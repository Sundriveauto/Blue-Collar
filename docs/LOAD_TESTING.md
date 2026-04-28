# Load Testing Guide

> Closes #406

## Overview

BlueCollar uses [k6](https://k6.io/) for load testing. Three test scripts cover different concerns:

| Script | Purpose |
|--------|---------|
| `api-load-test.js` | Full API load with 5 scenarios (smoke/load/stress/soak/spike) |
| `db-performance-test.js` | DB-heavy endpoints under concurrent load |
| `contract-gas-test.js` | Stellar Soroban contract call simulation |

## Prerequisites

```bash
# Install k6
brew install k6                          # macOS
# or
curl https://github.com/grafana/k6/releases/download/v0.54.0/k6-v0.54.0-linux-amd64.tar.gz \
  -L | tar xvz --strip-components 1
```

## Running Load Tests

### Smoke Test (1 VU, 1 min — sanity check)

```bash
k6 run --env SCENARIO=smoke deploy/load-tests/api-load-test.js
```

### Load Test (ramp to 100 VUs)

```bash
k6 run --env SCENARIO=load \
  --env BASE_URL=http://localhost:3000/api \
  deploy/load-tests/api-load-test.js
```

### Stress Test (ramp to 300 VUs — find breaking point)

```bash
k6 run --env SCENARIO=stress deploy/load-tests/api-load-test.js
```

### Soak Test (50 VUs for 30 min — memory/leak detection)

```bash
k6 run --env SCENARIO=soak deploy/load-tests/api-load-test.js
```

### Spike Test (instant 500 VUs)

```bash
k6 run --env SCENARIO=spike deploy/load-tests/api-load-test.js
```

### Database Performance Test

```bash
k6 run deploy/load-tests/db-performance-test.js
```

### Contract Gas Test

```bash
k6 run --env TEST_EMAIL=curator@example.com \
  --env TEST_PASSWORD=Password123! \
  deploy/load-tests/contract-gas-test.js
```

## Thresholds

| Metric | Threshold |
|--------|-----------|
| `http_req_duration` p95 | < 500ms |
| `http_req_duration` p99 | < 1500ms |
| `http_req_failed` | < 5% |
| `worker_list_duration` p95 | < 400ms |
| `auth_duration` p95 | < 600ms |
| `db_query_duration` p95 | < 600ms |
| `contract_call_duration` p95 | < 2500ms |

## CI

`load-tests.yml` runs automatically:
- On push to `main` (smoke scenario)
- Nightly at 03:00 UTC (smoke scenario)
- Manually via `workflow_dispatch` (choose any scenario)

Results are uploaded as artifacts (`load-test-results`) for 30 days.

## Contract Gas Usage

Soroban contract operations consume CPU and memory instructions. Key operations:

| Operation | Estimated Instructions |
|-----------|----------------------|
| `register(id, owner, name, category)` | ~500k |
| `get_worker(id)` | ~100k |
| `toggle(id, caller)` | ~300k |
| `tip(from, to, token, amount)` | ~800k |

Monitor actual gas on [Stellar Expert](https://stellar.expert/explorer/testnet).

## Interpreting Results

```
✓ http_req_duration.............: avg=123ms  p(95)=287ms  p(99)=412ms
✓ http_req_failed...............: 0.12%
✓ worker_list_duration..........: avg=98ms   p(95)=201ms
```

- `p(95)` above threshold → investigate slow queries or missing indexes
- `http_req_failed > 5%` → check error logs for 5xx responses
- Soak test memory growth → check for connection pool leaks
