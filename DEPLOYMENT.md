# Deployment

One command to ship: **`npm run deploy`**.

The server pulls from GitHub and builds there. Nothing large is uploaded — that's the
part that kept failing on the last project, where an 800MB image transfer would drop
mid-scp.

---

## First time

### 1. Push the code to GitHub

```bash
cd tawal-docgen
git init
git add .
git commit -m "Initial commit"
git branch -M master
git remote add origin https://github.com/<you>/tawal-docgen.git
git push -u origin master
```

`deploy.config` is gitignored, so your server address and any token stay local.

### 2. Fill in the target

```bash
cp deploy.config.example deploy.config
```

Edit it:

```bash
SERVER_USER="root"
SERVER_HOST="147.79.114.76"     # your server
SSH_KEY=""                       # empty = password auth
REPO_URL="https://github.com/<you>/tawal-docgen.git"
DEPLOY_DIR="/var/www/tawal-docgen"       # alongside your other apps
SRC_DIR="/var/www/tawal-docgen/src"
HOST_HTTP_PORT="8090"            # must not clash with other apps on the box
DOMAIN="docgen.smart-life.sa"
```

**Password servers are fine.** The scripts open one SSH connection you authenticate
once and reuse it for every step (`ControlMaster`), because `sshpass` doesn't exist on
Windows Git Bash.

**Private repo?** Create a fine-grained PAT with read-only *Contents* access and set
`GIT_TOKEN`. It's used for the clone and then stripped from `.git/config` so it isn't
left sitting on the server.

### 3. Prepare the server — once

```bash
npm run deploy:setup
```

Installs Docker, the compose plugin, git and curl if missing; offers a 2GB swapfile on
small boxes; writes the nginx vhost for your domain; and offers to issue SSL. Every
step checks before acting, so re-running is safe.

Point your DNS at the server before the SSL step, or skip it and re-run later.

### 4. Ship

```bash
npm run deploy
```

---

## Everyday use

```bash
git push                    # push your work
npm run deploy              # build and release on the server

npm run deploy:status       # containers, health, deployed commit, disk
npm run deploy:logs         # follow all logs
npm run deploy:logs backend # one service
npm run deploy:rollback     # back to the previous images
npm run deploy:ssh          # shell on the server, in the deploy directory
```

Flags:

```bash
npm run deploy -- --no-cache      # full rebuild, ignore layer cache
npm run deploy -- --branch dev    # ship a different branch
npm run deploy -- --skip-pull     # re-release what's already checked out
```

---

## What a deploy actually does

1. **Preflight** — checks docker/compose/git/curl exist, and that there's ~1.8GB of
   RAM+swap. Two Docker builds on a 1GB box get OOM-killed; better to refuse than to
   half-deploy.
2. **Fetch** — hard-resets the server's checkout to `origin/<branch>`.
3. **Build** — tags the running images `:previous`, then builds `:latest` and `:<sha>`.
4. **Release** — copies `docker-compose.prod.yml`, creates `.env` on first run with a
   generated DB password, then `docker compose up -d`.
5. **Health check** — polls `/api/health` for 90s. If it never answers, you get the
   backend logs and a non-zero exit.
6. **Prune** — removes dangling images.

**Nothing is stopped until the build succeeds.** The previous deploy keeps serving
while the new images build, and `up -d` recreates only what changed — roughly a second
of downtime instead of the minutes a `compose down` would cost. A broken commit leaves
the site up rather than taking it down, which is exactly what went wrong last time.

---

## Rollback

Every deploy retags the running images `:previous` before overwriting `:latest`, so:

```bash
npm run deploy:rollback
```

swaps them back and restarts — no rebuild, a few seconds. The bad build is kept as
`:failed` if you want to inspect it.

Database migrations are *not* reversed. If a release changed the schema, roll the code
back and fix forward on the data.

---

## Where things live on the server

```
/var/www/tawal-docgen/            DEPLOY_DIR — the live deployment
├── docker-compose.yml            copied from the repo each deploy
├── .env                          generated once, never overwritten
└── src/                          SRC_DIR — git checkout the server builds from
```

Both paths come from `deploy.config`. `/var/www` matches where your other apps sit;
`~/tawal-docgen` works just as well if you'd rather keep it in the home directory. The
setup script creates them with `sudo` when needed and hands ownership to the deploy
user, so nothing afterwards needs elevation.

`src/` is disposable — every deploy hard-resets it to `origin/<branch>`. Deleting it
costs nothing but a re-clone.

**Your data is not in either folder.** It's in Docker named volumes:

| Volume | Holds | On disk |
|---|---|---|
| `tawal-docgen_pgdata` | the database | `/var/lib/docker/volumes/tawal-docgen_pgdata/_data` |
| `tawal-docgen_storage` | uploaded GCLs, generated documents | `/var/lib/docker/volumes/tawal-docgen_storage/_data` |

These survive `docker compose down` and every re-deploy. Wiping `/var/www/tawal-docgen`
loses no data — only `.env`, which holds the database password.

Two files are written outside all of this:

```
/etc/nginx/sites-available/tawal-docgen   (symlinked into sites-enabled)
/etc/letsencrypt/live/<domain>/           if certbot ran
```

---

## Architecture on the server

```
Internet
   │
   ▼
host nginx :80/:443          ← already serving your other apps
   ├── docgen.smart-life.sa  → 127.0.0.1:8090
   └── (other vhosts)
                │
                ▼
        frontend container :80         nginx + the built SPA
                │  /api → backend:3000
                ▼
        backend container :3000        NestJS + Chromium
                │
                ▼
        db container :5432             Postgres 16
```

Only the frontend publishes a port, and it binds `127.0.0.1` — the API and database are
reachable only from inside the compose network, never from the internet.

Two named volumes hold state:

- `pgdata` — the database
- `storage` — uploaded GCLs and generated documents

Both survive `docker compose down`. They are **not** in any backup by default; see below.

---

## Server-side configuration

`~/tawal-docgen/.env` is created on the first deploy with a generated database password
and is **never overwritten** afterwards. Edit it on the server and restart:

```bash
npm run deploy:ssh
nano .env
docker compose up -d
```

`PUBLIC_URL` is the one worth checking — it drives CORS and must match how people
actually reach the app.

---

## GitHub Actions (optional)

`.github/workflows/deploy.yml` does the same thing on every push to master. It needs
key auth, so generate a deploy key on the server:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/gh-deploy -N ""
cat ~/.ssh/gh-deploy.pub >> ~/.ssh/authorized_keys
cat ~/.ssh/gh-deploy        # → paste into the SSH_PRIVATE_KEY secret
```

Secrets: `SSH_HOST`, `SSH_USER`, `SSH_PRIVATE_KEY`, optionally `SSH_PORT`.

Run `npm run deploy:setup` once first either way — the workflow assumes the server is
already prepared.

---

## Backups

Nothing is backed up automatically. A nightly dump is a cron line away:

```bash
npm run deploy:ssh
mkdir -p ~/backups
crontab -e
```

```cron
0 2 * * * cd ~/tawal-docgen && docker compose exec -T db pg_dump -U docgen tawal_docgen | gzip > ~/backups/db-$(date +\%F).sql.gz && find ~/backups -name 'db-*.sql.gz' -mtime +14 -delete
```

Documents live in the `storage` volume:

```bash
docker run --rm -v tawal-docgen_storage:/data -v ~/backups:/out alpine \
  tar czf /out/storage-$(date +%F).tar.gz -C /data .
```

---

## Troubleshooting

**`deploy.config not found`** — `cp deploy.config.example deploy.config` and fill it in.

**Password asked more than once** — the multiplexed connection didn't establish. Check
`/tmp/tawal-docgen-ssh-*` is writable, or set `SSH_KEY` and use key auth.

**Build killed / "signal 9"** — out of memory. Run `npm run deploy:setup` and accept the
swapfile.

**Health check fails, logs show `P1001`** — the backend can't reach Postgres. Check the
db container is healthy: `npm run deploy:status`.

**Port already in use** — something else on the box owns `HOST_HTTP_PORT`. Pick another
in `deploy.config`, re-run `npm run deploy:setup` to update the vhost, then deploy.

**502 from nginx** — the container isn't up, or the vhost points at the wrong port.
`npm run deploy:status` shows both.

**Arabic renders as boxes in the PAC** — the backend image installs `fonts-noto-core`.
If you changed the Dockerfile, put it back.
