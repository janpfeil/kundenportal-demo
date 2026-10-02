#!/usr/bin/env bash
# One-off backfill of the operator's customer and contract directories (phase 7, §3.7) for
# a tenant (default: owner). Reads with a paced Scan and writes at most 2 items per second,
# so it takes a few minutes and never exhausts the table's 5 read/write units. Safe to run
# again: a finished run leaves a mark per domain and the next one writes nothing.
#
#   AWS_PROFILE=kundenportal scripts/backfill-directory.sh [tenantId]
# shellcheck source=scripts/aws-env.sh
source "$(dirname "$0")/aws-env.sh"

ensure_credentials
TABLE_NAME="$(aws ssm get-parameter --name /kundenportal/base/table-name --query Parameter.Value --output text)"
export TABLE_NAME
log "Backfilling the directories of tenant ${1:-owner} in $TABLE_NAME"
pnpm --silent --filter @kundenportal/infra-cdk exec tsx "$REPO_ROOT/scripts/backfill-directory.mts" "${1:-owner}"
