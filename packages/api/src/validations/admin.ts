import { Validator } from 'simple-body-validator'

/**
 * Validation schemas for admin endpoints.
 */

// DELETE /admin/workers (bulk delete)
export const bulkDeleteRules = (v: Validator) => {
  v.field('ids').required().array().minLength(1)
  v.field('ids.*').string()
}
