#!/usr/bin/env bash
###############################################################################
# monitor-deployment.sh — Post-deploy Health Monitor with Auto-rollback
#
# Polls the live service for the given duration, tracking error rate.
# If the error rate exceeds the threshold, it triggers an automatic rollback.
# Integrates with Prometheus when available.
#
# Usage:
#   ./monitor-deployment.sh [OPTIONS]
#
# Options:
#   --slot <blue|green>   Slot being monitored (used in labels)
#   --namespace <ns>      Kubernetes namespace (default: bluecollar)
#   --duration <sec>      Monitoring window in seconds (default: 300)
#   --interval <sec>      Poll interval in seconds (default: 5)
#   --threshold <pct>     Error rate % that triggers rollback (default: 5)
#   --url <url>           Override health URL (skips in-cluster DNS)
#   --no-rollback         Alert only, don't auto-rollback
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
step() { echo -e "\n${BOLD}$*${NC}"; }

# ── Defaults ──────────────────────────────────────────────────────────────────
NAMESPACE="${NAMESPACE:-bluecollar}"
SLOT=""
DURATION=300
INTERVAL=5
ERROR_THRESHOLD=5   # percent
HEALTH_URL=""
AUTO_ROLLBACK=true
DRY_RUN=false
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Argument parsing ──────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --slot)         SLOT="$2";            shift 2 ;;
    --namespace)    NAMESPACE="$2";       shift 2 ;;
    --duration)     DURATION="$2";        shift 2 ;;
    --interval)     INTERVAL="$2";        shift 2 ;;
    --threshold)    ERROR_THRESHOLD="$2"; shift 2 ;;
    --url)          HEALTH_URL="$2";      shift 2 ;;
    --no-rollback)  AUTO_ROLLBACK=false;  shift   ;;
    --dry-run)      DRY_RUN=true;         shift   ;;
    -h|--help)
      grep '^#' "$0" | grep -v '#!/' | sed 's/^# \?//'
      exit 0 ;;
    # Legacy positional args: monitor-deployment.sh green 300
    blue|green)     SLOT="$1";     shift ;;
    [0-9]*)         DURATION="$1"; shift ;;
    *) err "Unknown option: $1"; exit 1 ;;
  esac
done

# Resolve health URL
if [[ -z "$HEALTH_URL" ]]; then
  HEALTH_URL="http://bluecollar-api/health"
fi

# ── Prometheus query helper (optional — silently skipped if unavailable) ──────
# Queries the Prometheus API for the 5xx error rate over the last minute.
# Returns "N/A" if Prometheus is not reachable.
query_prometheus_error_rate() {
  local prom_url="${PROMETHEUS_URL:-http://prometheus.monitoring.svc.cluster.local:9090}"
  local svc_label="${SLOT:-bluecollar-api}"
  local query="rate(http_requests_total{service=\"${svc_label}\",status=~\"5..\"}[1m]) / rate(http_requests_total{service=\"${svc_label}\"}[1m]) * 100"

  local result
  result=$(curl -s --max-time 5 \
    "${prom_url}/api/v1/query?query=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "${query}" 2>/dev/null || echo "")" \
    2>/dev/null | \
    python3 -c "
import sys,json
try:
  d=json.load(sys.stdin)
  vals=d.get('data',{}).get('result',[])
  if vals: print(vals[0]['value'][1])
  else: print('N/A')
except: print('N/A')
" 2>/dev/null || echo "N/A")

  echo "$result"
}

# ── Main monitoring loop ───────────────────────────────────────────────────────
step "📊 Monitoring Deployment (slot: ${SLOT:-live})"
log "URL:       ${HEALTH_URL}"
log "Duration:  ${DURATION}s"
log "Interval:  ${INTERVAL}s"
log "Threshold: ${ERROR_THRESHOLD}%"
log "Rollback:  ${AUTO_ROLLBACK}"
echo ""

TOTAL_CHECKS=0
ERROR_COUNT=0
CONSECUTIVE_ERRORS=0
MAX_CONSECUTIVE=3   # instant rollback trigger
START_TIME=$SECONDS
END_TIME=$((START_TIME + DURATION))

while [[ $SECONDS -lt $END_TIME ]]; do
  elapsed=$((SECONDS - START_TIME))
  remaining=$((END_TIME - SECONDS))

  # HTTP health poll
  if [[ "$DRY_RUN" == "true" ]]; then
    code="200"
  else
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$HEALTH_URL" 2>/dev/null || echo "000")
  fi

  TOTAL_CHECKS=$((TOTAL_CHECKS + 1))

  if [[ "$code" == "200" ]]; then
    CONSECUTIVE_ERRORS=0
    # Log every 30s to avoid noise
    if (( elapsed % 30 == 0 )); then
      log "  [${elapsed}s/${DURATION}s] ✓ HTTP ${code} | checks: ${TOTAL_CHECKS} | errors: ${ERROR_COUNT}"

      # Optional: log Prometheus error rate
      prom_rate="$(query_prometheus_error_rate)"
      if [[ "$prom_rate" != "N/A" ]]; then
        log "  Prometheus 5xx rate: ${prom_rate}%"
      fi
    fi
  else
    ERROR_COUNT=$((ERROR_COUNT + 1))
    CONSECUTIVE_ERRORS=$((CONSECUTIVE_ERRORS + 1))
    warn "[${elapsed}s/${DURATION}s] HTTP ${code} | consecutive: ${CONSECUTIVE_ERRORS} | total errors: ${ERROR_COUNT}/${TOTAL_CHECKS}"
  fi

  # Instant rollback on consecutive failures
  if [[ $CONSECUTIVE_ERRORS -ge $MAX_CONSECUTIVE ]]; then
    err "${MAX_CONSECUTIVE} consecutive health check failures — triggering rollback"

    if [[ "$AUTO_ROLLBACK" == "true" ]]; then
      err "Initiating automatic rollback..."
      "${SCRIPT_DIR}/rollback.sh" \
        --namespace "$NAMESPACE" \
        --timeout 60
    else
      err "Auto-rollback disabled. Manual intervention required."
    fi

    exit 1
  fi

  # Periodic error-rate check
  if [[ $TOTAL_CHECKS -gt 0 && $(( TOTAL_CHECKS % 12 )) -eq 0 ]]; then
    current_rate=$(( (ERROR_COUNT * 100) / TOTAL_CHECKS ))
    if [[ $current_rate -gt $ERROR_THRESHOLD ]]; then
      err "Error rate ${current_rate}% exceeds threshold ${ERROR_THRESHOLD}%"

      if [[ "$AUTO_ROLLBACK" == "true" ]]; then
        err "Initiating automatic rollback..."
        "${SCRIPT_DIR}/rollback.sh" \
          --namespace "$NAMESPACE" \
          --timeout 60
      else
        err "Auto-rollback disabled. Manual intervention required."
      fi

      exit 1
    fi
  fi

  sleep "$INTERVAL"
done

# ── Final report ──────────────────────────────────────────────────────────────
FINAL_ERROR_RATE=0
if [[ $TOTAL_CHECKS -gt 0 ]]; then
  FINAL_ERROR_RATE=$(( (ERROR_COUNT * 100) / TOTAL_CHECKS ))
fi

echo ""
log "Monitoring complete: ${TOTAL_CHECKS} checks | ${ERROR_COUNT} errors | ${FINAL_ERROR_RATE}% error rate"

if [[ $FINAL_ERROR_RATE -gt $ERROR_THRESHOLD ]]; then
  err "Final error rate ${FINAL_ERROR_RATE}% exceeds threshold ${ERROR_THRESHOLD}%"
  exit 1
fi

ok "Deployment monitoring passed (${FINAL_ERROR_RATE}% error rate < ${ERROR_THRESHOLD}% threshold)"
