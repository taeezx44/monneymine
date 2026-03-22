// hooks/useReceiptOcr.ts
// ─────────────────────────────────────────────────────────────
// Custom hook: upload receipt image → poll OCR status via realtime
// Usage:
//   const { upload, state, result, reset } = useReceiptOcr()
//   await upload(file, transactionId?)
// ─────────────────────────────────────────────────────────────

'use client'

import { useState, useCallback, useRef } from 'react'
import { supabase } from '@/supabase/client'
import type { OcrResult } from '@/supabase/functions/ocr-receipt'
import type { RealtimeChannel } from '@supabase/supabase-js'

export type OcrState =
  | 'idle'
  | 'uploading'
  | 'processing'   // Edge Function กำลังทำงาน
  | 'done'
  | 'failed'

interface UseReceiptOcrReturn {
  upload:       (file: File, transactionId?: string) => Promise<void>
  state:        OcrState
  progress:     number          // 0–100 (estimated)
  result:       OcrResult | null
  receiptId:    string | null
  errorMsg:     string | null
  reset:        () => void
}

export function useReceiptOcr(): UseReceiptOcrReturn {
  const [state,     setState]     = useState<OcrState>('idle')
  const [progress,  setProgress]  = useState(0)
  const [result,    setResult]    = useState<OcrResult | null>(null)
  const [receiptId, setReceiptId] = useState<string | null>(null)
  const [errorMsg,  setErrorMsg]  = useState<string | null>(null)

  const channelRef = useRef<RealtimeChannel | null>(null)

  const reset = useCallback(() => {
    setState('idle')
    setProgress(0)
    setResult(null)
    setReceiptId(null)
    setErrorMsg(null)
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
      channelRef.current = null
    }
  }, [])

  const upload = useCallback(async (file: File, transactionId?: string) => {
    reset()
    setState('uploading')
    setProgress(10)

    try {
      // 1. Upload + create receipt row
      const form = new FormData()
      form.append('file', file)
      if (transactionId) form.append('transaction_id', transactionId)

      const res = await fetch('/api/receipts/upload', { method: 'POST', body: form })
      const json = await res.json()

      if (!res.ok) {
        setErrorMsg(json.error ?? 'Upload failed')
        setState('failed')
        return
      }

      const { receipt_id } = json as { receipt_id: string }
      setReceiptId(receipt_id)
      setState('processing')
      setProgress(35)

      // 2. Animate progress while waiting (fake ticker until realtime fires)
      let tick = 35
      const ticker = setInterval(() => {
        tick = Math.min(tick + Math.random() * 5, 88)
        setProgress(Math.round(tick))
      }, 800)

      // 3. Subscribe to receipts row via Supabase Realtime
      const channel = supabase
        .channel(`receipt-ocr-${receipt_id}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'receipts', filter: `id=eq.${receipt_id}` },
          (payload) => {
            const updated = payload.new as {
              status: string
              ocr_amount: number | null
              ocr_merchant: string | null
              ocr_date: string | null
              ocr_items: any
              ocr_confidence: number | null
              ocr_raw_text: string | null
              error_message: string | null
            }

            if (updated.status === 'done') {
              clearInterval(ticker)
              setProgress(100)
              setResult({
                amount:        updated.ocr_amount,
                merchant:      updated.ocr_merchant,
                date:          updated.ocr_date,
                items:         updated.ocr_items,
                category_id:   null,   // will be on the transaction row
                category_name: null,
                confidence:    updated.ocr_confidence ?? 0.5,
                raw_text:      updated.ocr_raw_text ?? '',
                summary:       '',
              })
              setState('done')
              supabase.removeChannel(channel)

            } else if (updated.status === 'failed') {
              clearInterval(ticker)
              setErrorMsg(updated.error_message ?? 'OCR ล้มเหลว')
              setState('failed')
              supabase.removeChannel(channel)
            }
          }
        )
        .subscribe()

      channelRef.current = channel

      // 4. Timeout safety (60 sec)
      setTimeout(() => {
        if (channelRef.current) {
          clearInterval(ticker)
          setErrorMsg('OCR timeout — กรุณาลองใหม่')
          setState('failed')
          supabase.removeChannel(channel)
          channelRef.current = null
        }
      }, 60_000)

    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unknown error')
      setState('failed')
    }
  }, [reset])

  return { upload, state, progress, result, receiptId, errorMsg, reset }
}
