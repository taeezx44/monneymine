// lib/subscription.ts
// ─────────────────────────────────────────────────────────────
// Subscription business logic
//   - Plan definitions + feature flags
//   - Usage limits + quota checks
//   - Plan upgrade / downgrade helpers
// ─────────────────────────────────────────────────────────────

export type Plan = 'free' | 'pro' | 'business'

// ── Plan definitions ─────────────────────────────────────────

export interface PlanConfig {
  id:          Plan
  name:        string
  nameTH:      string
  price:       number        // THB / month
  priceAnnual: number        // THB / year (2 months free)
  color:       string
  badge:       string | null
  limits: {
    transactions_per_month: number  // -1 = unlimited
    ai_chat_per_day:        number
    receipt_scans_per_month:number
    wallets:                number
    export_history_months:  number  // how far back CSV export goes
  }
  features: {
    ai_chat:            boolean
    receipt_ocr:        boolean
    ai_categorize:      boolean
    budget_alerts:      boolean
    analytics_advanced: boolean
    csv_export:         boolean
    multi_wallet:       boolean
    realtime_sync:      boolean
    priority_support:   boolean
    custom_categories:  number   // max custom categories
  }
}

export const PLANS: Record<Plan, PlanConfig> = {
  free: {
    id:          'free',
    name:        'Free',
    nameTH:      'ฟรี',
    price:       0,
    priceAnnual: 0,
    color:       '#888882',
    badge:       null,
    limits: {
      transactions_per_month:  50,
      ai_chat_per_day:          3,
      receipt_scans_per_month:  5,
      wallets:                  1,
      export_history_months:    1,
    },
    features: {
      ai_chat:            true,
      receipt_ocr:        true,
      ai_categorize:      true,
      budget_alerts:      false,
      analytics_advanced: false,
      csv_export:         false,
      multi_wallet:       false,
      realtime_sync:      true,
      priority_support:   false,
      custom_categories:  3,
    },
  },

  pro: {
    id:          'pro',
    name:        'Pro',
    nameTH:      'โปร',
    price:       149,
    priceAnnual: 1490,   // ~฿124/mo
    color:       '#84cc16',
    badge:       'ยอดนิยม',
    limits: {
      transactions_per_month:  -1,
      ai_chat_per_day:         50,
      receipt_scans_per_month: -1,
      wallets:                  5,
      export_history_months:   12,
    },
    features: {
      ai_chat:            true,
      receipt_ocr:        true,
      ai_categorize:      true,
      budget_alerts:      true,
      analytics_advanced: true,
      csv_export:         true,
      multi_wallet:       true,
      realtime_sync:      true,
      priority_support:   false,
      custom_categories:  50,
    },
  },

  business: {
    id:          'business',
    name:        'Business',
    nameTH:      'ธุรกิจ',
    price:       349,
    priceAnnual: 3490,
    color:       '#60a5fa',
    badge:       null,
    limits: {
      transactions_per_month:  -1,
      ai_chat_per_day:         -1,
      receipt_scans_per_month: -1,
      wallets:                 -1,
      export_history_months:   -1,
    },
    features: {
      ai_chat:            true,
      receipt_ocr:        true,
      ai_categorize:      true,
      budget_alerts:      true,
      analytics_advanced: true,
      csv_export:         true,
      multi_wallet:       true,
      realtime_sync:      true,
      priority_support:   true,
      custom_categories:  -1,
    },
  },
}

// ── Feature gate helper ───────────────────────────────────────

export function canUseFeature(plan: Plan, feature: keyof PlanConfig['features']): boolean {
  const val = PLANS[plan].features[feature]
  if (typeof val === 'boolean') return val
  if (typeof val === 'number')  return val !== 0
  return false
}

export function getLimit(plan: Plan, limit: keyof PlanConfig['limits']): number {
  return PLANS[plan].limits[limit]
}

export function isUnlimited(plan: Plan, limit: keyof PlanConfig['limits']): boolean {
  return PLANS[plan].limits[limit] === -1
}

// ── Usage check (server-side) ─────────────────────────────────

import { createServerClient } from '@/supabase/client'

export interface UsageStatus {
  allowed:    boolean
  used:       number
  limit:      number
  unlimited:  boolean
  resetAt?:   Date
}

export async function checkTransactionQuota(userId: string, plan: Plan): Promise<UsageStatus> {
  if (isUnlimited(plan, 'transactions_per_month')) {
    return { allowed: true, used: 0, limit: -1, unlimited: true }
  }
  const limit  = getLimit(plan, 'transactions_per_month')
  const supabase = createServerClient()
  const start  = new Date(); start.setDate(1); start.setHours(0, 0, 0, 0)
  const { count } = await supabase
    .from('transactions')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', start.toISOString())

  const used    = count ?? 0
  const nextMonth = new Date(start.getFullYear(), start.getMonth() + 1, 1)
  return { allowed: used < limit, used, limit, unlimited: false, resetAt: nextMonth }
}

export async function checkAiChatQuota(userId: string, plan: Plan): Promise<UsageStatus> {
  if (isUnlimited(plan, 'ai_chat_per_day')) {
    return { allowed: true, used: 0, limit: -1, unlimited: true }
  }
  const limit    = getLimit(plan, 'ai_chat_per_day')
  const supabase = createServerClient()
  const today    = new Date(); today.setHours(0, 0, 0, 0)
  const { count } = await supabase
    .from('ai_messages')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'user')
    .gte('created_at', today.toISOString())
    .in('conversation_id',
      supabase.from('ai_conversations').select('id').eq('user_id', userId)
    )
  const used     = count ?? 0
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1)
  return { allowed: used < limit, used, limit, unlimited: false, resetAt: tomorrow }
}

export async function checkReceiptQuota(userId: string, plan: Plan): Promise<UsageStatus> {
  if (isUnlimited(plan, 'receipt_scans_per_month')) {
    return { allowed: true, used: 0, limit: -1, unlimited: true }
  }
  const limit    = getLimit(plan, 'receipt_scans_per_month')
  const supabase = createServerClient()
  const start    = new Date(); start.setDate(1); start.setHours(0, 0, 0, 0)
  const { count } = await supabase
    .from('receipts')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'done')
    .gte('created_at', start.toISOString())
  const used = count ?? 0
  const nextMonth = new Date(start.getFullYear(), start.getMonth() + 1, 1)
  return { allowed: used < limit, used, limit, unlimited: false, resetAt: nextMonth }
}
