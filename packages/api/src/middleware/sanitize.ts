import type { NextFunction, Request, Response } from 'express'
import xss from 'xss'

type Sanitizable = string | number | boolean | null | undefined | Sanitizable[] | { [key: string]: Sanitizable }

function sanitizeValue(value: Sanitizable): Sanitizable {
  if (typeof value === 'string') return xss(value)
  if (Array.isArray(value)) return value.map(sanitizeValue)
  if (value !== null && typeof value === 'object') return sanitizeObject(value)
  return value
}

function sanitizeObject(obj: { [key: string]: Sanitizable }) {
  return Object.fromEntries(Object.entries(obj).map(([key, value]) => [key, sanitizeValue(value)]))
}

export function sanitize(req: Request, _res: Response, next: NextFunction) {
  if (req.body && typeof req.body === 'object') req.body = sanitizeObject(req.body)
  if (req.query && typeof req.query === 'object') req.query = sanitizeObject(req.query as { [key: string]: Sanitizable }) as any
  next()
}
