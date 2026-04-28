/**
 * Validation schemas for user profile endpoints.
 */

// PATCH /users/me
export const updateProfileRules = {
  firstName: 'string',
  lastName: 'string',
  phone: 'string',
  bio: 'string',
}

// PUT /users/me/password
export const changePasswordRules = {
  currentPassword: 'required|string',
  newPassword: 'required|min:8',
}

// POST /users/me/push-subscription
export const pushSubscriptionRules = {
  endpoint: 'required|string',
  'keys.auth': 'required|string',
  'keys.p256dh': 'required|string',
}
