// hooks/useRealtimeSync.native.ts  (React Native / Expo)
// ─────────────────────────────────────────────────────────────
// Same realtime logic as web, adapted for React Native:
//  - AppState-aware (pause/resume on background/foreground)
//  - NetInfo-aware (reconnect when network comes back)
//  - expo-notifications integration for push fallback
// ─────────────────────────────────────────────────────────────

import { useEffect, useRef, useState, useCallback } from 'react'
import { AppState, type AppStateStatus } from 'react-native'
import NetInfo from '@react-native-community/netinfo'
import * as Notifications from 'expo-notifications'
import { supabase } from '@/supabase/client'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { useTransactionStore } from '@/store/transactionStore'
import { useNotificationStore } from '@/store/notificationStore'
import { useReceiptStore }      from '@/store/receiptStore'
import { useWalletStore }       from '@/store/walletStore'
import { useSubscriptionStore } from '@/store/subscriptionStore'

export type SyncStatus = 'connecting' | 'connected' | 'disconnected' | 'error'

export function useRealtimeSyncNative(userId: string | null) {
  const [status,  setStatus]  = useState<SyncStatus>('connecting')
  const [online,  setOnline]  = useState(true)
  const channelsRef = useRef<RealtimeChannel[]>([])
  const appStateRef = useRef<AppStateStatus>(AppState.currentState)

  const { addLocal, updateLocal, removeLocal }  = useTransactionStore()
  const { addNotification }                     = useNotificationStore()
  const { updateReceiptStatus }                 = useReceiptStore()
  const { updateWalletBalance }                 = useWalletStore()
  const { setSubscription }                     = useSubscriptionStore()

  const cleanup = useCallback(() => {
    channelsRef.current.forEach(ch => supabase.removeChannel(ch))
    channelsRef.current = []
  }, [])

  const subscribe = useCallback(() => {
    if (!userId || !online) return
    cleanup()
    setStatus('connecting')

    // 1. Transactions
    const txn = supabase
      .channel(`mobile:txn:${userId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'transactions',
        filter: `user_id=eq.${userId}`,
      }, ({ eventType, new: n, old: o }) => {
        if      (eventType === 'INSERT') addLocal(n as any)
        else if (eventType === 'UPDATE') updateLocal(n.id, n as any)
        else if (eventType === 'DELETE') removeLocal(o.id)
      })
      .subscribe(s => {
        if (s === 'SUBSCRIBED')    setStatus('connected')
        if (s === 'CHANNEL_ERROR') setStatus('error')
        if (s === 'CLOSED')        setStatus('disconnected')
      })

    // 2. Notifications — also fire local push notification
    const notif = supabase
      .channel(`mobile:notif:${userId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'notifications',
        filter: `user_id=eq.${userId}`,
      }, ({ new: n }) => {
        addNotification(n as any)
        // Show local push notification when app is foregrounded
        if (appStateRef.current === 'active') {
          Notifications.scheduleNotificationAsync({
            content: { title: n.title, body: n.body ?? undefined },
            trigger: null,
          })
        }
      })
      .subscribe()

    // 3. Receipt OCR status
    const receipt = supabase
      .channel(`mobile:receipt:${userId}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'receipts',
        filter: `user_id=eq.${userId}`,
      }, ({ new: r }) => {
        updateReceiptStatus(r.id, r.status, r as any)
        // Show push when OCR done/failed
        if (r.status === 'done' || r.status === 'failed') {
          Notifications.scheduleNotificationAsync({
            content: {
              title: r.status === 'done' ? '✓ สแกนสลิปสำเร็จ' : '✕ สแกนสลิปล้มเหลว',
              body:  r.status === 'done'
                ? `฿${r.ocr_amount?.toLocaleString() ?? '?'} — ${r.ocr_merchant ?? ''}`
                : r.error_message ?? 'กรุณาลองอีกครั้ง',
            },
            trigger: null,
          })
        }
      })
      .subscribe()

    // 4. Wallet balance
    const wallet = supabase
      .channel(`mobile:wallet:${userId}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'wallets',
        filter: `user_id=eq.${userId}`,
      }, ({ new: w }) => updateWalletBalance(w.id, w.balance))
      .subscribe()

    // 5. Subscription status — notify user on upgrade
    const sub = supabase
      .channel(`mobile:sub:${userId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'subscriptions',
        filter: `user_id=eq.${userId}`,
      }, ({ new: s }) => {
        if (!s) return
        setSubscription(s as any)
        if (s.status === 'active') {
          Notifications.scheduleNotificationAsync({
            content: {
              title: '🎉 อัปเกรดสำเร็จ!',
              body:  `คุณได้เปิดใช้งาน ${s.plan.toUpperCase()} Plan แล้ว`,
            },
            trigger: null,
          })
        }
      })
      .subscribe()

    channelsRef.current = [txn, notif, receipt, wallet, sub]
  }, [userId, online, cleanup, addLocal, updateLocal, removeLocal,
      addNotification, updateReceiptStatus, updateWalletBalance, setSubscription])

  // AppState: pause channels when backgrounded, resume when foregrounded
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      const prev = appStateRef.current
      appStateRef.current = next
      if (prev.match(/inactive|background/) && next === 'active') {
        subscribe()   // re-subscribe when app comes to foreground
      } else if (next.match(/inactive|background/)) {
        cleanup()     // pause channels in background to save battery
        setStatus('disconnected')
      }
    })
    return () => sub.remove()
  }, [subscribe, cleanup])

  // NetInfo: reconnect when network comes back
  useEffect(() => {
    const unsub = NetInfo.addEventListener(state => {
      const isOnline = state.isConnected ?? false
      setOnline(isOnline)
      if (isOnline && status === 'disconnected') subscribe()
      if (!isOnline) { cleanup(); setStatus('disconnected') }
    })
    return () => unsub()
  }, [status, subscribe, cleanup])

  // Initial subscribe
  useEffect(() => {
    subscribe()
    return cleanup
  }, [subscribe, cleanup])

  return { status, connected: status === 'connected', reconnect: subscribe }
}
