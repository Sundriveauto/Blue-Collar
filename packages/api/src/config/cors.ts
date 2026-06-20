import type { CorsOptions } from 'cors'

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
  : []

export const corsConfig: CorsOptions = {
  origin(origin, callback) {
    // Allow requests with no origin (mobile apps, curl, server-to-server)
    if (!origin) return callback(null, true)

    // In development with no allowlist configured, allow all origins
    if (process.env.NODE_ENV !== 'production' && allowedOrigins.length === 0) {
      return callback(null, true)
    }

    if (allowedOrigins.includes(origin)) {
      return callback(null, true)
    }

    // Return 403 for unlisted origins
    const err = Object.assign(new Error('CORS: origin not allowed'), { status: 403 })
    callback(err)
  },
  credentials: true,
}
