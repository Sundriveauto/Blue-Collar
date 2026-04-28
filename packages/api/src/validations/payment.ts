/**
 * Validation schemas for payment endpoints.
 */

// POST /payments/tip
export const tipRules = {
  from: 'required|string',
  to: 'required|string',
  amount: 'required|numeric|min:0',
}

// POST /payments/escrow
export const createEscrowRules = {
  from: 'required|string',
  to: 'required|string',
  amount: 'required|numeric|min:0',
  expiryDate: 'required|string',
}

// PATCH /payments/fee
export const updateFeeRules = {
  fee_bps: 'required|integer|min:0',
}
