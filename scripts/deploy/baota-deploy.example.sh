#!/usr/bin/env bash
set -euo pipefail

# Example only. Review, copy to the server, and set executable before use.
# Suggested server path: /www/scripts/conference-system-deploy.sh
# This template does not read, print, or write .env.production.

APP_DIR="${APP_DIR:-/www/wwwroot/conference-system}"
H5_TARGET="${H5_TARGET:-/www/wwwroot/m.guanchaohuiji.com/}"
ADMIN_TARGET="${ADMIN_TARGET:-/www/wwwroot/admin.guanchaohuiji.com/}"
API_HEALTH_URL="${API_HEALTH_URL:-http://127.0.0.1:3001/api/health}"
REMOTE="${REMOTE:-origin}"
BRANCH="${BRANCH:-main}"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

confirm_deploy() {
  if [[ "${CONFIRM_DEPLOY:-}" == "YES" ]]; then
    return
  fi

  echo "This is a Baota deployment template for conference-system."
  echo "It will pull ${REMOTE}/${BRANCH}, build user H5/admin, rsync static files, and check ${API_HEALTH_URL}."
  echo "It will not run Prisma migrate, restart PM2, or print production env files."
  read -r -p "Type deploy to continue: " reply
  if [[ "$reply" != "deploy" ]]; then
    echo "Deployment cancelled."
    exit 1
  fi
}

changed_under() {
  local pattern="$1"
  grep -Eq "$pattern" <<<"${CHANGED_FILES:-}"
}

require_command git
require_command pnpm
require_command rsync
require_command curl

confirm_deploy

cd "$APP_DIR"

BEFORE_COMMIT="$(git rev-parse HEAD)"
echo "Before commit: ${BEFORE_COMMIT}"

git fetch "$REMOTE"
git pull --ff-only "$REMOTE" "$BRANCH"

AFTER_COMMIT="$(git rev-parse HEAD)"
echo "After commit:  ${AFTER_COMMIT}"

if [[ "$BEFORE_COMMIT" == "$AFTER_COMMIT" ]]; then
  CHANGED_FILES=""
  echo "No repository changes detected."
else
  CHANGED_FILES="$(git diff --name-only "$BEFORE_COMMIT" "$AFTER_COMMIT")"
fi

USER_CHANGED=false
ADMIN_CHANGED=false
API_CHANGED=false
PRISMA_MIGRATIONS_CHANGED=false

if changed_under '^apps/user/'; then USER_CHANGED=true; fi
if changed_under '^apps/admin/'; then ADMIN_CHANGED=true; fi
if changed_under '^services/api/'; then API_CHANGED=true; fi
if changed_under '^prisma/migrations/'; then PRISMA_MIGRATIONS_CHANGED=true; fi

echo "Changed apps/user:           ${USER_CHANGED}"
echo "Changed apps/admin:          ${ADMIN_CHANGED}"
echo "Changed services/api:        ${API_CHANGED}"
echo "Changed prisma/migrations:   ${PRISMA_MIGRATIONS_CHANGED}"

if [[ "$API_CHANGED" == "true" ]]; then
  echo "WARNING: services/api changed. This safe frontend deploy template will not build:api or restart conference-api."
  echo "Review scripts/deploy/baota-api-deploy.example.sh for the manual backend deploy flow."
fi

if [[ "$PRISMA_MIGRATIONS_CHANGED" == "true" ]]; then
  echo "WARNING: prisma/migrations changed. Back up the database and manually confirm migrate deploy before backend release."
  echo "This safe frontend deploy template will not execute any database migration."
fi

if [[ "$API_CHANGED" == "true" || "$PRISMA_MIGRATIONS_CHANGED" == "true" ]]; then
  if [[ "${ALLOW_FRONTEND_DEPLOY_WITH_BACKEND_CHANGES:-}" != "YES" ]]; then
    echo "Refusing to continue by default because backend or migration changes were detected."
    echo "Set ALLOW_FRONTEND_DEPLOY_WITH_BACKEND_CHANGES=YES only after an operator accepts the risk."
    exit 2
  fi
fi

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
echo "Frontend deployment template completed."
