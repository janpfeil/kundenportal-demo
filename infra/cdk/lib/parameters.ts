/**
 * SSM parameter names that couple the stacks. Values are resolved by CloudFormation at
 * deploy time, so a stack can be destroyed and rebuilt without CloudFormation exports
 * blocking it — this is what lets the edge (and its DNS name) outlive the application.
 */
export const PARAM = {
  /** Written by Terraform (foundation). */
  ownerEmail: "/kundenportal/owner-email",
  base: {
    userPoolId: "/kundenportal/base/user-pool-id",
    userPoolClientId: "/kundenportal/base/user-pool-client-id",
    issuer: "/kundenportal/base/oidc-issuer",
    scopes: "/kundenportal/base/oidc-scopes",
    logoutUrl: "/kundenportal/base/oidc-logout-url",
    tableName: "/kundenportal/base/table-name",
    ownerTopicArn: "/kundenportal/base/owner-topic-arn",
    uploadBucketName: "/kundenportal/base/upload-bucket-name",
    /** Phase 4: role the shared Lambdas assume per pass tenant (token vending). */
    tenantDataRoleArn: "/kundenportal/base/tenant-data-role-arn",
    /** Phase 4: schedule group of the one-time pass expiry schedules. */
    passScheduleGroup: "/kundenportal/base/pass-schedule-group",
  },
  /**
   * Access to the legacy systems (phase 3). Written by Terraform from GitLab CI variables;
   * API keys and the Keycloak client secret as SecureString with the AWS managed key.
   */
  legacy: {
    utilityUrl: "/kundenportal/legacy/utility/url",
    utilityApiKey: "/kundenportal/legacy/utility/api-key",
    telcoUrl: "/kundenportal/legacy/telco/url",
    telcoApiKey: "/kundenportal/legacy/telco/api-key",
    keycloakIssuer: "/kundenportal/legacy/keycloak/issuer",
    keycloakClientId: "/kundenportal/legacy/keycloak/client-id",
    keycloakClientSecret: "/kundenportal/legacy/keycloak/client-secret",
  },
  app: {
    shellFunctionArn: "/kundenportal/app/shell-function-arn",
    shellOriginDomain: "/kundenportal/app/shell-origin-domain",
    apiOriginDomain: "/kundenportal/app/api-origin-domain",
  },
} as const;
