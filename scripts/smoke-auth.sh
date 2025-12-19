#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-5000}"
ORIGIN="${ORIGIN:-http://localhost:${PORT}}"
EMAIL="${EMAIL:-noah@noahlevin.com}"

pass() { echo "[PASS] $*"; }
fail() { echo "[FAIL] $*"; exit 1; }
skip() { echo "[SKIP] $*"; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

require_cmd curl
require_cmd node

echo "ORIGIN: ${ORIGIN}"
echo "EMAIL:  ${EMAIL}"
echo

http_status() {
  # usage: http_status URL
  curl -sS -o /dev/null -w "%{http_code}" "$1" || true
}

get_location_header() {
  # usage: get_location_header URL
  # Trim leading/trailing whitespace from the location header value
  curl -sS -I "$1" | awk 'BEGIN{IGNORECASE=1} /^Location:/{sub(/\r/,""); val=substr($0,10); gsub(/^[ \t]+|[ \t]+$/, "", val); print val}'
}

decode_redirect_uri() {
  # prints decoded redirect_uri from an OAuth Location header
  node -e "
    const loc = process.argv[1].trim();
    const url = new URL(loc);
    const ru = url.searchParams.get('redirect_uri') || '';
    console.log(decodeURIComponent(ru));
  " "$1"
}

check_oauth_302() {
  local path="$1"
  local url="${ORIGIN}${path}"
  local loc
  loc="$(get_location_header "$url" || true)"
  [[ -n "${loc}" ]] || fail "${path}: expected Location header, got none"
  echo "${path}: Location -> ${loc}"

  [[ "${loc}" == https://accounts.google.com/* ]] || fail "${path}: expected redirect to accounts.google.com"

  local decoded
  decoded="$(decode_redirect_uri "${loc}")"
  echo "${path}: decoded redirect_uri -> ${decoded}"

  [[ "${decoded}" == *"/auth/google/callback" ]] || fail "${path}: redirect_uri should end with /auth/google/callback"
  pass "${path}: 302 to Google with redirect_uri ending in /auth/google/callback"
}

check_magic_start() {
  local url="${ORIGIN}/app/auth/magic/start"
  local body
  body="$(curl -sS -X POST "$url" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"${EMAIL}\"}")"

  echo "/app/auth/magic/start: body -> ${body}"

  node -e "
    const data = JSON.parse(process.argv[1]);
    if (data.success !== true) {
      console.error('expected success=true, got', data);
      process.exit(1);
    }
  " "$body"

  pass "Magic link start returns JSON with success=true"
}

optional_debug_auth_config() {
  local url="${ORIGIN}/api/debug/auth-config"
  local code
  code="$(http_status "$url")"
  if [[ "$code" == "404" ]]; then
    skip "Debug auth-config endpoint unavailable (likely DEBUG_AUTH not enabled)"
    return 0
  fi
  [[ "$code" == "200" ]] || fail "Debug auth-config endpoint returned HTTP ${code}"

  local body
  body="$(curl -sS "$url")"
  echo "/api/debug/auth-config: body -> ${body}"

  node -e "
    const d = JSON.parse(process.argv[1]);
    for (const k of ['baseUrl','appBasePath','googleCallbackUrl','magicVerifyUrlTemplate']) {
      if (!d[k]) {
        console.error('missing/empty', k);
        process.exit(1);
      }
    }
  " "$body"

  pass "Debug auth-config has expected keys"
}

optional_debug_magic_last_send() {
  local url="${ORIGIN}/api/debug/magic-last-send"
  local code
  code="$(http_status "$url")"
  if [[ "$code" == "404" ]]; then
    skip "Debug magic-last-send endpoint unavailable (likely DEBUG_AUTH not enabled)"
    return 0
  fi
  [[ "$code" == "200" ]] || fail "Debug magic-last-send endpoint returned HTTP ${code}"

  local body
  body="$(curl -sS "$url")"
  echo "/api/debug/magic-last-send: body -> ${body}"

  node -e "
    const d = JSON.parse(process.argv[1]);
    if (d.providerAccepted !== true) {
      console.error('expected providerAccepted=true, got', d);
      process.exit(1);
    }
  " "$body"

  pass "Debug magic-last-send shows providerAccepted=true"
}

echo "=== Smoke: OAuth ==="
check_oauth_302 "/auth/google"
check_oauth_302 "/app/auth/google"
echo

echo "=== Smoke: Magic Link ==="
check_magic_start
echo

echo "=== Optional Debug Checks ==="
optional_debug_auth_config
optional_debug_magic_last_send
echo

echo "=== Results ==="
pass "All required checks passed"
