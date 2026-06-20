import { Router } from 'express'
import swaggerUi from 'swagger-ui-express'
import { buildSpec } from './spec.js'

const router = Router()
const spec = buildSpec()

router.get('/docs/openapi.json', (_req, res) => res.json(spec))
router.use('/docs', swaggerUi.serve, swaggerUi.setup(spec, { customSiteTitle: 'BlueCollar API Docs' }))

export default router
