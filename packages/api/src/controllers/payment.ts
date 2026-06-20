import type { Request, Response } from 'express'
import { paymentService } from '../services/payment.service.js'
import { handleError } from '../utils/handleError.js'
import { ErrorMessages, HttpStatus } from '../constants/index.js'

/**
 * POST /api/payments/tip
 * Body: { from, to, amount }
 */
export async function processTip(req: Request, res: Response) {
  try {
    const { from, to, amount } = req.body
    if (!from || !to || amount === undefined) {
      return res.status(HttpStatus.BAD_REQUEST).json({ status: 'error', message: ErrorMessages.TIP_FIELDS_REQUIRED, code: HttpStatus.BAD_REQUEST })
    }
    const result = paymentService.tip({ from, to, amount: Number(amount) })
    return res.status(HttpStatus.OK).json({ data: result, status: 'success', code: HttpStatus.OK })
  } catch (err) {
    return handleError(res, err)
  }
}

/**
 * POST /api/payments/escrow
 * Body: { from, to, amount, expiryDate }
 */
export async function createEscrow(req: Request, res: Response) {
  try {
    const { from, to, amount, expiryDate } = req.body
    if (!from || !to || amount === undefined || !expiryDate) {
      return res.status(HttpStatus.BAD_REQUEST).json({ status: 'error', message: ErrorMessages.ESCROW_FIELDS_REQUIRED, code: HttpStatus.BAD_REQUEST })
    }
    const result = paymentService.createEscrow({
      from,
      to,
      amount: Number(amount),
      expiryDate: new Date(expiryDate),
    })
    return res.status(HttpStatus.CREATED).json({ data: result, status: 'success', code: HttpStatus.CREATED })
  } catch (err) {
    return handleError(res, err)
  }
}

/**
 * GET /api/payments/fee
 */
export function getFee(_req: Request, res: Response) {
  return res.status(HttpStatus.OK).json({
    data: { fee_bps: paymentService.getFeeBps() },
    status: 'success',
    code: HttpStatus.OK,
  })
}

/**
 * PATCH /api/payments/fee
 * Body: { fee_bps }
 * Requires admin role.
 */
export function updateFee(req: Request, res: Response) {
  try {
    const { fee_bps } = req.body
    if (fee_bps === undefined) {
      return res.status(HttpStatus.BAD_REQUEST).json({ status: 'error', message: ErrorMessages.FEE_BPS_REQUIRED, code: HttpStatus.BAD_REQUEST })
    }
    paymentService.setFeeBps(req.user?.role ?? '', Number(fee_bps))
    return res.status(HttpStatus.OK).json({
      data: { fee_bps: paymentService.getFeeBps() },
      status: 'success',
      code: HttpStatus.OK,
    })
  } catch (err) {
    return handleError(res, err)
  }
}
