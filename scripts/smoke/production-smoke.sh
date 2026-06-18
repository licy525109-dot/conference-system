#!/usr/bin/env bash
set -Eeuo pipefail

API_BASE="${API_BASE:-https://guanchaohuiji.com/api}"
ADMIN_ROOT="${ADMIN_ROOT:-/www/wwwroot/admin.guanchaohuiji.com}"
PROJECT_DIR="${PROJECT_DIR:-/www/wwwroot/conference-system}"
PM2_PROCESS="${PM2_PROCESS:-conference-api}"
CMS_PAGE_KEY="${CMS_PAGE_KEY:-home}"
DATABASE_TABLES=(
  conferences
  orders
  payments
  registrations
  registration_attendees
  mall_orders
  mall_payments
  mall_refunds
  refunds
  invoice_applications
  notification_tasks
  notification_logs
  wecom_integrations
  knowledge_bases
  member_levels
  user_memberships
  page_templates
  page_versions
  tabbar_configs
)

API_BASE="${API_BASE%/}"
PUBLIC_BASE="${PUBLIC_BASE:-${API_BASE%/api}}"
PUBLIC_BASE="${PUBLIC_BASE%/}"
UPLOADS_URL="${UPLOADS_URL:-${PUBLIC_BASE}/uploads/}"

log() {
  printf '\n== %s ==\n' "$1"
}

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "missing required command: $1"
}

load_production_env() {
  if [[ -f "${PROJECT_DIR}/.env.production" ]]; then
    set -a
    # shellcheck disable=SC1091
    source "${PROJECT_DIR}/.env.production"
    set +a
  fi
}

curl_expect_200() {
  local label="$1"
  local url="$2"
  local status
  status="$(curl -fsS -o /tmp/conference-smoke-response.json -w "%{http_code}" "$url")" || fail "${label} request failed: ${url}"
  [[ "$status" == "200" ]] || fail "${label} returned HTTP ${status}: ${url}"
  echo "${label}: ok (${status})"
}

curl_expect_existing_endpoint() {
  local label="$1"
  local url="$2"
  local status
  status="$(curl -sS -o /tmp/conference-smoke-response.json -w "%{http_code}" -H "Content-Type: application/json" -X POST "$url" --data '{}')" || fail "${label} request failed: ${url}"
  case "$status" in
    200|400|401|403) echo "${label}: ok (${status})" ;;
    *) fail "${label} returned unexpected HTTP ${status}: ${url}" ;;
  esac
}

run_sql() {
  local sql="$1"
  if [[ -n "${DATABASE_URL:-}" ]] && command -v psql >/dev/null 2>&1; then
    psql "$DATABASE_URL" -Atc "$sql"
    return
  fi

  if [[ -f "${PROJECT_DIR}/docker-compose.prod.yml" ]] && command -v docker >/dev/null 2>&1; then
    docker compose -f "${PROJECT_DIR}/docker-compose.prod.yml" exec -T postgres \
      psql -U "${POSTGRES_USER:-conference}" -d "${POSTGRES_DB:-conference_dev}" -Atc "$sql"
    return
  fi

  fail "cannot run database checks; provide DATABASE_URL with psql or docker compose access"
}

check_database_tables() {
  local expected_csv
  expected_csv="$(printf "'%s'," "${DATABASE_TABLES[@]}")"
  expected_csv="${expected_csv%,}"
  local existing
  existing="$(run_sql "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN (${expected_csv}) ORDER BY table_name;")"
  for table in "${DATABASE_TABLES[@]}"; do
    if ! grep -qx "$table" <<<"$existing"; then
      fail "database table missing: ${table}"
    fi
  done
  echo "database tables: ok (${#DATABASE_TABLES[@]})"
}

check_enum_value() {
  local enum_name="$1"
  local enum_value="$2"
  local found
  found="$(run_sql "SELECT enumlabel FROM pg_enum JOIN pg_type ON pg_enum.enumtypid = pg_type.oid WHERE typname = '${enum_name}' AND enumlabel = '${enum_value}';")"
  [[ "$found" == "$enum_value" ]] || fail "enum ${enum_name}.${enum_value} missing"
  echo "enum ${enum_name}.${enum_value}: ok"
}

check_uploads_static_path() {
  local status
  status="$(curl -sS -o /tmp/conference-smoke-response.json -w "%{http_code}" "$UPLOADS_URL")" || fail "uploads static path request failed: ${UPLOADS_URL}"
  case "$status" in
    200|301|302|403) echo "uploads static path: ok (${status}) ${UPLOADS_URL}" ;;
    404|500|502|503|504) fail "uploads static path returned HTTP ${status}: ${UPLOADS_URL}" ;;
    *) fail "uploads static path returned unexpected HTTP ${status}: ${UPLOADS_URL}" ;;
  esac
}

check_pm2_online() {
  require_cmd pm2
  if ! pm2 describe "$PM2_PROCESS" | grep -Eiq "status[[:space:]]+online|online"; then
    pm2 describe "$PM2_PROCESS" || true
    fail "PM2 process is not online: ${PM2_PROCESS}"
  fi
  echo "pm2 ${PM2_PROCESS}: online"
}

check_admin_static_bundle() {
  [[ -d "$ADMIN_ROOT" ]] || fail "admin root not found: ${ADMIN_ROOT}"
  if grep -R -E "ReservedPage|功能建设中|预留页面" -n "$ADMIN_ROOT"; then
    fail "admin static bundle contains reserved-page copy"
  fi
  echo "admin static bundle: no reserved-page copy"
}

require_cmd curl
require_cmd grep
require_cmd find
load_production_env

log "1. API health"
curl_expect_200 "api health" "${API_BASE}/health"

log "2. Public API endpoints"
curl_expect_200 "public conferences" "${API_BASE}/conferences?page=1&pageSize=1"
curl_expect_200 "published CMS page" "${API_BASE}/pages/${CMS_PAGE_KEY}/published"
curl_expect_200 "app tabbar" "${API_BASE}/app/tabbar"
curl_expect_existing_endpoint "admin login endpoint" "${API_BASE}/admin/auth/login"
check_uploads_static_path

log "3. Database schema"
check_database_tables
check_enum_value "NotificationTaskStatus" "SKIPPED"
check_enum_value "CustomerGroupMessageStatus" "WAITING_CONFIRM"
check_enum_value "RefundStatus" "REQUESTED"
check_enum_value "RefundStatus" "SUCCESS"
check_enum_value "PaymentStatus" "SUCCESS"

log "4. Runtime process and admin static bundle"
check_pm2_online
check_admin_static_bundle

log "Production smoke passed"
