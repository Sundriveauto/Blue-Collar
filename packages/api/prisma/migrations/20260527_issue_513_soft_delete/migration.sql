-- AlterTable: add soft-delete column to Worker
ALTER TABLE "Worker" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- AlterTable: add soft-delete column to User
ALTER TABLE "User" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- Index: speed up the common query pattern (WHERE deletedAt IS NULL)
CREATE INDEX "Worker_deletedAt_idx" ON "Worker"("deletedAt");
CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");
