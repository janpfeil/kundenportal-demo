#!/usr/bin/env bash
# Removes the portal from AWS unattended.
#   teardown.sh          removes the application stack only (services, shell, API, events —
#                        the pay-per-use part); certificate, base (users, data, confirmed
#                        e-mail subscription) and edge (CloudFront, DNS target) stay, so the
#                        next deploy.sh brings the portal back under the same address.
#   teardown.sh --all    removes every stack; the next deploy creates a new CloudFront
#                        distribution, whose new domain the DNS record must then point to.
# CDK bootstrap and the Terraform foundation are never touched.
# shellcheck source=scripts/aws-env.sh
source "$(dirname "$0")/aws-env.sh"

ALL=false
for arg in "$@"; do
  case "$arg" in
    --all) ALL=true ;;
    *) echo "Unknown argument: $arg" >&2; exit 2 ;;
  esac
done

ensure_credentials
start=$(date +%s)

destroy() {
  local stack="$1" region="${2:-$AWS_REGION}"
  stack_exists "$stack" "$region" || { log "$stack: not deployed"; return 0; }
  log "Destroying $stack"
  if ! cdk destroy "$stack" --force --exclusively; then
    # Fallback for stacks stuck in ROLLBACK_FAILED/DELETE_FAILED (e.g. a non-empty bucket).
    [ "$region" = "$AWS_REGION" ] && delete_stack "$stack"
  fi
}

destroy KundenportalApp
delete_log_groups /aws/lambda/KundenportalApp-
delete_log_groups KundenportalApp-

if [ "$ALL" = true ]; then
  destroy KundenportalEdge
  destroy KundenportalBase
  destroy KundenportalCertificate us-east-1
  # Named log groups of the stacks (e.g. the static-file deployment) can be recreated by
  # a handler that logs while its stack is being deleted.
  delete_log_groups /aws/lambda/Kundenportal
  delete_log_groups Kundenportal
fi

log "Teardown done in $(( $(date +%s) - start )) s"
echo "TEARDOWN_SECONDS=$(( $(date +%s) - start ))"
