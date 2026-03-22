// store/notificationStore.ts
import { create } from 'zustand'
import { supabase } from '@/supabase/client'

export interface Notification {
  id:         string
  user_id:    string
  type:       string
  title:      string
  body:       string | null
  data:       Record<string, unknown> | null
  is_read:    boolean
  created_at: string
}

interface NotificationState {
  notifications: Notification[]
  unreadCount:   number
  loading:       boolean
  fetch:         (userId: string) => Promise<void>
  addNotification:    (n: Notification) => void
  markRead:           (id: string) => Promise<void>
  markAllRead:        (userId: string) => Promise<void>
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount:   0,
  loading:       false,

  fetch: async (userId) => {
    set({ loading: true })
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50)
    const notifs = data ?? []
    set({
      notifications: notifs,
      unreadCount:   notifs.filter(n => !n.is_read).length,
      loading:       false,
    })
  },

  addNotification: (n) => set(s => ({
    notifications: [n, ...s.notifications],
    unreadCount:   s.unreadCount + (n.is_read ? 0 : 1),
  })),

  markRead: async (id) => {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id)
    set(s => ({
      notifications: s.notifications.map(n => n.id === id ? { ...n, is_read: true } : n),
      unreadCount:   Math.max(0, s.unreadCount - 1),
    }))
  },

  markAllRead: async (userId) => {
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', userId)
      .eq('is_read', false)
    set(s => ({
      notifications: s.notifications.map(n => ({ ...n, is_read: true })),
      unreadCount:   0,
    }))
  },
}))


// ─────────────────────────────────────────────────────────────
// store/receiptStore.ts
// ─────────────────────────────────────────────────────────────
import { create } from 'zustand'
import { supabase } from '@/supabase/client'

export type ReceiptStatus = 'pending' | 'processing' | 'done' | 'failed'

export interface Receipt {
  id:              string
  transaction_id:  string | null
  user_id:         string
  image_url:       string
  status:          ReceiptStatus
  ocr_raw_text:    string | null
  ocr_amount:      number | null
  ocr_merchant:    string | null
  ocr_date:        string | null
  ocr_items:       unknown[] | null
  ocr_confidence:  number | null
  error_message:   string | null
  processed_at:    string | null
  created_at:      string
}

interface ReceiptState {
  receipts:  Record<string, Receipt>   // keyed by id
  fetch:     (userId: string) => Promise<void>
  updateReceiptStatus: (id: string, status: ReceiptStatus, data: Partial<Receipt>) => void
  getById:   (id: string) => Receipt | undefined
}

export const useReceiptStore = create<ReceiptState>((set, get) => ({
  receipts: {},

  fetch: async (userId) => {
    const { data } = await supabase
      .from('receipts')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(30)
    const map: Record<string, Receipt> = {}
    ;(data ?? []).forEach(r => { map[r.id] = r as Receipt })
    set({ receipts: map })
  },

  updateReceiptStatus: (id, status, data) => set(s => ({
    receipts: {
      ...s.receipts,
      [id]: { ...s.receipts[id], ...data, status },
    },
  })),

  getById: (id) => get().receipts[id],
}))


// ─────────────────────────────────────────────────────────────
// store/walletStore.ts
// ─────────────────────────────────────────────────────────────
import { create } from 'zustand'
import { supabase } from '@/supabase/client'

export interface Wallet {
  id:         string
  user_id:    string
  name:       string
  type:       string
  bank_name:  string | null
  balance:    number
  color:      string
  icon:       string
  is_default: boolean
  created_at: string
  updated_at: string
}

interface WalletState {
  wallets:        Wallet[]
  totalBalance:   number
  loading:        boolean
  fetch:          (userId: string) => Promise<void>
  updateWalletBalance: (id: string, balance: number) => void
  defaultWallet:  () => Wallet | undefined
}

export const useWalletStore = create<WalletState>((set, get) => ({
  wallets:      [],
  totalBalance: 0,
  loading:      false,

  fetch: async (userId) => {
    set({ loading: true })
    const { data } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', userId)
      .order('is_default', { ascending: false })
    const wallets = (data ?? []) as Wallet[]
    set({
      wallets,
      totalBalance: wallets.reduce((s, w) => s + w.balance, 0),
      loading: false,
    })
  },

  updateWalletBalance: (id, balance) => set(s => {
    const wallets = s.wallets.map(w => w.id === id ? { ...w, balance } : w)
    return { wallets, totalBalance: wallets.reduce((s, w) => s + w.balance, 0) }
  }),

  defaultWallet: () => get().wallets.find(w => w.is_default) ?? get().wallets[0],
}))


// ─────────────────────────────────────────────────────────────
// store/subscriptionStore.ts
// ─────────────────────────────────────────────────────────────
import { create } from 'zustand'
import { supabase } from '@/supabase/client'
import type { Plan } from '@/lib/subscription'

export interface Subscription {
  id:                   string
  user_id:              string
  plan:                 Plan
  status:               'active' | 'cancelled' | 'expired' | 'trialing'
  current_period_start: string
  current_period_end:   string
  cancelled_at:         string | null
  created_at:           string
}

interface SubscriptionState {
  subscription:  Subscription | null
  plan:          Plan
  isPro:         boolean
  isBusiness:    boolean
  loading:       boolean
  fetch:         (userId: string) => Promise<void>
  setSubscription: (sub: Subscription) => void
  daysRemaining: () => number
}

export const useSubscriptionStore = create<SubscriptionState>((set, get) => ({
  subscription: null,
  plan:         'free',
  isPro:        false,
  isBusiness:   false,
  loading:      false,

  fetch: async (userId) => {
    set({ loading: true })
    const [{ data: subData }, { data: userData }] = await Promise.all([
      supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from('users').select('plan').eq('id', userId).single(),
    ])
    const plan = (userData?.plan ?? 'free') as Plan
    set({
      subscription: subData as Subscription | null,
      plan,
      isPro:        plan === 'pro' || plan === 'business',
      isBusiness:   plan === 'business',
      loading:      false,
    })
  },

  setSubscription: (sub) => set({
    subscription: sub,
    plan:        sub.plan,
    isPro:       sub.plan === 'pro' || sub.plan === 'business',
    isBusiness:  sub.plan === 'business',
  }),

  daysRemaining: () => {
    const sub = get().subscription
    if (!sub) return 0
    const end  = new Date(sub.current_period_end)
    const now  = new Date()
    return Math.max(0, Math.ceil((end.getTime() - now.getTime()) / 86_400_000))
  },
}))
