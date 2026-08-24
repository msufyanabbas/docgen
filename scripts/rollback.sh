#!/usr/bin/env bash
# Restore the images from the previous deploy:  npm run deploy:rollback
#
# Every deploy retags the running images as ':previous' before overwriting
# ':latest', so this swaps them back without rebuilding anything.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
load_config
setup_ssh
trap close_ssh EXIT

step "Checking for a rollback target"
HAVE=$(rexec "docker image inspect '$IMAGE_PREFIX-backend:previous' >/dev/null 2>&1 && docker image inspect '$IMAGE_PREFIX-frontend:previous' >/dev/null 2>&1 && echo yes || echo no")
[ "$HAVE" = "yes" ] || die "No ':previous' images on the server — nothing to roll back to."

rexec "docker images '$IMAGE_PREFIX*:previous' --format '  {{.Repository}}:{{.Tag}}  {{.CreatedSince}}'"

confirm "Roll back to these?" || exit 0

step "Swapping images"
rexec "PREFIX='$IMAGE_PREFIX' DEPLOY='$DEPLOY_DIR' bash -se" <<'ENDSSH'
set -euo pipefail
DEPLOY="${DEPLOY/#\~/$HOME}"
for svc in backend frontend; do
  # Keep the bad build reachable as :failed in case it needs inspecting.
  docker image inspect "$PREFIX-$svc:latest" >/dev/null 2>&1 \
    && docker tag "$PREFIX-$svc:latest" "$PREFIX-$svc:failed"
  docker tag "$PREFIX-$svc:previous" "$PREFIX-$svc:latest"
done
cd "$DEPLOY"
docker compose up -d --force-recreate
ENDSSH
ok "Previous images restored"

step "Health"
for _ in $(seq 1 20); do
  CODE=$(rexec "curl -s -o /dev/null -w '%{http_code}' http://localhost:$HOST_HTTP_PORT/api/health || true")
  [ "$CODE" = "200" ] && { ok "Healthy again"; break; }
  sleep 3
done
echo ""
