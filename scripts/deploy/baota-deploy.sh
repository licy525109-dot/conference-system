#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="${PROJECT_DIR:-/www/wwwroot/conference-system}"
ADMIN_ROOT="${ADMIN_ROOT:-/www/wwwroot/admin.guanchaohuiji.com}"
H5_ROOT="${H5_ROOT:-/www/wwwroot/m.guanchaohuiji.com}"
H5_PUBLIC_URL="${H5_PUBLIC_URL:-https://m.guanchaohuiji.com}"
BRANCH="${BRANCH:-main}"
API_HEALTH_LOCAL="${API_HEALTH_LOCAL:-http://127.0.0.1:3001/api/health}"
API_HEALTH_PUBLIC="${API_HEALTH_PUBLIC:-https://guanchaohuiji.com/api/health}"
BACKUP_ROOT="${BACKUP_ROOT:-/www/backup}"
PM2_PROCESS="${PM2_PROCESS:-conference-api}"
LOCK_DIR="${LOCK_DIR:-/tmp/conference-system-baota-deploy.lock}"
PHASE="init"
BACKUP=""
ADMIN_STATIC_PUBLISHED=0
H5_STATIC_PUBLISHED=0

log() {
  printf '\n== %s ==\n' "$1"
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "ERROR: missing required command: $1" >&2
    exit 127
  fi
}

on_error() {
  local exit_code=$?
  echo "ERROR: deploy failed during phase: ${PHASE}" >&2
  if [[ -n "$BACKUP" ]]; then
    echo "Backup directory: ${BACKUP}" >&2
  fi
  if [[ "$ADMIN_STATIC_PUBLISHED" == "1" ]]; then
    echo "Admin static files were already published. Restore manually from: ${BACKUP}/admin-static" >&2
  fi
  if [[ "$H5_STATIC_PUBLISHED" == "1" ]]; then
    echo "User H5 static files were already published. Restore manually from: ${BACKUP}/user-h5-static" >&2
  fi
  exit "$exit_code"
}

cleanup_lock() {
  rmdir "$LOCK_DIR" 2>/dev/null || true
}

copy_admin_backup() {
  mkdir -p "$BACKUP/admin-static"
  if [[ -d "$ADMIN_ROOT" ]]; then
    cp -a "$ADMIN_ROOT"/. "$BACKUP/admin-static"/
  else
    echo "WARN: admin root does not exist yet: ${ADMIN_ROOT}"
  fi
}

copy_h5_backup() {
  mkdir -p "$BACKUP/user-h5-static"
  if [[ -d "$H5_ROOT" ]]; then
    cp -a "$H5_ROOT"/. "$BACKUP/user-h5-static"/
  else
    echo "WARN: user H5 root does not exist yet: ${H5_ROOT}"
  fi
}

clear_static_root() {
  local target="$1"
  mkdir -p "$target"
  find "$target" -mindepth 1 -maxdepth 1 ! -name ".user.ini" -exec rm -rf {} +
}

trap on_error ERR

echo "== 0. Load Node.js and pnpm runtime =="

export PATH="/www/server/nvm/versions/node/v24.16.0/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

if [ -d /www/server/nvm/versions/node ]; then
  NODE_BIN="$(find /www/server/nvm/versions/node -maxdepth 3 -type f -name pnpm 2>/dev/null | head -n 1 | xargs dirname 2>/dev/null || true)"
  if [ -n "$NODE_BIN" ]; then
    export PATH="$NODE_BIN:$PATH"
  fi
fi

if [ -n "${PNPM_HOME:-}" ]; then
  export PATH="$PNPM_HOME:$PATH"
else
  export PNPM_HOME="$HOME/.local/share/pnpm"
  export PATH="$PNPM_HOME:$PATH"
fi

if [ -s "$HOME/.nvm/nvm.sh" ]; then
  # shellcheck disable=SC1090
  . "$HOME/.nvm/nvm.sh"
  nvm use --lts >/dev/null 2>&1 || true
fi

if ! command -v pnpm >/dev/null 2>&1 && command -v corepack >/dev/null 2>&1; then
  corepack enable || true
  corepack prepare pnpm@11.5.2 --activate || true
fi

echo "node: $(command -v node || true)"
echo "npm: $(command -v npm || true)"
echo "pnpm: $(command -v pnpm || true)"
node -v || true
pnpm -v || true

require_cmd git
require_cmd pnpm
require_cmd docker
require_cmd curl
require_cmd pm2
require_cmd nginx

PHASE="enter project"
cd "$PROJECT_DIR"

PHASE="create deploy lock"
log "1. 创建部署锁，避免并发部署"
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  echo "ERROR: another deployment is running or lock remains: ${LOCK_DIR}" >&2
  exit 75
fi
trap cleanup_lock EXIT
trap on_error ERR

PHASE="backup env database frontend static"
log "2. 备份 env、数据库、后台与用户端 H5 静态文件"
BACKUP="${BACKUP_ROOT}/conference-system-auto-deploy-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP"
if [[ -f "$PROJECT_DIR/.env.production" ]]; then
  cp "$PROJECT_DIR/.env.production" "$BACKUP/.env.production"
else
  echo "WARN: .env.production not found at ${PROJECT_DIR}/.env.production"
fi

docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U conference -d conference_dev > "$BACKUP/conference_dev.sql"
copy_admin_backup
copy_h5_backup
echo "Backup directory: ${BACKUP}"

PHASE="pull latest main"
log "3. 拉取最新 main"
git fetch origin
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"
git --no-pager log --oneline -5

PHASE="install dependencies"
log "4. 安装依赖"
pnpm install --frozen-lockfile

PHASE="load production env"
log "5. 加载生产环境变量"
if [[ ! -f "$PROJECT_DIR/.env.production" ]]; then
  echo "ERROR: missing production env: ${PROJECT_DIR}/.env.production" >&2
  exit 2
fi
set -a
source "$PROJECT_DIR/.env.production"
set +a

PHASE="prisma generate and migrate"
log "6. Prisma"
pnpm --filter @conference/api exec prisma generate --schema ../../prisma/schema.prisma
pnpm --filter @conference/api exec prisma migrate deploy --schema ../../prisma/schema.prisma

PHASE="build api user h5 and admin"
log "7. 构建 API、用户端 H5 和 Admin"
pnpm --filter @conference/api build
pnpm --filter @conference/user build:h5
pnpm --filter @conference/admin build

PHASE="check frontend dist"
log "8. 构建产物检查"
if [[ ! -f apps/user/dist/build/h5/index.html ]]; then
  echo "ERROR: user H5 dist is missing index.html" >&2
  exit 3
fi
if ! grep -R -F "pages/cms-preview/index" -n apps/user/dist/build/h5/assets >/dev/null; then
  echo "ERROR: user H5 dist is missing the CMS runtime preview route" >&2
  exit 3
fi
if grep -R -E "ReservedPage|功能建设中|预留页面" -n apps/admin/dist; then
  echo "ERROR: admin dist still contains ReservedPage/功能建设中/预留页面 content" >&2
  exit 3
fi

PHASE="publish frontend static"
log "9. 发布用户端 H5 和后台静态文件"
H5_STATIC_PUBLISHED=1
clear_static_root "$H5_ROOT"
cp -a "$PROJECT_DIR/apps/user/dist/build/h5"/. "$H5_ROOT"/

ADMIN_STATIC_PUBLISHED=1
clear_static_root "$ADMIN_ROOT"
cp -a "$PROJECT_DIR/apps/admin/dist"/. "$ADMIN_ROOT"/

if ! grep -R -F "pages/cms-preview/index" -n "$H5_ROOT/assets" >/dev/null; then
  echo "ERROR: published user H5 files are missing the CMS runtime preview route" >&2
  exit 3
fi

nginx -t
nginx -s reload

PHASE="restart api"
log "10. 重启 API"
pm2 restart "$PM2_PROCESS" --update-env

PHASE="health check"
log "11. 健康检查"
sleep 5
curl -fsS "$API_HEALTH_LOCAL"
echo
curl -fsS "$API_HEALTH_PUBLIC"
echo
curl -fsS "${H5_PUBLIC_URL%/}/" >/dev/null
echo "User H5: ok (${H5_PUBLIC_URL%/}/)"

PHASE="pm2 status"
log "12. 输出 PM2 状态"
pm2 list
pm2 logs "$PM2_PROCESS" --lines 60 --nostream

PHASE="success"
log "Deploy success"
echo "Backup directory: ${BACKUP}"
