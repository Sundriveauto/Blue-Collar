import type { Request, Response } from 'express'
import * as jobService from '../services/job.service.js'
import { handleError } from '../utils/handleError.js'
import { ErrorMessages, HttpStatus } from '../constants/index.js'

export async function listJobs(req: Request, res: Response) {
  try {
    const { categoryId, status, page = '1', limit = '20' } = req.query
    const result = await jobService.listJobs({
      categoryId: categoryId ? String(categoryId) : undefined,
      status: status ? String(status) : undefined,
      page: Number(page),
      limit: Number(limit),
    })
    return res.json({ ...result, status: 'success', code: 200 })
  } catch (err) {
    return handleError(res, err)
  }
}

export async function showJob(req: Request, res: Response) {
  try {
    const job = await jobService.getJob(req.params.id)
    return res.json({ data: job, status: 'success', code: 200 })
  } catch (err) {
    return handleError(res, err)
  }
}

export async function createJob(req: Request, res: Response) {
  try {
    const job = await jobService.createJob(req.body, req.user!.id)
    return res.status(201).json({ data: job, status: 'success', code: 201 })
  } catch (err) {
    return handleError(res, err)
  }
}

export async function updateJob(req: Request, res: Response) {
  try {
    const job = await jobService.updateJob(req.params.id, req.user!.id, req.body)
    return res.json({ data: job, status: 'success', code: 200 })
  } catch (err) {
    return handleError(res, err)
  }
}

export async function deleteJob(req: Request, res: Response) {
  try {
    await jobService.deleteJob(req.params.id, req.user!.id)
    return res.status(204).send()
  } catch (err) {
    return handleError(res, err)
  }
}

export async function applyToJob(req: Request, res: Response) {
  try {
    const { workerId, coverLetter } = req.body
    if (!workerId) return res.status(HttpStatus.BAD_REQUEST).json({ status: 'error', message: ErrorMessages.WORKER_ID_REQUIRED, code: HttpStatus.BAD_REQUEST })
    const application = await jobService.applyToJob(req.params.id, String(workerId), coverLetter)
    return res.status(201).json({ data: application, status: 'success', code: 201 })
  } catch (err) {
    return handleError(res, err)
  }
}

export async function listApplications(req: Request, res: Response) {
  try {
    const applications = await jobService.listApplications(req.params.id, req.user!.id)
    return res.json({ data: applications, status: 'success', code: 200 })
  } catch (err) {
    return handleError(res, err)
  }
}

export async function updateApplicationStatus(req: Request, res: Response) {
  try {
    const { status } = req.body
    if (!['accepted', 'rejected'].includes(status)) {
      return res.status(HttpStatus.BAD_REQUEST).json({ status: 'error', message: ErrorMessages.APPLICATION_STATUS_INVALID, code: HttpStatus.BAD_REQUEST })
    }
    const application = await jobService.updateApplicationStatus(
      req.params.id,
      req.params.applicationId,
      req.user!.id,
      status
    )
    return res.json({ data: application, status: 'success', code: 200 })
  } catch (err) {
    return handleError(res, err)
  }
}

export async function withdrawApplication(req: Request, res: Response) {
  try {
    const { workerId } = req.body
    if (!workerId) return res.status(HttpStatus.BAD_REQUEST).json({ status: 'error', message: ErrorMessages.WORKER_ID_REQUIRED, code: HttpStatus.BAD_REQUEST })
    const application = await jobService.withdrawApplication(req.params.id, String(workerId))
    return res.json({ data: application, status: 'success', code: 200 })
  } catch (err) {
    return handleError(res, err)
  }
}
