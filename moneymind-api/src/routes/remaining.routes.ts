// src/routes/auth.routes.ts
import { Router }      from 'express'
import { authenticate } from '../middleware/auth.middleware'
import { ok }          from '../utils/response'
import { db }          from '../config/database'
import { AppError }    from '../utils/AppError'
import { z }           from 'zod'
import { validate }    from '../utils/validate'

const router = Router()

// POST /auth/sync-user  — called by frontend after Supabase OAuth to ensure user row exists
router.post('/sync-user', authenticate, async (req, res, next) => {
  try {
    const { id, email } = req.user!
    const { fullName, avatarUrl } = req.body as { fullName?: string; avatarUrl?: string }

    const { rows } = await db.query(`
      INSERT INTO users (id, email, full_name, avatar_url)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (id) DO UPDATE
        SET email      = EXCLUDED.email,
            full_name  = COALESCE($3, users.full_name),
            avatar_url = COALESCE($4, users.avatar_url),
            updated_at = NOW()
      RETURNING *
    `, [id, email, fullName ?? null, avatarUrl ?? null])

    return ok(res, rows[0])
  } catch (err) { next(err) }
})

// GET /auth/me  — get current user profile
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM users WHERE id = $1', [req.user!.id]
    )
    if (!rows[0]) throw new AppError('User not found', 404)
    return ok(res, rows[0])
  } catch (err) { next(err) }
})

export { router as authRouter }


// ─────────────────────────────────────────────────────────────
// src/routes/user.routes.ts
// ─────────────────────────────────────────────────────────────
import { Router }      from 'express'
import { authenticate } from '../middleware/auth.middleware'
import { ok }          from '../utils/response'
import { validate }    from '../utils/validate'
import { db }          from '../config/database'
import { z }           from 'zod'

const router = Router()

const UpdateUserSchema = z.object({
  full_name: z.string().max(100).optional(),
  currency:  z.string().length(3).optional(),
  timezone:  z.string().max(60).optional(),
  locale:    z.string().max(10).optional(),
})

router.use(authenticate)

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      'SELECT id, email, full_name, avatar_url, plan, currency, timezone, locale, created_at FROM users WHERE id = $1',
      [req.user!.id]
    )
    return ok(res, rows[0])
  } catch (err) { next(err) }
})

router.patch('/', validate(UpdateUserSchema), async (req, res, next) => {
  try {
    const { full_name, currency, timezone, locale } = req.body
    const sets: string[] = []
    const params: unknown[] = []
    let idx = 1
    if (full_name !== undefined) { sets.push(`full_name = $${idx++}`); params.push(full_name) }
    if (currency  !== undefined) { sets.push(`currency  = $${idx++}`); params.push(currency) }
    if (timezone  !== undefined) { sets.push(`timezone  = $${idx++}`); params.push(timezone) }
    if (locale    !== undefined) { sets.push(`locale    = $${idx++}`); params.push(locale) }
    if (!sets.length) { const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [req.user!.id]); return ok(res, rows[0]) }
    sets.push(`updated_at = NOW()`)
    params.push(req.user!.id)
    const { rows } = await db.query(`UPDATE users SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`, params)
    return ok(res, rows[0])
  } catch (err) { next(err) }
})

export { router as userRouter }


// ─────────────────────────────────────────────────────────────
// src/routes/category.routes.ts
// ─────────────────────────────────────────────────────────────
import { Router }      from 'express'
import { authenticate } from '../middleware/auth.middleware'
import { ok, created, noContent } from '../utils/response'
import { validate }    from '../utils/validate'
import { db }          from '../config/database'
import { AppError }    from '../utils/AppError'
import { z }           from 'zod'

const router = Router()

const CategorySchema = z.object({
  name:       z.string().min(1).max(80),
  name_th:    z.string().max(80).optional(),
  icon:       z.string().max(10).default('💰'),
  color:      z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#888882'),
  type:       z.enum(['income', 'expense']),
  budget:     z.number().positive().optional(),
  sort_order: z.number().int().default(0),
})

router.use(authenticate)

// GET all (own + system defaults)
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM categories WHERE user_id IS NULL OR user_id = $1 ORDER BY type, sort_order, name`,
      [req.user!.id]
    )
    return ok(res, rows)
  } catch (err) { next(err) }
})

router.post('/', validate(CategorySchema), async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `INSERT INTO categories (user_id, name, name_th, icon, color, type, budget, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.user!.id, req.body.name, req.body.name_th ?? null,
       req.body.icon, req.body.color, req.body.type,
       req.body.budget ?? null, req.body.sort_order]
    )
    return created(res, rows[0])
  } catch (err) { next(err) }
})

router.put('/:id', validate(CategorySchema.partial()), async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `UPDATE categories SET name=$1, icon=$2, color=$3, budget=$4 WHERE id=$5 AND user_id=$6 RETURNING *`,
      [req.body.name, req.body.icon, req.body.color, req.body.budget ?? null, req.params.id, req.user!.id]
    )
    if (!rows[0]) throw new AppError('Category not found', 404)
    return ok(res, rows[0])
  } catch (err) { next(err) }
})

router.delete('/:id', async (req, res, next) => {
  try {
    const { rowCount } = await db.query(
      'DELETE FROM categories WHERE id=$1 AND user_id=$2', [req.params.id, req.user!.id]
    )
    if (!rowCount) throw new AppError('Category not found or is a system default', 404)
    return noContent(res)
  } catch (err) { next(err) }
})

export { router as categoryRouter }


// ─────────────────────────────────────────────────────────────
// src/routes/wallet.routes.ts
// ─────────────────────────────────────────────────────────────
import { Router }      from 'express'
import { authenticate } from '../middleware/auth.middleware'
import { ok, created, noContent } from '../utils/response'
import { validate }    from '../utils/validate'
import { db }          from '../config/database'
import { AppError }    from '../utils/AppError'
import { z }           from 'zod'

const router = Router()

const WalletSchema = z.object({
  name:       z.string().min(1).max(100),
  type:       z.enum(['bank','cash','credit','e-wallet']).default('bank'),
  bank_name:  z.string().max(80).optional(),
  color:      z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#6366f1'),
  icon:       z.string().max(10).default('🏦'),
  is_default: z.boolean().default(false),
  balance:    z.number().default(0),
})

router.use(authenticate)

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM wallets WHERE user_id = $1 ORDER BY is_default DESC, name',
      [req.user!.id]
    )
    return ok(res, rows)
  } catch (err) { next(err) }
})

router.post('/', validate(WalletSchema), async (req, res, next) => {
  try {
    if (req.body.is_default) {
      await db.query('UPDATE wallets SET is_default=false WHERE user_id=$1', [req.user!.id])
    }
    const { rows } = await db.query(
      `INSERT INTO wallets (user_id, name, type, bank_name, color, icon, is_default, balance)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.user!.id, req.body.name, req.body.type, req.body.bank_name ?? null,
       req.body.color, req.body.icon, req.body.is_default, req.body.balance]
    )
    return created(res, rows[0])
  } catch (err) { next(err) }
})

router.delete('/:id', async (req, res, next) => {
  try {
    const { rowCount } = await db.query(
      'DELETE FROM wallets WHERE id=$1 AND user_id=$2', [req.params.id, req.user!.id]
    )
    if (!rowCount) throw new AppError('Wallet not found', 404)
    return noContent(res)
  } catch (err) { next(err) }
})

export { router as walletRouter }


// ─────────────────────────────────────────────────────────────
// src/routes/receipt.routes.ts  — stub (full logic in Edge Function)
// ─────────────────────────────────────────────────────────────
import { Router }      from 'express'
import { authenticate } from '../middleware/auth.middleware'
import { checkQuota }   from '../middleware/quota.middleware'
import { ok }          from '../utils/response'
import { db }          from '../config/database'

const router = Router()
router.use(authenticate)

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM receipts WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50',
      [req.user!.id]
    )
    return ok(res, rows)
  } catch (err) { next(err) }
})

router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM receipts WHERE id=$1 AND user_id=$2',
      [req.params.id, req.user!.id]
    )
    return ok(res, rows[0] ?? null)
  } catch (err) { next(err) }
})

export { router as receiptRouter }


// ─────────────────────────────────────────────────────────────
// src/routes/subscription.routes.ts
// ─────────────────────────────────────────────────────────────
import { Router }      from 'express'
import { authenticate } from '../middleware/auth.middleware'
import { ok }          from '../utils/response'
import { db }          from '../config/database'

const router = Router()
router.use(authenticate)

router.get('/', async (req, res, next) => {
  try {
    const [{ rows: sub }, { rows: user }] = await Promise.all([
      db.query(
        `SELECT * FROM subscriptions WHERE user_id=$1 AND status='active'
         ORDER BY created_at DESC LIMIT 1`,
        [req.user!.id]
      ),
      db.query('SELECT plan FROM users WHERE id=$1', [req.user!.id]),
    ])
    return ok(res, { subscription: sub[0] ?? null, plan: user[0]?.plan ?? 'free' })
  } catch (err) { next(err) }
})

export { router as subscriptionRouter }
