#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Deploy to the server.
#
#   npm run deploy                 build changed layers and restart
#   npm run deploy -- --no-cache   full rebuild
#   npm run deploy -- --branch dev deploy another branch
#   npm run deploy -- --skip-pull  redeploy what's already on the server
#
# The whole deploy runs as ONE remote session, so password auth prompts once —
# including on Windows, where SSH connection multiplexing is unavailable.
# The server pulls from GitHub and builds there; nothing large is uploaded.
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
    -h|--help)   sed -n '2,13p' "$0"; exit 0 ;;
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

# ---------------------------------------------------------------------------
# The build takes minutes. If it runs as a child of the SSH session, a dropped
# connection ("Read from remote host: Connection reset by peer") kills it
# halfway. So: write the script to the server, launch it DETACHED with setsid,
# and just follow its log. The connection can die and reconnect freely — the
# build carries on regardless.
# ---------------------------------------------------------------------------

REMOTE_DIR="$(rpath "$DEPLOY_DIR")"
STAMP="$(date +%Y%m%d-%H%M%S)"
REMOTE_SH="/tmp/tawal-docgen-deploy-$STAMP.sh"
REMOTE_LOG="/tmp/tawal-docgen-deploy-$STAMP.log"
REMOTE_RC="$REMOTE_LOG.rc"

LOCAL_SH="$(mktemp)"
trap 'rm -f "$LOCAL_SH"' EXIT

{
  echo "#!/usr/bin/env bash"
  # Config is baked in rather than passed through the environment, so the
  # detached process keeps it after the launching shell is gone.
  echo "SRC='$(rpath "$SRC_DIR")'"
  echo "DEPLOY='$REMOTE_DIR'"
  echo "REPO='$(repo_url_with_token)'"
  echo "BRANCH='$BRANCH'"
  echo "PREFIX='$IMAGE_PREFIX'"
  echo "PORT='$HOST_HTTP_PORT'"
  echo "NO_CACHE='$NO_CACHE'"
  echo "SKIP_PULL='$SKIP_PULL'"
  cat <<'PAYLOAD'
set -uo pipefail

B=$'\033[34m\033[1m'; G=$'\033[32m'; Y=$'\033[33m'; R=$'\033[31m'; D=$'\033[2m'; N=$'\033[0m'
step() { echo ""; echo "${B}> $*${N}"; }
ok()   { echo "  ${G}[ok]${N} $*"; }
warn() { echo "  ${Y}[!]${N} $*"; }
fail() { echo ""; echo "${R}[x] $*${N}" >&2; exit 1; }

# ------------------------------------------------------------------ preflight
step "Checking the server"
MISSING=""
command -v docker >/dev/null 2>&1      || MISSING="$MISSING docker"
docker compose version >/dev/null 2>&1 || MISSING="$MISSING docker-compose-plugin"
command -v git >/dev/null 2>&1         || MISSING="$MISSING git"
command -v curl >/dev/null 2>&1        || MISSING="$MISSING curl"
[ -n "$MISSING" ] && fail "Server is missing:$MISSING - run 'npm run deploy:setup' first."

[ -d "$DEPLOY" ] || fail "$DEPLOY does not exist - run 'npm run deploy:setup' first."
[ -w "$DEPLOY" ] || fail "$DEPLOY is not writable by $(id -un) - run 'npm run deploy:setup'."
ok "docker, compose, git, curl - $DEPLOY writable"

AVAIL=$(free -m | awk '/^Mem:/{print $7}')
SWAP=$(free -m | awk '/^Swap:/{print $2}')
echo "  ${D}memory ${AVAIL}MB available + ${SWAP}MB swap${N}"
if [ $((AVAIL + SWAP)) -lt 1800 ]; then
  warn "Under ~1.8GB usable - the vite/nest builds may be OOM-killed."
  warn "'npm run deploy:setup' can add a swapfile."
fi

# --------------------------------------------------------------------- source
if [ -z "$SKIP_PULL" ]; then
  step "Fetching $BRANCH"
  if [ ! -d "$SRC/.git" ]; then
    echo "  ${D}cloning fresh${N}"
    rm -rf "$SRC"
    git clone --branch "$BRANCH" "$REPO" "$SRC" || fail "Clone failed. Check REPO_URL and, for a private repo, GIT_TOKEN."
  else
    cd "$SRC" || fail "cannot enter $SRC"
    git remote set-url origin "$REPO"
    git fetch origin "$BRANCH" --prune || fail "git fetch failed"
    git checkout -B "$BRANCH" "origin/$BRANCH" >/dev/null 2>&1
    git reset --hard "origin/$BRANCH" >/dev/null || fail "git reset failed"
  fi
  cd "$SRC" || exit 1
  # Don't leave a token sitting in .git/config.
  git remote set-url origin "$(git remote get-url origin | sed -E 's#https://[^@]+@#https://#')"
  echo "  ${D}$(git --no-pager log -1 --format='%h - %s (%an, %ar)')${N}"
  ok "Source updated"
else
  warn "Skipping pull - using whatever is checked out"
  cd "$SRC" || fail "$SRC has no checkout to deploy"
fi

# ---------------------------------------------------------------------- build
#
# Build BEFORE touching the running containers. If the build fails the previous
# version keeps serving, instead of a `compose down` leaving the site dead.
#
step "Building images"
echo "  ${D}the slow part - a few minutes on a cold cache${N}"

for svc in backend frontend; do
  docker image inspect "$PREFIX-$svc:latest" >/dev/null 2>&1 \
    && docker tag "$PREFIX-$svc:latest" "$PREFIX-$svc:previous"
done

SHA=$(git rev-parse --short HEAD)
docker build $NO_CACHE -t "$PREFIX-backend:latest" -t "$PREFIX-backend:$SHA" ./backend \
  || fail "Backend image build failed."
docker build $NO_CACHE -t "$PREFIX-frontend:latest" -t "$PREFIX-frontend:$SHA" ./frontend \
  || fail "Frontend image build failed."
ok "Built at $SHA"

# -------------------------------------------------------------------- release
step "Releasing"
cp "$SRC/docker-compose.prod.yml" "$DEPLOY/docker-compose.yml" || fail "cannot write to $DEPLOY"

if [ ! -f "$DEPLOY/.env" ]; then
  cp "$SRC/deploy/.env.prod.example" "$DEPLOY/.env"
  DBPASS=$(openssl rand -hex 16)
  JWTSECRET=$(openssl rand -hex 32)
  sed -i "s|__DB_PASSWORD__|$DBPASS|g" "$DEPLOY/.env"
  sed -i "s|__JWT_SECRET__|$JWTSECRET|g" "$DEPLOY/.env"
  warn "Created $DEPLOY/.env with a generated DB password - keep a copy."
fi

grep -q '^HOST_HTTP_PORT=' "$DEPLOY/.env" \
  && sed -i "s|^HOST_HTTP_PORT=.*|HOST_HTTP_PORT=$PORT|" "$DEPLOY/.env" \
  || echo "HOST_HTTP_PORT=$PORT" >> "$DEPLOY/.env"

cd "$DEPLOY" || exit 1
# `up -d` recreates only what changed; no `down`, so the gap is about a second.
docker compose up -d --remove-orphans || fail "docker compose up failed"
ok "Containers up"

# --------------------------------------------------------------- health check
step "Waiting for the API"
HEALTHY=""
for _ in $(seq 1 30); do
  CODE=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT/api/health" 2>/dev/null)
  [ "$CODE" = "200" ] && { HEALTHY=1; break; }
  sleep 3
done

if [ -n "$HEALTHY" ]; then
  ok "Healthy - $(curl -s "http://localhost:$PORT/api/health")"
else
  warn "No 200 from /api/health after 90s. Recent backend logs:"
  docker compose logs --tail=40 backend
  fail "Deployed but not answering. 'npm run deploy:rollback' restores the previous build."
fi

step "Containers"
docker compose ps

docker image prune -f >/dev/null 2>&1
PAYLOAD
} > "$LOCAL_SH"

step "Starting the build on the server"
ssh "${SSH_OPTS[@]}" "$SERVER" "cat > '$REMOTE_SH'" < "$LOCAL_SH" \
  || die "Could not upload the deploy script."

# setsid detaches from the ssh session's process group so SIGHUP never reaches it.
PID=$(ssh "${SSH_OPTS[@]}" "$SERVER" \
  "setsid nohup bash -c 'bash \"$REMOTE_SH\"; echo \$? > \"$REMOTE_RC\"' \
     > '$REMOTE_LOG' 2>&1 < /dev/null & echo \$!") \
  || die "Could not start the remote build."
ok "Running detached as PID $PID — safe to lose the connection"
info "log: $REMOTE_LOG"

# --- follow the log, reconnecting as needed -------------------------------
LINES=0
ATTEMPTS=0
while :; do
  # tail --pid exits by itself once the build process finishes.
  ssh "${SSH_OPTS[@]}" "$SERVER" \
    "tail -n +$((LINES + 1)) -f --pid=$PID '$REMOTE_LOG' 2>/dev/null" || true

  # Finished?
  if ssh "${SSH_OPTS[@]}" "$SERVER" "[ -f '$REMOTE_RC' ]" 2>/dev/null; then
    break
  fi

  # Still running, connection dropped: resume from where the output stopped.
  NEW_LINES=$(ssh "${SSH_OPTS[@]}" "$SERVER" "wc -l < '$REMOTE_LOG' 2>/dev/null || echo 0" 2>/dev/null | tr -d ' ')
  [ -n "$NEW_LINES" ] && LINES="$NEW_LINES"

  ATTEMPTS=$((ATTEMPTS + 1))
  [ "$ATTEMPTS" -gt 40 ] && die "Lost the connection too many times. The build may still be running:
    ssh $SERVER \"tail -f $REMOTE_LOG\""

  warn "Connection dropped — reconnecting to follow the build (attempt $ATTEMPTS)"
  sleep 5
done

RC=$(ssh "${SSH_OPTS[@]}" "$SERVER" "cat '$REMOTE_RC' 2>/dev/null || echo 1" | tr -d '[:space:]')
ssh "${SSH_OPTS[@]}" "$SERVER" "rm -f '$REMOTE_SH'" 2>/dev/null || true

[ "$RC" = "0" ] || die "Deploy failed on the server (exit $RC).
    Full log:  ssh $SERVER \"cat $REMOTE_LOG\""

ELAPSED=$(( $(date +%s) - START ))
echo ""
echo "${C_GREEN}${C_BOLD}Deployed in ${ELAPSED}s${C_RESET}"
[ -n "${DOMAIN:-}" ] && echo "  https://$DOMAIN"
echo "  ${C_DIM}logs:   npm run deploy:logs${C_RESET}"
echo "  ${C_DIM}revert: npm run deploy:rollback${C_RESET}"
echo ""
