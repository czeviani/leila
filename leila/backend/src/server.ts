import 'dotenv/config'
import express from 'express'
import cors from 'cors'
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

app.use(cors())
app.use(express.json())

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'leila-backend' }))

// Protected routes
app.use('/api/sources', authMiddleware, sourcesRouter)
app.use('/api/properties', authMiddleware, propertiesRouter)
app.use('/api/filters', authMiddleware, filtersRouter)
app.use('/api/favorites', authMiddleware, favoritesRouter)
app.use('/api/evaluations', authMiddleware, evaluationsRouter)
app.use('/api/scraper', authMiddleware, scraperRouter)
app.use('/api/settings', authMiddleware, settingsRouter)

app.listen(PORT, () => {
  console.log(`Leila backend running on port ${PORT}`)
})

export default app
