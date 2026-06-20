-- Issue #517: Idempotency Keys
CREATE TABLE "IdempotencyKey" (
    "id"           TEXT NOT NULL,
    "key"          TEXT NOT NULL,
    "userId"       TEXT,
    "responseBody" JSONB NOT NULL,
    "statusCode"   INTEGER NOT NULL,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt"    TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IdempotencyKey_key_userId_key" ON "IdempotencyKey"("key", "userId");
CREATE INDEX "IdempotencyKey_expiresAt_idx" ON "IdempotencyKey"("expiresAt");
