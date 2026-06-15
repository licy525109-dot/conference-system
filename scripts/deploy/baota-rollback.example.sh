#!/usr/bin/env bash
set -euo pipefail

# Example only. This is a code rollback template for static assets.
# Database migrations are not automatically rolled back.

APP_DIR="${APP_DIR:-/www/wwwroot/conference-system}"
H5_TARGET="${H5_TARGET:-/www/wwwroot/m.guanchaohuiji.com/}"
ADMIN_TARGET="${ADMIN_TARGET:-/www/wwwroot/admin.guanchaohuiji.com/}"
API_HEALTH_URL="${API_HEALTH_URL:-http://127.0.0.1:3001/api/health}"
TARGET_COMMIT="${1:-}"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

usage() {
  echo "Usage: $0 <commit-hash>" >&2
  echo "Example: CONFIRM_ROLLBACK=YES $0 abc1234" >&2
}

confirm_rollback() {
  if [[ "${CONFIRM_ROLLBACK:-}" == "YES" ]]; then
    return
  fi

  echo "This rollback template will reset the repository code to ${TARGET_COMMIT}."
  echo "It will rebuild user H5/admin static assets, rsync them, and check API health."
  echo "Database migrations will NOT be rolled back automatically."
  echo "If backend code changed between commits, review PM2/API rollback steps separately."
  read -r -p "Type rollback to continue: " reply
  if [[ "$reply" != "rollback" ]]; then
    echo "Rollback cancelled."
    exit 1
  fi
}

changed_under() {
  local pattern="$1"
  grep -Eq "$pattern" <<<"${CHANGED_FILES:-}"
}

if [[ -z "$TARGET_COMMIT" ]]; then
  usage
  exit 1
fi

require_command git
require_command pnpm
require_command rsync
require_command curl

cd "$APP_DIR"

git fetch origin

CURRENT_COMMIT="$(git rev-parse HEAD)"
echo "Current HEAD: ${CURRENT_COMMIT}"
echo "Target commit: ${TARGET_COMMIT}"

CHANGED_FILES="$(git diff --name-only "$TARGET_COMMIT" "$CURRENT_COMMIT" || true)"

API_CHANGED=false
PRISMA_MIGRATIONS_CHANGED=false
if changed_under '^services/api/'; then API_CHANGED=true; fi
if changed_under '^prisma/migrations/'; then PRISMA_MIGRATIONS_CHANGED=true; fi

if [[ "$API_CHANGED" == "true" ]]; then
  echo "WARNING: backend code differs between current HEAD and target commit."
  echo "This template does not restart PM2 automatically; decide whether conference-api must be rebuilt and restarted."
fi

if [[ "$PRISMA_MIGRATIONS_CHANGED" == "true" ]]; then
  echo "WARNING: migration files differ between current HEAD and target commit."
  echo "Database migration rollback is not automatic. Prepare a manual data recovery plan before backend rollback."
fi

confirm_rollback

git reset --hard "$TARGET_COMMIT"

pnpm install --frozen-lockfile
pnpm build:user:h5
pnpm build:admin

echo "Rsync user H5 static files to ${H5_TARGET}"
rsync -a --delete --exclude='.user.ini' apps/user/dist/build/h5/ "$H5_TARGET"

echo "Rsync admin static files to ${ADMIN_TARGET}"
rsync -a --delete --exclude='.user.ini' apps/admin/dist/ "$ADMIN_TARGET"

echo "Checking API health at ${API_HEALTH_URL}"
curl -fsS "$API_HEALTH_URL"
echo
echo "Rollback template completed for code/static assets."
