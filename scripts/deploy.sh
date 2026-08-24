#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Deploy to the server.
#
#   npm run deploy                 build changed layers and restart
#   npm run deploy -- --no-cache   full rebuild
#   npm run deploy -- --branch dev deploy another branch
#   npm run deploy -- --skip-pull  redeploy what's already on the server
#
# The server pulls from GitHub and builds there — nothing large is uploaded.
# ---------------------------------------------------------------------------

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

NO_CACHE=""
SKIP_PULL=""
OVERRIDE_BRANCH=""

while [ $# -gt 0 ]; do
  case "$1" in
    --no-cache)  NO_CACHE="--no-cache"; shift ;;
    --skip-pull) SKIP_PULL="1"; shift ;;
    --branch)    OVERRIDE_BRANCH="$2"; shift 2 ;;
    -h|--help)   sed -n '2,12p' "$0"; exit 0 ;;
    *)           die "Unknown option: $1" ;;
  esac
done

load_config
[ -n "$OVERRIDE_BRANCH" ] && BRANCH="$OVERRIDE_BRANCH"

echo ""
echo "${C_BOLD}Tawal DocGen — deploy${C_RESET}"
info "server   $SERVER:$SERVER_PORT"
info "branch   $BRANCH"
info "domain   ${DOMAIN:-<not set>} (container port $HOST_HTTP_PORT)"

setup_ssh
trap close_ssh EXIT

START=$(date +%s)

# ---------------------------------------------------------------- preflight
step "Checking the server is ready"
MISSING=$(rexec bash -se <<'ENDSSH'
command -v docker >/dev/null 2>&1        || echo "docker"
docker compose version >/dev/null 2>&1   || echo "docker-compose-plugin"
command -v git >/dev/null 2>&1           || echo "git"
command -v curl >/dev/null 2>&1          || echo "curl"
ENDSSH
)
if [ -n "$MISSING" ]; then
  die "The server is missing: $(echo "$MISSING" | tr '\n' ' ')
    Run 'npm run deploy:setup' first — it installs these."
fi
ok "docker, compose, git and curl present"

# The deploy directory may sit under /var/www, which the deploy user might not own.
WRITABLE=$(rexec "[ -d '$(rpath "$DEPLOY_DIR")' ] && [ -w '$(rpath "$DEPLOY_DIR")' ] && echo yes || echo no")
[ "$WRITABLE" = "yes" ] || die "$DEPLOY_DIR is missing or not writable by $SERVER_USER.
    Run 'npm run deploy:setup' — it creates it and fixes ownership."

# Building two images needs real memory. The last project's server-side build
# died on a 1GB box, so refuse to start rather than take the site down.
AVAIL_MB=$(rexec "free -m | awk '/^Mem:/{print \$7}'")
SWAP_MB=$(rexec "free -m | awk '/^Swap:/{print \$2}'")
TOTAL=$(( AVAIL_MB + SWAP_MB ))
info "memory available ${AVAIL_MB}MB + ${SWAP_MB}MB swap"
if [ "$TOTAL" -lt 1800 ]; then
  warn "Under ~1.8GB usable. The frontend build (vite) and backend build (nest) may be OOM-killed."
  warn "Run 'npm run deploy:setup' — it can add a swapfile."
  confirm "Try anyway?" || exit 1
fi

# ------------------------------------------------------------------ source
if [ -z "$SKIP_PULL" ]; then
  step "Fetching $BRANCH on the server"
  REPO="$(repo_url_with_token)"
  rexec "REPO='$REPO' SRC='$SRC_DIR' BRANCH='$BRANCH' bash -se" <<'ENDSSH'
set -euo pipefail
SRC="${SRC/#\~/$HOME}"
if [ ! -d "$SRC/.git" ]; then
  echo "  cloning fresh"
  rm -rf "$SRC"
  git clone --branch "$BRANCH" "$REPO" "$SRC"
else
  cd "$SRC"
  git remote set-url origin "$REPO"
  git fetch origin "$BRANCH" --prune
  git checkout -B "$BRANCH" "origin/$BRANCH"
  git reset --hard "origin/$BRANCH"
fi
cd "$SRC"
# Don't leave a token sitting in .git/config.
git remote set-url origin "$(git remote get-url origin | sed -E 's#https://[^@]+@#https://#')"
git --no-pager log -1 --format='  at %h — %s (%an, %ar)'
ENDSSH
  ok "Source updated"
else
  warn "Skipping pull — deploying whatever is already checked out"
fi

# ------------------------------------------------------------------- build
#
# Build BEFORE touching the running containers. On the previous project a
# `docker compose down` ran first, the build then failed, and the site stayed
# down. Here a failed build leaves the current version serving.
#
step "Building images on the server"
info "this is the slow part — a few minutes on a cold cache"

rexec "SRC='$SRC_DIR' PREFIX='$IMAGE_PREFIX' NO_CACHE='$NO_CACHE' bash -se" <<'ENDSSH'
set -euo pipefail
SRC="${SRC/#\~/$HOME}"
cd "$SRC"

# Keep the current images as a rollback target before overwriting :latest.
for svc in backend frontend; do
  if docker image inspect "$PREFIX-$svc:latest" >/dev/null 2>&1; then
    docker tag "$PREFIX-$svc:latest" "$PREFIX-$svc:previous"
  fi
done

SHA=$(git rev-parse --short HEAD)

docker build $NO_CACHE -t "$PREFIX-backend:latest"  -t "$PREFIX-backend:$SHA"  ./backend
docker build $NO_CACHE -t "$PREFIX-frontend:latest" -t "$PREFIX-frontend:$SHA" ./frontend
echo "  built at $SHA"
ENDSSH
ok "Images built"

# ------------------------------------------------------------------ release
step "Releasing"
rexec "SRC='$SRC_DIR' DEPLOY='$DEPLOY_DIR' PORT='$HOST_HTTP_PORT' PREFIX='$IMAGE_PREFIX' bash -se" <<'ENDSSH'
set -euo pipefail
SRC="${SRC/#\~/$HOME}"; DEPLOY="${DEPLOY/#\~/$HOME}"
mkdir -p "$DEPLOY"

cp "$SRC/docker-compose.prod.yml" "$DEPLOY/docker-compose.yml"

if [ ! -f "$DEPLOY/.env" ]; then
  cp "$SRC/deploy/.env.prod.example" "$DEPLOY/.env"
  # Generate real secrets on first release instead of shipping defaults.
  DBPASS=$(openssl rand -hex 16)
  sed -i "s|__DB_PASSWORD__|$DBPASS|g" "$DEPLOY/.env"
  echo "  created $DEPLOY/.env with a generated database password"
fi

grep -q '^HOST_HTTP_PORT=' "$DEPLOY/.env" \
  && sed -i "s|^HOST_HTTP_PORT=.*|HOST_HTTP_PORT=$PORT|" "$DEPLOY/.env" \
  || echo "HOST_HTTP_PORT=$PORT" >> "$DEPLOY/.env"

cd "$DEPLOY"
# `up -d` recreates only what changed; no `down`, so the gap is ~1 second.
docker compose up -d --remove-orphans
ENDSSH
ok "Containers up"

# ------------------------------------------------------------- health check
step "Waiting for the API"
HEALTHY=""
for _ in $(seq 1 30); do
  CODE=$(rexec "curl -s -o /dev/null -w '%{http_code}' http://localhost:$HOST_HTTP_PORT/api/health || true")
  if [ "$CODE" = "200" ]; then HEALTHY="1"; break; fi
  sleep 3
done

if [ -n "$HEALTHY" ]; then
  BODY=$(rexec "curl -s http://localhost:$HOST_HTTP_PORT/api/health")
  ok "Healthy — $BODY"
else
  warn "No 200 from /api/health after 90s. Recent backend logs:"
  rexec "cd $(rpath "$DEPLOY_DIR") && docker compose logs --tail=40 backend" || true
  die "Deploy finished but the app is not answering. 'npm run deploy:rollback' restores the previous images."
fi

step "Container status"
rexec "cd $(rpath "$DEPLOY_DIR") && docker compose ps"

# --------------------------------------------------------------- housekeeping
step "Pruning dangling images"
rexec "docker image prune -f >/dev/null 2>&1 || true"
ok "Done"

ELAPSED=$(( $(date +%s) - START ))
echo ""
echo "${C_GREEN}${C_BOLD}Deployed in ${ELAPSED}s${C_RESET}"
[ -n "${DOMAIN:-}" ] && echo "  https://$DOMAIN"
echo "  ${C_DIM}logs:   npm run deploy:logs${C_RESET}"
echo "  ${C_DIM}revert: npm run deploy:rollback${C_RESET}"
echo ""
