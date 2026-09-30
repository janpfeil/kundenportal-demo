# Access of the portal's Lambdas to the legacy systems (read at run time, never at deploy
# time). Standard parameters are free; SecureStrings use the AWS managed key aws/ssm (free,
# unlike Secrets Manager). Names: infra/cdk/lib/parameters.ts (PARAM.legacy).

locals {
  legacy_parameters = var.legacy_enabled ? {
    "utility/url"            = { type = "String", value = var.legacy_utility_url }
    "utility/api-key"        = { type = "SecureString", value = var.legacy_utility_api_key }
    "telco/url"              = { type = "String", value = var.legacy_telco_url }
    "telco/api-key"          = { type = "SecureString", value = var.legacy_telco_api_key }
    "keycloak/issuer"        = { type = "String", value = "${var.keycloak_url}/realms/${var.keycloak_realm}" }
    "keycloak/client-id"     = { type = "String", value = var.keycloak_migration_client_id }
    "keycloak/client-secret" = { type = "SecureString", value = var.keycloak_migration_client_secret }
  } : {}
}

resource "aws_ssm_parameter" "legacy" {
  for_each    = local.legacy_parameters
  name        = "/kundenportal/legacy/${each.key}"
  description = "Legacy systems (phase 3): ${each.key}"
  type        = each.value.type
  value       = each.value.value

  lifecycle {
    precondition {
      condition     = each.value.value != ""
      error_message = "The value of /kundenportal/legacy/${each.key} is empty; set the matching TF_VAR_ variable."
    }
  }
}
