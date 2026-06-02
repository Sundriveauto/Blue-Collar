#!/bin/bash
set -e

API_URL="${STAGING_API_URL:-http://localhost:3000}"
APP_URL="${STAGING_APP_URL:-http://localhost:3001}"

echo "🧪 Running staging smoke tests..."
echo "   API: $API_URL"
echo "   App: $APP_URL"

check() {
  local label=$1 url=$2 expected=$3
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$url" 2>/dev/null || echo "000")
  if [ "$code" != "$expected" ]; then
    echo "❌ $label — expected $expected, got $code ($url)"
    exit 1
  fi
  echo "✅ $label ($code)"
}

check "API health"      "$API_URL/health"         "200"
check "API categories"  "$API_URL/api/categories"  "200"
check "App homepage"    "$APP_URL/"                "200"

echo "✅ All staging smoke tests passed."
