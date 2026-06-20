import { z } from 'zod'
import { emailField, passwordField, nameField, tokenField } from './shared.js'

// POST /auth/register
export const registerRules = z.object({
  email: emailField,
  password: passwordField,
  firstName: nameField,
  lastName: nameField,
})

// POST /auth/login
export const loginRules = z.object({
  email: emailField,
  password: z.string().min(1),
})

// POST /auth/forgot-password
export const forgotPasswordRules = z.object({
  email: emailField,
})

// PUT /auth/reset-password
export const resetPasswordRules = z.object({
  token: tokenField,
  password: passwordField,
})

// PUT /auth/verify-account
export const verifyAccountRules = z.object({
  token: tokenField,
})

// POST /auth/resend-verification
export const resendVerificationRules = z.object({
  email: emailField,
})
