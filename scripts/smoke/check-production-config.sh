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

load_production_env

echo "== Required core configuration =="
print_required DATABASE_URL
print_required JWT_SECRET
print_required WECHAT_APP_ID
print_required WECHAT_APP_SECRET

echo
echo "== Registration WeChat Pay =="
print_mode WECHAT_PAY_MODE mock
print_mode WECHAT_PAY_ENABLED false
if [[ "${WECHAT_PAY_ENABLED:-false}" == "true" || "${WECHAT_PAY_MODE:-mock}" == "wechat" ]]; then
  require_when_enabled true WECHAT_PAY_MCH_ID
  require_when_enabled true WECHAT_PAY_SERIAL_NO
  require_when_enabled true WECHAT_PAY_NOTIFY_URL
  require_when_enabled true WECHAT_PAY_PRIVATE_KEY_PATH
  require_when_enabled true WECHAT_PAY_API_V3_KEY
else
  require_when_enabled false WECHAT_PAY_MCH_ID
  require_when_enabled false WECHAT_PAY_SERIAL_NO
  require_when_enabled false WECHAT_PAY_NOTIFY_URL
fi

echo
echo "== WeCom =="
print_optional_secret WECOM_CONFIG_ENCRYPTION_KEY "JWT_SECRET fallback will be used"

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

echo
echo "== AI =="
print_mode AI_PROVIDER LOCAL_FALLBACK
print_optional_secret AI_API_KEY "AI will use LOCAL_FALLBACK when provider permits"

echo
echo "== SMS and notification providers =="
print_mode NOTIFICATION_CENTER_ENABLED false
print_mode WECHAT_SUBSCRIBE_MESSAGE_ENABLED false
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
