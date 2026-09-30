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
  },
  app: {
    shellFunctionArn: "/kundenportal/app/shell-function-arn",
    shellOriginDomain: "/kundenportal/app/shell-origin-domain",
    apiOriginDomain: "/kundenportal/app/api-origin-domain",
  },
} as const;
