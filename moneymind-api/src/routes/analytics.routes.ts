// src/routes/analytics.routes.ts
import { Router } from 'express'
import { authenticate } from '../middleware/auth.middleware'
import { AnalyticsController } from '../controllers/analytics.controller'

const router = Router()
const ctrl   = new AnalyticsController()

router.use(authenticate)

router.get('/summary',            ctrl.monthlySummary.bind(ctrl))
router.get('/daily',              ctrl.dailySpending.bind(ctrl))
router.get('/categories',         ctrl.categoryBreakdown.bind(ctrl))
router.get('/trends',             ctrl.sixMonthTrend.bind(ctrl))
router.get('/top-merchants',      ctrl.topMerchants.bind(ctrl))
router.get('/savings-rate',       ctrl.savingsRate.bind(ctrl))

export { router as analyticsRouter }


// ─────────────────────────────────────────────────────────────
// src/controllers/analytics.controller.ts
// ─────────────────────────────────────────────────────────────
import type { Request, Response, NextFunction } from 'express'
import { AnalyticsService } from '../services/analytics.service'
import { ok } from '../utils/response'

export class AnalyticsController {
  private svc = new AnalyticsService()

  async monthlySummary(req: Request, res: Response, next: NextFunction) {
    try {
      const month = (req.query.month as string) ?? new Date().toISOString().slice(0, 7)
      const data  = await this.svc.getMonthlySummary(req.user!.id, month)
      return ok(res, data)
    } catch (err) { next(err) }
  }

  async dailySpending(req: Request, res: Response, next: NextFunction) {
    try {
      const days  = Math.min(90, parseInt(req.query.days as string) || 30)
      const data  = await this.svc.getDailySpending(req.user!.id, days)
      return ok(res, data)
    } catch (err) { next(err) }
  }

  async categoryBreakdown(req: Request, res: Response, next: NextFunction) {
    try {
      const month = (req.query.month as string) ?? new Date().toISOString().slice(0, 7)
      const data  = await this.svc.getCategoryBreakdown(req.user!.id, month)
      return ok(res, data)
    } catch (err) { next(err) }
  }

  async sixMonthTrend(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await this.svc.getSixMonthTrend(req.user!.id)
      return ok(res, data)
    } catch (err) { next(err) }
  }

  async topMerchants(req: Request, res: Response, next: NextFunction) {
    try {
      const month = (req.query.month as string) ?? new Date().toISOString().slice(0, 7)
      const limit = Math.min(20, parseInt(req.query.limit as string) || 10)
      const data  = await this.svc.getTopMerchants(req.user!.id, month, limit)
      return ok(res, data)
    } catch (err) { next(err) }
  }

  async savingsRate(req: Request, res: Response, next: NextFunction) {
    try {
      const months = Math.min(12, parseInt(req.query.months as string) || 6)
      const data   = await this.svc.getSavingsRate(req.user!.id, months)
      return ok(res, data)
    } catch (err) { next(err) }
  }
}


// ─────────────────────────────────────────────────────────────
// src/services/analytics.service.ts
// ─────────────────────────────────────────────────────────────
import { db }              from '../config/database'
import { cacheGet, cacheSet } from '../config/cache'

export interface MonthlySummary {
  month:         string
  total_income:  number
  total_expense: number
  net_savings:   number
  savings_rate:  number
  tx_count:      number
  top_categories: CategoryTotal[]
  budget_alerts:  BudgetAlert[]
}

export interface CategoryTotal {
  category_id:   string | null
  category_name: string
  category_icon: string
  category_color:string
  type:          string
  total:         number
  tx_count:      number
  percent:       number
}

export interface BudgetAlert {
  category_name: string
  spent:         number
  budget:        number
  percent:       number
  over_by:       number
}

export interface DailySpending {
  day:      string
  income:   number
  expense:  number
  tx_count: number
}

export interface MonthTrend {
  month:    string
  income:   number
  expense:  number
  savings:  number
}

export class AnalyticsService {

  async getMonthlySummary(userId: string, month: string): Promise<MonthlySummary> {
    const cacheKey = `analytics:monthly:${userId}:${month}`
    const cached   = await cacheGet<MonthlySummary>(cacheKey)
    if (cached) return cached

    const monthStart = `${month}-01`
    const monthEnd   = new Date(
      parseInt(month.slice(0, 4)),
      parseInt(month.slice(5, 7)),
      0
    ).toISOString().split('T')[0]

    // Totals
    const { rows: totals } = await db.query<{
      type: string; total: string; tx_count: string
    }>(`
      SELECT type, SUM(amount) AS total, COUNT(*) AS tx_count
      FROM transactions
      WHERE user_id = $1
        AND transacted_at::date BETWEEN $2::date AND $3::date
      GROUP BY type
    `, [userId, monthStart, monthEnd])

    const income  = parseFloat(totals.find(r => r.type === 'income') ?.total ?? '0')
    const expense = parseFloat(totals.find(r => r.type === 'expense')?.total ?? '0')
    const tx_count = totals.reduce((s, r) => s + parseInt(r.tx_count), 0)

    // Category breakdown
    const { rows: catRows } = await db.query<CategoryTotal>(`
      SELECT
        COALESCE(t.category_id, t.ai_category_id) AS category_id,
        COALESCE(c.name, 'ไม่ระบุ') AS category_name,
        COALESCE(c.icon, '💰')       AS category_icon,
        COALESCE(c.color, '#888882') AS category_color,
        t.type,
        SUM(t.amount)::float     AS total,
        COUNT(*)::int            AS tx_count,
        ROUND(SUM(t.amount) / NULLIF($4::numeric, 0) * 100, 1)::float AS percent
      FROM transactions t
      LEFT JOIN categories c ON c.id = COALESCE(t.category_id, t.ai_category_id)
      WHERE t.user_id = $1
        AND t.transacted_at::date BETWEEN $2::date AND $3::date
      GROUP BY 1, 2, 3, 4, 5
      ORDER BY total DESC
    `, [userId, monthStart, monthEnd, expense])

    // Budget alerts
    const { rows: budgetRows } = await db.query<BudgetAlert>(`
      SELECT
        c.name AS category_name,
        SUM(t.amount)::float AS spent,
        b.amount::float AS budget,
        ROUND(SUM(t.amount) / b.amount * 100, 1)::float AS percent,
        (SUM(t.amount) - b.amount)::float AS over_by
      FROM budgets b
      JOIN categories c ON c.id = b.category_id
      LEFT JOIN transactions t ON t.category_id = b.category_id
        AND t.user_id = b.user_id
        AND t.transacted_at::date BETWEEN $2::date AND $3::date
        AND t.type = 'expense'
      WHERE b.user_id = $1 AND b.period = 'monthly'
      GROUP BY c.name, b.amount
      HAVING SUM(t.amount) > b.amount
      ORDER BY over_by DESC
    `, [userId, monthStart, monthEnd])

    const result: MonthlySummary = {
      month,
      total_income:  income,
      total_expense: expense,
      net_savings:   income - expense,
      savings_rate:  income > 0 ? Math.round(((income - expense) / income) * 100) : 0,
      tx_count,
      top_categories: catRows.filter(r => r.type === 'expense').slice(0, 6),
      budget_alerts:  budgetRows,
    }

    // Cache 10 minutes
    await cacheSet(cacheKey, result, 600)
    return result
  }

  async getDailySpending(userId: string, days: number): Promise<DailySpending[]> {
    const cacheKey = `analytics:daily:${userId}:${days}`
    const cached   = await cacheGet<DailySpending[]>(cacheKey)
    if (cached) return cached

    const { rows } = await db.query<DailySpending>(`
      SELECT
        transacted_at::date::text AS day,
        COALESCE(SUM(amount) FILTER (WHERE type = 'income'),  0)::float AS income,
        COALESCE(SUM(amount) FILTER (WHERE type = 'expense'), 0)::float AS expense,
        COUNT(*)::int AS tx_count
      FROM transactions
      WHERE user_id = $1
        AND transacted_at >= NOW() - INTERVAL '${days} days'
      GROUP BY 1
      ORDER BY 1 ASC
    `, [userId])

    await cacheSet(cacheKey, rows, 300)
    return rows
  }

  async getCategoryBreakdown(userId: string, month: string): Promise<CategoryTotal[]> {
    const monthStart = `${month}-01`
    const monthEnd   = new Date(
      parseInt(month.slice(0, 4)),
      parseInt(month.slice(5, 7)), 0
    ).toISOString().split('T')[0]

    const { rows } = await db.query<CategoryTotal>(`
      SELECT
        COALESCE(t.category_id, t.ai_category_id) AS category_id,
        COALESCE(c.name, 'ไม่ระบุ') AS category_name,
        COALESCE(c.icon, '💰')       AS category_icon,
        COALESCE(c.color, '#888882') AS category_color,
        t.type,
        SUM(t.amount)::float         AS total,
        COUNT(*)::int                AS tx_count,
        0::float                     AS percent
      FROM transactions t
      LEFT JOIN categories c ON c.id = COALESCE(t.category_id, t.ai_category_id)
      WHERE t.user_id = $1
        AND t.transacted_at::date BETWEEN $2::date AND $3::date
      GROUP BY 1, 2, 3, 4, 5
      ORDER BY total DESC
    `, [userId, monthStart, monthEnd])
    return rows
  }

  async getSixMonthTrend(userId: string): Promise<MonthTrend[]> {
    const cacheKey = `analytics:trend:${userId}`
    const cached   = await cacheGet<MonthTrend[]>(cacheKey)
    if (cached) return cached

    const { rows } = await db.query<MonthTrend>(`
      SELECT
        to_char(date_trunc('month', transacted_at), 'YYYY-MM') AS month,
        COALESCE(SUM(amount) FILTER (WHERE type='income'),  0)::float AS income,
        COALESCE(SUM(amount) FILTER (WHERE type='expense'), 0)::float AS expense,
        COALESCE(
          SUM(amount) FILTER (WHERE type='income') -
          SUM(amount) FILTER (WHERE type='expense'), 0
        )::float AS savings
      FROM transactions
      WHERE user_id = $1
        AND transacted_at >= date_trunc('month', NOW() - INTERVAL '5 months')
      GROUP BY 1
      ORDER BY 1 ASC
    `, [userId])

    await cacheSet(cacheKey, rows, 3600)
    return rows
  }

  async getTopMerchants(userId: string, month: string, limit: number) {
    const monthStart = `${month}-01`
    const { rows } = await db.query(`
      SELECT
        COALESCE(ai_merchant_normalized, merchant, 'ไม่ระบุ') AS merchant,
        COUNT(*)::int                       AS tx_count,
        SUM(amount)::float                  AS total,
        AVG(amount)::float                  AS avg_amount
      FROM transactions
      WHERE user_id = $1
        AND type = 'expense'
        AND transacted_at::date >= $2::date
      GROUP BY 1
      ORDER BY total DESC
      LIMIT $3
    `, [userId, monthStart, limit])
    return rows
  }

  async getSavingsRate(userId: string, months: number) {
    const { rows } = await db.query(`
      SELECT
        to_char(date_trunc('month', transacted_at), 'YYYY-MM') AS month,
        COALESCE(SUM(amount) FILTER (WHERE type='income'),  0)::float AS income,
        COALESCE(SUM(amount) FILTER (WHERE type='expense'), 0)::float AS expense,
        CASE
          WHEN SUM(amount) FILTER (WHERE type='income') > 0
          THEN ROUND(
            (1 - SUM(amount) FILTER (WHERE type='expense') /
                 NULLIF(SUM(amount) FILTER (WHERE type='income'), 0)
            ) * 100, 1
          )
          ELSE 0
        END::float AS savings_rate
      FROM transactions
      WHERE user_id = $1
        AND transacted_at >= date_trunc('month', NOW() - INTERVAL '${months - 1} months')
      GROUP BY 1
      ORDER BY 1 ASC
    `, [userId])
    return rows
  }
}
