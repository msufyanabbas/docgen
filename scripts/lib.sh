#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Shared helpers for the deploy scripts. Sourced, never run directly.
# ---------------------------------------------------------------------------

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTROL_PATH="/tmp/tawal-docgen-ssh-%r@%h:%p"

# --- pretty output -------------------------------------------------------
if [ -t 1 ]; then
  C_RESET=$'\033[0m'; C_DIM=$'\033[2m'; C_BOLD=$'\033[1m'
  C_BLUE=$'\033[34m'; C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'; C_RED=$'\033[31m'
else
  C_RESET=""; C_DIM=""; C_BOLD=""; C_BLUE=""; C_GREEN=""; C_YELLOW=""; C_RED=""
fi

step()  { echo "";  echo "${C_BLUE}${C_BOLD}▸ $*${C_RESET}"; }
info()  { echo "  ${C_DIM}$*${C_RESET}"; }
ok()    { echo "  ${C_GREEN}✓${C_RESET} $*"; }
warn()  { echo "  ${C_YELLOW}!${C_RESET} $*"; }
die()   { echo ""; echo "${C_RED}${C_BOLD}✗ $*${C_RESET}" >&2; exit 1; }

# --- config --------------------------------------------------------------
load_config() {
  local file="$ROOT_DIR/deploy.config"
  [ -f "$file" ] || die "deploy.config not found.
    Run:  cp deploy.config.example deploy.config
    then fill in your server details."

  # shellcheck disable=SC1090
  source "$file"

  : "${SERVER_USER:?SERVER_USER missing from deploy.config}"
  : "${SERVER_HOST:?SERVER_HOST missing from deploy.config}"
  SERVER_PORT="${SERVER_PORT:-22}"
  BRANCH="${BRANCH:-master}"
  SRC_DIR="${SRC_DIR:-/var/www/tawal-docgen/src}"
  DEPLOY_DIR="${DEPLOY_DIR:-/var/www/tawal-docgen}"
  HOST_HTTP_PORT="${HOST_HTTP_PORT:-8090}"
  IMAGE_PREFIX="${IMAGE_PREFIX:-tawal-docgen}"
  SERVER="$SERVER_USER@$SERVER_HOST"
}

# --- ssh -----------------------------------------------------------------
#
# One master connection, reused by every later command. With password auth you
# type it once; without multiplexing every step would prompt again, and sshpass
# isn't available on Windows Git Bash.
#
SSH_OPTS=()

setup_ssh() {
  SSH_OPTS=(
    -p "$SERVER_PORT"
    -o ControlMaster=auto
    -o "ControlPath=$CONTROL_PATH"
    -o ControlPersist=15m
    -o ServerAliveInterval=30
    -o ServerAliveCountMax=6
    -o ConnectTimeout=20
    -o StrictHostKeyChecking=accept-new
  )
  if [ -n "${SSH_KEY:-}" ]; then
    [ -f "${SSH_KEY/#\~/$HOME}" ] || die "SSH key not found: $SSH_KEY"
    SSH_OPTS+=(-i "${SSH_KEY/#\~/$HOME}")
  fi

  step "Connecting to $SERVER"
  if [ -z "${SSH_KEY:-}" ]; then
    info "Password auth — you'll be asked once, then the connection is reused."
  fi

  ssh "${SSH_OPTS[@]}" "$SERVER" "echo connected >/dev/null" \
    || die "Could not reach $SERVER on port $SERVER_PORT."
  ok "Connected"
}

close_ssh() {
  ssh "${SSH_OPTS[@]}" -O exit "$SERVER" 2>/dev/null || true
}

# Run a command on the server.
rexec() { ssh "${SSH_OPTS[@]}" "$SERVER" "$@"; }

# Run a heredoc script on the server with the shell's error flags set.
rscript() { ssh "${SSH_OPTS[@]}" "$SERVER" "bash -se" ; }

rcopy() { scp -P "$SERVER_PORT" -o "ControlPath=$CONTROL_PATH" "$@"; }

# Renders a configured path for use inside a remote command. A leading ~ is left
# for the remote shell to expand ($HOME differs per user); absolute paths pass
# through untouched, which is what /var/www needs.
rpath() {
  local p="$1"
  # shellcheck disable=SC2088  # the ~ is a literal pattern, expanded remotely
  case "$p" in
    "~"|"~/"*) echo "\$HOME${p#\~}" ;;
    *)         echo "$p" ;;
  esac
}

# --- misc ----------------------------------------------------------------
require_local() {
  command -v "$1" >/dev/null 2>&1 || die "$1 is required locally but was not found."
}

confirm() {
  local prompt="${1:-Continue?}"
  read -r -p "  $prompt [y/N] " reply
  [[ "$reply" =~ ^[Yy]$ ]]
}

# Authenticated clone URL, without leaking the token into logs or `git remote`.
repo_url_with_token() {
  if [ -n "${GIT_TOKEN:-}" ]; then
    echo "${REPO_URL/https:\/\//https://$GIT_TOKEN@}"
  else
    echo "$REPO_URL"
  fi
}
