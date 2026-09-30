import { Duration, Stack } from "aws-cdk-lib";
import { Alarm, ComparisonOperator, TreatMissingData } from "aws-cdk-lib/aws-cloudwatch";
import { SnsAction } from "aws-cdk-lib/aws-cloudwatch-actions";
import type { ITable } from "aws-cdk-lib/aws-dynamodb";
import { type IEventBus, Rule } from "aws-cdk-lib/aws-events";
import { LambdaFunction } from "aws-cdk-lib/aws-events-targets";
import { PolicyStatement } from "aws-cdk-lib/aws-iam";
import type { IFunction } from "aws-cdk-lib/aws-lambda";
import { SqsDestination } from "aws-cdk-lib/aws-lambda-destinations";
import type { ITopic } from "aws-cdk-lib/aws-sns";
import { Queue, QueueEncryption } from "aws-cdk-lib/aws-sqs";
import {
  AccountsLinked,
  LegacyAccountMigrated,
  MigratedAccountsRemoved,
} from "@kundenportal/events";
import { Construct } from "constructs";
import { ServiceFunction } from "./functions.js";
import { grantLegacyAccess } from "./legacy-access.js";

export interface MigrationProps {
  table: ITable;
  bus: IEventBus;
  ownerTopic: ITopic;
  userPoolId: string;
  /** The contract worker takes over legacy contracts; phase 2 owns it. */
  contractWorker: IFunction;
  contractDlq: Queue;
  reservedConcurrency: number;
}

/**
 * Phase 3 — legacy systems and migration (fachkonzept §5 "Migration"):
 * - customer worker: creates migrated customers (`LegacyAccountMigrated`, `AccountsLinked`)
 * - migration API: `/me/links`, `/migration/*` (cockpit, owner only)
 * - migration worker: every event of the bus → cockpit timeline; `BulkMigrationStarted`
 *   reads the export, `LegacyAccountMigrated` looks for duplicates
 * - record processor: one inactive record per asynchronous invocation; what fails goes
 *   to the migration DLQ (Lambda on-failure destination), from where the cockpit redrives
 *
 * Like the other workers without a polled queue (free tier, see kostenfrei.md).
 */
export class Migration extends Construct {
  readonly api: IFunction;

  constructor(scope: Construct, id: string, props: MigrationProps) {
    super(scope, id);
    const { table, bus, reservedConcurrency } = props;
    const environment = { TABLE_NAME: table.tableName, EVENT_BUS_NAME: bus.eventBusName };

    // --- customer: migrated customers ---------------------------------------------
    const customerDlq = this.deadLetterQueue("CustomerDlq", props.ownerTopic, "customer");
    const customerWorker = this.worker("CustomerWorker", customerDlq, reservedConcurrency, {
      entry: "services/customer/src/worker-handler.ts",
      description: "customer service: migrated customers and linked accounts",
      environment,
    });
    table.grantReadWriteData(customerWorker);
    bus.grantPutEventsTo(customerWorker);

    const migrated = {
      source: [...LegacyAccountMigrated.sources],
      detailType: [LegacyAccountMigrated.detailType],
    };
    const linked = { source: [AccountsLinked.source], detailType: [AccountsLinked.detailType] };
    for (const [target, dlq, name] of [
      [customerWorker, customerDlq, "Customer"],
      [props.contractWorker, props.contractDlq, "Contract"],
    ] as const) {
      new Rule(this, `LegacyAccountMigratedTo${name}`, {
        eventBus: bus,
        description: `LegacyAccountMigrated → ${name.toLowerCase()}`,
        eventPattern: migrated,
        targets: [this.invoke(target, dlq)],
      });
      new Rule(this, `AccountsLinkedTo${name}`, {
        eventBus: bus,
        description: `AccountsLinked → ${name.toLowerCase()}`,
        eventPattern: linked,
        targets: [this.invoke(target, dlq)],
      });
    }

    new Rule(this, "MigratedAccountsRemovedToCustomer", {
      eventBus: bus,
      description: "MigratedAccountsRemoved → customer (demo reset deletes profiles)",
      eventPattern: {
        source: [MigratedAccountsRemoved.source],
        detailType: [MigratedAccountsRemoved.detailType],
      },
      targets: [this.invoke(customerWorker, customerDlq)],
    });

    // --- migration ----------------------------------------------------------------
    // Failed record tasks wait here for a redrive from the cockpit. Failures are part of
    // the demo (one defective record), so there is no alarm; the cockpit shows them.
    const recordDlq = new Queue(this, "RecordDlq", {
      retentionPeriod: Duration.days(14),
      encryption: QueueEncryption.SQS_MANAGED,
      enforceSSL: true,
    });
    const userPoolArn = Stack.of(this).formatArn({
      service: "cognito-idp",
      resource: "userpool",
      resourceName: props.userPoolId,
    });
    const migrationEnvironment = {
      ...environment,
      USER_POOL_ID: props.userPoolId,
      MIGRATION_DLQ_URL: recordDlq.queueUrl,
    };

    const processor = new ServiceFunction(this, "MigrationProcessor", {
      entry: "services/migration/src/processor-handler.ts",
      description: "migration: one legacy record of a bulk import or redrive",
      reservedConcurrency,
      timeout: Duration.seconds(30),
      environment: { ...migrationEnvironment, PROCESSOR_FUNCTION_NAME: "-" },
    });
    // A failed record is final until an operator redrives it: no automatic retries.
    processor.configureAsyncInvoke({
      retryAttempts: 0,
      maxEventAge: Duration.hours(6),
      onFailure: new SqsDestination(recordDlq),
    });

    const workerDlq = this.deadLetterQueue("MigrationDlq", props.ownerTopic, "migration");
    const worker = this.worker("MigrationWorker", workerDlq, reservedConcurrency, {
      entry: "services/migration/src/worker-handler.ts",
      description: "migration: timeline, export reader, duplicate detection",
      timeout: Duration.seconds(60),
      environment: { ...migrationEnvironment, PROCESSOR_FUNCTION_NAME: processor.functionName },
    });
    new Rule(this, "EventsToMigration", {
      eventBus: bus,
      description: "every portal event → migration (timeline, bulk import, duplicates)",
      eventPattern: { source: [{ prefix: "kundenportal." }] as unknown as string[] },
      targets: [this.invoke(worker, workerDlq)],
    });

    const api = new ServiceFunction(this, "MigrationApi", {
      entry: "services/migration/src/api-handler.ts",
      description: "migration: /me/links, /migration/status, bulk, redrive, demo reset",
      reservedConcurrency,
      // The redrive looks for the task in the DLQ with a few long polls; the demo reset
      // deletes accounts, links and the timeline before it announces the removal.
      timeout: Duration.seconds(30),
      environment: { ...migrationEnvironment, PROCESSOR_FUNCTION_NAME: processor.functionName },
    });
    this.api = api;

    for (const fn of [processor, worker, api]) {
      table.grantReadWriteData(fn);
      bus.grantPutEventsTo(fn);
      grantLegacyAccess(fn);
    }
    for (const fn of [worker, api]) processor.grantInvoke(fn);
    recordDlq.grantConsumeMessages(api);
    recordDlq.grantPurge(api);
    // Demo reset: the API removes the accounts the migration created.
    api.addToRolePolicy(
      new PolicyStatement({ actions: ["cognito-idp:AdminDeleteUser"], resources: [userPoolArn] }),
    );
    processor.addToRolePolicy(
      new PolicyStatement({
        actions: [
          "cognito-idp:AdminCreateUser",
          "cognito-idp:AdminSetUserPassword",
          "cognito-idp:AdminGetUser",
        ],
        resources: [userPoolArn],
      }),
    );
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
    reservedConcurrency: number,
    props: Omit<ConstructorParameters<typeof ServiceFunction>[2], "reservedConcurrency">,
  ): ServiceFunction {
    const fn = new ServiceFunction(this, id, { ...props, reservedConcurrency });
    fn.configureAsyncInvoke({
      retryAttempts: 2,
      maxEventAge: Duration.hours(6),
      onFailure: new SqsDestination(dlq),
    });
    return fn;
  }

  private deadLetterQueue(id: string, ownerTopic: ITopic, domain: string): Queue {
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
    }).addAlarmAction(new SnsAction(ownerTopic));
    return queue;
  }
}
