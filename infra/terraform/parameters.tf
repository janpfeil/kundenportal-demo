# Hand-over to the application (CDK reads these at deploy time). SSM standard
# parameters are free; nothing secret is stored here.

resource "aws_ssm_parameter" "owner_email" {
  name        = "/kundenportal/owner-email"
  description = "E-mail address for owner hints of the application (SNS subscription)"
  type        = "String"
  value       = var.owner_email
}

resource "aws_ssm_parameter" "budget_topic" {
  name        = "/kundenportal/budget-alerts-topic-arn"
  description = "SNS topic of the budget alerts (basis for a kill switch)"
  type        = "String"
  value       = aws_sns_topic.budget_alerts.arn
}
