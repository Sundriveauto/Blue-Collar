# BlueCollar Contracts

Stellar **Soroban** smart contracts for the BlueCollar protocol, written in Rust.

| Contract | Description |
|---|---|
| `registry` | On-chain worker registrations, curator management, staking, badges |
| `market` | Token tips, escrow payments, arbitration, protocol fee |

---

## Prerequisites

```bash
# Rust + wasm target
rustup target add wasm32-unknown-unknown

# Stellar CLI
cargo install --locked stellar-cli

# Fund a testnet account (one-time)
stellar keys generate --global deployer
stellar keys fund deployer --network testnet
```

---

## Build

```bash
cd packages/contracts

# Build both contracts
make build

# Or individually
make build-registry
make build-market
```

WASM outputs land in `target/wasm32-unknown-unknown/release/`.

## Coverage

[![Contracts Coverage](https://github.com/Blue-Kollar/Blue-Collar/actions/workflows/enhanced-ci-cd.yml/badge.svg?branch=main)](https://github.com/Blue-Kollar/Blue-Collar/actions/workflows/enhanced-ci-cd.yml)

Run contract coverage locally from `packages/contracts`:

```bash
rustup component add llvm-tools-preview
cargo install --locked cargo-llvm-cov
cargo llvm-cov --workspace --lcov --output-path target/coverage/lcov.info --fail-under-lines 80
```

The CI job uploads the generated coverage report as an artifact from `packages/contracts/target/coverage`.

---

## Deploy

### Testnet (quick start)

```bash
make deploy-testnet \
  SOURCE=deployer \
  ADMIN=<your-stellar-address> \
  FEE_RECIPIENT=<treasury-address> \
  FEE_BPS=100
```

This runs `deploy-registry.sh` then `deploy-market.sh` and writes both contract IDs
to `deployments.json`.

### Mainnet

```bash
make deploy-mainnet \
  SOURCE=<mainnet-key-alias> \
  ADMIN=<admin-address> \
  FEE_RECIPIENT=<treasury-address> \
  FEE_BPS=100
```

### Manual (per-contract)

```bash
# Registry
./scripts/deploy-registry.sh \
  --network testnet \
  --source deployer \
  --admin <admin-address>

# Market
./scripts/deploy-market.sh \
  --network testnet \
  --source deployer \
  --admin <admin-address> \
  --fee-bps 100 \
  --fee-recipient <treasury-address>
```

### deployments.json

After each deploy the contract IDs are stored in `deployments.json`:

```json
{
  "testnet": {
    "registry": {
      "contract_id": "C...",
      "admin": "G...",
      "deployed_at": "2026-01-01T00:00:00Z"
    },
    "market": {
      "contract_id": "C...",
      "admin": "G...",
      "fee_bps": 100,
      "fee_recipient": "G...",
      "deployed_at": "2026-01-01T00:00:00Z"
    }
  }
}
```

---

## Upgrading a Contract

Upgrades preserve the contract ID and all storage.

```bash
# 1. Install new WASM, get its hash
stellar contract install \
  --wasm target/wasm32-unknown-unknown/release/bluecollar_registry.wasm \
  --source <admin-key> \
  --network testnet
# → <new_wasm_hash>

# 2. Invoke upgrade
stellar contract invoke \
  --id <contract-id> \
  --source <admin-key> \
  --network testnet \
  -- upgrade \
  --new_wasm_hash <new_wasm_hash>

# 3. If the storage schema changed, run migrate
stellar contract invoke \
  --id <contract-id> \
  --source <admin-key> \
  --network testnet \
  -- migrate \
  --admin <admin-address> \
  --expected_version <N>
```

See [SECURITY.md](./SECURITY.md#8-migration-pattern) for the full migration pattern.

---

## Storage TTL

Soroban persistent entries expire after a TTL measured in ledgers.

| Constant | Value | Approx. duration |
|---|---|---|
| `TTL_EXTEND_TO` | 535,000 ledgers | ~1 year |
| `TTL_THRESHOLD` | 267,500 ledgers | ~6 months |

Every write automatically extends the TTL. A public `extend_worker_ttl(id)` function
lets anyone refresh a worker entry without special permissions.

---

## Security

See [SECURITY.md](./SECURITY.md) for the full threat model, auth table, overflow
analysis, and migration pattern.
