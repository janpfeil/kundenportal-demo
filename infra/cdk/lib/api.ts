import { HttpApi, HttpMethod, HttpNoneAuthorizer, HttpStage } from "aws-cdk-lib/aws-apigatewayv2";
import { HttpJwtAuthorizer } from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import { CfnFunction, type IFunction } from "aws-cdk-lib/aws-lambda";
import type { ApiRoute } from "@kundenportal/api-contract/routes";
import { Construct } from "constructs";

/** Stage name doubles as path prefix, so CloudFront can pass `/api/*` through unchanged. */
export const API_STAGE = "api";

export interface ApiProps {
  routes: ApiRoute[];
  /** Which function serves which operation of the contract. */
  handlers: Record<string, IFunction>;
  issuer: string;
  audience: string[];
  /**
   * Reserved concurrency of the functions behind the API (0 = leave as built). A page
   * calls several of them at once (contracts, readings, usage) and the E2E run opens
   * several pages in parallel; 2 throttled such bursts.
   */
  reservedConcurrency?: number;
}

/** HTTP API with a JWT authorizer; routes and required scopes come from the OpenAPI contract. */
export class Api extends Construct {
  readonly httpApi: HttpApi;
  readonly stage: HttpStage;
  /** Base URL including the stage, e.g. https://abc.execute-api.eu-central-1.amazonaws.com/api */
  readonly url: string;

  constructor(scope: Construct, id: string, props: ApiProps) {
    super(scope, id);

    this.httpApi = new HttpApi(this, "HttpApi", {
      createDefaultStage: false,
      description: "Kundenportal API",
    });
    this.stage = new HttpStage(this, "Stage", {
      httpApi: this.httpApi,
      stageName: API_STAGE,
      autoDeploy: true,
      // Cost and abuse guard: far above demo traffic, far below anything that costs money.
      throttle: { rateLimit: 10, burstLimit: 20 },
    });

    const authorizer = new HttpJwtAuthorizer("Jwt", props.issuer, { jwtAudience: props.audience });
    // Only operations the contract declares with `security: []` (redeeming an invitation
    // before the visitor has an account) go without; they check an ALTCHA proof instead.
    const open = new HttpNoneAuthorizer();
    const integrations = new Map<IFunction, HttpLambdaIntegration>();
    for (const route of props.routes) {
      const handler = props.handlers[route.operationId];
      if (!handler) throw new Error(`No function for operation ${route.operationId}`);
      const integration =
        integrations.get(handler) ??
        new HttpLambdaIntegration(`${route.operationId}Integration`, handler);
      if (!integrations.has(handler) && props.reservedConcurrency) {
        const cfn = handler.node.defaultChild;
        if (cfn instanceof CfnFunction)
          cfn.reservedConcurrentExecutions = props.reservedConcurrency;
      }
      integrations.set(handler, integration);
      this.httpApi.addRoutes({
        path: route.path,
        methods: [HttpMethod[route.method]],
        integration,
        ...(route.public
          ? { authorizer: open }
          : { authorizer, authorizationScopes: route.scopes }),
      });
    }

    this.url = `${this.httpApi.apiEndpoint}/${API_STAGE}`;
  }
}
