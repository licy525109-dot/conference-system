#!/usr/bin/env bash
set -euo pipefail

# Example only. Use this template only when backend/API changes are intentionally released.
# It loads .env.production for commands that need DATABASE_URL, but never prints env contents.

APP_DIR="${APP_DIR:-/www/wwwroot/conference-system}"
ENV_FILE="${ENV_FILE:-/www/wwwroot/conference-system/.env.production}"
API_HEALTH_URL="${API_HEALTH_URL:-http://127.0.0.1:3001/api/health}"
PM2_PROCESS="${PM2_PROCESS:-conference-api}"
POSTGRES_READY_TIMEOUT_SECONDS="${POSTGRES_READY_TIMEOUT_SECONDS:-60}"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

confirm_api_deploy() {
  echo "BACKEND/API DEPLOY TEMPLATE"
  echo "Before continuing:"
  echo "1. Back up PostgreSQL."
  echo "2. Confirm Prisma migrations have been reviewed."
  echo "3. Confirm this is not a migrate dev or migrate reset workflow."
  echo "4. Remember: production migrations do not automatically roll back."

  if [[ "${CONFIRM_API_DEPLOY:-}" == "YES" ]]; then
    return
  fi

  read -r -p "Type api-deploy to continue: " reply
  if [[ "$reply" != "api-deploy" ]]; then
    echo "API deployment cancelled."
    exit 1
  fi
}

load_production_env() {
  if [[ ! -f "$ENV_FILE" ]]; then
    echo "Missing production env file: ${ENV_FILE}" >&2
    exit 1
  fi

  # shellcheck source=/dev/null
  set -a
  source "$ENV_FILE"
  set +a

  if [[ -z "${DATABASE_URL:-}" ]]; then
    echo "DATABASE_URL is missing after loading ${ENV_FILE}" >&2
    exit 1
  fi
}

detect_postgres_endpoint() {
  read -r POSTGRES_HOST POSTGRES_PORT < <(node - <<'NODE'
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  process.exit(1);
}
const parsed = new URL(databaseUrl);
console.log(`${parsed.hostname} ${parsed.port || "5432"}`);
NODE
)
}

wait_for_postgres() {
  if ! command -v pg_isready >/dev/null 2>&1; then
    echo "pg_isready is not installed; skipping readiness probe. Ensure PostgreSQL is ready before continuing."
    return
  fi

  echo "Waiting for PostgreSQL at ${POSTGRES_HOST}:${POSTGRES_PORT}"
  local started_at
  started_at="$(date +%s)"
  while true; do
    if pg_isready -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" >/dev/null 2>&1; then
      echo "PostgreSQL is ready."
      return
    fi

    if (( "$(date +%s)" - started_at >= POSTGRES_READY_TIMEOUT_SECONDS )); then
      echo "PostgreSQL did not become ready within ${POSTGRES_READY_TIMEOUT_SECONDS}s." >&2
      exit 1
    fi
    sleep 2
  done
}

require_command git
require_command node
require_command pnpm
require_command pm2
require_command curl

confirm_api_deploy

cd "$APP_DIR"

CURRENT_COMMIT="$(git rev-parse HEAD)"
echo "Deploying backend at commit: ${CURRENT_COMMIT}"
echo "Loading production env from ${ENV_FILE} without printing its contents."
load_production_env
detect_postgres_endpoint
wait_for_postgres

pnpm install --frozen-lockfile

echo "Generating Prisma client."
pnpm --filter @conference/api exec prisma generate --schema ../../prisma/schema.prisma

echo "Running Prisma migrate deploy."
echo "Do not use prisma migrate dev in production."
echo "Do not use prisma migrate reset in production."
echo "Production migration rollback is manual and application-specific."
pnpm --filter @conference/api exec prisma migrate deploy --schema ../../prisma/schema.prisma

pnpm build:api

echo "Restarting PM2 process: ${PM2_PROCESS}"
pm2 restart "$PM2_PROCESS"

echo "Checking API health at ${API_HEALTH_URL}"
curl -fsS "$API_HEALTH_URL"
echo
echo "Backend/API deployment template completed."
