# Developer Onboarding Guide

> Get the full BlueCollar stack running locally in under 30 minutes.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Clone & Install](#clone--install)
- [Environment Setup](#environment-setup)
- [Running the Stack](#running-the-stack)
  - [Option A — Docker (recommended)](#option-a--docker-recommended)
  - [Option B — Manual](#option-b--manual)
- [Contracts (Rust / Soroban)](#contracts-rust--soroban)
- [Monitoring](#monitoring)
- [Verify Everything Works](#verify-everything-works)
- [Troubleshooting](#troubleshooting)
- [Your First Contribution](#your-first-contribution)

---

## Prerequisites

Install the following tools before you begin. Exact minimum versions are listed — newer patch releases are fine.

| Tool | Min version | Install |
|------|-------------|---------|
| Node.js | 20 | [nodejs.org](https://nodejs.org) or `nvm install 20` |
| pnpm | 9 | `npm install -g pnpm@9` |
| Docker + Compose | 24 / 2.24 | [docs.docker.com](https://docs.docker.com/get-docker/) |
| Rust + Cargo | 1.78 | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` |
| Stellar CLI | 21 | `cargo install --locked stellar-cli` |

Verify your setup:

```bash
node -v          # v20.x.x
pnpm -v          # 9.x.x
docker -v        # Docker version 24.x.x
cargo -V         # cargo 1.78.x
stellar -V       # stellar 21.x.x
```

---

## Clone & Install

```bash
git clone https://github.com/Fidelis900/Blue-Collar.git
cd Blue-Collar
pnpm install
```

`pnpm install` installs dependencies for all three packages (`api`, `app`, `contracts`) in one shot via the workspace.

---

## Environment Setup

The API needs a `.env` file. Copy the example and fill in the required values:

```bash
cp packages/api/.env.example packages/api/.env
```

Open `packages/api/.env` and set at minimum:

| Variable | What to set locally |
|----------|---------------------|
| `DATABASE_URL` | `postgresql://bluecollar:bluecollar@localhost:5432/bluecollar` |
| `TEST_DATABASE_URL` | `postgresql://bluecollar:bluecollar@localhost:5432/bluecollar_test` |
| `JWT_SECRET` | Any long random string — `openssl rand -hex 32` |
| `REDIS_URL` | `redis://localhost:6379` |
| `APP_URL` | `http://localhost:3001` |
| `ALLOWED_ORIGINS` | `http://localhost:3001` |

Everything else (Google OAuth, SMTP, Stellar contract IDs, VAPID keys) can be left as the placeholder values for local development. Features that depend on them (OAuth login, email, on-chain events) will simply not work until you supply real credentials.

---

## Running the Stack

### Option A — Docker (recommended)

Docker Compose starts PostgreSQL, Redis, the API, and Adminer (a DB UI) with a single command. The API container runs `prisma migrate deploy` automatically on startup.

```bash
# Start all services in the background
pnpm docker:up

# Seed the database with categories
cd packages/api && pnpm seed && cd ../..

# Stop and remove containers (data volumes are preserved)
pnpm docker:down
```

| Service | URL |
|---------|-----|
| API | http://localhost:3000 |
| Adminer (DB UI) | http://localhost:8080 |
| PostgreSQL | localhost:5432 |
| Redis | localhost:6379 |

Then start the Next.js frontend separately:

```bash
cd packages/app
pnpm dev   # http://localhost:3001
```

### Option B — Manual

Use this if you prefer to run services outside Docker or already have PostgreSQL and Redis running.

**1. Start PostgreSQL and Redis**

Make sure both are running and accessible at the URLs in your `.env`.

**2. Run API migrations and seed**

```bash
cd packages/api
pnpm migrate   # runs prisma migrate dev
pnpm seed      # seeds categories
pnpm dev       # starts API on :3000
```

**3. Start the frontend**

```bash
cd packages/app
pnpm dev       # starts Next.js on :3001
```

**4. Run both together from the root (optional)**

```bash
# From the repo root — starts API + app concurrently
pnpm dev
```

---

## Contracts (Rust / Soroban)

You only need this section if you are working on the smart contracts.

**Add the WASM target (one-time setup):**

```bash
rustup target add wasm32-unknown-unknown
```

**Build:**

```bash
cd packages/contracts
cargo build --release --target wasm32-unknown-unknown
```

**Run contract tests:**

```bash
cargo test
```

**Lint (zero-warnings policy):**

```bash
cargo clippy -- -D warnings
```

**Deploy to Stellar testnet:**

```bash
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/bluecollar_registry.wasm \
  --source <your-secret-key> \
  --network testnet
```

After deploying, copy the contract ID into `REGISTRY_CONTRACT_ID` (or `MARKET_CONTRACT_ID`) in `packages/api/.env`.

---

## Monitoring

The Docker Compose file includes an OpenTelemetry Collector. It starts automatically with `pnpm docker:up`.

| Port | Purpose |
|------|---------|
| 4317 | OTLP gRPC receiver |
| 4318 | OTLP HTTP receiver |
| 8888 | Collector self-metrics |

The API exports traces and metrics to the collector when `NODE_ENV=production`. In development (`NODE_ENV=development`) telemetry is disabled by default.

---

## Verify Everything Works

Run through this checklist after setup:

```bash
# 1. API health check
curl http://localhost:3000/health
# Expected: {"status":"ok"} or similar

# 2. List categories (public endpoint)
curl http://localhost:3000/api/categories
# Expected: JSON array of categories

# 3. API unit tests
cd packages/api && pnpm test

# 4. App unit tests
cd packages/app && pnpm test

# 5. Contract tests
cd packages/contracts && cargo test
```

If all five pass, your environment is ready.

---

## Troubleshooting

### Port already in use

```
Error: listen EADDRINUSE :::3000
```

Find and kill the process using the port:

```bash
lsof -ti :3000 | xargs kill -9   # API
lsof -ti :3001 | xargs kill -9   # App
lsof -ti :5432 | xargs kill -9   # PostgreSQL
```

Or change the port in `packages/api/.env` (`PORT=3001`) and update `APP_URL` / `ALLOWED_ORIGINS` accordingly.

---

### Prisma migration errors

**`P1001` — Can't reach database server**

The database isn't running or `DATABASE_URL` is wrong. If using Docker, make sure the containers are up:

```bash
pnpm docker:up
docker ps   # confirm db container is healthy
```

**`P3006` — Migration failed to apply**

A previous migration left the database in a dirty state. Reset it (destroys all local data):

```bash
cd packages/api
pnpm exec prisma migrate reset
pnpm seed
```

**Schema out of sync after pulling new code**

```bash
cd packages/api
pnpm migrate   # applies any new migrations
```

---

### `pnpm install` fails with peer dependency errors

Make sure you are on pnpm 9:

```bash
pnpm -v
npm install -g pnpm@9
```

Then delete the lockfile and reinstall:

```bash
rm pnpm-lock.yaml
pnpm install
```

---

### Freighter wallet not connecting

Freighter is a browser extension for Stellar wallet interactions. To set it up for local development:

1. Install the [Freighter extension](https://www.freighter.app/) in Chrome or Firefox.
2. Create or import a wallet.
3. Switch the network to **Testnet**: click the network selector in the top-right of the extension and choose "Testnet".
4. Fund your testnet account using [Stellar Friendbot](https://friendbot.stellar.org/?addr=<your-public-key>).
5. Reload the app — Freighter should now connect when prompted.

If the app shows "Freighter not detected", make sure the extension is enabled for `localhost` in your browser's extension settings.

---

### `stellar` CLI not found after install

The Stellar CLI binary is installed into Cargo's bin directory. Make sure it is on your `PATH`:

```bash
export PATH="$HOME/.cargo/bin:$PATH"
# Add this line to your ~/.bashrc or ~/.zshrc to make it permanent
```

---

### Docker containers keep restarting

Check the logs for the failing service:

```bash
docker compose logs api
docker compose logs db
```

Common causes:
- `packages/api/.env` is missing or has an invalid `DATABASE_URL`.
- Port 5432 or 6379 is already occupied by a local process (see port conflict section above).

---

## Your First Contribution

### 1. Find an issue

Browse [open issues](https://github.com/Fidelis900/Blue-Collar/issues) and look for ones labelled `good first issue` or `help wanted`. Leave a comment to claim it before starting.

### 2. Fork and branch

```bash
# Fork on GitHub, then clone your fork
git clone https://github.com/<your-username>/Blue-Collar.git
cd Blue-Collar
pnpm install

# Create a branch following the naming convention: <type>/<short-description>
git checkout -b feat/my-feature
```

Branch types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`.

### 3. Make your changes

- Follow the code style for the package you are editing (TypeScript for `api`/`app`, Rust for `contracts`).
- Run `pnpm build` (or `cargo build`) to catch type/compile errors before committing.
- Add or update tests for any logic you change.

### 4. Commit using Conventional Commits

```
<type>(<scope>): <short description>
```

Examples:

```bash
git commit -m "feat(api): add worker search by category"
git commit -m "fix(app): correct pagination offset on worker list"
git commit -m "docs: add Freighter setup to onboarding guide"
```

Scopes: `api`, `app`, `contracts`, `docs`, `ci`, `deps`.

### 5. Run CI checks locally

```bash
pnpm test    # all package tests
pnpm build   # TypeScript compile check
pnpm lint    # ESLint

# Contracts
cd packages/contracts
cargo test
cargo clippy -- -D warnings
```

All checks must pass before opening a PR.

### 6. Open a pull request

```bash
git push -u origin feat/my-feature
```

Then open a PR on GitHub:

- **Title**: follow the commit convention (`feat(api): add worker search by category`).
- **Description**: summarise what changed, how you tested it, and reference the issue (`Closes #42`).
- Request a review from a maintainer.

PRs are squash-merged. The CI pipeline runs tests, build, and lint automatically — all checks must be green before merge.

---

For questions, join the [Telegram community](https://t.me/bluecollar) or open a [GitHub Discussion](https://github.com/Fidelis900/Blue-Collar/discussions).
