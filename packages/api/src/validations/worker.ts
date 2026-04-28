/**
 * Validation schemas for worker endpoints.
 */

// POST /workers
export const createWorkerRules = {
  name: 'required|string',
  categoryId: 'required|string',
  phone: 'required_without:email',
  email: 'required_without:phone|email',
}

// PUT /workers/:id — all fields optional
export const updateWorkerRules = {
  name: 'string',
  categoryId: 'string',
  phone: 'string',
  email: 'email',
  bio: 'string',
  walletAddress: 'string',
}

// POST /workers/:id/reviews
export const createReviewRules = {
  rating: 'required|integer|min:1|max:5',
  comment: 'string',
}

// POST /workers/:id/contact
export const contactRequestRules = {
  message: 'required|string|min:10',
}
