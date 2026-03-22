// src/app.ts
// ─────────────────────────────────────────────────────────────
// Express application factory
// All middleware, routes, and error handlers configured here
// ─────────────────────────────────────────────────────────────

import express, { type Application, type Request, type Response, type NextFunction } from 'express'
import cors          from 'cors'
import helmet        from 'helmet'
import compression   from 'compression'
import morgan        from 'morgan'
import rateLimit     from 'express-rate-limit'

import { env }         from './config/env'
import { logger }      from './config/logger'
import { AppError }    from './utils/AppError'

// Routes
import { authRouter }         from './routes/auth.routes'
import { transactionRouter }  from './routes/transaction.routes'
import { analyticsRouter }    from './routes/analytics.routes'
import { categoryRouter }     from './routes/category.routes'
import { walletRouter }       from './routes/wallet.routes'
import { receiptRouter }      from './routes/receipt.routes'
import { subscriptionRouter } from './routes/subscription.routes'
import { userRouter }         from './routes/user.routes'

export function createApp(): Application {
  const app = express()

  // ── Security headers ────────────────────────────────────────
  app.use(helmet({
    contentSecurityPolicy: false,   // handled by frontend
    crossOriginEmbedderPolicy: false,
  }))

  // ── CORS ────────────────────────────────────────────────────
  app.use(cors({
    origin: env.CORS_ORIGINS,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  }))

  // ── Compression ─────────────────────────────────────────────
  app.use(compression())

  // ── Body parsing ────────────────────────────────────────────
  app.use(express.json({ limit: '10mb' }))
  app.use(express.urlencoded({ extended: true, limit: '10mb' }))

  // ── Request logging ─────────────────────────────────────────
  if (env.NODE_ENV !== 'test') {
    app.use(morgan('combined', {
      stream: { write: (msg) => logger.http(msg.trim()) },
      skip: (req) => req.url === '/health',
    }))
  }

  // ── Request ID ──────────────────────────────────────────────
  app.use((req: Request, _res: Response, next: NextFunction) => {
    req.requestId = (req.headers['x-request-id'] as string) ?? crypto.randomUUID()
    next()
  })

  // ── Global rate limit ────────────────────────────────────────
  const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,   // 15 minutes
    max:      500,
    standardHeaders: true,
    legacyHeaders:   false,
    message: { success: false, error: 'Too many requests, please try again later.' },
  })
  app.use(globalLimiter)

  // Stricter limit for auth endpoints
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max:      20,
    message: { success: false, error: 'Too many auth attempts.' },
  })

  // ── Health check ─────────────────────────────────────────────
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', ts: new Date().toISOString(), version: env.API_VERSION })
  })

  // ── API routes ───────────────────────────────────────────────
  const v1 = express.Router()

  v1.use('/auth',          authLimiter, authRouter)
  v1.use('/users',         userRouter)
  v1.use('/transactions',  transactionRouter)
  v1.use('/analytics',     analyticsRouter)
  v1.use('/categories',    categoryRouter)
  v1.use('/wallets',       walletRouter)
  v1.use('/receipts',      receiptRouter)
  v1.use('/subscriptions', subscriptionRouter)

  app.use(`/api/${env.API_VERSION}`, v1)

  // ── 404 handler ──────────────────────────────────────────────
  app.use((_req: Request, _res: Response, next: NextFunction) => {
    next(new AppError('Route not found', 404))
  })

  // ── Global error handler ─────────────────────────────────────
  app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof AppError) {
      logger.warn(`[${req.requestId}] ${err.statusCode} ${req.method} ${req.url} — ${err.message}`)
      return res.status(err.statusCode).json({
        success: false,
        error:   err.message,
        ...(env.NODE_ENV === 'development' && { stack: err.stack }),
      })
    }

    // Unexpected error
    logger.error(`[${req.requestId}] Unhandled error:`, err)
    return res.status(500).json({
      success: false,
      error:   'Internal server error',
    })
  })

  return app
}

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      requestId: string
      user?: {
        id:    string
        email: string
        plan:  'free' | 'pro' | 'business'
      }
    }
  }
}
