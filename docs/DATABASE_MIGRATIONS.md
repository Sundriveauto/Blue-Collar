# Database Migration Best Practices

## Tooling

BlueCollar uses **Prisma Migrate** for schema migrations.

## Creating a migration

```bash
cd packages/api
npx prisma migrate dev --name describe_your_change
```

This generates a SQL file in `prisma/migrations/` and applies it to your local DB.

## Rules

1. **Never edit an applied migration file.** Create a new one instead.
2. **All migrations must be backward compatible** — the old API version must still work while the new one deploys (blue/green).
3. **Avoid long-running locks.** Use `CREATE INDEX CONCURRENTLY` for large tables.
4. **Test rollback.** Every migration should have a documented rollback path (or be additive-only).

## CI pipeline

The `migration-test.yml` workflow runs on every PR that touches `prisma/`:

| Step | What it checks |
|---|---|
| Forward migration | All migrations apply cleanly from scratch |
| Schema drift | `prisma migrate diff` detects any untracked changes |
| Seed + query | Production-like data loads without errors |
| Performance | Migration completes in < 30 seconds |
| Rollback + re-apply | `migrate reset` + `migrate deploy` is idempotent |
| API tests | Full test suite passes against the migrated DB |

## Rollback procedure

Prisma does not support automatic down-migrations. Rollback options:

1. **Additive change** (new column/table): deploy previous API version — new columns are ignored.
2. **Destructive change** (drop column/table): restore from the pre-migration RDS snapshot taken automatically before each deploy.

```bash
# Restore to point-in-time (replace timestamp)
bash deploy/scripts/restore-database.sh "2024-01-15T10:30:00Z"
```

## Performance guidelines

- Add indexes for all foreign keys and frequently filtered columns.
- For tables > 1M rows, use `CREATE INDEX CONCURRENTLY` in a raw SQL migration.
- Avoid `ALTER TABLE ... ADD COLUMN NOT NULL` without a default on large tables — use a two-step migration instead.
