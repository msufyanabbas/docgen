#!/usr/bin/env bash
# Container status, health and disk usage:  npm run deploy:status
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
load_config
setup_ssh
trap close_ssh EXIT

step "Containers"
rexec "cd $(rpath "$DEPLOY_DIR") && docker compose ps"

step "Health"
CODE=$(rexec "curl -s -o /dev/null -w '%{http_code}' http://localhost:$HOST_HTTP_PORT/api/health || true")
if [ "$CODE" = "200" ]; then
  ok "$(rexec "curl -s http://localhost:$HOST_HTTP_PORT/api/health")"
else
  warn "API returned $CODE on :$HOST_HTTP_PORT"
fi

step "Deployed commit"
rexec "cd $(rpath "$SRC_DIR") && git --no-pager log -1 --format='  %h — %s (%an, %ar)'" 2>/dev/null || warn "no source checkout yet"

step "Disk and memory"
rexec "df -h / | tail -1 | awk '{print \"  disk  \"\$3\" used of \"\$2\" (\"\$5\")\"}'; free -m | awk '/^Mem:/{print \"  mem   \"\$3\"MB used of \"\$2\"MB\"}'"

step "Docker images"
rexec "docker images '$IMAGE_PREFIX*' --format '  {{.Repository}}:{{.Tag}}  {{.Size}}  {{.CreatedSince}}'"
echo ""
