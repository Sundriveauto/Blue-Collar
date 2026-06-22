import { z } from 'zod'
import { emailField, nameField, phoneField } from './shared.js'

// POST /workers
export const createWorkerRules = z
  .object({
    name: nameField,
    categoryId: z.string().min(1),
    phone: phoneField,
    email: emailField.optional(),
    bio: z.string().optional(),
    walletAddress: z.string().optional(),
  })
  .refine((d) => d.phone || d.email, {
    message: 'Either phone or email is required',
    path: ['phone'],
  })

// PUT /workers/:id — all fields optional
export const updateWorkerRules = z.object({
  name: nameField.optional(),
  categoryId: z.string().optional(),
  phone: phoneField,
  email: emailField.optional(),
  bio: z.string().optional(),
  walletAddress: z.string().optional(),
})

// POST /workers/:id/reviews
export const createReviewRules = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().optional(),
})

// POST /workers/:id/contact
export const contactRequestRules = z.object({
  message: z.string().min(10),
})

// Advanced search and filtering
export const advancedSearchRules = z.object({
  query: z.string().optional(),
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
  radius: z.coerce.number().min(0.1).max(1000).optional(),
  categories: z.string().optional(),
  minRating: z.coerce.number().int().min(1).max(5).optional(),
  maxRating: z.coerce.number().int().min(1).max(5).optional(),
  dayOfWeek: z.coerce.number().int().min(0).max(6).optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  isVerified: z.coerce.boolean().optional(),
  sortBy: z.enum(['relevance', 'rating', 'distance', 'newest', 'reviews']).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
})
