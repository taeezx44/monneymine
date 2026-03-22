// store/authStore.ts
import { create } from 'zustand'
import { supabase } from '@/supabase/client'
import type { User } from '@/supabase/client'

interface AuthState {
  user:    User | null
  session: any | null
  loading: boolean
  signInWithGoogle: () => Promise<void>
  signInWithGithub: () => Promise<void>
  signOut:          () => Promise<void>
  initialize:       () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user:    null,
  session: null,
  loading: true,

  initialize: () => {
    // Listen to Supabase auth state
    supabase.auth.getSession().then(({ data: { session } }) => {
      set({ session, loading: false })
      if (session?.user?.id) {
        supabase.from('users').select('*').eq('id', session.user.id).single()
          .then(({ data }) => set({ user: data }))
      }
    })

    supabase.auth.onAuthStateChange((_event, session) => {
      set({ session, loading: false })
      if (session?.user?.id) {
        supabase.from('users').select('*').eq('id', session.user.id).single()
          .then(({ data }) => set({ user: data }))
      } else {
        set({ user: null })
      }
    })
  },

  signInWithGoogle: async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: 'moneymind://auth/callback' },
    })
  },

  signInWithGithub: async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: { redirectTo: 'moneymind://auth/callback' },
    })
  },

  signOut: async () => {
    await supabase.auth.signOut()
    set({ user: null, session: null })
  },
}))


// ─────────────────────────────────────────────────────────────
// store/transactionStore.ts
// ─────────────────────────────────────────────────────────────

import { create } from 'zustand'
import { supabase } from '@/supabase/client'
import type { Transaction } from '@/supabase/client'

interface TransactionState {
  transactions: Transaction[]
  loading:      boolean
  error:        string | null
  fetchRecent:  (userId: string, limit?: number) => Promise<void>
  addLocal:     (t: Transaction) => void
  updateLocal:  (id: string, updates: Partial<Transaction>) => void
  removeLocal:  (id: string) => void
  subscribeRealtime: (userId: string) => () => void
}

export const useTransactionStore = create<TransactionState>((set, get) => ({
  transactions: [],
  loading:      false,
  error:        null,

  fetchRecent: async (userId, limit = 50) => {
    set({ loading: true, error: null })
    const { data, error } = await supabase
      .from('transactions')
      .select('*, category:categories(*), wallet:wallets(id,name,icon,color)')
      .eq('user_id', userId)
      .order('transacted_at', { ascending: false })
      .limit(limit)

    set({ transactions: data ?? [], loading: false, error: error?.message ?? null })
  },

  addLocal:    (t)       => set(s => ({ transactions: [t, ...s.transactions] })),
  updateLocal: (id, upd) => set(s => ({ transactions: s.transactions.map(t => t.id === id ? { ...t, ...upd } : t) })),
  removeLocal: (id)      => set(s => ({ transactions: s.transactions.filter(t => t.id !== id) })),

  subscribeRealtime: (userId) => {
    const channel = supabase
      .channel(`mobile-txns-${userId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'transactions', filter: `user_id=eq.${userId}`,
      }, (payload) => {
        if      (payload.eventType === 'INSERT') get().addLocal(payload.new as Transaction)
        else if (payload.eventType === 'UPDATE') get().updateLocal(payload.new.id, payload.new)
        else if (payload.eventType === 'DELETE') get().removeLocal(payload.old.id)
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  },
}))


// ─────────────────────────────────────────────────────────────
// utils/format.ts
// ─────────────────────────────────────────────────────────────

const MONTHS_TH = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']

export function formatTHB(amount: number): string {
  return '฿' + amount.toLocaleString('th-TH', { maximumFractionDigits: 0 })
}

export function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    return `${d.getDate()} ${MONTHS_TH[d.getMonth()]} ${d.getFullYear()}`
  } catch { return iso }
}

export function thisMonth(): string {
  const d = new Date()
  return `${MONTHS_TH[d.getMonth()]} ${d.getFullYear()}`
}

export function relativeDate(iso: string): string {
  const d    = new Date(iso)
  const now  = new Date()
  const diff = Math.floor((now.getTime() - d.getTime()) / 86400000)
  if (diff === 0) return 'วันนี้'
  if (diff === 1) return 'เมื่อวาน'
  if (diff <= 7)  return `${diff} วันที่แล้ว`
  return formatDate(iso)
}
