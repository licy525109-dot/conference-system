#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="${PROJECT_DIR:-/www/wwwroot/conference-system}"
FAILED=0

load_production_env() {
  if [[ -f "${PROJECT_DIR}/.env.production" ]]; then
    set -a
    # shellcheck disable=SC1091
    source "${PROJECT_DIR}/.env.production"
    set +a
  fi
}

configured() {
  local name="$1"
  [[ -n "${!name:-}" ]]
}

configured_any() {
  local name
  for name in "$@"; do
    if configured "$name"; then
      return 0
    fi
  done
  return 1
}

print_required() {
  local name="$1"
  if configured "$name"; then
    echo "${name}: configured"
  else
    echo "${name}: missing"
    FAILED=1
  fi
}

print_optional_secret() {
  local name="$1"
  local fallback_note="${2:-optional capability disabled or fallback will be used}"
  if configured "$name"; then
    echo "${name}: configured"
  else
    echo "${name}: missing, ${fallback_note}"
  fi
}

print_mode() {
  local name="$1"
  local default_value="${2:-disabled}"
  local value="${!name:-$default_value}"
  if [[ -z "$value" ]]; then
    value="$default_value"
  fi
  echo "${name}: ${value}"
}

require_when_enabled() {
  local enabled="$1"
  local name="$2"
  if [[ "$enabled" == "true" ]] && ! configured "$name"; then
    echo "${name}: missing, required while enabled"
    FAILED=1
  elif configured "$name"; then
    echo "${name}: configured"
  else
    echo "${name}: missing, disabled"
  fi
}

require_any_when_enabled() {
  local enabled="$1"
  local label="$2"
  shift 2
  if [[ "$enabled" == "true" ]] && ! configured_any "$@"; then
    echo "${label}: missing, required while enabled"
    FAILED=1
  elif configured_any "$@"; then
    echo "${label}: configured"
  else
    echo "${label}: missing, disabled"
  fi
}

load_production_env

echo "== Required core configuration =="
print_required DATABASE_URL
print_required JWT_SECRET
print_required WECOM_CONFIG_ENCRYPTION_KEY
print_required PUBLIC_API_BASE_URL
print_required CORS_ALLOWED_ORIGINS
print_required WECHAT_APP_ID
print_required WECHAT_APP_SECRET
if [[ "${NODE_ENV:-}" != "production" ]]; then
  echo "NODE_ENV: must be production"
  FAILED=1
else
  echo "NODE_ENV: production"
fi
if [[ "${WECHAT_LOGIN_MODE:-}" != "real" ]]; then
  echo "WECHAT_LOGIN_MODE: must be real"
  FAILED=1
else
  echo "WECHAT_LOGIN_MODE: real"
fi
JWT_SECRET_VALUE="${JWT_SECRET:-}"
JWT_SECRET_LOWER="$(printf '%s' "$JWT_SECRET_VALUE" | tr '[:upper:]' '[:lower:]')"
if configured JWT_SECRET && { [[ ${#JWT_SECRET_VALUE} -lt 32 ]] || [[ "$JWT_SECRET_LOWER" == *"change_me"* ]] || [[ "$JWT_SECRET_LOWER" == *"replace-with"* ]]; }; then
  echo "JWT_SECRET: configured but too short or still uses a placeholder"
  FAILED=1
fi
WECOM_KEY_VALUE="${WECOM_CONFIG_ENCRYPTION_KEY:-}"
WECOM_KEY_LOWER="$(printf '%s' "$WECOM_KEY_VALUE" | tr '[:upper:]' '[:lower:]')"
if configured WECOM_CONFIG_ENCRYPTION_KEY && { [[ ${#WECOM_KEY_VALUE} -lt 32 ]] || [[ "$WECOM_KEY_LOWER" == *"change_me"* ]] || [[ "$WECOM_KEY_LOWER" == *"replace-with"* ]]; }; then
  echo "WECOM_CONFIG_ENCRYPTION_KEY: configured but too short or still uses a placeholder"
  FAILED=1
fi
IFS=',' read -r -a CORS_ORIGINS <<< "${CORS_ALLOWED_ORIGINS:-}"
for CORS_ORIGIN in "${CORS_ORIGINS[@]}"; do
  CORS_ORIGIN="${CORS_ORIGIN#${CORS_ORIGIN%%[![:space:]]*}}"
  CORS_ORIGIN="${CORS_ORIGIN%${CORS_ORIGIN##*[![:space:]]}}"
  if [[ "$CORS_ORIGIN" == "*" ]] || [[ "$CORS_ORIGIN" != https://* ]]; then
    echo "CORS_ALLOWED_ORIGINS: every production origin must be an explicit HTTPS origin"
    FAILED=1
    break
  fi
done
if configured PUBLIC_API_BASE_URL && [[ "${PUBLIC_API_BASE_URL}" != https://* ]]; then
  echo "PUBLIC_API_BASE_URL: must use public HTTPS"
  FAILED=1
fi
if [[ "${WECHAT_PAY_MODE:-}" == "mock" ]] || [[ "${WECHAT_PAY_MOCK:-false}" == "true" ]]; then
  echo "Registration mock payment: must be disabled in production"
  FAILED=1
fi
if [[ "${ORDER_EXPIRY_WORKER_ENABLED:-true}" == "false" ]]; then
  echo "ORDER_EXPIRY_WORKER_ENABLED: must not be false because pending orders reserve inventory"
  FAILED=1
fi
if [[ "${MALL_PAYMENT_MODE:-}" == "mock" ]] || [[ "${MALL_MOCK_PAYMENT_ENABLED:-false}" == "true" ]]; then
  echo "Mall mock payment: must be disabled in production"
  FAILED=1
fi
if [[ "${REFUND_MODE:-}" == "mock" ]] || [[ "${MOCK_REFUND_ENABLED:-false}" == "true" ]]; then
  echo "Registration mock refund: must be disabled in production"
  FAILED=1
fi
if [[ "${MALL_REFUND_MODE:-}" == "mock" ]] || [[ "${MALL_MOCK_REFUND_ENABLED:-false}" == "true" ]]; then
  echo "Mall mock refund: must be disabled in production"
  FAILED=1
fi

echo
echo "== Registration WeChat Pay =="
print_mode WECHAT_PAY_MODE mock
print_mode WECHAT_PAY_ENABLED false
WECHAT_PAY_ACTIVE=false
if [[ "${WECHAT_PAY_ENABLED:-}" != "false" ]] && { [[ "${WECHAT_PAY_ENABLED:-}" == "true" ]] || [[ "${WECHAT_PAY_MODE:-mock}" == "real" ]] || [[ "${WECHAT_PAY_MODE:-mock}" == "wechat" ]]; }; then
  WECHAT_PAY_ACTIVE=true
fi
if [[ "${WECHAT_PAY_MODE:-}" != "real" ]]; then
  echo "WECHAT_PAY_MODE: must be real for production registration checkout"
  FAILED=1
fi
if [[ "$WECHAT_PAY_ACTIVE" == "true" ]]; then
  require_any_when_enabled true WECHAT_PAY_APP_ID WECHAT_PAY_APP_ID WECHAT_APP_ID
  require_when_enabled true WECHAT_PAY_MCH_ID
  require_any_when_enabled true WECHAT_PAY_MCH_SERIAL_NO WECHAT_PAY_MCH_SERIAL_NO WECHAT_PAY_SERIAL_NO WECHAT_PAY_CERT_SERIAL_NO
  require_when_enabled true WECHAT_PAY_NOTIFY_URL
  require_when_enabled true WECHAT_PAY_PRIVATE_KEY_PATH
  require_when_enabled true WECHAT_PAY_API_V3_KEY
  require_when_enabled true WECHAT_PAY_PLATFORM_PUBLIC_KEY_PATH
  require_any_when_enabled true WECHAT_PAY_VERIFICATION_KEY_ID WECHAT_PAY_PLATFORM_PUBLIC_KEY_ID WECHAT_PAY_PLATFORM_CERT_SERIAL_NO
  if configured WECHAT_PAY_PRIVATE_KEY_PATH && [[ ! -r "${WECHAT_PAY_PRIVATE_KEY_PATH}" ]]; then
    echo "WECHAT_PAY_PRIVATE_KEY_PATH: configured but file is not readable"
    FAILED=1
  fi
  if configured WECHAT_PAY_PLATFORM_PUBLIC_KEY_PATH && [[ ! -r "${WECHAT_PAY_PLATFORM_PUBLIC_KEY_PATH}" ]]; then
    echo "WECHAT_PAY_PLATFORM_PUBLIC_KEY_PATH: configured but file is not readable"
    FAILED=1
  fi
  if configured WECHAT_PAY_NOTIFY_URL && [[ "${WECHAT_PAY_NOTIFY_URL}" != https://*/api/payments/wechat/notify ]]; then
    echo "WECHAT_PAY_NOTIFY_URL: must be an HTTPS URL ending in /api/payments/wechat/notify"
    FAILED=1
  fi
else
  require_any_when_enabled false WECHAT_PAY_APP_ID WECHAT_PAY_APP_ID WECHAT_APP_ID
  require_when_enabled false WECHAT_PAY_MCH_ID
  require_any_when_enabled false WECHAT_PAY_MCH_SERIAL_NO WECHAT_PAY_MCH_SERIAL_NO WECHAT_PAY_SERIAL_NO WECHAT_PAY_CERT_SERIAL_NO
  require_when_enabled false WECHAT_PAY_NOTIFY_URL
fi

echo
echo "== WeCom =="
if configured WECOM_CONFIG_ENCRYPTION_KEY; then
  echo "WECOM_CONFIG_ENCRYPTION_KEY: dedicated production key configured"
else
  echo "WECOM_CONFIG_ENCRYPTION_KEY: missing"
fi

echo
echo "== Mall payment and refund =="
print_mode MALL_PAYMENT_MODE disabled
print_mode MALL_MOCK_PAYMENT_ENABLED false
if [[ "${MALL_PAYMENT_MODE:-disabled}" == "wechat" ]]; then
  require_when_enabled true WECHAT_PAY_MALL_NOTIFY_URL
else
  require_when_enabled false WECHAT_PAY_MALL_NOTIFY_URL
fi
print_mode MALL_REFUND_MODE disabled
print_mode MALL_MOCK_REFUND_ENABLED false
print_mode MALL_WECHAT_REFUND_ENABLED false
MALL_REFUND_ACTIVE=false
if [[ "${MALL_REFUND_MODE:-disabled}" == "wechat" ]] || [[ "${MALL_WECHAT_REFUND_ENABLED:-false}" == "true" ]]; then
  MALL_REFUND_ACTIVE=true
fi
REGISTRATION_REFUND_ACTIVE=false
if [[ "${REFUND_MODE:-disabled}" == "wechat" ]] || [[ "${WECHAT_REFUND_ENABLED:-false}" == "true" ]]; then
  REGISTRATION_REFUND_ACTIVE=true
fi
if [[ "$MALL_REFUND_ACTIVE" == "true" ]] || [[ "$REGISTRATION_REFUND_ACTIVE" == "true" ]]; then
  require_when_enabled true WECHAT_PAY_REFUND_NOTIFY_URL
  require_any_when_enabled true WECHAT_PAY_APP_ID WECHAT_PAY_APP_ID WECHAT_APP_ID
  require_when_enabled true WECHAT_PAY_MCH_ID
  require_any_when_enabled true WECHAT_PAY_MCH_SERIAL_NO WECHAT_PAY_MCH_SERIAL_NO WECHAT_PAY_SERIAL_NO WECHAT_PAY_CERT_SERIAL_NO
  require_when_enabled true WECHAT_PAY_PRIVATE_KEY_PATH
  require_when_enabled true WECHAT_PAY_API_V3_KEY
  require_when_enabled true WECHAT_PAY_PLATFORM_PUBLIC_KEY_PATH
  require_any_when_enabled true WECHAT_PAY_VERIFICATION_KEY_ID WECHAT_PAY_PLATFORM_PUBLIC_KEY_ID WECHAT_PAY_PLATFORM_CERT_SERIAL_NO
  if configured WECHAT_PAY_PRIVATE_KEY_PATH && [[ ! -r "${WECHAT_PAY_PRIVATE_KEY_PATH}" ]]; then
    echo "WECHAT_PAY_PRIVATE_KEY_PATH: configured but file is not readable"
    FAILED=1
  fi
  if configured WECHAT_PAY_PLATFORM_PUBLIC_KEY_PATH && [[ ! -r "${WECHAT_PAY_PLATFORM_PUBLIC_KEY_PATH}" ]]; then
    echo "WECHAT_PAY_PLATFORM_PUBLIC_KEY_PATH: configured but file is not readable"
    FAILED=1
  fi
  if configured WECHAT_PAY_REFUND_NOTIFY_URL && [[ "${WECHAT_PAY_REFUND_NOTIFY_URL}" != https://*/api/payments/wechat/refund-notify ]]; then
    echo "WECHAT_PAY_REFUND_NOTIFY_URL: must be an HTTPS URL ending in /api/payments/wechat/refund-notify"
    FAILED=1
  fi
fi
if [[ "$REGISTRATION_REFUND_ACTIVE" == "true" ]] && [[ "${REFUND_REQUIRES_APPROVAL:-true}" == "false" ]]; then
  echo "REFUND_REQUIRES_APPROVAL: must remain true because automatic approval is not implemented"
  FAILED=1
fi
if [[ "$MALL_REFUND_ACTIVE" == "true" ]] && [[ "${MALL_REFUND_REQUIRES_APPROVAL:-true}" == "false" ]]; then
  echo "MALL_REFUND_REQUIRES_APPROVAL: must remain true because automatic approval is not implemented"
  FAILED=1
fi

echo
echo "== AI =="
print_mode AI_PROVIDER LOCAL_FALLBACK
print_optional_secret AI_API_KEY "AI will use LOCAL_FALLBACK when provider permits"

echo
echo "== SMS and notification providers =="
print_mode NOTIFICATION_CENTER_ENABLED false
print_mode WECHAT_SUBSCRIBE_MESSAGE_ENABLED false
print_mode NOTIFICATION_TASK_WORKER_ENABLED true
if [[ "${WECHAT_SUBSCRIBE_MESSAGE_ENABLED:-false}" == "true" ]] && [[ "${NOTIFICATION_TASK_WORKER_ENABLED:-true}" == "false" ]]; then
  echo "NOTIFICATION_TASK_WORKER_ENABLED: must not be false while WeChat subscription messages are enabled"
  FAILED=1
fi
print_mode SMS_ENABLED false
print_mode SMS_PROVIDER disabled

echo
echo "== Finance =="
print_mode REFUND_ENABLED false
print_mode INVOICE_ENABLED false
print_mode FINANCE_RECONCILIATION_ENABLED false
print_optional_secret WECHAT_PAY_REFUND_NOTIFY_URL "real WeChat refund callback disabled"
print_optional_secret WECHAT_PAY_BILL_STORAGE_PATH "WeChat bill download/import storage disabled"

if [[ "$FAILED" == "1" ]]; then
  echo
  echo "Production config check failed: required configuration is missing."
  exit 1
fi

echo
echo "Production config check passed."
