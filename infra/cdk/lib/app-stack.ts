import { Duration, Fn, Stack, type StackProps } from "aws-cdk-lib";
import { PolicyStatement } from "aws-cdk-lib/aws-iam";
import { Table } from "aws-cdk-lib/aws-dynamodb";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import { Bucket } from "aws-cdk-lib/aws-s3";
import { Topic } from "aws-cdk-lib/aws-sns";
import { StringParameter } from "aws-cdk-lib/aws-ssm";
import { loadApiRoutes } from "@kundenportal/api-contract/routes";
import type { Construct } from "constructs";
import { Api } from "./api.js";
import type { PortalConfig } from "./config.js";
import { DomainServices } from "./domain-services.js";
import { Events } from "./events.js";
import { Migration } from "./migration.js";
import { Tenancy } from "./tenancy.js";
import { ServiceFunction } from "./functions.js";
import { PARAM } from "./parameters.js";
import { NextLambda } from "./next-lambda.js";
import { Shell } from "./shell.js";
import { ZONES, zoneParams } from "./zones.js";

/**
 * The part of the portal a teardown removes: services, shell, API and event flow (the
 * pay-per-use services API Gateway and EventBridge live here). It reads the long-lived
 * base through SSM and publishes its origins for the edge the same way.
 */
export class AppStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps & { config: PortalConfig }) {
    super(scope, id, props);
    const { config } = props;
    const reservedConcurrency = config.reservedConcurrency;
    const param = (name: string) => StringParameter.valueForStringParameter(this, name);

    const userPoolId = param(PARAM.base.userPoolId);
    const clientId = param(PARAM.base.userPoolClientId);
    const issuer = param(PARAM.base.issuer);
    const table = Table.fromTableName(this, "Table", param(PARAM.base.tableName));
    const ownerTopic = Topic.fromTopicArn(this, "OwnerHints", param(PARAM.base.ownerTopicArn));

    const consumerTimeout = Duration.seconds(10);
    const events = new Events(this, "Events", { ownerTopic, consumerTimeout });

    const customer = new ServiceFunction(this, "Customer", {
      entry: "services/customer/src/handler.ts",
      description: "customer service: GET/PATCH /me",
      reservedConcurrency,
      environment: { TABLE_NAME: table.tableName, EVENT_BUS_NAME: events.bus.eventBusName },
    });
    table.grantReadWriteData(customer);
    events.bus.grantPutEventsTo(customer);

    const notificationApi = new ServiceFunction(this, "NotificationApi", {
      entry: "services/notification/src/api-handler.ts",
      description: "notification service: GET/PATCH /notifications",
      reservedConcurrency,
      environment: { TABLE_NAME: table.tableName },
    });
    table.grantReadWriteData(notificationApi);

    const notificationConsumer = new ServiceFunction(this, "NotificationConsumer", {
      entry: "services/notification/src/consumer-handler.ts",
      description: "notification service: domain events from SQS",
      reservedConcurrency,
      timeout: consumerTimeout,
      environment: { TABLE_NAME: table.tableName, OWNER_TOPIC_ARN: ownerTopic.topicArn },
    });
    table.grantReadWriteData(notificationConsumer);
    ownerTopic.grantPublish(notificationConsumer);
    notificationConsumer.addEventSource(
      new SqsEventSource(events.notificationQueue, {
        batchSize: 10,
        reportBatchItemFailures: true,
      }),
    );

    const uploadBucket = Bucket.fromBucketName(this, "Uploads", param(PARAM.base.uploadBucketName));
    const domains = new DomainServices(this, "Domains", {
      table,
      bus: events.bus,
      ownerTopic,
      uploadBucket,
      reservedConcurrency,
    });

    const migration = new Migration(this, "Migration", {
      table,
      bus: events.bus,
      ownerTopic,
      userPoolId,
      contractWorker: domains.contractWorker,
      contractDlq: domains.contractDlq,
      reservedConcurrency,
    });

    // Token vending (phase 4): every service built so far reaches pass tenants' tables only
    // through the tenant role, with the tenant as session tag.
    const tenantDataRoleArn = param(PARAM.base.tenantDataRoleArn);
    for (const fn of this.node.findAll().filter((c) => c instanceof ServiceFunction)) {
      fn.addEnvironment("TENANT_DATA_ROLE_ARN", tenantDataRoleArn);
      fn.addToRolePolicy(
        new PolicyStatement({
          actions: ["sts:AssumeRole", "sts:TagSession"],
          resources: [tenantDataRoleArn],
        }),
      );
    }

    // The tenancy service manages tenants itself and needs no vended access.
    const tenancy = new Tenancy(this, "Tenancy", {
      table,
      bus: events.bus,
      ownerTopic,
      uploadBucket,
      userPoolId,
      scheduleGroup: param(PARAM.base.passScheduleGroup),
      portalUrl: `https://${config.domainName}`,
      reservedConcurrency,
    });

    const api = new Api(this, "Api", {
      routes: loadApiRoutes(),
      handlers: {
        getMe: customer,
        updateMe: customer,
        listNotifications: notificationApi,
        markNotificationRead: notificationApi,
        listContracts: domains.contractApi,
        getContract: domains.contractApi,
        updateContract: domains.contractApi,
        listMeterReadings: domains.consumptionApi,
        submitMeterReading: domains.consumptionApi,
        getDataUsage: domains.consumptionApi,
        getConsumptionHistory: domains.consumptionApi,
        listDocuments: domains.documentsApi,
        createUploadUrl: domains.documentsApi,
        listLinks: migration.api,
        confirmLink: migration.api,
        getMigrationStatus: migration.api,
        searchMigration: migration.api,
        startBulkMigration: migration.api,
        resetMigration: migration.api,
        redriveMigrationRecord: migration.api,
        createInvitation: tenancy.api,
        listPasses: tenancy.api,
        getPassOverview: tenancy.api,
        revokePass: tenancy.api,
        getOwnPass: tenancy.api,
        activateOwnPass: tenancy.api,
        getRedeemChallenge: tenancy.publicApi,
        redeemInvitation: tenancy.publicApi,
        getOffer: tenancy.publicApi,
        getSettings: tenancy.api,
        updateSettings: tenancy.api,
      },
      issuer,
      audience: [clientId],
      reservedConcurrency: config.apiReservedConcurrency,
    });

    const userPoolArn = this.formatArn({
      service: "cognito-idp",
      resource: "userpool",
      resourceName: userPoolId,
    });
    const shell = new Shell(this, "Shell", {
      domainName: config.domainName,
      reservedConcurrency: config.webReservedConcurrency,
      userPoolArn,
      environment: {
        API_URL: api.url,
        OIDC_ISSUER: issuer,
        OIDC_CLIENT_ID: clientId,
        OIDC_SCOPE: param(PARAM.base.scopes),
        OIDC_LOGOUT_URL: param(PARAM.base.logoutUrl),
        COGNITO_USER_POOL_ID: userPoolId,
      },
    });

    const publish = (name: string, value: string) =>
      new StringParameter(this, `Param${name.replaceAll("/", "-")}`, {
        parameterName: name,
        stringValue: value,
      });
    publish(PARAM.app.shellFunctionArn, shell.function.functionArn);
    publish(PARAM.app.shellOriginDomain, Fn.select(2, Fn.split("/", shell.url.url)));
    publish(PARAM.app.apiOriginDomain, Fn.select(2, Fn.split("/", api.url)));

    // Zones (multi-zones): each its own function; sign-in stays in the shell, the zones only
    // read the shared session cookie and call the API with its access token.
    for (const zone of ZONES) {
      const lambda = new NextLambda(this, `Zone-${zone.id}`, {
        app: zone.app,
        description: `Zone ${zone.basePath} (Next.js standalone server)`,
        domainName: config.domainName,
        reservedConcurrency: config.webReservedConcurrency,
        userPoolArn,
        readinessPath: `${zone.basePath}/healthz`,
        environment: {
          API_URL: api.url,
          OIDC_CLIENT_ID: clientId,
          COGNITO_USER_POOL_ID: userPoolId,
        },
      });
      const params = zoneParams(zone);
      publish(params.functionArn, lambda.function.functionArn);
      publish(params.originDomain, Fn.select(2, Fn.split("/", lambda.url.url)));
    }
  }
}
