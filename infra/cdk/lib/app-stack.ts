import { Duration, Fn, Stack, type StackProps } from "aws-cdk-lib";
import { Table } from "aws-cdk-lib/aws-dynamodb";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import { Topic } from "aws-cdk-lib/aws-sns";
import { StringParameter } from "aws-cdk-lib/aws-ssm";
import { loadApiRoutes } from "@kundenportal/api-contract/routes";
import type { Construct } from "constructs";
import { Api } from "./api.js";
import type { PortalConfig } from "./config.js";
import { Events } from "./events.js";
import { ServiceFunction } from "./functions.js";
import { PARAM } from "./parameters.js";
import { Shell } from "./shell.js";

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

    const api = new Api(this, "Api", {
      routes: loadApiRoutes(),
      handlers: {
        getMe: customer,
        updateMe: customer,
        listNotifications: notificationApi,
        markNotificationRead: notificationApi,
      },
      issuer,
      audience: [clientId],
    });

    const shell = new Shell(this, "Shell", {
      domainName: config.domainName,
      reservedConcurrency,
      userPoolArn: this.formatArn({
        service: "cognito-idp",
        resource: "userpool",
        resourceName: userPoolId,
      }),
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
  }
}
