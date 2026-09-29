output "github_deploy_role_arn" {
  description = "Set as GitHub environment variable AWS_DEPLOY_ROLE_ARN (environment production)."
  value       = aws_iam_role.github_deploy.arn
}

output "gitlab_foundation_role_arn" {
  description = "Set as GitLab CI/CD variable AWS_ROLE_ARN in the platform project."
  value       = aws_iam_role.gitlab_foundation.arn
}

output "budget_alerts_topic_arn" {
  description = "SNS topic that receives budget alerts."
  value       = aws_sns_topic.budget_alerts.arn
}
