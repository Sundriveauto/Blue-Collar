import { z } from 'zod'

export const emailField = z.string().email()
export const passwordField = z.string().min(8)
export const nameField = z.string().min(1)
export const tokenField = z.string().min(1)
export const phoneField = z.string().optional()
