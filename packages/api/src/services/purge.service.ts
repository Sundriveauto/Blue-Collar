/**
 * Purge service — hard-deletes Worker and User records that have been
 * soft-deleted for more than 90 days.
 *
 * Runs once per day via setInterval. Safe to call manually for testing.
 */
import { db } from '../db.js'
import { logger } from '../config/logger.js'

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000
const INTERVAL_MS = 24 * 60 * 60 * 1000 // 24 hours

export async function purgeExpiredSoftDeletes(): Promise<void> {
  const cutoff = new Date(Date.now() - NINETY_DAYS_MS)

  const [workers, users] = await Promise.all([
    db.worker.deleteMany({ where: { deletedAt: { lte: cutoff } } }),
    db.user.deleteMany({ where: { deletedAt: { lte: cutoff } } }),
  ])

  if (workers.count > 0 || users.count > 0) {
    logger.info({ workers: workers.count, users: users.count }, 'Purged expired soft-deleted records')
  }
}

export function startPurgeScheduler(): void {
  // Run once at startup, then every 24 hours
  purgeExpiredSoftDeletes().catch((err) => logger.error(err, 'Purge job failed'))
  setInterval(() => {
    purgeExpiredSoftDeletes().catch((err) => logger.error(err, 'Purge job failed'))
  }, INTERVAL_MS)
}
