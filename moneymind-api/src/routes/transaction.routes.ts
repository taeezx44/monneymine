// src/routes/transaction.routes.ts
import { Router } from 'express'
import { authenticate }    from '../middleware/auth.middleware'
import { checkQuota }      from '../middleware/quota.middleware'
import { validate }        from '../utils/validate'
import { TransactionController } from '../controllers/transaction.controller'
import {
  CreateTransactionSchema,
  UpdateTransactionSchema,
  ListTransactionsQuerySchema,
} from '../schemas/transaction.schema'

const router = Router()
const ctrl   = new TransactionController()

router.use(authenticate)

router.get(   '/',     validate(ListTransactionsQuerySchema, 'query'), ctrl.list.bind(ctrl))
router.post(  '/',     checkQuota('transactions_per_month'), validate(CreateTransactionSchema), ctrl.create.bind(ctrl))
router.get(   '/:id',  ctrl.getOne.bind(ctrl))
router.put(   '/:id',  validate(UpdateTransactionSchema), ctrl.update.bind(ctrl))
router.delete('/:id',  ctrl.remove.bind(ctrl))

export { router as transactionRouter }


// ─────────────────────────────────────────────────────────────
// src/schemas/transaction.schema.ts
// ─────────────────────────────────────────────────────────────
import { z } from 'zod'

export const CreateTransactionSchema = z.object({
  type:          z.enum(['income', 'expense', 'transfer']),
  amount:        z.number().positive('Amount must be positive'),
  currency:      z.string().length(3).default('THB'),
  note:          z.string().max(500).optional(),
  merchant:      z.string().max(200).optional(),
  location:      z.string().max(200).optional(),
  category_id:   z.string().uuid().optional(),
  wallet_id:     z.string().uuid().optional(),
  transacted_at: z.string().datetime().optional(),
  transfer_to_wallet_id: z.string().uuid().optional(),
}).refine(
  data => data.type !== 'transfer' || !!data.transfer_to_wallet_id,
  { message: 'transfer_to_wallet_id required for transfer type', path: ['transfer_to_wallet_id'] }
)

export const UpdateTransactionSchema = CreateTransactionSchema.partial()

export const ListTransactionsQuerySchema = z.object({
  page:        z.coerce.number().int().positive().default(1),
  limit:       z.coerce.number().int().min(1).max(100).default(20),
  type:        z.enum(['income', 'expense', 'transfer']).optional(),
  category_id: z.string().uuid().optional(),
  wallet_id:   z.string().uuid().optional(),
  from:        z.string().datetime().optional(),
  to:          z.string().datetime().optional(),
  search:      z.string().max(100).optional(),
  sort:        z.enum(['transacted_at', 'amount', 'created_at']).default('transacted_at'),
  order:       z.enum(['asc', 'desc']).default('desc'),
})

export type CreateTransactionInput = z.infer<typeof CreateTransactionSchema>
export type UpdateTransactionInput = z.infer<typeof UpdateTransactionSchema>
export type ListTransactionsQuery  = z.infer<typeof ListTransactionsQuerySchema>


// ─────────────────────────────────────────────────────────────
// src/controllers/transaction.controller.ts
// ─────────────────────────────────────────────────────────────
import type { Request, Response, NextFunction } from 'express'
import { TransactionService }  from '../services/transaction.service'
import { ok, created, noContent, paginated } from '../utils/response'
import { AppError }            from '../utils/AppError'
import type { ListTransactionsQuery, CreateTransactionInput, UpdateTransactionInput } from '../schemas/transaction.schema'

export class TransactionController {
  private svc = new TransactionService()

  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const query = req.query as unknown as ListTransactionsQuery
      const { data, total } = await this.svc.list(req.user!.id, query)
      return paginated(res, data, { page: query.page, limit: query.limit, total })
    } catch (err) { next(err) }
  }

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const body = req.body as CreateTransactionInput
      const txn  = await this.svc.create(req.user!.id, body)
      return created(res, txn)
    } catch (err) { next(err) }
  }

  async getOne(req: Request, res: Response, next: NextFunction) {
    try {
      const txn = await this.svc.findById(req.params.id, req.user!.id)
      if (!txn) throw new AppError('Transaction not found', 404)
      return ok(res, txn)
    } catch (err) { next(err) }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const body = req.body as UpdateTransactionInput
      const txn  = await this.svc.update(req.params.id, req.user!.id, body)
      if (!txn) throw new AppError('Transaction not found', 404)
      return ok(res, txn)
    } catch (err) { next(err) }
  }

  async remove(req: Request, res: Response, next: NextFunction) {
    try {
      const deleted = await this.svc.delete(req.params.id, req.user!.id)
      if (!deleted) throw new AppError('Transaction not found', 404)
      return noContent(res)
    } catch (err) { next(err) }
  }
}


// ─────────────────────────────────────────────────────────────
// src/services/transaction.service.ts
// ─────────────────────────────────────────────────────────────
import { db }  from '../config/database'
import { cacheDel } from '../config/cache'
import type { CreateTransactionInput, UpdateTransactionInput, ListTransactionsQuery } from '../schemas/transaction.schema'

export interface Transaction {
  id:              string
  user_id:         string
  wallet_id:       string | null
  category_id:     string | null
  type:            string
  amount:          number
  currency:        string
  note:            string | null
  merchant:        string | null
  location:        string | null
  ai_category_id:  string | null
  ai_confidence:   number | null
  ai_tags:         string[] | null
  transacted_at:   string
  created_at:      string
  updated_at:      string
  category?:       { id: string; name: string; icon: string; color: string } | null
  wallet?:         { id: string; name: string; icon: string } | null
}

export class TransactionService {

  async list(
    userId: string,
    q: ListTransactionsQuery
  ): Promise<{ data: Transaction[]; total: number }> {
    const conditions: string[] = ['t.user_id = $1']
    const params: unknown[]    = [userId]
    let   paramIdx             = 2

    if (q.type)        { conditions.push(`t.type = $${paramIdx++}`);         params.push(q.type) }
    if (q.category_id) { conditions.push(`t.category_id = $${paramIdx++}`);  params.push(q.category_id) }
    if (q.wallet_id)   { conditions.push(`t.wallet_id = $${paramIdx++}`);    params.push(q.wallet_id) }
    if (q.from)        { conditions.push(`t.transacted_at >= $${paramIdx++}`);params.push(q.from) }
    if (q.to)          { conditions.push(`t.transacted_at <= $${paramIdx++}`);params.push(q.to) }
    if (q.search)      {
      conditions.push(`t.merchant ILIKE $${paramIdx++}`)
      params.push(`%${q.search}%`)
    }

    const where = conditions.join(' AND ')
    const order = `t.${q.sort} ${q.order.toUpperCase()}`
    const offset = (q.page - 1) * q.limit

    const [{ rows: data }, { rows: countRows }] = await Promise.all([
      db.query<Transaction>(`
        SELECT
          t.*,
          json_build_object('id', c.id, 'name', c.name, 'icon', c.icon, 'color', c.color) AS category,
          json_build_object('id', w.id, 'name', w.name, 'icon', w.icon) AS wallet
        FROM transactions t
        LEFT JOIN categories c ON c.id = COALESCE(t.category_id, t.ai_category_id)
        LEFT JOIN wallets    w ON w.id = t.wallet_id
        WHERE ${where}
        ORDER BY ${order}
        LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
      `, [...params, q.limit, offset]),

      db.query<{ count: string }>(
        `SELECT COUNT(*) FROM transactions t WHERE ${where}`,
        params
      ),
    ])

    return { data, total: parseInt(countRows[0].count) }
  }

  async findById(id: string, userId: string): Promise<Transaction | null> {
    const { rows } = await db.query<Transaction>(`
      SELECT t.*,
        json_build_object('id', c.id, 'name', c.name, 'icon', c.icon, 'color', c.color) AS category,
        json_build_object('id', w.id, 'name', w.name, 'icon', w.icon) AS wallet
      FROM transactions t
      LEFT JOIN categories c ON c.id = COALESCE(t.category_id, t.ai_category_id)
      LEFT JOIN wallets    w ON w.id = t.wallet_id
      WHERE t.id = $1 AND t.user_id = $2
    `, [id, userId])
    return rows[0] ?? null
  }

  async create(userId: string, input: CreateTransactionInput): Promise<Transaction> {
    const { rows } = await db.query<Transaction>(`
      INSERT INTO transactions
        (user_id, type, amount, currency, note, merchant, location,
         category_id, wallet_id, transacted_at, transfer_to_wallet_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,
              COALESCE($10::timestamptz, NOW()), $11)
      RETURNING *
    `, [
      userId, input.type, input.amount,
      input.currency ?? 'THB',
      input.note       ?? null,
      input.merchant   ?? null,
      input.location   ?? null,
      input.category_id ?? null,
      input.wallet_id  ?? null,
      input.transacted_at ?? null,
      input.transfer_to_wallet_id ?? null,
    ])

    // Invalidate analytics cache for this user
    await cacheDel(`analytics:monthly:${userId}`, `analytics:daily:${userId}`)

    return rows[0]
  }

  async update(id: string, userId: string, input: UpdateTransactionInput): Promise<Transaction | null> {
    const sets: string[]   = []
    const params: unknown[] = []
    let   idx = 1

    const fields: (keyof UpdateTransactionInput)[] = [
      'type','amount','currency','note','merchant',
      'location','category_id','wallet_id','transacted_at',
    ]
    for (const f of fields) {
      if (f in input) { sets.push(`${f} = $${idx++}`); params.push((input as any)[f]) }
    }
    if (!sets.length) return this.findById(id, userId)

    sets.push(`updated_at = NOW()`)
    params.push(id, userId)

    const { rows } = await db.query<Transaction>(
      `UPDATE transactions SET ${sets.join(', ')}
       WHERE id = $${idx} AND user_id = $${idx + 1}
       RETURNING *`,
      params
    )
    if (rows[0]) await cacheDel(`analytics:monthly:${userId}`)
    return rows[0] ?? null
  }

  async delete(id: string, userId: string): Promise<boolean> {
    const { rowCount } = await db.query(
      'DELETE FROM transactions WHERE id = $1 AND user_id = $2',
      [id, userId]
    )
    if (rowCount) await cacheDel(`analytics:monthly:${userId}`)
    return (rowCount ?? 0) > 0
  }
}
