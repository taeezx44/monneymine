// hooks/useSlipVerify.ts
// ─────────────────────────────────────────────────────────────
// Upload slip → poll verify status via Supabase Realtime
// ─────────────────────────────────────────────────────────────

'use client'

import { useState, useCallback, useRef } from 'react'
import { supabase } from '@/supabase/client'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { Plan } from '@/lib/subscription'

export type VerifyState = 'idle' | 'uploading' | 'ocr' | 'verifying' | 'success' | 'failed'

type PlanKey = 'pro_monthly' | 'pro_annual' | 'business_monthly' | 'business_annual'

interface VerifyResult {
  plan:       Plan
  amount:     number
  ref_number: string | null
  bank:       string | null
}

export function useSlipVerify() {
  const [state,    setState]    = useState<VerifyState>('idle')
  const [progress, setProgress] = useState(0)
  const [result,   setResult]   = useState<VerifyResult | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)

  const reset = useCallback(() => {
    setState('idle'); setProgress(0); setResult(null); setErrorMsg(null)
    if (channelRef.current) { supabase.removeChannel(channelRef.current); channelRef.current = null }
  }, [])

  const upload = useCallback(async (file: File, planKey: PlanKey) => {
    reset()
    setState('uploading')
    setProgress(10)

    try {
      const form = new FormData()
      form.append('file', file)
      form.append('plan_key', planKey)

      const res  = await fetch('/api/subscription/slip', { method: 'POST', body: form })
      const json = await res.json()

      if (!res.ok) { setErrorMsg(json.error ?? 'Upload failed'); setState('failed'); return }

      const { slip_id } = json as { slip_id: string }
      setState('ocr'); setProgress(35)

      // Fake progress ticker
      let tick = 35
      const timer = setInterval(() => {
        tick = Math.min(tick + Math.random() * 6, 88)
        setProgress(Math.round(tick))

        // Transition states based on progress
        if (tick > 50)  setState('ocr')
        if (tick > 68)  setState('verifying')
      }, 700)

      // Subscribe to payment_slips row
      const channel = supabase
        .channel(`slip-verify-${slip_id}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'payment_slips', filter: `id=eq.${slip_id}` },
          (payload) => {
            const updated = payload.new as { status: string; amount: number; admin_note: string }
            clearInterval(timer)

            if (updated.status === 'verified') {
              setProgress(100)
              // Parse ref from admin_note  "OCR confidence: 0.94 | ref: REF20250122"
              const refMatch = updated.admin_note?.match(/ref:\s*(\S+)/)
              setResult({
                plan:       planKey.includes('pro') ? 'pro' : 'business',
                amount:     updated.amount,
                ref_number: refMatch?.[1] ?? null,
                bank:       null,   // fetched from notification if needed
              })
              setState('success')
              supabase.removeChannel(channel)

            } else if (updated.status === 'rejected') {
              setErrorMsg(updated.admin_note ?? 'การตรวจสอบล้มเหลว')
              setState('failed')
              supabase.removeChannel(channel)
            }
          }
        )
        .subscribe()

      channelRef.current = channel

      // 90 second timeout
      setTimeout(() => {
        if (channelRef.current) {
          clearInterval(timer)
          setErrorMsg('หมดเวลา — กรุณาลองใหม่')
          setState('failed')
          supabase.removeChannel(channel)
          channelRef.current = null
        }
      }, 90_000)

    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unknown error')
      setState('failed')
    }
  }, [reset])

  return { upload, state, progress, result, errorMsg, reset }
}
