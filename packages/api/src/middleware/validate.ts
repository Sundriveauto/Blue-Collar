import { z, ZodSchema } from 'zod'
import type { Request, Response, NextFunction } from 'express'

/**
 * Zod-based validate middleware factory (#519).
 * Validates req.body against a Zod schema and returns structured 400 errors.
 *
 * @param schema - A Zod schema to validate against
 * @param target - Which part of the request to validate ('body' | 'query' | 'params')
 */
export function validate(schema: ZodSchema, target: 'body' | 'query' | 'params' = 'body') {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[target])
    if (!result.success) {
      const errors = result.error.errors.reduce<Record<string, string[]>>((acc, err) => {
        const field = err.path.join('.') || '_root'
        if (!acc[field]) acc[field] = []
        acc[field].push(err.message)
        return acc
      }, {})
      return res.status(400).json({
        status: 'error',
        message: 'Validation failed',
        code: 400,
        errors,
      })
    }
    req[target] = result.data
    next()
  }
}
