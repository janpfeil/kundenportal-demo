import { Duration, Stack, TimeZone } from "aws-cdk-lib";
import { Alarm, ComparisonOperator, TreatMissingData } from "aws-cdk-lib/aws-cloudwatch";
import { SnsAction } from "aws-cdk-lib/aws-cloudwatch-actions";
import type { ITable } from "aws-cdk-lib/aws-dynamodb";
import { type IEventBus, Rule } from "aws-cdk-lib/aws-events";
import { LambdaFunction } from "aws-cdk-lib/aws-events-targets";
import { PolicyStatement, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import type { IFunction } from "aws-cdk-lib/aws-lambda";
import { SqsDestination } from "aws-cdk-lib/aws-lambda-destinations";
import type { IBucket } from "aws-cdk-lib/aws-s3";
import { Schedule, ScheduleExpression, ScheduleTargetInput } from "aws-cdk-lib/aws-scheduler";
import { LambdaInvoke } from "aws-cdk-lib/aws-scheduler-targets";
import { type ITopic, Topic } from "aws-cdk-lib/aws-sns";
import { LambdaSubscription } from "aws-cdk-lib/aws-sns-subscriptions";
import { Queue, QueueEncryption } from "aws-cdk-lib/aws-sqs";
import { Construct } from "constructs";
import { ServiceFunction } from "./functions.js";
import { grantLegacyAccess } from "./legacy-access.js";
import { TENANT_TABLE_PREFIX } from "./tenant-data.js";

/** Name of the budget alert topic the foundation (Terraform) creates. */
export const BUDGET_TOPIC_NAME = "kundenportal-budget-alerts";
/** SecureString with the ALTCHA HMAC key; the public function creates it on first use. */
export const ALTCHA_KEY_PARAMETER = "/kundenportal/tenancy/altcha-hmac-key";

export interface TenancyProps {
  table: ITable;
  bus: IEventBus;
  ownerTopic: ITopic;
  uploadBucket: IBucket;
  userPoolId: string;
  /** Group of the one-time expiry schedules (base stack). */
  scheduleGroup: string;
  portalUrl: string;
  reservedConcurrency: number;
}

/**
 * Phase 4 — demo passes and their tenants (docs/wiki/architektur-mandanten.md):
 * - api: invitations and pass administration (owner), own pass status (pass holders)
 * - public: ALTCHA challenge and redeeming an invitation, before the visitor has an account
 * - worker: sets tenants up and tears them down, expiry and daily reconciliation, events
 *   quota, kill switch from the budget alarm
 */
export class Tenancy extends Construct {
  readonly api: IFunction;
  readonly publicApi: IFunction;
  readonly worker: IFunction;

  constructor(scope: Construct, id: string, props: TenancyProps) {
    super(scope, id);
    const { table, bus, reservedConcurrency } = props;
    const stack = Stack.of(this);
    const userPoolArn = stack.formatArn({
      service: "cognito-idp",
      resource: "userpool",
      resourceName: props.userPoolId,
    });
    const tenantTables = stack.formatArn({
      service: "dynamodb",
      resource: "table",
      resourceName: `${TENANT_TABLE_PREFIX}*`,
    });
    const environment = {
      TABLE_NAME: table.tableName,
      EVENT_BUS_NAME: bus.eventBusName,
      PORTAL_URL: props.portalUrl,
      USER_POOL_ID: props.userPoolId,
      TENANT_TABLE_PREFIX,
    };

    // --- worker -------------------------------------------------------------------
    const dlq = new Queue(this, "WorkerDlq", {
      retentionPeriod: Duration.days(14),
      encryption: QueueEncryption.SQS_MANAGED,
      enforceSSL: true,
    });
    new Alarm(this, "WorkerDlqNotEmpty", {
      alarmDescription: "A tenancy task could not be processed and waits in the tenancy DLQ",
      metric: dlq.metricApproximateNumberOfMessagesVisible({ period: Duration.minutes(5) }),
      threshold: 0,
      comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
      evaluationPeriods: 1,
      treatMissingData: TreatMissingData.NOT_BREACHING,
    }).addAlarmAction(new SnsAction(props.ownerTopic));

    const worker = new ServiceFunction(this, "Worker", {
      entry: "services/tenancy/src/worker-handler.ts",
      description: "tenancy: set up and tear down pass tenants, expiry, quotas, kill switch",
      reservedConcurrency,
      // Waits up to 120 s for a new table to become active; teardown pages through users.
      timeout: Duration.minutes(3),
      environment: {
        ...environment,
        UPLOAD_BUCKET: props.uploadBucket.bucketName,
        PASS_SCHEDULE_GROUP: props.scheduleGroup,
      },
    });
    worker.configureAsyncInvoke({
      retryAttempts: 2,
      maxEventAge: Duration.hours(6),
      onFailure: new SqsDestination(dlq),
    });
    this.worker = worker;

    // The scheduler calls the worker at the end of each pass.
    const schedulerRole = new Role(this, "SchedulerRole", {
      assumedBy: new ServicePrincipal("scheduler.amazonaws.com", {
        conditions: { StringEquals: { "aws:SourceAccount": stack.account } },
      }),
      description: "EventBridge Scheduler: invoke the tenancy worker when a pass expires",
    });
    worker.grantInvoke(schedulerRole);
    // The worker builds its own ARN (a direct reference would be a cycle).
    worker.addEnvironment("ACCOUNT_ID", stack.account);
    worker.addEnvironment("SCHEDULER_ROLE_ARN", schedulerRole.roleArn);

    table.grantReadWriteData(worker);
    bus.grantPutEventsTo(worker);
    grantLegacyAccess(worker);
    worker.addToRolePolicy(
      new PolicyStatement({
        sid: "TenantTables",
        actions: [
          "dynamodb:CreateTable",
          "dynamodb:DeleteTable",
          "dynamodb:DescribeTable",
          "dynamodb:DescribeTimeToLive",
          "dynamodb:UpdateTimeToLive",
          "dynamodb:TagResource",
          "dynamodb:ListTagsOfResource",
        ],
        resources: [tenantTables],
      }),
    );
    worker.addToRolePolicy(
      new PolicyStatement({ actions: ["dynamodb:ListTables"], resources: ["*"] }),
    );
    worker.addToRolePolicy(
      new PolicyStatement({
        sid: "PassHolderAccounts",
        actions: [
          "cognito-idp:AdminCreateUser",
          "cognito-idp:AdminAddUserToGroup",
          "cognito-idp:AdminGetUser",
          "cognito-idp:AdminDeleteUser",
          "cognito-idp:ListUsers",
        ],
        resources: [userPoolArn],
      }),
    );
    worker.addToRolePolicy(
      new PolicyStatement({
        sid: "ExpirySchedules",
        actions: ["scheduler:CreateSchedule", "scheduler:DeleteSchedule", "scheduler:GetSchedule"],
        resources: [
          stack.formatArn({
            service: "scheduler",
            resource: "schedule",
            resourceName: `${props.scheduleGroup}/*`,
          }),
        ],
      }),
    );
    worker.addToRolePolicy(
      new PolicyStatement({ actions: ["iam:PassRole"], resources: [schedulerRole.roleArn] }),
    );
    props.uploadBucket.grantDelete(worker, "uploads/*");
    worker.addToRolePolicy(
      new PolicyStatement({
        actions: ["s3:ListBucket"],
        resources: [props.uploadBucket.bucketArn],
        conditions: { StringLike: { "s3:prefix": ["uploads/*"] } },
      }),
    );

    // Every event of a pass tenant: DemoPassIssued/-Expired start work, all count for the
    // events quota. Pass tenant ids start with "p"; the owner's tenant is "owner".
    new Rule(this, "PassTenantEvents", {
      eventBus: bus,
      description: "events of pass tenants → tenancy (set-up, teardown, events quota)",
      eventPattern: {
        source: [{ prefix: "kundenportal." }] as unknown as string[],
        detail: { tenantId: [{ prefix: "p" }] },
      },
      targets: [
        new LambdaFunction(worker, {
          deadLetterQueue: dlq,
          retryAttempts: 8,
          maxEventAge: Duration.hours(24),
        }),
      ],
    });

    // Daily: expire passes whose schedule ran into a paused stack, retry stuck set-ups.
    new Schedule(this, "Reconcile", {
      description: "Daily reconciliation of demo-pass tenants",
      schedule: ScheduleExpression.cron({
        minute: "30",
        hour: "3",
        timeZone: TimeZone.EUROPE_BERLIN,
      }),
      target: new LambdaInvoke(worker, {
        input: ScheduleTargetInput.fromObject({ task: "reconcile" }),
        retryAttempts: 2,
        maxEventAge: Duration.hours(1),
        deadLetterQueue: dlq,
      }),
    });

    // Kill switch: the budget alarm (foundation) closes redemption.
    const budgetTopic = Topic.fromTopicArn(
      this,
      "BudgetAlerts",
      stack.formatArn({ service: "sns", resource: BUDGET_TOPIC_NAME }),
    );
    budgetTopic.addSubscription(new LambdaSubscription(worker));

    // --- api (JWT) ------------------------------------------------------------------
    const api = new ServiceFunction(this, "Api", {
      entry: "services/tenancy/src/api-handler.ts",
      description: "tenancy: invitations, passes (owner), own pass status",
      reservedConcurrency,
      environment,
    });
    table.grantReadWriteData(api);
    bus.grantPutEventsTo(api);
    this.api = api;

    // --- public ---------------------------------------------------------------------
    const publicApi = new ServiceFunction(this, "Public", {
      entry: "services/tenancy/src/public-handler.ts",
      description: "tenancy: ALTCHA challenge and redeeming an invitation (no sign-in)",
      reservedConcurrency,
      environment: { ...environment, ALTCHA_HMAC_KEY_PARAM: ALTCHA_KEY_PARAMETER },
    });
    table.grantReadWriteData(publicApi);
    bus.grantPutEventsTo(publicApi);
    const altchaKey = stack.formatArn({
      service: "ssm",
      resource: "parameter",
      resourceName: ALTCHA_KEY_PARAMETER.slice(1),
    });
    publicApi.addToRolePolicy(
      new PolicyStatement({
        actions: ["ssm:GetParameter", "ssm:PutParameter"],
        resources: [altchaKey],
      }),
    );
    // One pass per address: the redeem checks whether the address already has an account.
    publicApi.addToRolePolicy(
      new PolicyStatement({ actions: ["cognito-idp:ListUsers"], resources: [userPoolArn] }),
    );
    this.publicApi = publicApi;
  }
}
