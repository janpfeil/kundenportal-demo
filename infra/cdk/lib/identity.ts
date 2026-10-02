import { Duration, RemovalPolicy, Stack } from "aws-cdk-lib";
import type { ITable } from "aws-cdk-lib/aws-dynamodb";
import { PolicyStatement } from "aws-cdk-lib/aws-iam";
import {
  AccountRecovery,
  CfnManagedLoginBranding,
  CfnUserPoolGroup,
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
import { grantLegacyAccess } from "./legacy-access.js";
import { loginBrandingAssets, loginBrandingSettings } from "./login-branding.js";

/** Name of the EventBridge bus of the app stack; the identity triggers publish to it. */
export const EVENT_BUS_NAME = "kundenportal";
/** Cognito group of the portal owner (migration cockpit). */
export const OWNER_GROUP = "owner";

/** Cognito group of demo-pass holders (phase 4): their own tenant's cockpit and pass status. */
export const PASS_GROUP = "pass";

export interface IdentityProps {
  domainName: string;
  cognitoDomainPrefix: string;
  allowLocalhostCallback: boolean;
  reservedConcurrency: number;
  /** API scopes from the OpenAPI contract, e.g. `kundenportal/profile.read`. */
  apiScopes: { resourceServer: string; name: string }[];
  /** Single table; the post authentication trigger keeps its marker there. */
  table: ITable;
  /** Phase 4: role the triggers assume for a pass tenant's own table (token vending). */
  tenantDataRoleArn: string;
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
        // Phase 3: the legacy account a user came from (`utility:V-1000123`) and how
        // (`lazy` at the first sign-in, `bulk` by the import). Set only by the platform.
        legacy_ref: new StringAttribute({ minLen: 1, maxLen: 64, mutable: false }),
        migration_mode: new StringAttribute({ minLen: 1, maxLen: 8, mutable: false }),
      },
      passwordPolicy: { minLength: 12, requireSymbols: false },
      accountRecovery: AccountRecovery.EMAIL_ONLY,
      deletionProtection: false,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // Lazy migration (J2): unknown users are checked against the legacy systems.
    const migrateUser = new ServiceFunction(this, "UserMigration", {
      entry: "services/identity/src/user-migration.ts",
      description: "Lazy migration: checks unknown users at the legacy systems",
      reservedConcurrency: props.reservedConcurrency,
      // Cognito waits at most 5 seconds for a trigger.
      timeout: Duration.seconds(5),
      // Reads the pass tenant of a plus address (`anna.becker+<tenant>@…`) in the base table.
      environment: { TABLE_NAME: props.table.tableName },
    });
    grantLegacyAccess(migrateUser);
    props.table.grantReadData(migrateUser);
    this.userPool.addTrigger(UserPoolOperation.USER_MIGRATION, migrateUser);

    // After the first sign-in of a migrated user: publish LegacyAccountMigrated. Both
    // triggers try (the documentation leaves open which fires on the migrating sign-in);
    // a marker in the table makes it happen once.
    const announcer = (id: string, entry: string, description: string) => {
      const fn = new ServiceFunction(this, id, {
        entry,
        description,
        reservedConcurrency: props.reservedConcurrency,
        timeout: Duration.seconds(5),
        environment: {
          TABLE_NAME: props.table.tableName,
          EVENT_BUS_NAME,
          TENANT_DATA_ROLE_ARN: props.tenantDataRoleArn,
        },
      });
      grantLegacyAccess(fn);
      props.table.grantReadWriteData(fn);
      fn.addToRolePolicy(
        new PolicyStatement({
          actions: ["sts:AssumeRole", "sts:TagSession"],
          resources: [props.tenantDataRoleArn],
        }),
      );
      // The bus lives in the app stack; the name is fixed, so no reference between the stacks.
      fn.addToRolePolicy(
        new PolicyStatement({
          actions: ["events:PutEvents"],
          resources: [
            Stack.of(this).formatArn({
              service: "events",
              resource: "event-bus",
              resourceName: EVENT_BUS_NAME,
            }),
          ],
        }),
      );
      return fn;
    };
    const tokenClaims = announcer(
      "PreTokenGeneration",
      "services/identity/src/pre-token-generation-handler.ts",
      "Adds tenant, email, locale, name, origin to access tokens; announces lazy migrations",
    );
    this.userPool.addTrigger(
      UserPoolOperation.PRE_TOKEN_GENERATION_CONFIG,
      tokenClaims,
      LambdaVersion.V2_0,
    );
    const postAuthentication = announcer(
      "PostAuthentication",
      "services/identity/src/post-authentication-handler.ts",
      "Announces lazily migrated accounts (LegacyAccountMigrated)",
    );
    this.userPool.addTrigger(UserPoolOperation.POST_AUTHENTICATION, postAuthentication);

    new CfnUserPoolGroup(this, "OwnerGroup", {
      userPoolId: this.userPool.userPoolId,
      groupName: OWNER_GROUP,
      description: "Portal owner: migration cockpit",
    });

    new CfnUserPoolGroup(this, "PassGroup", {
      userPoolId: this.userPool.userPoolId,
      groupName: PASS_GROUP,
      description: "Demo-pass holders: own tenant only",
    });

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
      // Password flow: the migrate user trigger only runs for password-based sign-ins
      // (not SRP); AWS asks to allow it on the client before adding the trigger.
      authFlows: { userPassword: true },
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

    // Managed login needs a style per client: the portal's colours, icon and logo (preset
    // "klar", light and dark), see login-branding.ts.
    new CfnManagedLoginBranding(this, "Branding", {
      userPoolId: this.userPool.userPoolId,
      clientId: this.client.userPoolClientId,
      useCognitoProvidedValues: false,
      settings: loginBrandingSettings(),
      assets: loginBrandingAssets(),
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
