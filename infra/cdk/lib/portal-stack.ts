import { Duration, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import type { ICertificate } from "aws-cdk-lib/aws-certificatemanager";
import { AttributeType, BillingMode, Table, TableEncryption } from "aws-cdk-lib/aws-dynamodb";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import { Topic } from "aws-cdk-lib/aws-sns";
import { EmailSubscription } from "aws-cdk-lib/aws-sns-subscriptions";
import { StringParameter } from "aws-cdk-lib/aws-ssm";
import { apiScopes, loadApiRoutes } from "@kundenportal/api-contract/routes";
import type { Construct } from "constructs";
import { Api } from "./api.js";
import type { PortalConfig } from "./config.js";
import { Edge } from "./edge.js";
import { Events } from "./events.js";
import { ServiceFunction } from "./functions.js";
import { Identity } from "./identity.js";

export interface PortalStackProps extends StackProps {
  config: PortalConfig;
  certificate?: ICertificate;
}

/** The application: identity, data, events, services, API and edge of the portal. */
export class PortalStack extends Stack {
  constructor(scope: Construct, id: string, props: PortalStackProps) {
    super(scope, id, props);
    const { config } = props;
    const reservedConcurrency = config.reservedConcurrency;
    const routes = loadApiRoutes();

    // Single table (fachkonzept §7.1); provisioned 5/5 stays inside the always-free 25 RCU/WCU.
    const table = new Table(this, "Table", {
      partitionKey: { name: "PK", type: AttributeType.STRING },
      sortKey: { name: "SK", type: AttributeType.STRING },
      billingMode: BillingMode.PROVISIONED,
      readCapacity: 5,
      writeCapacity: 5,
      encryption: TableEncryption.AWS_MANAGED,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const ownerTopic = new Topic(this, "OwnerHints", { displayName: "Kundenportal" });
    ownerTopic.addSubscription(
      new EmailSubscription(
        StringParameter.valueForStringParameter(this, config.ownerEmailParameter),
      ),
    );

    const consumerTimeout = Duration.seconds(10);
    const events = new Events(this, "Events", { ownerTopic, consumerTimeout });

    const identity = new Identity(this, "Identity", {
      domainName: config.domainName,
      cognitoDomainPrefix: config.cognitoDomainPrefix,
      allowLocalhostCallback: config.allowLocalhostCallback,
      reservedConcurrency,
      apiScopes: apiScopes(routes),
    });

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

    const api = new Api(this, "Api", {
      routes,
      handlers: {
        getMe: customer,
        updateMe: customer,
        listNotifications: notificationApi,
        markNotificationRead: notificationApi,
      },
      issuer: identity.issuer,
      audience: [identity.client.userPoolClientId],
    });

    new Edge(this, "Edge", {
      domainName: config.domainName,
      ...(props.certificate ? { certificate: props.certificate } : {}),
      reservedConcurrency,
      userPoolArn: identity.userPool.userPoolArn,
      apiUrl: api.url,
      shellEnvironment: {
        API_URL: api.url,
        OIDC_ISSUER: identity.issuer,
        OIDC_CLIENT_ID: identity.client.userPoolClientId,
        OIDC_SCOPE: identity.scopes.join(" "),
        OIDC_LOGOUT_URL: `${identity.domain.baseUrl()}/logout`,
        COGNITO_USER_POOL_ID: identity.userPool.userPoolId,
      },
    });
  }
}
