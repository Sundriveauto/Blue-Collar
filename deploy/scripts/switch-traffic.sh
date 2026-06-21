#!/usr/bin/env bash
###############################################################################
# switch-traffic.sh — Atomic Kubernetes Service Selector Patch
#
# Patches the selector of the live  bluecollar-api  Service to point at
# the given slot (blue | green).  Also patches the stable service used by
# Argo Rollouts.  The operation is atomic at the API-server level and takes
# effect in milliseconds — pods already handling long-lived connections
# finish gracefully thanks to the preStop hook (5s sleep) in the Deployment.
#
# Usage:
#   ./switch-traffic.sh --slot <blue|green> [OPTIONS]
#
# Options:
#   --slot <blue|green>   Target slot (required)
#   --namespace <ns>      Kubernetes namespace (default: bluecollar)
#   --timeout <sec>       Health check timeout (default: 30)
#   --skip-monitor        Skip post-switch health poll
#   --dry-run             Print actions without executing
#   -h, --help            Show this help
###############################################################################
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

log()  { echo -e "${CYAN}[$(date '+%H:%M:%S')]${NC} $*"; }
ok()   { echo -e "${GREEN}✅ $*${NC}"; }
warn() { echo -e "${YELLOW}⚠️  $*${NC}"; }
err()  { echo -e "${RED}❌ $*${NC}" >&2; }

# ── Defaults ──────────────────────────────────────────────────────────────────
NAMESPACE="${NAMESPACE:-bluecollar}"
TARGET_SLOT=""
TIMEOUT=30
SKIP_MONITOR=false
DRY_RUN=false

# ── Argument parsing ──────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --slot)         TARGET_SLOT="$2"; shift 2 ;;
    --namespace)    NAMESPACE="$2";   shift 2 ;;
    --timeout)      TIMEOUT="$2";     shift 2 ;;
    --skip-monitor) SKIP_MONITOR=true; shift  ;;
    --dry-run)      DRY_RUN=true;     shift   ;;
    -h|--help)
      grep '^#' "$0" | grep -v '#!/' | sed 's/^# \?//'
      exit 0 ;;
    # Legacy positional arg support (called with just slot name)
    blue|green)     TARGET_SLOT="$1"; shift   ;;
    *) err "Unknown option: $1"; exit 1 ;;
  esac
done

if [[ -z "$TARGET_SLOT" ]]; then
  err "--slot <blue|green> is required"
  exit 1
fi

if [[ "$TARGET_SLOT" != "blue" && "$TARGET_SLOT" != "green" ]]; then
  err "Invalid slot '${TARGET_SLOT}'. Must be 'blue' or 'green'."
  exit 1
fi

kube() {
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "[DRY-RUN] kubectl $*"
    return 0
  fi
  kubectl "$@"
}

# ── Patch live service selector ────────────────────────────────────────────────
log "Switching live service selector to slot: ${TARGET_SLOT}"

SELECTOR_PATCH="{\"spec\":{\"selector\":{\"app\":\"bluecollar-api\",\"slot\":\"${TARGET_SLOT}\"}}}"
ANNOTATION_PATCH="{\"metadata\":{\"annotations\":{\"bluecollar.io/active-slot\":\"${TARGET_SLOT}\"}}}"

kube patch service bluecollar-api \
  -n "$NAMESPACE" \
  --type=merge \
  -p "${SELECTOR_PATCH}"

kube patch service bluecollar-api \
  -n "$NAMESPACE" \
  --type=merge \
  -p "${ANNOTATION_PATCH}"

# Also update the stable service used by Argo Rollouts
kube patch service bluecollar-api-stable \
  -n "$NAMESPACE" \
  --type=merge \
  -p "${SELECTOR_PATCH}" 2>/dev/null || true

ok "Service selector patched to slot: ${TARGET_SLOT}"

# ── Post-switch health poll ────────────────────────────────────────────────────
if [[ "$SKIP_MONITOR" == "true" ]]; then
  log "Skipping post-switch health poll (--skip-monitor)"
  exit 0
fi

log "Verifying live service health after switch (timeout: ${TIMEOUT}s)..."

ATTEMPTS=$(( TIMEOUT / 5 ))
[[ $ATTEMPTS -lt 3 ]] && ATTEMPTS=3

for i in $(seq 1 "$ATTEMPTS"); do
  code=$(kubectl run "sw-health-$$-${i}" \
    --image=curlimages/curl:8.7.1 \
    --restart=Never \
    --rm \
    --namespace="$NAMESPACE" \
    --attach \
    --quiet \
    -- curl -s -o /dev/null -w '%{http_code}' --max-time 5 \
       "http://bluecollar-api/health" 2>/dev/null || echo "000")

  if [[ "$code" == "200" ]]; then
    ok "Live service health verified (HTTP ${code}) after traffic switch"
    exit 0
  fi

  warn "Attempt ${i}/${ATTEMPTS}: HTTP ${code} — retrying in 5s..."
  sleep 5
done

err "Live service health check failed after ${TIMEOUT}s"
exit 1
