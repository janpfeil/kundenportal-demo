import { Duration, TimeZone } from "aws-cdk-lib";
import { Alarm, ComparisonOperator, TreatMissingData } from "aws-cdk-lib/aws-cloudwatch";
import { SnsAction } from "aws-cdk-lib/aws-cloudwatch-actions";
import type { ITable } from "aws-cdk-lib/aws-dynamodb";
import { EventBus, type IEventBus, type IRuleTarget, Rule } from "aws-cdk-lib/aws-events";
import { LambdaFunction } from "aws-cdk-lib/aws-events-targets";
import type { IFunction } from "aws-cdk-lib/aws-lambda";
import { SqsDestination } from "aws-cdk-lib/aws-lambda-destinations";
import type { IBucket } from "aws-cdk-lib/aws-s3";
import { Schedule, ScheduleExpression, ScheduleTargetInput } from "aws-cdk-lib/aws-scheduler";
import { LambdaInvoke } from "aws-cdk-lib/aws-scheduler-targets";
import type { ITopic } from "aws-cdk-lib/aws-sns";
import { Queue, QueueEncryption } from "aws-cdk-lib/aws-sqs";
import {
  ContractChanged,
  CustomerRegistered,
  MeterReadingSubmitted,
  MigratedAccountsRemoved,
} from "@kundenportal/events";
import { Construct } from "constructs";
import { ServiceFunction } from "./functions.js";

export interface DomainServicesProps {
  table: ITable;
  bus: IEventBus;
  ownerTopic: ITopic;
  uploadBucket: IBucket;
  reservedConcurrency: number;
}

type DomainEvent = { source: string; detailType: string };

/** Input of the daily schedule; must match `SCHEDULED_CHECK` in services/consumption/src/worker.ts. */
export const DATA_VOLUME_CHECK_INPUT = { task: "checkDataVolumes" } as const;

/**
 * Contract, consumption and documents services (fachkonzept §5): one API function each
 * plus their event consumers.
 *
 * EventBridge invokes the workers directly (asynchronously) instead of through a queue:
 * an SQS event source polls around the clock (≈ 0.65 M requests per queue and month),
 * and the notification queue alone already uses most of the 1 M free SQS requests, so
 * any further queue would cost money even after the Free Plan. Instead: a retry policy
 * and a DLQ on every rule target (delivery failures), two Lambda retries and then an
 * on-failure destination to the same DLQ (function errors). The workers are idempotent,
 * so retries and duplicate deliveries are harmless.
 *
 * Every DLQ has an alarm to the owner, like the notification DLQ.
 */
export class DomainServices extends Construct {
  readonly contractApi: IFunction;
  readonly consumptionApi: IFunction;
  readonly documentsApi: IFunction;
  /** The contract worker and its DLQ; phase 3 routes the migration events to it. */
  readonly contractWorker: IFunction;
  readonly contractDlq: Queue;

  private readonly props: DomainServicesProps;

  constructor(scope: Construct, id: string, props: DomainServicesProps) {
    super(scope, id);
    this.props = props;
    const { table, bus, uploadBucket, reservedConcurrency } = props;
    const environment = { TABLE_NAME: table.tableName, EVENT_BUS_NAME: bus.eventBusName };

    // --- contract -------------------------------------------------------------------
    const contractApi = new ServiceFunction(this, "ContractApi", {
      entry: "services/contract/src/api-handler.ts",
      description: "contract service: contracts, orders, terminations, products, back office",
      reservedConcurrency,
      environment,
    });
    table.grantReadWriteData(contractApi);
    bus.grantPutEventsTo(contractApi);
    this.contractApi = contractApi;

    const contractDlq = this.deadLetterQueue("ContractDlq", "contract");
    const contractWorker = this.worker("ContractWorker", contractDlq, {
      entry: "services/contract/src/worker-handler.ts",
      description: "contract service: demo and migrated contracts, installment recalculation",
      environment,
    });
    table.grantReadWriteData(contractWorker);
    bus.grantPutEventsTo(contractWorker);
    this.contractWorker = contractWorker;
    this.contractDlq = contractDlq;
    // MigratedAccountsRemoved: a demo reset removed these customers; each domain deletes its data.
    for (const event of [CustomerRegistered, MeterReadingSubmitted, MigratedAccountsRemoved]) {
      this.route(`${event.detailType}ToContract`, event, "contract", [
        this.invoke(contractWorker, contractDlq),
      ]);
    }

    // --- consumption ----------------------------------------------------------------
    const consumptionApi = new ServiceFunction(this, "ConsumptionApi", {
      entry: "services/consumption/src/api-handler.ts",
      description: "consumption service: readings and data usage per contract",
      reservedConcurrency,
      environment,
    });
    table.grantReadWriteData(consumptionApi);
    bus.grantPutEventsTo(consumptionApi);
    this.consumptionApi = consumptionApi;

    const consumptionDlq = this.deadLetterQueue("ConsumptionDlq", "consumption");
    const consumptionWorker = this.worker("ConsumptionWorker", consumptionDlq, {
      entry: "services/consumption/src/worker-handler.ts",
      description: "consumption service: projections and the daily data volume check",
      // The daily check visits every mobile contract of all tenants.
      timeout: Duration.seconds(60),
      environment,
    });
    table.grantReadWriteData(consumptionWorker);
    bus.grantPutEventsTo(consumptionWorker);
    for (const event of [CustomerRegistered, ContractChanged, MigratedAccountsRemoved]) {
      this.route(`${event.detailType}ToConsumption`, event, "consumption", [
        this.invoke(consumptionWorker, consumptionDlq),
      ]);
    }
    // EventBridge Scheduler: 14 M invocations a month are free; this uses about 30.
    new Schedule(this, "DataVolumeCheck", {
      description: "Daily check: mobile data volume ≥ 80 % → DataVolumeThresholdReached",
      schedule: ScheduleExpression.cron({
        minute: "0",
        hour: "7",
        timeZone: TimeZone.EUROPE_BERLIN,
      }),
      target: new LambdaInvoke(consumptionWorker, {
        input: ScheduleTargetInput.fromObject(DATA_VOLUME_CHECK_INPUT),
        retryAttempts: 2,
        maxEventAge: Duration.hours(1),
        deadLetterQueue: consumptionDlq,
      }),
    });

    // --- documents ------------------------------------------------------------------
    const documentsEnvironment = { ...environment, UPLOAD_BUCKET: uploadBucket.bucketName };
    const documentsApi = new ServiceFunction(this, "DocumentsApi", {
      entry: "services/documents/src/api-handler.ts",
      description: "documents service: GET /documents, presigned upload URLs",
      reservedConcurrency,
      environment: documentsEnvironment,
    });
    table.grantReadWriteData(documentsApi);
    // Phase 4: QuotaExceeded when a pass has used its uploads.
    bus.grantPutEventsTo(documentsApi);
    // Presigned URLs carry the function's permissions: PUT below uploads/ only.
    uploadBucket.grantPut(documentsApi, "uploads/*");
    this.documentsApi = documentsApi;

    const documentsDlq = this.deadLetterQueue("DocumentsDlq", "documents");
    const documentsWorker = this.worker("DocumentsWorker", documentsDlq, {
      entry: "services/documents/src/worker-handler.ts",
      description: "documents service: upload checks (S3 events) and projection",
      environment: documentsEnvironment,
    });
    table.grantReadWriteData(documentsWorker);
    bus.grantPutEventsTo(documentsWorker);
    uploadBucket.grantDelete(documentsWorker, "uploads/*");
    for (const event of [CustomerRegistered, MigratedAccountsRemoved]) {
      this.route(`${event.detailType}ToDocuments`, event, "documents", [
        this.invoke(documentsWorker, documentsDlq),
      ]);
    }
    // S3 publishes to the account's default bus (AWS service events there are free).
    new Rule(this, "UploadToDocuments", {
      eventBus: EventBus.fromEventBusName(this, "DefaultBus", "default"),
      description: "S3 Object Created in the upload bucket → documents",
      eventPattern: {
        source: ["aws.s3"],
        detailType: ["Object Created"],
        detail: {
          bucket: { name: [uploadBucket.bucketName] },
          object: { key: [{ prefix: "uploads/" }] },
        },
      },
      targets: [this.invoke(documentsWorker, documentsDlq)],
    });
  }

  private route(id: string, event: DomainEvent, domain: string, targets: IRuleTarget[]) {
    new Rule(this, id, {
      eventBus: this.props.bus,
      description: `${event.detailType} → ${domain}`,
      eventPattern: { source: [event.source], detailType: [event.detailType] },
      targets,
    });
  }

  /** Asynchronous EventBridge target; what EventBridge cannot deliver goes to the DLQ. */
  private invoke(fn: IFunction, dlq: Queue): LambdaFunction {
    return new LambdaFunction(fn, {
      deadLetterQueue: dlq,
      retryAttempts: 8,
      maxEventAge: Duration.hours(24),
    });
  }

  /** A worker invoked asynchronously: two retries, then the invocation lands in the DLQ. */
  private worker(
    id: string,
    dlq: Queue,
    props: Omit<ConstructorParameters<typeof ServiceFunction>[2], "reservedConcurrency">,
  ): ServiceFunction {
    const fn = new ServiceFunction(this, id, {
      ...props,
      reservedConcurrency: this.props.reservedConcurrency,
    });
    fn.configureAsyncInvoke({
      retryAttempts: 2,
      maxEventAge: Duration.hours(6),
      onFailure: new SqsDestination(dlq),
    });
    return fn;
  }

  private deadLetterQueue(id: string, domain: string): Queue {
    const queue = new Queue(this, id, {
      retentionPeriod: Duration.days(14),
      encryption: QueueEncryption.SQS_MANAGED,
      enforceSSL: true,
    });
    new Alarm(this, `${id}NotEmpty`, {
      alarmDescription: `A domain event could not be processed and waits in the ${domain} DLQ`,
      metric: queue.metricApproximateNumberOfMessagesVisible({ period: Duration.minutes(5) }),
      threshold: 0,
      comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
      evaluationPeriods: 1,
      treatMissingData: TreatMissingData.NOT_BREACHING,
    }).addAlarmAction(new SnsAction(this.props.ownerTopic));
    return queue;
  }
}
