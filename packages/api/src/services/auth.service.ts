import { db } from '../db.js'
import argon2 from 'argon2'
import jwt from 'jsonwebtoken'
import crypto from 'node:crypto'
import { sendVerificationEmail, sendPasswordResetEmail } from '../mailer/index.js'
import { AppError } from './AppError.js'
import { sanitizeUser } from '../models/user.model.js'
import { logger } from '../config/logger.js'
import type { LoginBody, RegisterBody } from '../interfaces/index.js'

const ACCESS_TOKEN_TTL = '15m'
const REFRESH_TOKEN_TTL_DAYS = 7

/**
 * Generate a short-lived email verification token for a user.
 */
function generateVerificationToken(userId: string) {
  const raw = jwt.sign({ id: userId, purpose: 'email-verify' }, process.env.JWT_SECRET!, {
    expiresIn: '24h',
  })
  const hash = crypto.createHash('sha256').update(raw).digest('hex')
  const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000)
  return { raw, hash, expiry }
}

/**
 * Generate a refresh token: raw random bytes + its SHA-256 hash + expiry.
 */
function generateRefreshToken() {
  const raw = crypto.randomBytes(40).toString('hex')
  const hash = crypto.createHash('sha256').update(raw).digest('hex')
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000)
  return { raw, hash, expiresAt }
}

/**
 * Authenticate a user with email and password.
 * Issues a short-lived access token (15 min) and a long-lived refresh token (7 days).
 */
export async function loginUser({ email, password }: LoginBody) {
  const user = await db.user.findUnique({ where: { email } })
  if (!user || !user.password || !(await argon2.verify(user.password, password))) {
    throw new AppError('Invalid credentials', 401)
  }
  if (!user.verified) {
    throw new AppError(
      'Your email address has not been verified. Please check your inbox and click the verification link.',
      403,
    )
  }

  const accessToken = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET!, {
    expiresIn: ACCESS_TOKEN_TTL,
  })

  const { raw: refreshTokenRaw, hash: refreshTokenHash, expiresAt } = generateRefreshToken()
  await db.refreshToken.create({ data: { userId: user.id, tokenHash: refreshTokenHash, expiresAt } })

  return { data: sanitizeUser(user), token: accessToken, refreshToken: refreshTokenRaw }
}

/**
 * Exchange a valid refresh token for a new access token + refresh token pair.
 * Revokes the old refresh token (rotation strategy).
 */
export async function rotateRefreshToken(rawToken: string) {
  const hash = crypto.createHash('sha256').update(rawToken).digest('hex')
  const stored = await db.refreshToken.findUnique({ where: { tokenHash: hash } })

  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
    throw new AppError('Invalid or expired refresh token', 401)
  }

  // Revoke the old token
  await db.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } })

  const user = await db.user.findUnique({ where: { id: stored.userId } })
  if (!user) throw new AppError('User not found', 404)

  const accessToken = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET!, {
    expiresIn: ACCESS_TOKEN_TTL,
  })

  const { raw: newRefreshRaw, hash: newRefreshHash, expiresAt } = generateRefreshToken()
  await db.refreshToken.create({ data: { userId: user.id, tokenHash: newRefreshHash, expiresAt } })

  return { token: accessToken, refreshToken: newRefreshRaw }
}

/**
 * Revoke all refresh tokens for a user (called on logout).
 */
export async function revokeAllRefreshTokens(userId: string) {
  await db.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  })
}

/**
 * Register a new user account and send a verification email.
 *
 * @param email - The desired email address (must be unique).
 * @param password - The plaintext password (will be hashed with Argon2).
 * @param firstName - User's first name.
 * @param lastName - User's last name.
 * @returns The sanitized (non-sensitive) user object.
 * @throws AppError 409 if the email is already registered.
 */
export async function registerUser({ email, password, firstName, lastName }: RegisterBody) {
  const existing = await db.user.findUnique({ where: { email } })
  if (existing) throw new AppError('Email already in use', 409)

  const hashed = await argon2.hash(password)
  const user = await db.user.create({ data: { email, password: hashed, firstName, lastName } })

  const { raw, hash, expiry } = generateVerificationToken(user.id)
  await db.user.update({
    where: { id: user.id },
    data: { verificationToken: hash, verificationTokenExpiry: expiry },
  })

  sendVerificationEmail(email, firstName, raw).catch((err) =>
    logger.error({ err }, 'Failed to send verification email'),
  )

  return sanitizeUser(user)
}

/**
 * Verify a user's email address using the raw JWT from the verification email.
 *
 * Compares the SHA-256 hash of the provided token against the stored hash and
 * checks the expiry. Marks the account as verified on success.
 *
 * @param token - The raw JWT from the verification email link.
 * @returns `true` if the account was just verified, `false` if it was already verified.
 * @throws AppError 400 if the token is invalid, expired, or does not match.
 */
export async function verifyAccount(token: string): Promise<boolean> {
  let payload: { id?: string; purpose?: string }
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET!) as { id: string; purpose: string }
  } catch {
    throw new AppError('Token is invalid or has expired', 400)
  }

  if (payload.purpose !== 'email-verify' || !payload.id) {
    throw new AppError('Invalid verification token', 400)
  }

  const user = await db.user.findUnique({ where: { id: payload.id } })
  if (!user) throw new AppError('User not found', 404)
  if (user.verified) return false

  const incomingHash = crypto.createHash('sha256').update(token).digest('hex')
  const valid =
    incomingHash === user.verificationToken &&
    user.verificationTokenExpiry &&
    user.verificationTokenExpiry > new Date()

  if (!valid) throw new AppError('Token is invalid or has expired', 400)

  await db.user.update({
    where: { id: user.id },
    data: { verified: true, verificationToken: null, verificationTokenExpiry: null },
  })
  return true
}

/**
 * Resend a verification email to an unverified account.
 * Silently returns if no account exists or if already verified (prevents enumeration).
 */
export async function resendVerificationEmail(email: string) {
  const user = await db.user.findUnique({ where: { email } })
  if (!user || user.verified) return

  const { raw, hash, expiry } = generateVerificationToken(user.id)
  await db.user.update({
    where: { id: user.id },
    data: { verificationToken: hash, verificationTokenExpiry: expiry },
  })

  sendVerificationEmail(email, user.firstName, raw).catch((err) =>
    logger.error({ err }, 'Failed to resend verification email'),
  )
}

/**
 * Initiate a password reset flow by sending a reset email.
 *
 * Silently returns if no account exists for the given email (prevents enumeration).
 * Stores a SHA-256 hash of the raw reset token in the database with a 1-hour expiry.
 *
 * @param email - The email address to send the reset link to.
 */
export async function requestPasswordReset(email: string) {
  const user = await db.user.findUnique({ where: { email } })
  if (!user) return

  const rawToken = crypto.randomBytes(32).toString('hex')
  const hash = crypto.createHash('sha256').update(rawToken).digest('hex')
  const expiry = new Date(Date.now() + 60 * 60 * 1000)

  await db.user.update({ where: { id: user.id }, data: { resetToken: hash, resetTokenExpiry: expiry } })

  sendPasswordResetEmail(user.email, user.firstName, rawToken).catch((err) =>
    logger.error({ err }, 'Failed to send password reset email'),
  )
}

/**
 * Reset a user's password using the raw token from the reset email.
 *
 * Hashes the provided token, looks up the matching user, and updates the password.
 * Clears the reset token fields on success.
 *
 * @param token - The raw reset token from the email link.
 * @param password - The new plaintext password (will be hashed with Argon2).
 * @throws AppError 400 if the token is invalid or has expired.
 */
export async function resetPassword(token: string, password: string) {
  const hash = crypto.createHash('sha256').update(token).digest('hex')
  const user = await db.user.findFirst({
    where: { resetToken: hash, resetTokenExpiry: { gt: new Date() } },
  })
  if (!user) throw new AppError('Token is invalid or has expired', 400)

  const hashedPassword = await argon2.hash(password)
  await db.user.update({
    where: { id: user.id },
    data: { password: hashedPassword, resetToken: null, resetTokenExpiry: null },
  })
}
