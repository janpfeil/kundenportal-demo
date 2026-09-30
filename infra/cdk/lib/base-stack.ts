import { CfnOutput, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import { AttributeType, BillingMode, Table, TableEncryption } from "aws-cdk-lib/aws-dynamodb";
import { Topic } from "aws-cdk-lib/aws-sns";
import { EmailSubscription } from "aws-cdk-lib/aws-sns-subscriptions";
import { StringParameter } from "aws-cdk-lib/aws-ssm";
import { apiScopes, loadApiRoutes } from "@kundenportal/api-contract/routes";
import type { Construct } from "constructs";
import type { PortalConfig } from "./config.js";
import { Identity } from "./identity.js";
import { PARAM } from "./parameters.js";
import { Uploads } from "./uploads.js";

/**
 * Long-lived part of the portal that costs nothing while idle: identity (Cognito with its
 * trigger), data (DynamoDB, upload bucket) and the owner's notification topic. It survives an application
 * teardown, so users, data and the confirmed e-mail subscription stay.
 */
export class BaseStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps & { config: PortalConfig }) {
    super(scope, id, props);
    const { config } = props;

    const identity = new Identity(this, "Identity", {
      domainName: config.domainName,
      cognitoDomainPrefix: config.cognitoDomainPrefix,
      allowLocalhostCallback: config.allowLocalhostCallback,
      reservedConcurrency: config.reservedConcurrency,
      apiScopes: apiScopes(loadApiRoutes()),
    });

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

    // Uploads outlive an app teardown like the table; the lifecycle rule empties the bucket.
    const uploads = new Uploads(this, "Uploads", {
      domainName: config.domainName,
      allowLocalhost: config.allowLocalhostCallback,
    });

    const ownerTopic = new Topic(this, "OwnerHints", { displayName: "Kundenportal" });
    ownerTopic.addSubscription(
      new EmailSubscription(StringParameter.valueForStringParameter(this, PARAM.ownerEmail)),
    );

    const publish = (name: string, value: string) =>
      new StringParameter(this, `Param${name.replaceAll("/", "-")}`, {
        parameterName: name,
        stringValue: value,
      });
    publish(PARAM.base.userPoolId, identity.userPool.userPoolId);
    publish(PARAM.base.userPoolClientId, identity.client.userPoolClientId);
    publish(PARAM.base.issuer, identity.issuer);
    publish(PARAM.base.scopes, identity.scopes.join(" "));
    publish(PARAM.base.logoutUrl, `${identity.domain.baseUrl()}/logout`);
    publish(PARAM.base.tableName, table.tableName);
    publish(PARAM.base.ownerTopicArn, ownerTopic.topicArn);
    publish(PARAM.base.uploadBucketName, uploads.bucket.bucketName);

    new CfnOutput(this, "UserPoolId", { value: identity.userPool.userPoolId });
    new CfnOutput(this, "ManagedLoginUrl", { value: identity.domain.baseUrl() });
  }
}
