import type { Request, Response, NextFunction } from 'express'
import { redis, cacheMetrics } from '../config/redis.js'

/**
 * TTL presets (seconds) for different endpoint types.
 */
export const TTL = {
  SHORT: 60,        // 1 min  — frequently changing data (reviews, availability)
  MEDIUM: 300,      // 5 min  — worker profiles
  LONG: 600,        // 10 min — semi-static lists
  HOUR: 3600,       // 1 hr   — categories (rarely change)
}

/**
 * Cache middleware for GET endpoints.
 * Skips caching when Redis is unavailable.
 *
 * @param ttl - Time-to-live in seconds
 * @param keyFn - Optional function to derive a custom cache key from the request
 */
export function cacheMiddleware(ttl: number, keyFn?: (req: Request) => string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Only cache GET requests
    if (req.method !== 'GET') return next()

    const key = keyFn ? keyFn(req) : `cache:${req.originalUrl}`

    try {
      const cached = await redis.get(key)
      if (cached) {
        cacheMetrics.hits++
        res.setHeader('X-Cache', 'HIT')
        return res.json(JSON.parse(cached))
      }
      cacheMetrics.misses++
      res.setHeader('X-Cache', 'MISS')
    } catch {
      // Redis unavailable — pass through without caching
      return next()
    }

    // Intercept res.json to store the response in cache
    const originalJson = res.json.bind(res)
    res.json = (body: unknown) => {
      redis.setex(key, ttl, JSON.stringify(body)).catch(() => {})
      return originalJson(body)
    }

    next()
  }
}

/**
 * Invalidate one or more cache keys (supports glob patterns via SCAN).
 */
export async function invalidateCache(...keys: string[]) {
  try {
    await Promise.all(keys.map((k) => redis.del(k)))
  } catch {
    // Silently ignore Redis errors during invalidation
  }
}

/**
 * Invalidate all cache keys matching a pattern (e.g. "cache:/api/workers*").
 */
export async function invalidateCachePattern(pattern: string) {
  try {
    const keys = await redis.keys(pattern)
    if (keys.length) await redis.del(...keys)
  } catch {
    // Silently ignore
  }
}
