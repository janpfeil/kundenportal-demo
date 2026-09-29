#!/usr/bin/env bash
# Deploys the whole portal unattended and deterministically. Safe to run repeatedly:
#   1. build (services, shell, CDK synth) — skip with --skip-build if already built
#   2. certificate, base and app stacks
#   3. edge stack, forced, so CloudFront points at the (possibly new) app origins
# The CloudFront distribution and its domain survive app teardowns, so DNS never changes.
#
# Environment: AWS credentials (or AWS_PROFILE), optional RESERVED_CONCURRENCY (default 2).
# shellcheck source=scripts/aws-env.sh
source "$(dirname "$0")/aws-env.sh"

SKIP_BUILD=false
for arg in "$@"; do
  case "$arg" in
    --skip-build) SKIP_BUILD=true ;;
    *) echo "Unknown argument: $arg" >&2; exit 2 ;;
  esac
done

ensure_credentials
start=$(date +%s)

if [ "$SKIP_BUILD" = false ]; then
  log "Building"
  (cd "$REPO_ROOT" && pnpm build)
fi
build_done=$(date +%s)

# One-off migration: the former single stack held the domain alias and must go first.
if stack_exists Kundenportal; then
  log "Removing the former single stack 'Kundenportal'"
  delete_stack Kundenportal
  delete_log_groups /aws/lambda/Kundenportal-
fi

CONTEXT=(-c "reservedConcurrency=${RESERVED_CONCURRENCY:-2}")
OUTPUTS="$CDK_DIR/cdk-outputs.json"
COMMON=(--require-approval never --exclusively --progress events "${CONTEXT[@]}")

log "Deploying certificate, base and app"
cdk deploy KundenportalCertificate KundenportalBase KundenportalApp "${COMMON[@]}" --outputs-file "$OUTPUTS.core"
app_done=$(date +%s)

log "Deploying edge (re-pointing CloudFront at the app)"
cdk deploy KundenportalEdge "${COMMON[@]}" --force --outputs-file "$OUTPUTS.edge"
end=$(date +%s)

node -e '
  const [a, b, out] = process.argv.slice(1);
  const fs = require("fs");
  fs.writeFileSync(out, JSON.stringify({ ...JSON.parse(fs.readFileSync(a)), ...JSON.parse(fs.readFileSync(b)) }, null, 2));
' "$OUTPUTS.core" "$OUTPUTS.edge" "$OUTPUTS"
rm -f "$OUTPUTS.core" "$OUTPUTS.edge"

log "Done: build $((build_done - start)) s, certificate/base/app $((app_done - build_done)) s, edge $((end - app_done)) s, total $((end - start)) s"
echo "BUILD_SECONDS=$((build_done - start))"
echo "CORE_SECONDS=$((app_done - build_done))"
echo "EDGE_SECONDS=$((end - app_done))"
echo "TOTAL_SECONDS=$((end - start))"
