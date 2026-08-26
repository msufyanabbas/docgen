#!/usr/bin/env bash
# Restore the images from the previous deploy:  npm run deploy:rollback
#
# Every deploy retags the running images ':previous' before overwriting ':latest',
# so this swaps them back without rebuilding.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
load_config
setup_ssh
trap close_ssh EXIT

step "Checking for a rollback target"
HAVE=$(remote_script "PREFIX='$IMAGE_PREFIX'" <<'ENDSSH'
docker image inspect "$PREFIX-backend:previous"  >/dev/null 2>&1 \
  && docker image inspect "$PREFIX-frontend:previous" >/dev/null 2>&1 \
  && docker images "$PREFIX*:previous" --format "  {{.Repository}}:{{.Tag}}  {{.CreatedSince}}" \
  || echo "NONE"
ENDSSH
)

if [ "$HAVE" = "NONE" ] || [ -z "$HAVE" ]; then
  die "No ':previous' images on the server - nothing to roll back to."
fi
echo "$HAVE"

confirm "Roll back to these?" || exit 0

set +e
remote_script \
  "PREFIX='$IMAGE_PREFIX'" \
  "DEPLOY='$(rpath "$DEPLOY_DIR")'" \
  "PORT='$HOST_HTTP_PORT'" \
  <<'ENDSSH'
set -uo pipefail
G=$'\033[32m'; Y=$'\033[33m'; N=$'\033[0m'

for svc in backend frontend; do
  # Keep the bad build reachable as :failed in case it needs inspecting.
  docker image inspect "$PREFIX-$svc:latest" >/dev/null 2>&1 \
    && docker tag "$PREFIX-$svc:latest" "$PREFIX-$svc:failed"
  docker tag "$PREFIX-$svc:previous" "$PREFIX-$svc:latest" || exit 1
done

cd "$DEPLOY" || exit 1
docker compose up -d --force-recreate || exit 1
echo "  ${G}[ok]${N} previous images restored"

for _ in $(seq 1 20); do
  CODE=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT/api/health" 2>/dev/null)
  [ "$CODE" = "200" ] && { echo "  ${G}[ok]${N} healthy again"; exit 0; }
  sleep 3
done
echo "  ${Y}[!]${N} still not answering - check 'npm run deploy:logs'"
ENDSSH
RC=$?
set -e
echo ""
exit $RC
