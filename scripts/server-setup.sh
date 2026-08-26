#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# One-time server preparation:  npm run deploy:setup
#
# Installs Docker/git if missing, adds swap on small boxes, creates the nginx
# vhost that proxies your domain to the container, and offers to issue SSL.
# Safe to re-run — every step checks before acting.
# ---------------------------------------------------------------------------

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

load_config

echo ""
echo "${C_BOLD}Tawal DocGen — server setup${C_RESET}"
info "server $SERVER  ·  domain ${DOMAIN:-<not set>}  ·  port $HOST_HTTP_PORT"

setup_ssh
trap close_ssh EXIT

if [ "$USE_MUX" = "0" ] && [ -z "${SSH_KEY:-}" ]; then
  warn "Windows + password auth: this setup script pauses for your answers, so it"
  warn "cannot run as one session — expect a prompt per step. It only runs once."
  warn "Set up a key (see DEPLOYMENT.md) and you'll never be asked again."
fi

# ------------------------------------------------------------------ packages
step "Base packages"
remote_script <<'ENDSSH'
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

need=()
command -v git    >/dev/null || need+=(git)
command -v curl   >/dev/null || need+=(curl)
command -v openssl>/dev/null || need+=(openssl)

if [ ${#need[@]} -gt 0 ]; then
  echo "  installing: ${need[*]}"
  apt-get update -qq
  apt-get install -y -qq "${need[@]}"
else
  echo "  git, curl, openssl already present"
fi

if ! command -v docker >/dev/null; then
  echo "  installing docker"
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
else
  echo "  docker $(docker --version | awk '{print $3}' | tr -d ,)"
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "  installing compose plugin"
  apt-get install -y -qq docker-compose-plugin
fi
ENDSSH
ok "Packages ready"

# ---------------------------------------------------------------------- swap
step "Memory"
MEM=$(rexec "free -m | awk '/^Mem:/{print \$2}'")
SWAP=$(rexec "free -m | awk '/^Swap:/{print \$2}'")
info "${MEM}MB RAM, ${SWAP}MB swap"

if [ "$MEM" -lt 2048 ] && [ "$SWAP" -lt 2048 ]; then
  warn "Docker builds of this app want ~2GB. Without it the vite build gets OOM-killed."
  if confirm "Add a 2GB swapfile?"; then
    remote_script <<'ENDSSH'
set -euo pipefail
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "  swapfile created"
else
  swapon /swapfile 2>/dev/null || true
  echo "  swapfile already exists"
fi
ENDSSH
    ok "Swap enabled"
  fi
else
  ok "Enough memory to build"
fi

# --------------------------------------------------------------- directories
step "Directories"
# /var/www usually belongs to root, so create with sudo when we aren't root and
# hand ownership to the deploy user — later steps must write without sudo.
remote_script "DEPLOY='$(rpath "$DEPLOY_DIR")'" "SRC='$(rpath "$SRC_DIR")'" <<'ENDSSH'
set -euo pipefail
SUDO=""
[ "$(id -u)" -ne 0 ] && SUDO="sudo"

for dir in "$DEPLOY" "$SRC"; do
  if [ ! -d "$dir" ]; then
    $SUDO mkdir -p "$dir"
    [ -n "$SUDO" ] && $SUDO chown -R "$(id -un):$(id -gn)" "$dir"
    echo "  created $dir"
  else
    echo "  $dir exists"
  fi
  [ -w "$dir" ] || { echo "  NOT WRITABLE: $dir"; exit 1; }
done
ENDSSH
ok "$DEPLOY_DIR and $SRC_DIR ready and writable"

# --------------------------------------------------------------------- nginx
if [ -n "${DOMAIN:-}" ]; then
  step "nginx vhost for $DOMAIN"

  HAS_NGINX=$(rexec "command -v nginx >/dev/null && echo yes || echo no")
  if [ "$HAS_NGINX" = "no" ]; then
    warn "nginx is not installed on the host."
    if confirm "Install it? (skip if another proxy fronts this box)"; then
      rexec "DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nginx && systemctl enable --now nginx"
      HAS_NGINX=yes
    fi
  fi

  if [ "$HAS_NGINX" = "yes" ]; then
    # Render the template locally, then install it.
    TMP=$(mktemp)
    sed -e "s|__DOMAIN__|$DOMAIN|g" -e "s|__PORT__|$HOST_HTTP_PORT|g" \
      "$ROOT_DIR/deploy/nginx-site.conf.template" > "$TMP"
    rcopy "$TMP" "$SERVER:/tmp/tawal-docgen.conf"
    rm -f "$TMP"

    remote_script <<'ENDSSH'
set -euo pipefail
mv /tmp/tawal-docgen.conf /etc/nginx/sites-available/tawal-docgen
ln -sfn /etc/nginx/sites-available/tawal-docgen /etc/nginx/sites-enabled/tawal-docgen
nginx -t
systemctl reload nginx
ENDSSH
    ok "vhost installed and nginx reloaded"

    step "SSL"
    HAS_CERT=$(rexec "[ -d /etc/letsencrypt/live/$DOMAIN ] && echo yes || echo no")
    if [ "$HAS_CERT" = "yes" ]; then
      ok "Certificate for $DOMAIN already present"
    else
      info "Point $DOMAIN at $SERVER_HOST in DNS before issuing a certificate."
      if confirm "Run certbot for $DOMAIN now?"; then
        rexec "DEBIAN_FRONTEND=noninteractive apt-get install -y -qq certbot python3-certbot-nginx \
               && certbot --nginx -d '$DOMAIN' --non-interactive --agree-tos --register-unsafely-without-email --redirect" \
          && ok "HTTPS enabled" \
          || warn "certbot failed — usually DNS hasn't propagated yet. Re-run this script later."
      else
        info "Skipped. Later:  certbot --nginx -d $DOMAIN"
      fi
    fi
  fi
else
  warn "DOMAIN is empty in deploy.config — skipping nginx. The app will only be reachable on :$HOST_HTTP_PORT."
fi

echo ""
echo "${C_GREEN}${C_BOLD}Server ready${C_RESET}"
echo "  Next:  ${C_BOLD}npm run deploy${C_RESET}"
echo ""
