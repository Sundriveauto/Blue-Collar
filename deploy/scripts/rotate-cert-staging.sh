#!/usr/bin/env bash
# Test TLS certificate rotation in staging by forcing a renewal.
# Usage: ./rotate-cert-staging.sh [certificate-name] [namespace]
set -euo pipefail

CERT_NAME="${1:-bluecollar-tls}"
NAMESPACE="${2:-bluecollar}"
STAGING_ISSUER="letsencrypt-staging"

echo "==> Checking cert-manager is installed..."
kubectl get crd certificates.cert-manager.io >/dev/null 2>&1 || {
  echo "ERROR: cert-manager CRDs not found. Install cert-manager first." >&2
  exit 1
}

echo "==> Current certificate status for '${CERT_NAME}' in '${NAMESPACE}':"
kubectl get certificate "${CERT_NAME}" -n "${NAMESPACE}" \
  -o jsonpath='{.status.conditions[?(@.type=="Ready")]}' | jq . 2>/dev/null || true

echo ""
echo "==> Patching certificate to use staging issuer for rotation test..."
kubectl patch certificate "${CERT_NAME}" -n "${NAMESPACE}" \
  --type=merge \
  -p "{\"spec\":{\"issuerRef\":{\"name\":\"${STAGING_ISSUER}\",\"kind\":\"ClusterIssuer\"}}}"

echo "==> Deleting existing TLS secret to force re-issuance..."
kubectl delete secret "${CERT_NAME}" -n "${NAMESPACE}" --ignore-not-found

echo "==> Annotating certificate to trigger immediate renewal..."
kubectl annotate certificate "${CERT_NAME}" -n "${NAMESPACE}" \
  cert-manager.io/issue-temporary-certificate="true" --overwrite

echo "==> Waiting up to 120s for certificate to become Ready..."
kubectl wait certificate "${CERT_NAME}" -n "${NAMESPACE}" \
  --for=condition=Ready --timeout=120s

echo "==> Certificate rotation succeeded. Restoring production issuer..."
kubectl patch certificate "${CERT_NAME}" -n "${NAMESPACE}" \
  --type=merge \
  -p '{"spec":{"issuerRef":{"name":"letsencrypt-prod","kind":"ClusterIssuer"}}}'

kubectl delete secret "${CERT_NAME}" -n "${NAMESPACE}" --ignore-not-found

echo "==> Waiting for production certificate to become Ready..."
kubectl wait certificate "${CERT_NAME}" -n "${NAMESPACE}" \
  --for=condition=Ready --timeout=120s

echo ""
echo "==> Final certificate status:"
kubectl get certificate "${CERT_NAME}" -n "${NAMESPACE}"
echo "==> Rotation test complete."
