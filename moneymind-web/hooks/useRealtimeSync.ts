// hooks/useRealtimeSync.ts  (Next.js / React)
// ─────────────────────────────────────────────────────────────
// Central Realtime hook — subscribes to all 5 data streams:
//   transactions · notifications · receipts · wallets · subscriptions
//
// Usage:
//   const { connected } = useRealtimeSync(userId)
//   // แต่ละ slice ใช้ผ่าน Zustand store ที่ subscribe ไว้แล้ว
// ─────────────────────────────────────────────────────────────

'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase }          from '@/supabase/client'
import type { RealtimeChannel } from '@supabase/supabase-js'

// ── Zustand stores (ใช้ร่วมกันทั้ง web + mobile) ──────────────
import { useTransactionStore } from '@/store/transactionStore'
import { useNotificationStore } from '@/store/notificationStore'
import { useReceiptStore }      from '@/store/receiptStore'
import { useWalletStore }       from '@/store/walletStore'
import { useSubscriptionStore } from '@/store/subscriptionStore'

export type SyncStatus = 'connecting' | 'connected' | 'disconnected' | 'error'

interface UseRealtimeSyncReturn {
  status:    SyncStatus
  connected: boolean
  reconnect: () => void
}

export function useRealtimeSync(userId: string | null): UseRealtimeSyncReturn {
  const [status, setStatus] = useState<SyncStatus>('connecting')
  const channelsRef = useRef<RealtimeChannel[]>([])

  // Store actions
  const { addLocal, updateLocal, removeLocal }        = useTransactionStore()
  const { addNotification }                           = useNotificationStore()
  const { updateReceiptStatus }                       = useReceiptStore()
  const { updateWalletBalance }                       = useWalletStore()
  const { setSubscription }                           = useSubscriptionStore()

  const subscribe = useCallback(() => {
    if (!userId) return

    // Clean up existing channels first
    channelsRef.current.forEach(ch => supabase.removeChannel(ch))
    channelsRef.current = []
    setStatus('connecting')

    // ── 1. Transactions ─────────────────────────────────────
    const txnChannel = supabase
      .channel(`rt:txn:${userId}`)
      .on('postgres_changes', {
        event:  '*',
        schema: 'public',
        table:  'transactions',
        filter: `user_id=eq.${userId}`,
      }, ({ eventType, new: newRow, old: oldRow }) => {
        if      (eventType === 'INSERT') addLocal(newRow as any)
        else if (eventType === 'UPDATE') updateLocal(newRow.id, newRow as any)
        else if (eventType === 'DELETE') removeLocal(oldRow.id)
      })
      .subscribe((s) => {
        if (s === 'SUBSCRIBED')   setStatus('connected')
        if (s === 'CHANNEL_ERROR') setStatus('error')
        if (s === 'CLOSED')        setStatus('disconnected')
      })

    // ── 2. Notifications ─────────────────────────────────────
    const notifChannel = supabase
      .channel(`rt:notif:${userId}`)
      .on('postgres_changes', {
        event:  'INSERT',
        schema: 'public',
        table:  'notifications',
        filter: `user_id=eq.${userId}`,
      }, ({ new: notif }) => {
        addNotification(notif as any)
      })
      .subscribe()

    // ── 3. Receipt OCR status ─────────────────────────────────
    const receiptChannel = supabase
      .channel(`rt:receipt:${userId}`)
      .on('postgres_changes', {
        event:  'UPDATE',
        schema: 'public',
        table:  'receipts',
        filter: `user_id=eq.${userId}`,
      }, ({ new: receipt }) => {
        updateReceiptStatus(receipt.id, receipt.status, receipt as any)
      })
      .subscribe()

    // ── 4. Wallet balance ─────────────────────────────────────
    const walletChannel = supabase
      .channel(`rt:wallet:${userId}`)
      .on('postgres_changes', {
        event:  'UPDATE',
        schema: 'public',
        table:  'wallets',
        filter: `user_id=eq.${userId}`,
      }, ({ new: wallet }) => {
        updateWalletBalance(wallet.id, wallet.balance)
      })
      .subscribe()

    // ── 5. Subscription status ────────────────────────────────
    const subChannel = supabase
      .channel(`rt:sub:${userId}`)
      .on('postgres_changes', {
        event:  '*',
        schema: 'public',
        table:  'subscriptions',
        filter: `user_id=eq.${userId}`,
      }, ({ new: sub }) => {
        if (sub) setSubscription(sub as any)
      })
      .subscribe()

    channelsRef.current = [
      txnChannel, notifChannel, receiptChannel, walletChannel, subChannel,
    ]
  }, [userId, addLocal, updateLocal, removeLocal, addNotification,
      updateReceiptStatus, updateWalletBalance, setSubscription])

  useEffect(() => {
    subscribe()
    return () => {
      channelsRef.current.forEach(ch => supabase.removeChannel(ch))
      channelsRef.current = []
    }
  }, [subscribe])

  return {
    status,
    connected: status === 'connected',
    reconnect: subscribe,
  }
}
