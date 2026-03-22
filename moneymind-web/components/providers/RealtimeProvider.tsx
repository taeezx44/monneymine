'use client'

// components/providers/RealtimeProvider.tsx
// ─────────────────────────────────────────────────────────────
// App-level provider that:
//  1. Bootstraps all stores on mount (initial fetch)
//  2. Subscribes to all realtime channels
//  3. Shows a subtle connection status indicator
// Wrap this inside the auth-protected layout
// ─────────────────────────────────────────────────────────────

import { useEffect, useRef }    from 'react'
import { useSession }           from 'next-auth/react'
import { useRealtimeSync }      from '@/hooks/useRealtimeSync'
import { useTransactionStore }  from '@/store/transactionStore'
import { useNotificationStore } from '@/store/notificationStore'
import { useReceiptStore }      from '@/store/receiptStore'
import { useWalletStore }       from '@/store/walletStore'
import { useSubscriptionStore } from '@/store/subscriptionStore'

// ── Connection status dot ─────────────────────────────────────
function StatusDot({ status }: { status: string }) {
  const color: Record<string, string> = {
    connected:    '#84cc16',
    connecting:   '#fbbf24',
    disconnected: '#f87171',
    error:        '#f87171',
  }
  return (
    <>
      <div
        className="rt-status-dot"
        title={`Realtime: ${status}`}
        style={{ background: color[status] ?? '#555' }}
      />
      <style jsx>{`
        .rt-status-dot {
          position: fixed;
          bottom: 16px; right: 16px;
          width: 8px; height: 8px;
          border-radius: 50%;
          opacity: 0.6;
          z-index: 9999;
          transition: background 0.4s;
          pointer-events: none;
        }
        @keyframes pulse {
          0%, 100% { opacity: 0.6; }
          50%       { opacity: 1; }
        }
        .rt-status-dot[data-connecting='true'] {
          animation: pulse 1.2s ease-in-out infinite;
        }
      `}</style>
    </>
  )
}

// ── Provider ──────────────────────────────────────────────────
export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession()
  const userId = session?.user?.id ?? null
  const bootstrapped = useRef(false)

  const { status, reconnect } = useRealtimeSync(userId)

  const fetchTransactions  = useTransactionStore(s => s.fetchRecent)
  const fetchNotifications = useNotificationStore(s => s.fetch)
  const fetchReceipts      = useReceiptStore(s => s.fetch)
  const fetchWallets       = useWalletStore(s => s.fetch)
  const fetchSubscription  = useSubscriptionStore(s => s.fetch)

  // Bootstrap all stores on first login
  useEffect(() => {
    if (!userId || bootstrapped.current) return
    bootstrapped.current = true

    // Parallel initial fetches
    Promise.all([
      fetchTransactions(userId, 50),
      fetchNotifications(userId),
      fetchReceipts(userId),
      fetchWallets(userId),
      fetchSubscription(userId),
    ]).catch(console.error)
  }, [userId])

  // Auto-reconnect when tab becomes visible
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && status === 'disconnected') {
        reconnect()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [status, reconnect])

  return (
    <>
      {children}
      {userId && <StatusDot status={status} data-connecting={status === 'connecting'} />}
    </>
  )
}
