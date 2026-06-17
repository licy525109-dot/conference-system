# Baota Release Guide

## 1. Current Production Facts

- Baota project directory: `/www/wwwroot/conference-system`
- GitHub repository: `git@github.com:licy525109-dot/conference-system.git`
- API process manager: PM2
- PM2 process name: `conference-api`
- PM2 starts API through `/www/wwwroot/conference-system/start-api.sh`
- `start-api.sh` sources `/www/wwwroot/conference-system/.env.production`
- API listens on `3001`
- `3000` is `certificate-site`, not the conference API
- PostgreSQL runs through server-side `docker-compose.prod.yml`
- API health check: `curl http://127.0.0.1:3001/api/health`

Do not commit or overwrite server-only assets from local Git.

## 2. Server Asset Inventory

These files and directories live on the server and must not be committed to GitHub:

- `/www/wwwroot/conference-system/.env.production`
- `/www/wwwroot/conference-system/.env.local`
- `/www/wwwroot/conference-system/apps/admin/.env.production`
- `/www/wwwroot/conference-system/uploads`
- `/www/wwwroot/conference-system/services/api/uploads`
- `/www/wwwroot/conference-system/docker-compose.prod.yml`
- `/www/wwwroot/conference-system/start-api.sh`

If an example is needed, add a template or `.example` file in Git. Do not copy real server files into the repository.

## 3. Automatic Production Deployment Flow

Current default production release path is the automatic workflow:

```text
.github/workflows/deploy-baota.yml
```

It runs on push to `main` and can also be triggered manually. The workflow SSHes to the server and runs:

```bash
cd /www/wwwroot/conference-system
bash scripts/deploy/baota-deploy.sh
```

The script backs up `.env.production`, PostgreSQL, and admin static files before publishing. It then installs dependencies, runs Prisma generate/migrate deploy, builds API/Admin, publishes Admin static files, reloads Nginx, restarts PM2, and checks local/public API health. See `docs/deploy/AUTO_DEPLOY_BAOTA.md`.

Use this path for normal production deployment after merging to `main`, including backend/API and Prisma migration changes.

## 4. Legacy Frontend-Only Manual Flow

Use this manual path only when changes affect:

- `apps/user/**`
- `apps/admin/**`
- `docs/**`
- static frontend UI configuration that does not change API contracts

Suggested flow on the server:

```bash
cd /www/wwwroot/conference-system
git fetch origin
git pull --ff-only origin main
pnpm install --frozen-lockfile
pnpm build:user:h5
pnpm build:admin
rsync -a --delete --exclude='.user.ini' apps/user/dist/build/h5/ /www/wwwroot/m.guanchaohuiji.com/
rsync -a --delete --exclude='.user.ini' apps/admin/dist/ /www/wwwroot/admin.guanchaohuiji.com/
curl http://127.0.0.1:3001/api/health
```

The old example script `scripts/deploy/baota-deploy.example.sh` follows this legacy frontend-only flow. The current automatic deployment uses `scripts/deploy/baota-deploy.sh`.

Frontend-only releases do not require:

- Prisma migrate
- PM2 restart
- Editing `.env.production`
- Restarting PostgreSQL or Redis

## 5. Backend/API Deployment Flow

Use this path only when `services/api/**` or shared backend runtime behavior changed.

Required manual checks:

1. Confirm the PR reviewed API behavior and authentication.
2. Confirm no payment, amount, order, notify, or registration state logic changed unexpectedly.
3. Back up the database.
4. Confirm `.env.production` exists on the server and has the expected keys.
5. Confirm API health before deployment.

Suggested flow:

```bash
cd /www/wwwroot/conference-system
git fetch origin
git pull --ff-only origin main
pnpm install --frozen-lockfile
pnpm build:api
pm2 restart conference-api
curl http://127.0.0.1:3001/api/health
```

If Prisma migrations changed, follow section 6 before restarting the API.

The backend template `scripts/deploy/baota-api-deploy.example.sh` requires explicit confirmation, loads `.env.production`, waits for PostgreSQL, runs `prisma migrate deploy`, builds the API, restarts PM2, and validates health.

## 6. Prisma Migration Deployment Flow

Production migration rules:

- Use `prisma migrate deploy`.
- Do not use `prisma migrate dev`.
- Do not use `prisma migrate reset`.
- Migration rollback is not automatic.
- Back up PostgreSQL before running migrations.

Example backup command:

```bash
mkdir -p /www/backup/conference-system
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U conference -d conference_dev > "/www/backup/conference-system/backup-$(date +%Y%m%d-%H%M%S).sql"
```

Example migration command after loading production env:

```bash
cd /www/wwwroot/conference-system
set -a
source /www/wwwroot/conference-system/.env.production
set +a
pnpm --filter @conference/api exec prisma migrate deploy --schema ../../prisma/schema.prisma
```

Do not print the contents of `.env.production` in terminal output or logs.

## 7. API Port Notes

- `3001` is the real `conference-api` port.
- `3000` is `certificate-site`.
- Health checks must use `http://127.0.0.1:3001/api/health`.
- Nginx reverse proxy and WeChat callback configuration must point to the real conference API route, not the certificate site.

## 8. Rsync and `.user.ini`

Baota may place `.user.ini` in web root directories. When deploying static files, always exclude it:

```bash
rsync -a --delete --exclude='.user.ini' <source>/ <target>/
```

Do not run a command that deletes the whole web root. Deploy into the static target directory and preserve Baota-managed files.

## 9. Deployment Verification Commands

After frontend-only deployment:

```bash
curl -I https://m.guanchaohuiji.com/
curl -I https://admin.guanchaohuiji.com/
curl http://127.0.0.1:3001/api/health
```

After backend deployment:

```bash
pm2 status conference-api
pm2 logs conference-api --lines 100
curl http://127.0.0.1:3001/api/health
```

Manual smoke checks:

- H5 homepage
- Conference detail
- Registration form
- Payment result page
- My registrations
- Admin login
- Dashboard
- Conference management
- Registrations
- Orders
- CMS pages

## 10. Common Faults

### Prisma Cannot Find `DATABASE_URL`

Likely causes:

- `.env.production` was not loaded before running Prisma.
- The command was run from the wrong directory.
- The server-only env file is missing or unreadable.

Fix:

```bash
cd /www/wwwroot/conference-system
set -a
source /www/wwwroot/conference-system/.env.production
set +a
pnpm exec prisma migrate deploy --schema prisma/schema.prisma
```

Do not print the env file.

### Rsync Fails on `.user.ini`

Use `--exclude='.user.ini'`. Do not delete Baota-managed web root files.

### PM2 Keeps Restarting

Check:

- `pm2 logs conference-api --lines 100`
- `pm2 describe conference-api`
- Whether `start-api.sh` still exists and is executable
- Whether `.env.production` exists and was not overwritten
- Whether port `3001` is already occupied

### Port `3000` / `3001` Confusion

Use `3001` for the conference API health check. `3000` is not the conference API.

### GitHub SSH Permission Failure

Check:

- Server deploy key has read access to `licy525109-dot/conference-system`
- `ssh -T git@github.com` works on the server
- Known hosts are configured
- Remote URL remains `git@github.com:licy525109-dot/conference-system.git`

### GitHub Actions Secrets Missing

Manual deploy workflow requires:

- `BAOTA_HOST`
- `BAOTA_PORT`
- `BAOTA_USER`
- `BAOTA_SSH_KEY`

Mini Program workflow requires:

- `MP_APPID`
- `MP_PRIVATE_KEY`

Secrets must be configured in GitHub repository settings and must never be written into workflow files.

## 11. Rollback Flow

Code/static rollback:

```bash
cd /www/wwwroot/conference-system
git fetch origin
git log --oneline -10
CONFIRM_ROLLBACK=YES /www/scripts/conference-system-rollback.sh <commit-hash>
```

The example template is `scripts/deploy/baota-rollback.example.sh`.

Important:

- Code rollback does not automatically roll back database migrations.
- Backend rollback may require `build:api` and `pm2 restart conference-api`.
- If a migration changed data or schema, prepare a manual database recovery plan before rollback.

## 12. When Server Deployment Is Not Needed

No server deployment is needed when a PR only changes:

- Documentation
- Comments
- Local-only examples that are not copied to the server
- GitHub Actions workflow files that are not triggered
- Scripts/templates that are not installed on the server

If a PR changes user/admin source code, rebuild and deploy static assets. If a PR changes backend code or migrations, follow the backend/API and Prisma sections.
