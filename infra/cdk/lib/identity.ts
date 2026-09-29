import { Duration, RemovalPolicy, Stack } from "aws-cdk-lib";
import {
  AccountRecovery,
  CfnManagedLoginBranding,
  ClientAttributes,
  FeaturePlan,
  LambdaVersion,
  ManagedLoginVersion,
  OAuthScope,
  ResourceServerScope,
  StringAttribute,
  UserPool,
  type UserPoolClient,
  UserPoolClientIdentityProvider,
  type UserPoolDomain,
  UserPoolOperation,
} from "aws-cdk-lib/aws-cognito";
import { Construct } from "constructs";
import { ServiceFunction } from "./functions.js";

export interface IdentityProps {
  domainName: string;
  cognitoDomainPrefix: string;
  allowLocalhostCallback: boolean;
  reservedConcurrency: number;
  /** API scopes from the OpenAPI contract, e.g. `kundenportal/profile.read`. */
  apiScopes: { resourceServer: string; name: string }[];
}

/**
 * Amazon Cognito user pool (plan Essentials) with managed login. The shell signs in as
 * a confidential client with Authorization Code + PKCE; the API trusts the pool as JWT issuer.
 */
export class Identity extends Construct {
  readonly userPool: UserPool;
  readonly client: UserPoolClient;
  readonly domain: UserPoolDomain;
  readonly issuer: string;
  /** Scopes the shell requests: OIDC basics plus all API scopes. */
  readonly scopes: string[];

  constructor(scope: Construct, id: string, props: IdentityProps) {
    super(scope, id);

    this.userPool = new UserPool(this, "UserPool", {
      featurePlan: FeaturePlan.ESSENTIALS,
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: {
        email: { required: true, mutable: true },
        fullname: { required: false, mutable: true },
        locale: { required: false, mutable: true },
      },
      // Set only by the platform (later: when a demo pass creates a tenant), never by users.
      customAttributes: {
        tenant_id: new StringAttribute({ minLen: 1, maxLen: 40, mutable: false }),
      },
      passwordPolicy: { minLength: 12, requireSymbols: false },
      accountRecovery: AccountRecovery.EMAIL_ONLY,
      deletionProtection: false,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const tokenClaims = new ServiceFunction(this, "PreTokenGeneration", {
      entry: "services/identity/src/pre-token-generation.ts",
      description: "Adds tenant, verified email, locale and name to access tokens",
      reservedConcurrency: props.reservedConcurrency,
      timeout: Duration.seconds(5),
    });
    this.userPool.addTrigger(
      UserPoolOperation.PRE_TOKEN_GENERATION_CONFIG,
      tokenClaims,
      LambdaVersion.V2_0,
    );

    this.domain = this.userPool.addDomain("Domain", {
      cognitoDomain: { domainPrefix: props.cognitoDomainPrefix },
      managedLoginVersion: ManagedLoginVersion.NEWER_MANAGED_LOGIN,
    });

    const servers = [...new Set(props.apiScopes.map((scope) => scope.resourceServer))];
    const apiScopes = servers.flatMap((identifier) => {
      const scopes = props.apiScopes
        .filter((scope) => scope.resourceServer === identifier)
        .map(
          (scope) =>
            new ResourceServerScope({ scopeName: scope.name, scopeDescription: scope.name }),
        );
      const server = this.userPool.addResourceServer(`Api-${identifier}`, { identifier, scopes });
      return scopes.map((scope) => OAuthScope.resourceServer(server, scope));
    });

    const origin = `https://${props.domainName}`;
    const localhost = props.allowLocalhostCallback ? ["http://localhost:3000"] : [];
    this.client = this.userPool.addClient("ShellClient", {
      generateSecret: true,
      authFlows: {},
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [OAuthScope.OPENID, OAuthScope.EMAIL, OAuthScope.PROFILE, ...apiScopes],
        callbackUrls: [origin, ...localhost].map((base) => `${base}/auth/callback`),
        logoutUrls: [origin, ...localhost].map((base) => `${base}/`),
      },
      supportedIdentityProviders: [UserPoolClientIdentityProvider.COGNITO],
      preventUserExistenceErrors: true,
      accessTokenValidity: Duration.hours(1),
      idTokenValidity: Duration.hours(1),
      refreshTokenValidity: Duration.days(1),
      // Users may edit these, but never custom:tenant_id.
      writeAttributes: new ClientAttributes().withStandardAttributes({
        email: true,
        fullname: true,
        locale: true,
      }),
    });

    // Managed login needs a style per client; Cognito's default look is enough for phase 1.
    new CfnManagedLoginBranding(this, "Branding", {
      userPoolId: this.userPool.userPoolId,
      clientId: this.client.userPoolClientId,
      useCognitoProvidedValues: true,
    });

    this.issuer = `https://cognito-idp.${Stack.of(this).region}.amazonaws.com/${this.userPool.userPoolId}`;
    this.scopes = [
      "openid",
      "email",
      "profile",
      ...props.apiScopes.map((s) => `${s.resourceServer}/${s.name}`),
    ];
  }
}
