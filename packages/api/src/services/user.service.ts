import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import { db } from '../db.js'
import { sendVerificationEmail } from '../mailer/index.js'
import { sanitizeUser } from '../models/user.model.js'
import { AppError } from './AppError.js'
import { createServiceLogger } from '../utils/logger.js'

const logger = createServiceLogger('UserService')

const updateProfileSchema = z.object({
  firstName: z.string().min(1).max(50).optional(),
  lastName: z.string().min(1).max(50).optional(),
  email: z.string().email().optional(),
})

function generateVerificationToken(userId: string) {
  const raw = jwt.sign({ id: userId, purpose: 'email-verify' }, process.env.JWT_SECRET!, {
    expiresIn: '24h',
  })
  const hash = crypto.createHash('sha256').update(raw).digest('hex')
  const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000)
  return { raw, hash, expiry }
}

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>

export async function updateProfile(userId: string, input: UpdateProfileInput) {
  logger.debug('Updating user profile', { userId })
  const parsed = updateProfileSchema.parse(input)
  const current = await db.user.findUnique({ where: { id: userId } })
  if (!current) {
    logger.warn('Profile update failed: user not found', { userId })
    throw new AppError('User not found', 404)
  }

  const emailChanged = parsed.email !== undefined && parsed.email !== current.email
  const verification = emailChanged ? generateVerificationToken(userId) : null

  const updated = await db.user.update({
    where: { id: userId },
    data: {
      ...parsed,
      ...(emailChanged
        ? {
            verified: false,
            verificationToken: verification!.hash,
            verificationTokenExpiry: verification!.expiry,
          }
        : {}),
    },
  })

  if (emailChanged) {
    logger.info('Email changed, verification email sent', { userId, newEmail: updated.email })
    await sendVerificationEmail(updated.email, updated.firstName, verification!.raw)
  } else {
    logger.info('User profile updated successfully', { userId })
  }

  return sanitizeUser(updated)
}
