# GitLab CI (self-hosted, gitlab.rypox.org) → AWS without access keys. Only pipelines of
# the platform project on its protected main branch may assume the foundation role.
#
# The foundation role can manage IAM roles, which could be abused to grant itself more
# rights. Both CI roles therefore carry a permissions boundary that caps their effective
# rights; the foundation role may only create or change roles that keep this boundary and
# may never change the boundary itself (that stays a local, owner-only change).

locals {
  gitlab_host = trimprefix(var.gitlab_url, "https://")
}

data "tls_certificate" "gitlab" {
  url = var.gitlab_url
}

resource "aws_iam_openid_connect_provider" "gitlab" {
  url             = var.gitlab_url
  client_id_list  = [var.gitlab_url]
  thumbprint_list = [data.tls_certificate.gitlab.certificates[length(data.tls_certificate.gitlab.certificates) - 1].sha1_fingerprint]
}

data "aws_iam_policy_document" "gitlab_trust" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.gitlab.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "${local.gitlab_host}:aud"
      values   = [var.gitlab_url]
    }

    condition {
      test     = "StringEquals"
      variable = "${local.gitlab_host}:sub"
      values   = ["project_path:${var.gitlab_project_path}:ref_type:branch:ref:${var.gitlab_branch}"]
    }
  }
}

resource "aws_iam_role" "gitlab_foundation" {
  name                 = "kundenportal-gitlab-foundation"
  description          = "GitLab CI (${var.gitlab_project_path}, ${var.gitlab_branch}): Terraform foundation"
  assume_role_policy   = data.aws_iam_policy_document.gitlab_trust.json
  permissions_boundary = aws_iam_policy.ci_boundary.arn
  max_session_duration = 3600
}

locals {
  managed_roles      = "arn:aws:iam::${local.account_id}:role/kundenportal-*"
  managed_parameters = "arn:aws:ssm:${var.region}:${local.account_id}:parameter/kundenportal/*"
  boundary_arn       = "arn:aws:iam::${local.account_id}:policy/kundenportal-ci-boundary"
}

data "aws_iam_policy_document" "gitlab_foundation" {
  statement {
    sid = "ManageOidcProviders"
    actions = [
      "iam:CreateOpenIDConnectProvider",
      "iam:DeleteOpenIDConnectProvider",
      "iam:GetOpenIDConnectProvider",
      "iam:TagOpenIDConnectProvider",
      "iam:UntagOpenIDConnectProvider",
      "iam:UpdateOpenIDConnectProviderThumbprint",
      "iam:AddClientIDToOpenIDConnectProvider",
      "iam:RemoveClientIDFromOpenIDConnectProvider",
    ]
    resources = ["arn:aws:iam::${local.account_id}:oidc-provider/*"]
  }

  statement {
    sid       = "ListIam"
    actions   = ["iam:ListOpenIDConnectProviders", "iam:ListPolicies"]
    resources = ["*"]
  }

  statement {
    sid = "ReadAndMaintainProjectRoles"
    actions = [
      "iam:GetRole",
      "iam:GetRolePolicy",
      "iam:ListRolePolicies",
      "iam:ListAttachedRolePolicies",
      "iam:ListInstanceProfilesForRole",
      "iam:UpdateRole",
      "iam:UpdateRoleDescription",
      "iam:UpdateAssumeRolePolicy",
      "iam:TagRole",
      "iam:UntagRole",
      "iam:DeleteRole",
      "iam:DeleteRolePolicy",
    ]
    resources = [local.managed_roles]
  }

  statement {
    sid       = "ChangeRolesOnlyWithBoundary"
    actions   = ["iam:CreateRole", "iam:PutRolePolicy", "iam:PutRolePermissionsBoundary"]
    resources = [local.managed_roles]

    condition {
      test     = "StringEquals"
      variable = "iam:PermissionsBoundary"
      values   = [local.boundary_arn]
    }
  }

  statement {
    sid       = "ReadBoundary"
    actions   = ["iam:GetPolicy", "iam:GetPolicyVersion", "iam:ListPolicyVersions", "iam:ListPolicyTags"]
    resources = [local.boundary_arn]
  }

  statement {
    sid = "Budget"
    actions = [
      "budgets:ViewBudget",
      "budgets:ModifyBudget",
      "budgets:ListTagsForResource",
      "budgets:TagResource",
      "budgets:UntagResource",
    ]
    resources = ["arn:aws:budgets::${local.account_id}:budget/kundenportal-*"]
  }

  statement {
    sid = "BudgetTopic"
    actions = [
      "sns:CreateTopic",
      "sns:DeleteTopic",
      "sns:GetTopicAttributes",
      "sns:SetTopicAttributes",
      "sns:ListTagsForResource",
      "sns:TagResource",
      "sns:UntagResource",
      "sns:Subscribe",
      "sns:Unsubscribe",
      "sns:GetSubscriptionAttributes",
      "sns:SetSubscriptionAttributes",
      "sns:ListSubscriptionsByTopic",
    ]
    resources = ["arn:aws:sns:${var.region}:${local.account_id}:kundenportal-*"]
  }

  statement {
    sid = "Parameters"
    actions = [
      "ssm:PutParameter",
      "ssm:GetParameter",
      "ssm:GetParameters",
      "ssm:DeleteParameter",
      "ssm:AddTagsToResource",
      "ssm:RemoveTagsFromResource",
      "ssm:ListTagsForResource",
    ]
    resources = [local.managed_parameters]
  }

  statement {
    sid       = "DescribeParameters"
    actions   = ["ssm:DescribeParameters"]
    resources = ["*"]
  }

  # SecureString parameters of the legacy systems (phase 3) use the AWS managed key
  # aws/ssm; the role may use it only through SSM.
  statement {
    sid       = "SecureParametersViaSsm"
    actions   = ["kms:Encrypt", "kms:Decrypt", "kms:GenerateDataKey"]
    resources = ["*"]

    condition {
      test     = "StringEquals"
      variable = "kms:ViaService"
      values   = ["ssm.${var.region}.amazonaws.com"]
    }
  }
}

data "aws_iam_policy_document" "gitlab_foundation_guard" {
  statement {
    sid    = "NeverTouchTheBoundaryOrManagedPolicies"
    effect = "Deny"
    actions = [
      "iam:CreatePolicy",
      "iam:CreatePolicyVersion",
      "iam:DeletePolicy",
      "iam:DeletePolicyVersion",
      "iam:SetDefaultPolicyVersion",
      "iam:AttachRolePolicy",
      "iam:DeleteRolePermissionsBoundary",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "gitlab_foundation" {
  name   = "terraform-foundation"
  role   = aws_iam_role.gitlab_foundation.id
  policy = data.aws_iam_policy_document.gitlab_foundation.json
}

resource "aws_iam_role_policy" "gitlab_foundation_guard" {
  name   = "guard"
  role   = aws_iam_role.gitlab_foundation.id
  policy = data.aws_iam_policy_document.gitlab_foundation_guard.json
}

# Upper limit for both CI roles: what they may do at most, whatever their own policies say.
data "aws_iam_policy_document" "ci_boundary" {
  source_policy_documents = [
    data.aws_iam_policy_document.github_deploy.json,
    data.aws_iam_policy_document.gitlab_foundation.json,
  ]
}

resource "aws_iam_policy" "ci_boundary" {
  name        = "kundenportal-ci-boundary"
  description = "Permissions boundary of the CI roles (changed only by the owner, locally)"
  policy      = data.aws_iam_policy_document.ci_boundary.json
}
