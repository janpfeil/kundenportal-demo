# GitHub Actions → AWS without access keys: the deploy workflow exchanges its OIDC token
# for short-lived credentials of this role (deploy, teardown, DLQ probe, e2e test). Only the production environment of the one
# repository qualifies, so pull requests from forks never get AWS access.

data "aws_caller_identity" "current" {}

locals {
  account_id          = data.aws_caller_identity.current.account_id
  github_issuer_host  = "token.actions.githubusercontent.com"
  cdk_bootstrap_roles = [for kind in ["deploy", "file-publishing", "image-publishing", "lookup"] : "arn:aws:iam::${local.account_id}:role/cdk-${var.cdk_qualifier}-${kind}-role-${local.account_id}-*"]
}

resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://${local.github_issuer_host}"
  client_id_list = ["sts.amazonaws.com"]
}

data "aws_iam_policy_document" "github_trust" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "${local.github_issuer_host}:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "${local.github_issuer_host}:sub"
      values   = ["${var.github_subject_prefix}:environment:${var.github_environment}"]
    }
  }
}

resource "aws_iam_role" "github_deploy" {
  name                 = "kundenportal-github-deploy"
  description          = "GitHub Actions (${var.github_repository}, environment ${var.github_environment}): CDK deploy and destroy"
  assume_role_policy   = data.aws_iam_policy_document.github_trust.json
  permissions_boundary = aws_iam_policy.ci_boundary.arn
  max_session_duration = 3600
}

data "aws_iam_policy_document" "github_deploy" {
  statement {
    sid       = "UseCdkBootstrapRoles"
    actions   = ["sts:AssumeRole", "sts:TagSession"]
    resources = local.cdk_bootstrap_roles
  }

  statement {
    sid       = "ReadBootstrapVersion"
    actions   = ["ssm:GetParameter"]
    resources = ["arn:aws:ssm:*:${local.account_id}:parameter/cdk-bootstrap/${var.cdk_qualifier}/version"]
  }

  statement {
    sid       = "SendTestEventsToOwnBus"
    actions   = ["events:PutEvents"]
    resources = ["arn:aws:events:${var.region}:${local.account_id}:event-bus/kundenportal"]
  }

  statement {
    sid       = "ReadStackOutputs"
    actions   = ["cloudformation:DescribeStacks"]
    resources = ["arn:aws:cloudformation:${var.region}:${local.account_id}:stack/Kundenportal/*"]
  }

  # End-to-end test: a throw-away user per run, only in the project's own user pool.
  statement {
    sid = "EndToEndTestUsers"
    actions = [
      "cognito-idp:AdminCreateUser",
      "cognito-idp:AdminSetUserPassword",
      "cognito-idp:AdminDeleteUser",
    ]
    resources = ["arn:aws:cognito-idp:${var.region}:${local.account_id}:userpool/*"]

    condition {
      test     = "StringEquals"
      variable = "aws:ResourceTag/project"
      values   = [var.project]
    }
  }

  statement {
    sid = "CleanUpLogGroupsAfterTeardown"
    actions = [
      "logs:DescribeLogGroups",
      "logs:DeleteLogGroup",
    ]
    resources = [
      "arn:aws:logs:*:${local.account_id}:log-group:/aws/lambda/Kundenportal*",
      "arn:aws:logs:*:${local.account_id}:log-group::log-stream:",
    ]
  }
}

resource "aws_iam_role_policy" "github_deploy" {
  name   = "cdk-deploy"
  role   = aws_iam_role.github_deploy.id
  policy = data.aws_iam_policy_document.github_deploy.json
}
