#!/usr/bin/env bash
###############################################################################
# db-migrate-blue-green.sh — Safe Database Migration for Blue-Green Deployments
#
# Blue-green deployments require backward-compatible migrations because both
# the current (blue) and new (green) versions of the app run against the SAME
# database simultaneously during the traffic switch.
#
# This script implements the expand-contract pattern:
#
#   Phase 1 – EXPAND   Run additive migrations (new columns/tables, nullable
#                       columns, new indexes) BEFORE deploying the new image.
#                       Both old and new app versions stay compatible.
#
#   Phase 2 – CONTRACT Run breaking migrations (drop old columns, rename,
#                       enforce NOT NULL) only AFTER the old version has been
#                       fully decommissioned (next deploy cycle).
#
# Usage:
#   ./db-migrate-blue-green.sh --phase expand --namespace bluecollar --image <tag>
#   ./db-migrate-blue-green.sh --phase contract --namespace bluecollar --image <tag>
#
# Options:
#   --phase <expand|contract>   Migration phase (required)
#   --namespace <ns>            Kubernetes namespace (default: bluecollar)
#   --image <tag>               Docker image to run migrations with (required)
#   --registry <url>            Registry prefix (default: ghcr.io/blue-kollar)
#   --dry-run                   Print actions without executing
#   --timeout <sec>             Job timeout in seconds (default: 300)
#   -h, --help                  Show this help
###############################################################################
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

log()  { echo -e "${CYAN}[$(date '+%H:%M:%S')]${NC} $*"; }
ok()   { echo -e "${GREEN}✅ $*${NC}"; }
warn() { echo -e "${YELLOW}⚠️  $*${NC}"; }
err()  { echo -e "${RED}❌ $*${NC}" >&2; }

# ── Defaults ──────────────────────────────────────────────────────────────────
NAMESPACE="${NAMESPACE:-bluecollar}"
PHASE=""
IMAGE_TAG="${IMAGE_TAG:-}"
REGISTRY="${DOCKER_REGISTRY:-ghcr.io/blue-kollar}"
DRY_RUN=false
JOB_TIMEOUT=300

# ── Argument parsing ──────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --phase)      PHASE="$2";      shift 2 ;;
    --namespace)  NAMESPACE="$2";  shift 2 ;;
    --image)      IMAGE_TAG="$2";  shift 2 ;;
    --registry)   REGISTRY="$2";   shift 2 ;;
    --dry-run)    DRY_RUN=true;    shift   ;;
    --timeout)    JOB_TIMEOUT="$2"; shift 2 ;;
    -h|--help)
      grep '^#' "$0" | grep -v '#!/' | sed 's/^# \?//'
      exit 0 ;;
    *) err "Unknown option: $1"; exit 1 ;;
  esac
done

# ── Validation ────────────────────────────────────────────────────────────────
if [[ -z "$PHASE" ]]; then
  err "--phase <expand|contract> is required"
  exit 1
fi

if [[ "$PHASE" != "expand" && "$PHASE" != "contract" ]]; then
  err "Invalid phase '${PHASE}'. Must be 'expand' or 'contract'."
  exit 1
fi

if [[ -z "$IMAGE_TAG" ]]; then
  err "--image <tag> is required"
  exit 1
fi

FULL_IMAGE="${REGISTRY}/bluecollar-api:${IMAGE_TAG}"
JOB_NAME="db-migrate-${PHASE}-${IMAGE_TAG:0:8}-$(date +%s)"

log "Migration Phase: ${PHASE}"
log "Image:           ${FULL_IMAGE}"
log "Namespace:       ${NAMESPACE}"
log "Job name:        ${JOB_NAME}"

if [[ "$PHASE" == "contract" ]]; then
  warn "CONTRACT phase: this will drop/rename columns. Ensure old app version is no longer running."
  warn "Proceeding in 5s... Press Ctrl+C to abort."
  sleep 5
fi

# ── Dispatch migration Job ────────────────────────────────────────────────────
if [[ "$DRY_RUN" == "true" ]]; then
  log "[DRY-RUN] Would create Job ${JOB_NAME} to run prisma migrate deploy"
  exit 0
fi

# The PRISMA_MIGRATION_PHASE env var is read by the app's migration entrypoint
# to decide which migrations to run (expand-only vs full).
# If your Prisma setup doesn't distinguish phases, both phases run the same
# `prisma migrate deploy` — the expand/contract logic is enforced by your
# migration file naming convention (e.g., 001_expand_add_col.sql).
kubectl apply -n "$NAMESPACE" -f - <<EOF
apiVersion: batch/v1
kind: Job
metadata:
  name: ${JOB_NAME}
  namespace: ${NAMESPACE}
  labels:
    app.kubernetes.io/part-of: bluecollar
    bluecollar.io/purpose: migration
    bluecollar.io/phase: ${PHASE}
  annotations:
    bluecollar.io/image-tag: "${IMAGE_TAG}"
    bluecollar.io/migration-phase: "${PHASE}"
spec:
  backoffLimit: 2
  activeDeadlineSeconds: ${JOB_TIMEOUT}
  ttlSecondsAfterFinished: 7200
  template:
    spec:
      restartPolicy: OnFailure
      containers:
        - name: migrate
          image: ${FULL_IMAGE}
          command: ["npx", "prisma", "migrate", "deploy"]
          env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: bluecollar-secrets
                  key: database-url
            - name: PRISMA_MIGRATION_PHASE
              value: "${PHASE}"
            - name: NODE_ENV
              value: "production"
          resources:
            requests:
              cpu: "100m"
              memory: "128Mi"
            limits:
              cpu: "500m"
              memory: "256Mi"
EOF

log "Waiting for migration job ${JOB_NAME} to complete (timeout: ${JOB_TIMEOUT}s)..."

if ! kubectl wait "job/${JOB_NAME}" \
      -n "$NAMESPACE" \
      --for=condition=complete \
      --timeout="${JOB_TIMEOUT}s"; then
  err "Migration job ${JOB_NAME} failed or timed out"
  kubectl logs "job/${JOB_NAME}" -n "$NAMESPACE" || true
  kubectl delete "job/${JOB_NAME}" -n "$NAMESPACE" --ignore-not-found || true
  exit 1
fi

ok "Migration phase '${PHASE}' completed successfully"
kubectl delete "job/${JOB_NAME}" -n "$NAMESPACE" --ignore-not-found || true
