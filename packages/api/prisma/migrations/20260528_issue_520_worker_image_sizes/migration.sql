-- Issue #520: Add multi-size image fields to Worker
ALTER TABLE "Worker"
  ADD COLUMN IF NOT EXISTS "imageThumb"  TEXT,
  ADD COLUMN IF NOT EXISTS "imageMedium" TEXT,
  ADD COLUMN IF NOT EXISTS "imageFull"   TEXT;
