#!/usr/bin/env bash
# Shared helpers for deploy.sh and teardown.sh (sourced, not executed).
# AWS access comes from the environment: OIDC credentials in GitHub Actions, or locally a
# profile set up with `aws login` (AWS_PROFILE); nothing here asks questions.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CDK_DIR="$REPO_ROOT/infra/cdk"
export AWS_REGION="${AWS_REGION:-eu-central-1}"
export AWS_DEFAULT_REGION="$AWS_REGION"

log() { printf '%s %s\n' "$(date -u +%H:%M:%S)" "$*"; }

# Tools such as the CDK CLI do not all understand `aws login` sessions; hand them
# short-lived environment credentials instead.
ensure_credentials() {
  if [ -z "${AWS_ACCESS_KEY_ID:-}" ] && [ -n "${AWS_PROFILE:-}" ]; then
    eval "$(aws configure export-credentials --profile "$AWS_PROFILE" --format env)"
    unset AWS_PROFILE
  fi
  CDK_DEFAULT_ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
  export CDK_DEFAULT_ACCOUNT
  log "AWS account $CDK_DEFAULT_ACCOUNT, region $AWS_REGION"
}

# True if the stack exists. Fails loudly on any other error (e.g. missing permissions),
# so a teardown can never silently skip a stack it was not allowed to see.
stack_exists() {
  local region="${2:-$AWS_REGION}" out
  if out=$(aws cloudformation describe-stacks --region "$region" --stack-name "$1" \
    --query 'Stacks[0].StackStatus' --output text 2>&1); then
    [ "$out" != "DELETE_COMPLETE" ]
  elif grep -q "does not exist" <<<"$out"; then
    return 1
  else
    echo "Cannot check stack $1 in $region: $out" >&2
    exit 1
  fi
}

# Empties every S3 bucket of a stack, so deleting it can never stall on a non-empty bucket.
empty_stack_buckets() {
  local stack="$1" bucket
  for bucket in $(aws cloudformation list-stack-resources --stack-name "$stack" \
    --query "StackResourceSummaries[?ResourceType=='AWS::S3::Bucket'].PhysicalResourceId" --output text); do
    log "Emptying bucket $bucket"
    aws s3 rm "s3://$bucket" --recursive --quiet || true
  done
}

# Deletes a stack directly through CloudFormation (used for stacks the CDK app no longer
# defines, and as a fallback after a failed rollback).
delete_stack() {
  local stack="$1"
  stack_exists "$stack" || return 0
  empty_stack_buckets "$stack"
  log "Deleting stack $stack"
  aws cloudformation delete-stack --stack-name "$stack"
  aws cloudformation wait stack-delete-complete --stack-name "$stack"
}

# Lambda creates log groups for custom-resource handlers outside CloudFormation.
delete_log_groups() {
  local prefix="$1" region group
  for region in eu-central-1 us-east-1; do
    for group in $(aws logs describe-log-groups --region "$region" --log-group-name-prefix "$prefix" \
      --query 'logGroups[].logGroupName' --output text); do
      log "Deleting log group $group ($region)"
      aws logs delete-log-group --region "$region" --log-group-name "$group"
    done
  done
}

cdk() { (cd "$CDK_DIR" && pnpm exec cdk "$@"); }
