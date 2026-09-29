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
