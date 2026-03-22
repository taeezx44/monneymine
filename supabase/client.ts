// supabase/client.ts
// ─────────────────────────────────────────────
// Singleton Supabase client + TypeScript types
// ─────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js'

// ── Types ────────────────────────────────────

export type TransactionType = 'income' | 'expense' | 'transfer'
export type SubscriptionPlan = 'free' | 'pro' | 'business'
export type ReceiptStatus = 'pending' | 'processing' | 'done' | 'failed'
export type SlipStatus = 'pending' | 'verified' | 'rejected'

export interface User {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  plan: SubscriptionPlan
  currency: string
  timezone: string
  locale: string
  created_at: string
  updated_at: string
}

export interface Category {
  id: string
  user_id: string | null
  name: string
  name_th: string | null
  icon: string
  color: string
  type: TransactionType
  budget: number | null
  is_default: boolean
  sort_order: number
  created_at: string
}

export interface Wallet {
  id: string
  user_id: string
  name: string
  type: 'bank' | 'cash' | 'credit' | 'e-wallet'
  bank_name: string | null
  balance: number
  color: string
  icon: string
  is_default: boolean
  created_at: string
  updated_at: string
}

export interface Transaction {
  id: string
  user_id: string
  wallet_id: string | null
  category_id: string | null
  type: TransactionType
  amount: number
  currency: string
  note: string | null
  merchant: string | null
  location: string | null
  ai_category_id: string | null
  ai_confidence: number | null
  ai_merchant_normalized: string | null
  ai_tags: string[] | null
  transfer_to_wallet_id: string | null
  transacted_at: string
  created_at: string
  updated_at: string
  // joined fields
  category?: Category
  wallet?: Wallet
}

export interface Receipt {
  id: string
  transaction_id: string | null
  user_id: string
  image_url: string
  status: ReceiptStatus
  ocr_raw_text: string | null
  ocr_amount: number | null
  ocr_merchant: string | null
  ocr_date: string | null
  ocr_items: Record<string, unknown>[] | null
  ocr_confidence: number | null
  error_message: string | null
  processed_at: string | null
  created_at: string
}

export interface Notification {
  id: string
  user_id: string
  type: string
  title: string
  body: string | null
  data: Record<string, unknown> | null
  is_read: boolean
  created_at: string
}

// ── Database generic type map ─────────────────

export interface Database {
  public: {
    Tables: {
      users:            { Row: User;         Insert: Partial<User>;        Update: Partial<User> }
      categories:       { Row: Category;     Insert: Partial<Category>;    Update: Partial<Category> }
      wallets:          { Row: Wallet;       Insert: Partial<Wallet>;      Update: Partial<Wallet> }
      transactions:     { Row: Transaction;  Insert: Partial<Transaction>; Update: Partial<Transaction> }
      receipts:         { Row: Receipt;      Insert: Partial<Receipt>;     Update: Partial<Receipt> }
      notifications:    { Row: Notification; Insert: Partial<Notification>;Update: Partial<Notification> }
    }
    Views: {
      v_monthly_category_totals: { Row: MonthlyCategoryTotal }
      v_daily_spending: { Row: DailySpending }
    }
  }
}

export interface MonthlyCategoryTotal {
  user_id: string
  month: string
  category_id: string | null
  category_name: string | null
  category_icon: string | null
  category_color: string | null
  type: TransactionType
  total: number
  tx_count: number
}

export interface DailySpending {
  user_id: string
  day: string
  type: TransactionType
  total: number
  tx_count: number
}

// ── Singleton client ──────────────────────────

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  realtime: {
    params: { eventsPerSecond: 10 },
  },
})

// Server-side client (Node.js / API routes) — uses service role key
export const createServerClient = () =>
  createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
