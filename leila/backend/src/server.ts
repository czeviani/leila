import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import rateLimit from 'express-rate-limit'
import { authMiddleware } from './middleware/auth'
import sourcesRouter from './routes/sources'
import propertiesRouter from './routes/properties'
import filtersRouter from './routes/filters'
import favoritesRouter from './routes/favorites'
import evaluationsRouter from './routes/evaluations'
import scraperRouter from './routes/scraper'
import settingsRouter from './routes/settings'

const app = express()
const PORT = process.env.PORT || 3001

const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(o => o.trim()).filter(Boolean)
  : []

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true)
    callback(new Error(`CORS: origin ${origin} not allowed`))
  },
  credentials: true,
}))

const evaluationLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas avaliações — tente novamente em 1 minuto' },
})

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
})

app.use(express.json())

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'leila-backend' }))

// Protected routes
app.use('/api', apiLimiter)
app.use('/api/sources', authMiddleware, sourcesRouter)
app.use('/api/properties', authMiddleware, propertiesRouter)
app.use('/api/filters', authMiddleware, filtersRouter)
app.use('/api/favorites', authMiddleware, favoritesRouter)
app.use('/api/evaluations', authMiddleware, evaluationLimiter, evaluationsRouter)
app.use('/api/scraper', authMiddleware, scraperRouter)
app.use('/api/settings', authMiddleware, settingsRouter)

app.listen(PORT, () => {
  console.log(`Leila backend running on port ${PORT}`)
})

export default app
