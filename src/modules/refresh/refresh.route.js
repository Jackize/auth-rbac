import express from 'express'
import { authorize } from '../../middleware/authorize.js'
import { getActiveRefreshTokens } from './refresh.controller.js'

const router = express.Router()

router.get('/active', authorize, getActiveRefreshTokens)

export default router