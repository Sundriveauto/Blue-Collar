#!/usr/bin/env bash
###############################################################################
# rollback.sh — Blue-Green Rollback (target: < 60 seconds)
#
# Usage:
#   ./rollback.sh [OPTIONS]
#
# Options:
#   --namespace <ns>   Kubernetes namespace (default: bluecollar)
#   --timeout <sec>    Max seconds to wait for rollback (default: 60)
#   --dry-run          Print actions without executing
#   -h, --help         Show this help
#
# How it works:
#   1. Reads the active-env ConfigMap to find the current live slot
#   2. Switches the live Service selector to the previous (standby) slot
#   3. Scales the previous slot back to full replicas if needed
#   4. Waits for the standby pods to confirm they are Ready
#   5. Verifies health via /health endpoint
#   6. Updates the active-env ConfigMap to reflect the reverted slot
#   7. Scales down the failed slot to 1 replica for post-mortem
#
# The entire sequence is designed to complete under 60 seconds because
# the standby slot is left running at ≥1 replica and its pods are already
# warmed up with a valid image from the previous deploy.
###############################################################################
set -euo pipefail

# ── Colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

log()  { echo -e "${CYAN}[$(date '+%H:%M:%S')]${NC} $*"; }
ok()   { echo -e "${GREEN}✅ $*${NC}"; }
warn() { echo -e "${YELLOW}⚠️  $*${NC}"; }
err()  { echo -e "${RED}❌ $*${NC}" >&2; }
step() { echo -e "\n${BOLD}${BLUE}━━━ $* ━━━${NC}"; }

# ── Defaults ──────────────────────────────────────────────────────────────────
NAMESPACE="${NAMESPACE:-bluecollar}"
TIMEOUT=60
DRY_RUN=false
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Argument parsing ──────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --namespace)  NAMESPACE="$2"; shift 2 ;;
    --timeout)    TIMEOUT="$2";   shift 2 ;;
    --dry-run)    DRY_RUN=true;   shift   ;;
    -h|--help)
      grep '^#' "$0" | grep -v '#!/' | sed 's/^# \?//'
      exit 0 ;;
    *) err "Unknown option: $1"; exit 1 ;;
  esac
done

# kubectl wrapper — respects DRY_RUN
kube() {
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "[DRY-RUN] kubectl $*"
    return 0
  fi
  kubectl "$@"
}

# ── Read current state ────────────────────────────────────────────────────────
get_active_slot() {
  kubectl get configmap active-env -n "$NAMESPACE" \
    -o jsonpath='{.data.slot}' 2>/dev/null || echo "blue"
}

# ── Start rollback ────────────────────────────────────────────────────────────
ROLLBACK_START=$SECONDS

step "BlueCollar Rollback Initiated"
ACTIVE_SLOT="$(get_active_slot)"

if [[ "$ACTIVE_SLOT" == "blue" ]]; then
  ROLLBACK_SLOT="green"
else
  ROLLBACK_SLOT="blue"
fi

log "Current active (failed) slot: ${ACTIVE_SLOT}"
log "Rolling back to:              ${ROLLBACK_SLOT}"
log "Timeout:                      ${TIMEOUT}s"
echo ""

# ── Step 1: Scale standby back to full replicas immediately ───────────────────
step "Scale Up → ${ROLLBACK_SLOT}"
log "Scaling bluecollar-api-${ROLLBACK_SLOT} to 3 replicas..."
kube scale "deployment/bluecollar-api-${ROLLBACK_SLOT}" \
  --replicas=3 \
  -n "$NAMESPACE"

# ── Step 2: Switch live service to standby slot ───────────────────────────────
step "Switch Traffic → ${ROLLBACK_SLOT}"
"${SCRIPT_DIR}/switch-traffic.sh" \
  --slot "$ROLLBACK_SLOT" \
  --namespace "$NAMESPACE" \
  --timeout "$TIMEOUT" \
  --skip-monitor

# ── Step 3: Wait for rollback slot pods to be fully ready ────────────────────
step "Readiness Check → ${ROLLBACK_SLOT}"
remaining=$((TIMEOUT - (SECONDS - ROLLBACK_START)))
if [[ $remaining -le 0 ]]; then
  err "Timeout budget exhausted before readiness check."
  exit 1
fi

log "Waiting up to ${remaining}s for bluecollar-api-${ROLLBACK_SLOT} to be ready..."
if ! kube rollout status "deployment/bluecollar-api-${ROLLBACK_SLOT}" \
      -n "$NAMESPACE" \
      --timeout="${remaining}s"; then
  err "Rollback deployment not ready within timeout. Manual intervention required."
  exit 1
fi

# ── Step 4: Quick health check ────────────────────────────────────────────────
step "Health Check → ${ROLLBACK_SLOT}"
SVC="bluecollar-api-${ROLLBACK_SLOT}"
HEALTH_ATTEMPTS=6
for i in $(seq 1 $HEALTH_ATTEMPTS); do
  code=$(kubectl run "rb-health-$$-${i}" \
    --image=curlimages/curl:8.7.1 \
    --restart=Never \
    --rm \
    --namespace="$NAMESPACE" \
    --attach \
    --quiet \
    -- curl -s -o /dev/null -w '%{http_code}' --max-time 5 \
       "http://${SVC}/health" 2>/dev/null || echo "000")

  if [[ "$code" == "200" ]]; then
    ok "Health check passed (HTTP ${code})"
    break
  fi

  if [[ $i -eq $HEALTH_ATTEMPTS ]]; then
    err "Health check failed after ${HEALTH_ATTEMPTS} attempts (last: HTTP ${code})"
    err "The rollback slot may also be unhealthy. Manual investigation required."
    exit 1
  fi

  warn "Health check attempt ${i}/${HEALTH_ATTEMPTS}: HTTP ${code} — retrying..."
  sleep 5
done

# ── Step 5: Update ConfigMap ──────────────────────────────────────────────────
kube patch configmap active-env -n "$NAMESPACE" \
  --type=merge \
  -p "{\"data\":{\"slot\":\"${ROLLBACK_SLOT}\",\"promoted-at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}}"

# ── Step 6: Scale down failed slot ────────────────────────────────────────────
log "Scaling failed slot (${ACTIVE_SLOT}) down to 1 replica for post-mortem..."
kube scale "deployment/bluecollar-api-${ACTIVE_SLOT}" \
  --replicas=1 \
  -n "$NAMESPACE" || warn "Could not scale down ${ACTIVE_SLOT} (non-fatal)"

# ── Reset canary weight to 0 in case a canary was in progress ────────────────
kube annotate ingress bluecollar-ingress-canary \
  -n "$NAMESPACE" --overwrite \
  "nginx.ingress.kubernetes.io/canary-weight=0" 2>/dev/null || true

ELAPSED=$((SECONDS - ROLLBACK_START))
echo ""
ok "Rollback complete in ${ELAPSED}s"
log "Active slot:  ${ROLLBACK_SLOT}"
log "Failed slot:  ${ACTIVE_SLOT} (1 replica, preserved for investigation)"
