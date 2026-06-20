# Security Testing Guide

> Closes #403

## Overview

BlueCollar uses a multi-layer security testing strategy:

| Layer | Tool | When |
|-------|------|------|
| Unit | Vitest (SQL injection, XSS, headers) | Every PR |
| Dependency | `pnpm audit` + Trivy | Every PR |
| DAST | OWASP ZAP Baseline | Push to main + weekly |
| Secret scan | Gitleaks | Every PR |

## Running Locally

### Unit Security Tests

```bash
cd packages/api
pnpm vitest run src/__tests__/security/security.test.ts
```

Tests cover:
- SQL injection payloads in auth and worker endpoints
- XSS payloads in query params and request bodies
- Security headers (CSP, X-Frame-Options, X-Content-Type-Options)
- Authentication bypass attempts
- Rate limiting behaviour

### Dependency Scan

```bash
pnpm audit --audit-level=high
```

### OWASP ZAP (local)

```bash
# Start the API first
cd packages/api && pnpm dev

# Run ZAP baseline scan
docker run -t owasp/zap2docker-stable zap-baseline.py \
  -t http://localhost:3000/api \
  -r zap-report.html
```

## CI Workflow

`security-tests.yml` runs three jobs:

1. **security-unit** – fast SQL/XSS/header tests on every PR
2. **dependency-scan** – `pnpm audit` + Trivy on every PR
3. **owasp-zap** – full DAST scan on push to main and weekly schedule
4. **secret-scan** – Gitleaks on every PR

## Interpreting Results

- ZAP reports are uploaded as artifacts (`zap-report`) for 30 days
- `pnpm audit` failures at `high` severity block the build
- Trivy findings are informational (exit-code 0) to avoid blocking on unfixed CVEs

## Adding New Security Tests

Add test cases to `packages/api/src/__tests__/security/security.test.ts`.
Follow the existing pattern of `it.each(PAYLOADS)` for systematic coverage.
