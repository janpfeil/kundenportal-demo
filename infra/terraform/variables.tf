variable "region" {
  description = "AWS region of the application."
  type        = string
  default     = "eu-central-1"
}

variable "project" {
  description = "Value of the project tag on every resource."
  type        = string
  default     = "kundenportal-demo"
}

variable "owner_email" {
  description = "E-mail address of the owner for budget alerts and hints (kept out of the repository; set TF_VAR_owner_email)."
  type        = string

  validation {
    condition     = can(regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", var.owner_email))
    error_message = "owner_email must be an e-mail address."
  }
}

variable "github_repository" {
  description = "GitHub repository (owner/name) whose deploy workflow may assume the deploy role."
  type        = string
  default     = "janpfeil/kundenportal-demo"
}

variable "github_subject_prefix" {
  description = "Subject prefix GitHub puts into OIDC tokens of the repository. GitHub uses immutable owner and repository IDs (owner@id/repo@id), so a renamed or re-created repository with the same name cannot assume the role. Read it with: gh api repos/<owner>/<repo>/actions/oidc/customization/sub"
  type        = string
  default     = "repo:janpfeil@5345175/kundenportal-demo@1395090655"

  validation {
    condition     = can(regex("^repo:[^/@]+@[0-9]+/[^/@]+@[0-9]+$", var.github_subject_prefix))
    error_message = "github_subject_prefix must look like repo:owner@id/name@id."
  }
}

variable "github_environment" {
  description = "GitHub environment that guards deployments (requires the owner's approval)."
  type        = string
  default     = "production"
}

variable "gitlab_url" {
  description = "Issuer URL of the self-hosted GitLab (OIDC for CI jobs)."
  type        = string
  default     = "https://gitlab.rypox.org"
}

variable "gitlab_project_path" {
  description = "GitLab project whose pipeline manages this foundation."
  type        = string
  default     = "saas/kundenportal-demo/platform"
}

variable "gitlab_branch" {
  description = "Protected branch of the GitLab project that may assume the foundation role."
  type        = string
  default     = "main"
}

variable "cdk_qualifier" {
  description = "Qualifier of the CDK bootstrap stack (default of cdk bootstrap)."
  type        = string
  default     = "hnb659fds"
}

variable "monthly_budget_usd" {
  description = "Monthly cost budget; alerts fire long before this amount (first cent)."
  type        = number
  default     = 1
}

# --- Phase 3: legacy systems and the telco's Keycloak realm ---------------------------
# The realm "telko" itself is imported by the deploy of the private project legacy-telko
# (kcadm.sh, secrets in its Ansible vault). Terraform only hands the access data to the
# portal's Lambdas as SSM parameters. Secrets come from CI/CD variables of the GitLab
# project platform (TF_VAR_…, masked and protected), never from the repository.

variable "legacy_enabled" {
  description = "Writes the legacy SSM parameters. Set TF_VAR_legacy_enabled=true once the variables below exist."
  type        = bool
  default     = false
}

variable "keycloak_url" {
  description = "Base URL of the own Keycloak."
  type        = string
  default     = "https://id.rypox.net"
}

variable "keycloak_realm" {
  description = "Realm of the telco's legacy sign-in."
  type        = string
  default     = "telko"
}

variable "keycloak_migration_client_id" {
  description = "Confidential client of that realm the migrate user trigger uses (password grant)."
  type        = string
  default     = "kundenportal-migration"
}

variable "keycloak_migration_client_secret" {
  description = "Secret of that client; the same value as vault_keycloak_client_secret in legacy-telko (TF_VAR_keycloak_migration_client_secret)."
  type        = string
  default     = ""
  sensitive   = true
}

variable "legacy_utility_url" {
  description = "HTTPS base URL of the utility's legacy system."
  type        = string
  default     = "https://kundenportal-versorger.rypox.com"
}

variable "legacy_telco_url" {
  description = "HTTPS base URL of the telco's legacy system."
  type        = string
  default     = "https://kundenportal-telko.rypox.com"
}

variable "legacy_utility_api_key" {
  description = "API key of the utility's legacy system; the same as vault_legacy_api_key of legacy-versorger (TF_VAR_legacy_utility_api_key)."
  type        = string
  default     = ""
  sensitive   = true
}

variable "legacy_telco_api_key" {
  description = "API key of the telco's legacy system; the same as vault_legacy_api_key of legacy-telko (TF_VAR_legacy_telco_api_key)."
  type        = string
  default     = ""
  sensitive   = true
}
