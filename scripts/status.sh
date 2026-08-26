#!/usr/bin/env bash
# Container status, health and disk usage:  npm run deploy:status
# Runs as one remote session, so password auth prompts once.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
load_config
setup_ssh
trap close_ssh EXIT

remote_script \
  "DEPLOY='$(rpath "$DEPLOY_DIR")'" \
  "SRC='$(rpath "$SRC_DIR")'" \
  "PORT='$HOST_HTTP_PORT'" \
  "PREFIX='$IMAGE_PREFIX'" \
  <<'ENDSSH'
B=$'\033[34m\033[1m'; G=$'\033[32m'; Y=$'\033[33m'; D=$'\033[2m'; N=$'\033[0m'
step() { echo ""; echo "${B}> $*${N}"; }

step "Containers"
cd "$DEPLOY" 2>/dev/null && docker compose ps || echo "  no deployment at $DEPLOY"

step "Health"
CODE=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT/api/health" 2>/dev/null)
if [ "$CODE" = "200" ]; then
  echo "  ${G}[ok]${N} $(curl -s "http://localhost:$PORT/api/health")"
else
  echo "  ${Y}[!]${N} API returned ${CODE:-no response} on :$PORT"
fi

step "Deployed commit"
if [ -d "$SRC/.git" ]; then
  cd "$SRC" && git --no-pager log -1 --format="  %h - %s (%an, %ar)"
else
  echo "  no source checkout yet"
fi

step "Disk and memory"
df -h / | tail -1 | awk '{print "  disk  "$3" used of "$2" ("$5")"}'
free -m | awk '/^Mem:/{print "  mem   "$3"MB used of "$2"MB"}'
free -m | awk '/^Swap:/{print "  swap  "$3"MB used of "$2"MB"}'

step "Images"
docker images "$PREFIX*" --format "  {{.Repository}}:{{.Tag}}  {{.Size}}  {{.CreatedSince}}"
echo ""
ENDSSH
