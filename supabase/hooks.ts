// supabase/hooks.ts
// ─────────────────────────────────────────────
// React hooks: realtime sync + data fetching
// ─────────────────────────────────────────────

'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase, type Transaction, type Notification, type Wallet } from './client'
import type { RealtimeChannel } from '@supabase/supabase-js'

// ── useTransactions ───────────────────────────
// Fetches transactions + subscribes to realtime INSERT/UPDATE/DELETE

export function useTransactions(userId: string, limit = 50) {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchTransactions = useCallback(async () => {
    const { data, error } = await supabase
      .from('transactions')
      .select(`
        *,
        category:categories(*),
        wallet:wallets(id, name, icon, color)
      `)
      .eq('user_id', userId)
      .order('transacted_at', { ascending: false })
      .limit(limit)

    if (error) { setError(error.message); return }
    setTransactions(data ?? [])
    setLoading(false)
  }, [userId, limit])

  useEffect(() => {
    fetchTransactions()

    // Realtime subscription — syncs across all devices instantly
    const channel: RealtimeChannel = supabase
      .channel(`transactions:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'transactions',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setTransactions((prev) => [payload.new as Transaction, ...prev])
          } else if (payload.eventType === 'UPDATE') {
            setTransactions((prev) =>
              prev.map((t) => (t.id === payload.new.id ? (payload.new as Transaction) : t))
            )
          } else if (payload.eventType === 'DELETE') {
            setTransactions((prev) => prev.filter((t) => t.id !== payload.old.id))
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [userId, fetchTransactions])

  return { transactions, loading, error, refetch: fetchTransactions }
}

// ── useWallets ────────────────────────────────

export function useWallets(userId: string) {
  const [wallets, setWallets] = useState<Wallet[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from('wallets')
        .select('*')
        .eq('user_id', userId)
        .order('is_default', { ascending: false })
      setWallets(data ?? [])
      setLoading(false)
    }
    fetch()

    const channel = supabase
      .channel(`wallets:${userId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'wallets', filter: `user_id=eq.${userId}`
      }, fetch)
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [userId])

  return { wallets, loading }
}

// ── useNotifications ──────────────────────────

export function useNotifications(userId: string) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const unreadCount = notifications.filter((n) => !n.is_read).length

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(30)
      setNotifications(data ?? [])
    }
    fetch()

    const channel = supabase
      .channel(`notifications:${userId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}`
      }, (payload) => {
        setNotifications((prev) => [payload.new as Notification, ...prev])
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [userId])

  const markRead = async (id: string) => {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id)
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)))
  }

  return { notifications, unreadCount, markRead }
}

// ── useMonthlySummary ─────────────────────────

export function useMonthlySummary(userId: string, month: Date = new Date()) {
  const [summary, setSummary] = useState<{
    totalIncome: number
    totalExpense: number
    netSavings: number
    topCategories: Array<{ category_name: string; category_icon: string; category_color: string; total: number; percent: number }>
  } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetch = async () => {
      const start = new Date(month.getFullYear(), month.getMonth(), 1).toISOString()

      const { data } = await supabase
        .from('v_monthly_category_totals')
        .select('*')
        .eq('user_id', userId)
        .gte('month', start)
        .lte('month', new Date(month.getFullYear(), month.getMonth() + 1, 0).toISOString())

      if (!data) { setLoading(false); return }

      const totalIncome  = data.filter((r) => r.type === 'income') .reduce((s, r) => s + Number(r.total), 0)
      const totalExpense = data.filter((r) => r.type === 'expense').reduce((s, r) => s + Number(r.total), 0)

      const topCategories = data
        .filter((r) => r.type === 'expense' && r.category_name)
        .sort((a, b) => Number(b.total) - Number(a.total))
        .slice(0, 5)
        .map((r) => ({
          category_name:  r.category_name!,
          category_icon:  r.category_icon ?? '💰',
          category_color: r.category_color ?? '#6366f1',
          total:   Number(r.total),
          percent: totalExpense > 0 ? Math.round((Number(r.total) / totalExpense) * 100) : 0,
        }))

      setSummary({ totalIncome, totalExpense, netSavings: totalIncome - totalExpense, topCategories })
      setLoading(false)
    }
    fetch()
  }, [userId, month])

  return { summary, loading }
}
