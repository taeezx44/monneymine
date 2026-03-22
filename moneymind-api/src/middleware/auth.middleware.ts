// src/middleware/auth.middleware.ts
// ─────────────────────────────────────────────────────────────
// JWT authentication + Supabase session verification
// ─────────────────────────────────────────────────────────────

import { type Request, type Response, type NextFunction } from 'express'
import jwt                from 'jsonwebtoken'
import { createClient }   from '@supabase/supabase-js'
import { AppError }       from '../utils/AppError'
import { env }            from '../config/env'
import { cacheGet, cacheSet } from '../config/cache'
import { db }             from '../config/database'

// Supabase admin client for token verification
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

// ── Verify Supabase JWT ───────────────────────────────────────
export async function authenticate(
  req: Request, res: Response, next: NextFunction
) {
  try {
    const header = req.headers.authorization
    if (!header?.startsWith('Bearer ')) {
      throw new AppError('Missing Authorization header', 401)
    }

    const token = header.slice(7)

    // Try cache first (avoid hitting Supabase on every request)
    const cacheKey = `auth:${token.slice(-16)}`
    const cached   = await cacheGet<{ id: string; email: string; plan: string }>(cacheKey)

    if (cached) {
      req.user = cached as typeof req.user
      return next()
    }

    // Verify with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token)
    if (error || !user) throw new AppError('Invalid or expired token', 401)

    // Fetch plan from users table
    const { rows } = await db.query<{ plan: string }>(
      'SELECT plan FROM users WHERE id = $1',
      [user.id]
    )
    const plan = (rows[0]?.plan ?? 'free') as 'free' | 'pro' | 'business'

    req.user = { id: user.id, email: user.email!, plan }

    // Cache for 5 minutes
    await cacheSet(cacheKey, req.user, 300)
    next()

  } catch (err) {
    next(err)
  }
}

// ── Plan gate ─────────────────────────────────────────────────
export function requirePlan(...plans: Array<'free' | 'pro' | 'business'>) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new AppError('Unauthenticated', 401))
    if (!plans.includes(req.user.plan)) {
      return next(new AppError(
        `This feature requires ${plans.join(' or ')} plan`, 403
      ))
    }
    next()
  }
}

// Shorthand guards
export const requirePro      = requirePlan('pro', 'business')
export const requireBusiness = requirePlan('business')


// ─────────────────────────────────────────────────────────────
// src/utils/AppError.ts
// ─────────────────────────────────────────────────────────────
export class AppError extends Error {
  public readonly statusCode: number
  public readonly isOperational: boolean

  constructor(message: string, statusCode = 500, isOperational = true) {
    super(message)
    this.statusCode    = statusCode
    this.isOperational = isOperational
    Error.captureStackTrace(this, this.constructor)
  }
}


// ─────────────────────────────────────────────────────────────
// src/utils/response.ts  — Standardized API responses
// ─────────────────────────────────────────────────────────────
import type { Response } from 'express'

export interface ApiResponse<T = unknown> {
  success: boolean
  data?:   T
  error?:  string
  meta?:   {
    page?:       number
    limit?:      number
    total?:      number
    total_pages?: number
  }
}

export function ok<T>(res: Response, data: T, status = 200): Response {
  return res.status(status).json({ success: true, data } satisfies ApiResponse<T>)
}

export function created<T>(res: Response, data: T): Response {
  return ok(res, data, 201)
}

export function paginated<T>(
  res: Response,
  data: T[],
  meta: { page: number; limit: number; total: number }
): Response {
  return res.status(200).json({
    success: true,
    data,
    meta: {
      ...meta,
      total_pages: Math.ceil(meta.total / meta.limit),
    },
  } satisfies ApiResponse<T[]>)
}

export function noContent(res: Response): Response {
  return res.status(204).send()
}


// ─────────────────────────────────────────────────────────────
// src/utils/pagination.ts
// ─────────────────────────────────────────────────────────────
import type { Request } from 'express'

export interface PaginationParams {
  page:   number
  limit:  number
  offset: number
}

export function parsePagination(req: Request, maxLimit = 100): PaginationParams {
  const page  = Math.max(1, parseInt(req.query.page  as string) || 1)
  const limit = Math.min(maxLimit, Math.max(1, parseInt(req.query.limit as string) || 20))
  return { page, limit, offset: (page - 1) * limit }
}


// ─────────────────────────────────────────────────────────────
// src/utils/validate.ts  — Zod request validation middleware
// ─────────────────────────────────────────────────────────────
import type { Request, Response, NextFunction } from 'express'
import { z, ZodError, type ZodSchema } from 'zod'
import { AppError } from './AppError'

type ValidateTarget = 'body' | 'query' | 'params'

export function validate(schema: ZodSchema, target: ValidateTarget = 'body') {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      const parsed = schema.parse(req[target])
      ;(req as any)[target] = parsed  // replace with parsed/coerced values
      next()
    } catch (err) {
      if (err instanceof ZodError) {
        const messages = err.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
        return next(new AppError(`Validation error: ${messages}`, 422))
      }
      next(err)
    }
  }
}


// ─────────────────────────────────────────────────────────────
// src/middleware/quota.middleware.ts  — Feature quota enforcement
// ─────────────────────────────────────────────────────────────
import type { Request, Response, NextFunction } from 'express'
import { db }       from '../config/database'
import { AppError } from '../utils/AppError'

const LIMITS = {
  free:     { transactions_per_month: 50, ai_chat_per_day: 3,  receipt_scans: 5  },
  pro:      { transactions_per_month: -1, ai_chat_per_day: 50, receipt_scans: -1 },
  business: { transactions_per_month: -1, ai_chat_per_day: -1, receipt_scans: -1 },
} as const

type QuotaType = 'transactions_per_month' | 'ai_chat_per_day' | 'receipt_scans'

export function checkQuota(type: QuotaType) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new AppError('Unauthenticated', 401))

    const plan  = req.user.plan as keyof typeof LIMITS
    const limit = LIMITS[plan][type]
    if (limit === -1) return next()   // unlimited

    const userId = req.user.id
    let count = 0

    if (type === 'transactions_per_month') {
      const { rows } = await db.query<{ count: string }>(
        `SELECT COUNT(*) FROM transactions
         WHERE user_id = $1 AND created_at >= date_trunc('month', NOW())`,
        [userId]
      )
      count = parseInt(rows[0].count)
    } else if (type === 'ai_chat_per_day') {
      const { rows } = await db.query<{ count: string }>(
        `SELECT COUNT(*) FROM ai_messages am
         JOIN ai_conversations ac ON ac.id = am.conversation_id
         WHERE ac.user_id = $1 AND am.role = 'user'
           AND am.created_at >= date_trunc('day', NOW())`,
        [userId]
      )
      count = parseInt(rows[0].count)
    } else if (type === 'receipt_scans') {
      const { rows } = await db.query<{ count: string }>(
        `SELECT COUNT(*) FROM receipts
         WHERE user_id = $1 AND status = 'done'
           AND created_at >= date_trunc('month', NOW())`,
        [userId]
      )
      count = parseInt(rows[0].count)
    }

    if (count >= limit) {
      throw new AppError(
        `คุณใช้ ${type.replace(/_/g, ' ')} ครบ ${limit} แล้วในช่วงนี้ อัปเกรด plan เพื่อใช้งานต่อ`,
        429
      )
    }

    next()
  }
}
