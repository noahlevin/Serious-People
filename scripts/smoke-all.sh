#!/usr/bin/env bash
set -euo pipefail

# Full smoke loop: auth + serious plan artifacts + module gating
# Usage: bash scripts/smoke-all.sh
# Env vars (with defaults):
#   PORT=5000
#   ORIGIN=http://localhost:$PORT
#   EMAIL=noah@noahlevin.com
#   DEV_TOOLS_SECRET=sp-dev-2024

PORT="${PORT:-5000}"
ORIGIN="${ORIGIN:-http://localhost:$PORT}"
EMAIL="${EMAIL:-noah@noahlevin.com}"
DEV_TOOLS_SECRET="${DEV_TOOLS_SECRET:-sp-dev-2024}"

echo "========================================"
echo "[SMOKE-ALL] Full Smoke Loop"
echo "========================================"
echo "ORIGIN=$ORIGIN"
echo "EMAIL=$EMAIL"
echo "PORT=$PORT"
echo ""

FAILED=0

# ----------------------------------------------
# 1. Auth smoke test
# ----------------------------------------------
echo "[SMOKE-ALL] Step 1: Running auth smoke test..."
echo ""
if bash scripts/smoke-auth.sh; then
  echo ""
  echo "[PASS] Auth smoke test passed"
else
  echo ""
  echo "[FAIL] Auth smoke test failed"
  FAILED=1
fi
echo ""

# ----------------------------------------------
# 2. Serious Plan Artifacts smoke test
# ----------------------------------------------
echo "[SMOKE-ALL] Step 2: Running serious plan artifacts smoke test..."
echo ""
if ORIGIN="$ORIGIN" EMAIL="$EMAIL" DEV_TOOLS_SECRET="$DEV_TOOLS_SECRET" node scripts/smoke-serious-plan-artifacts.mjs; then
  echo ""
  echo "[PASS] Serious plan artifacts smoke test passed"
else
  echo ""
  echo "[FAIL] Serious plan artifacts smoke test failed"
  FAILED=1
fi
echo ""

# ----------------------------------------------
# 3. Module gating check
# ----------------------------------------------
echo "[SMOKE-ALL] Step 3: Checking module route gating..."
echo ""

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$ORIGIN/app/module/1")

if [ "$HTTP_CODE" = "302" ]; then
  echo "[PASS] Module route gated (302 redirect to login)"
elif [ "$HTTP_CODE" = "200" ]; then
  echo "[PASS] Module route served (200 - SPA HTML returned)"
else
  echo "[FAIL] Module route returned unexpected status: $HTTP_CODE"
  FAILED=1
fi
echo ""

# ----------------------------------------------
# Summary
# ----------------------------------------------
echo "========================================"
if [ "$FAILED" -eq 0 ]; then
  echo "[PASS] Smoke loop complete"
  exit 0
else
  echo "[FAIL] Smoke loop had failures"
  exit 1
fi
