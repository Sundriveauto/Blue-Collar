#!/usr/bin/env bash
###############################################################################
# smoke-tests.sh — Post-deploy Smoke Tests
#
# Runs against a named service inside the cluster OR via an external URL.
# Supports both Kubernetes in-cluster mode (default) and external URL mode.
#
# Usage:
#   # In-cluster (CI/CD — uses kubectl run)
#   ./smoke-tests.sh --slot green --namespace bluecollar
#
#   # External URL (staging / local)
#   ./smoke-tests.sh --api-url http://localhost:3000 --app-url http://localhost:3001
#
# Options:
#   --slot <blue|green>     Target slot service name inside cluster
#   --namespace <ns>        Kubernetes namespace (default: bluecollar)
#   --api-url <url>         Override API base URL (skips in-cluster probe)
#   --app-url <url>         Override App base URL
#   --timeout <sec>         Per-request timeout (default: 10)
#   --dry-run               Print actions without executing
#   -h, --help              Show this help
###############################################################################
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

log()  { echo -e "${CYAN}[$(date '+%H:%M:%S')]${NC} $*"; }
ok()   { echo -e "${GREEN}✅ $*${NC}"; }
fail() { echo -e "${RED}❌ $*${NC}" >&2; }

# ── Defaults ──────────────────────────────────────────────────────────────────
NAMESPACE="${NAMESPACE:-bluecollar}"
SLOT=""
API_URL=""
APP_URL=""
REQUEST_TIMEOUT=10
DRY_RUN=false
PASS=0
FAIL=0

# ── Argument parsing ──────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --slot)       SLOT="$2";            shift 2 ;;
    --namespace)  NAMESPACE="$2";       shift 2 ;;
    --api-url)    API_URL="$2";         shift 2 ;;
    --app-url)    APP_URL="$2";         shift 2 ;;
    --timeout)    REQUEST_TIMEOUT="$2"; shift 2 ;;
    --dry-run)    DRY_RUN=true;         shift   ;;
    -h|--help)
      grep '^#' "$0" | grep -v '#!/' | sed 's/^# \?//'
      exit 0 ;;
    # Legacy positional — called as: smoke-tests.sh blue|green
    blue|green)   SLOT="$1"; shift ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# ── Resolve base URLs ─────────────────────────────────────────────────────────
if [[ -z "$API_URL" && -n "$SLOT" ]]; then
  # In-cluster: use service DNS
  API_URL="http://bluecollar-api-${SLOT}"
elif [[ -z "$API_URL" ]]; then
  # Fallback to staging env vars
  API_URL="${STAGING_API_URL:-http://localhost:3000}"
fi

if [[ -z "$APP_URL" ]]; then
  APP_URL="${STAGING_APP_URL:-http://localhost:3001}"
fi

log "Smoke tests target:"
log "  API: ${API_URL}"
log "  App: ${APP_URL}"
echo ""

# ── Test runner ───────────────────────────────────────────────────────────────
# check <label> <url> <expected_http_code> [<body_contains>]
check() {
  local label="$1"
  local url="$2"
  local expected="$3"
  local body_grep="${4:-}"

  if [[ "$DRY_RUN" == "true" ]]; then
    ok "[DRY-RUN] ${label} — would check ${url}"
    PASS=$((PASS + 1))
    return 0
  fi

  local body code
  body=$(curl -s --max-time "$REQUEST_TIMEOUT" "$url" 2>/dev/null || echo "")
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time "$REQUEST_TIMEOUT" "$url" 2>/dev/null || echo "000")

  if [[ "$code" != "$expected" ]]; then
    fail "${label} — expected HTTP ${expected}, got ${code} (${url})"
    FAIL=$((FAIL + 1))
    return 0   # don't abort; collect all failures
  fi

  if [[ -n "$body_grep" ]] && ! echo "$body" | grep -q "$body_grep"; then
    fail "${label} — HTTP ${code} but body missing '${body_grep}' (${url})"
    FAIL=$((FAIL + 1))
    return 0
  fi

  ok "${label} (HTTP ${code})"
  PASS=$((PASS + 1))
}

# ── API checks ────────────────────────────────────────────────────────────────
log "── API ──────────────────────────────────────────"
check "API /health"              "${API_URL}/health"              "200" '"ok"'
check "API /ready"               "${API_URL}/ready"               "200" '"ok"'
check "API /api/v1/categories"   "${API_URL}/api/v1/categories"   "200"
check "API 404 handling"         "${API_URL}/this-route-does-not-exist" "404"

# ── App checks ────────────────────────────────────────────────────────────────
log ""
log "── App ──────────────────────────────────────────"
check "App homepage"             "${APP_URL}/"                    "200"
check "App /health"              "${APP_URL}/health"              "200"

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
log "Results: ${PASS} passed, ${FAIL} failed"

if [[ $FAIL -gt 0 ]]; then
  fail "Smoke tests FAILED (${FAIL} failure(s))"
  exit 1
fi

ok "All smoke tests passed (${PASS}/${PASS})"
