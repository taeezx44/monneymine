// hooks/useAiChat.ts
// ─────────────────────────────────────────────────────────────
// Streaming AI Financial Chat hook
// - ส่งข้อความ → อ่าน SSE stream → render token ทีละตัว
// - จัดการ conversation_id, message history, loading states
// ─────────────────────────────────────────────────────────────

'use client'

import { useState, useCallback, useRef } from 'react'
import { supabase } from '@/supabase/client'

export interface ChatMessage {
  id:       string
  role:     'user' | 'assistant'
  content:  string
  pending?: boolean    // true = กำลัง stream
  error?:   boolean
}

interface UseAiChatOptions {
  userId:        string
  contextMonth?: string   // YYYY-MM, default = current
}

interface UseAiChatReturn {
  messages:        ChatMessage[]
  conversationId:  string | null
  isStreaming:     boolean
  send:            (text: string) => Promise<void>
  reset:           () => void
  stopStream:      () => void
}

function makeId() {
  return Math.random().toString(36).slice(2, 10)
}

export function useAiChat({ userId, contextMonth }: UseAiChatOptions): UseAiChatReturn {
  const [messages,       setMessages]       = useState<ChatMessage[]>([])
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [isStreaming,    setIsStreaming]     = useState(false)

  const abortRef = useRef<AbortController | null>(null)

  const stopStream = useCallback(() => {
    abortRef.current?.abort()
    setIsStreaming(false)
    // Mark last pending message as complete
    setMessages(prev => prev.map(m => m.pending ? { ...m, pending: false } : m))
  }, [])

  const reset = useCallback(() => {
    abortRef.current?.abort()
    setMessages([])
    setConversationId(null)
    setIsStreaming(false)
  }, [])

  const send = useCallback(async (text: string) => {
    if (!text.trim() || isStreaming) return

    const userMsgId     = makeId()
    const assistantMsgId = makeId()

    // Append user message immediately
    setMessages(prev => [...prev, {
      id: userMsgId, role: 'user', content: text,
    }])

    // Append empty pending assistant message
    setMessages(prev => [...prev, {
      id: assistantMsgId, role: 'assistant', content: '', pending: true,
    }])

    setIsStreaming(true)
    abortRef.current = new AbortController()

    try {
      // Call Supabase Edge Function via fetch (SSE)
      const { data: { session } } = await supabase.auth.getSession()

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/ai-financial-chat`,
        {
          method: 'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${session?.access_token}`,
            'apikey':         process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          },
          body: JSON.stringify({
            user_id:         userId,
            conversation_id: conversationId,
            message:         text,
            context_month:   contextMonth,
          }),
          signal: abortRef.current.signal,
        }
      )

      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`)
      }

      // Read SSE stream
      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let   buffer  = ''
      let   accumulated = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (data === '[DONE]') continue

          try {
            const evt = JSON.parse(data)

            // conversation_id from server
            if (evt.type === 'conversation_id' && evt.id) {
              setConversationId(evt.id)
              continue
            }

            // Text delta
            if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
              accumulated += evt.delta.text ?? ''
              const snap = accumulated
              setMessages(prev => prev.map(m =>
                m.id === assistantMsgId ? { ...m, content: snap } : m
              ))
            }
          } catch { /* skip */ }
        }
      }

      // Mark complete
      setMessages(prev => prev.map(m =>
        m.id === assistantMsgId ? { ...m, pending: false } : m
      ))

    } catch (err) {
      if ((err as Error).name === 'AbortError') return

      setMessages(prev => prev.map(m =>
        m.id === assistantMsgId
          ? { ...m, content: 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง', pending: false, error: true }
          : m
      ))
    } finally {
      setIsStreaming(false)
    }
  }, [userId, conversationId, contextMonth, isStreaming])

  return { messages, conversationId, isStreaming, send, reset, stopStream }
}
