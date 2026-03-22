// supabase/functions/ai-financial-chat/index.ts
// ─────────────────────────────────────────────────────────────
// Streaming AI Financial Assistant
//   - ดึง financial context (summary เดือนปัจจุบัน) ของ user
//   - ส่งให้ Claude พร้อม system prompt เป็น financial advisor ภาษาไทย
//   - Stream response กลับแบบ SSE (Server-Sent Events)
//   - บันทึก conversation ใน ai_messages table
// ─────────────────────────────────────────────────────────────

import { serve }         from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient }  from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── Types ───────────────────────────────────────────────────

interface ChatRequest {
  user_id:         string
  conversation_id: string | null   // null = new conversation
  message:         string
  context_month?:  string          // YYYY-MM (default = current month)
}

interface FinancialContext {
  month:         string
  total_income:  number
  total_expense: number
  net_savings:   number
  top_categories: Array<{ name: string; amount: number; percent: number; over_budget: boolean }>
  recent_txns:   Array<{ merchant: string; amount: number; type: string; category: string; date: string }>
  budget_alerts: Array<{ category: string; spent: number; budget: number; percent: number }>
}

// ── Build financial context from DB ────────────────────────

async function buildFinancialContext(
  userId: string,
  month: string,
  supabase: ReturnType<typeof createClient>
): Promise<FinancialContext> {
  const monthStart = `${month}-01`
  const [y, m] = month.split('-').map(Number)
  const monthEnd = new Date(y, m, 0).toISOString().split('T')[0]

  // Monthly category totals
  const { data: catTotals } = await supabase
    .from('v_monthly_category_totals')
    .select('*')
    .eq('user_id', userId)
    .gte('month', monthStart)
    .lte('month', monthEnd + 'T23:59:59Z')

  const income  = (catTotals ?? []).filter(r => r.type === 'income') .reduce((s, r) => s + Number(r.total), 0)
  const expense = (catTotals ?? []).filter(r => r.type === 'expense').reduce((s, r) => s + Number(r.total), 0)

  const topCats = (catTotals ?? [])
    .filter(r => r.type === 'expense' && r.category_name)
    .sort((a, b) => Number(b.total) - Number(a.total))
    .slice(0, 6)
    .map(r => ({
      name:        r.category_name!,
      amount:      Number(r.total),
      percent:     expense > 0 ? Math.round((Number(r.total) / expense) * 100) : 0,
      over_budget: false,   // enriched below
    }))

  // Budget comparison
  const { data: budgets } = await supabase
    .from('budgets')
    .select('*, category:categories(name)')
    .eq('user_id', userId)
    .eq('period', 'monthly')

  const budgetAlerts: FinancialContext['budget_alerts'] = []
  const catBudgetMap: Record<string, number> = {}
  ;(budgets ?? []).forEach(b => {
    if (b.category?.name) catBudgetMap[b.category.name] = Number(b.amount)
  })

  topCats.forEach(c => {
    const bud = catBudgetMap[c.name]
    if (bud && c.amount > bud) {
      c.over_budget = true
      budgetAlerts.push({ category: c.name, spent: c.amount, budget: bud, percent: Math.round((c.amount / bud) * 100) })
    }
  })

  // Recent transactions (last 10)
  const { data: recentTxns } = await supabase
    .from('transactions')
    .select('amount, type, merchant, transacted_at, category:categories(name)')
    .eq('user_id', userId)
    .gte('transacted_at', monthStart)
    .order('transacted_at', { ascending: false })
    .limit(10)

  return {
    month,
    total_income:   income,
    total_expense:  expense,
    net_savings:    income - expense,
    top_categories: topCats,
    recent_txns:    (recentTxns ?? []).map(t => ({
      merchant: t.merchant ?? 'ไม่ระบุ',
      amount:   Number(t.amount),
      type:     t.type,
      category: (t.category as any)?.name ?? 'ไม่ระบุ',
      date:     t.transacted_at.split('T')[0],
    })),
    budget_alerts: budgetAlerts,
  }
}

// ── Build system prompt ─────────────────────────────────────

function buildSystemPrompt(ctx: FinancialContext): string {
  const thbFmt = (n: number) => `฿${n.toLocaleString('th-TH', { maximumFractionDigits: 0 })}`

  return `คุณคือ MoneyMind AI — ผู้ช่วยการเงินส่วนตัวที่เชี่ยวชาญ ตอบเป็นภาษาไทยเสมอ เว้นแต่ user พูดภาษาอื่น

บุคลิก: ฉลาด เป็นมิตร ตรงไปตรงมา ให้คำแนะนำที่ actionable ไม่พูดวนเวียน

ข้อมูลการเงินของ user เดือน ${ctx.month}:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
รายรับ:  ${thbFmt(ctx.total_income)}
รายจ่าย: ${thbFmt(ctx.total_expense)}
ออม:      ${thbFmt(ctx.net_savings)} (${ctx.total_income > 0 ? Math.round((ctx.net_savings / ctx.total_income) * 100) : 0}%)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
หมวดจ่ายสูงสุด:
${ctx.top_categories.map(c => `  ${c.name}: ${thbFmt(c.amount)} (${c.percent}%)${c.over_budget ? ' ⚠️ เกินงบ' : ''}`).join('\n')}

${ctx.budget_alerts.length > 0 ? `⚠️ เกินงบประมาณ:\n${ctx.budget_alerts.map(a => `  ${a.category}: ใช้ ${a.percent}% (${thbFmt(a.spent)} / ${thbFmt(a.budget)})`).join('\n')}` : ''}

รายการล่าสุด:
${ctx.recent_txns.slice(0, 5).map(t => `  ${t.type === 'income' ? '+' : '-'}${thbFmt(t.amount)} — ${t.merchant} (${t.category}) ${t.date}`).join('\n')}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

กฎการตอบ:
- ใช้ตัวเลขจริงจาก context ด้านบนในการวิเคราะห์
- ถ้าถามเรื่องการลดค่าใช้จ่าย → ระบุหมวดที่เกินงบก่อน
- ถ้าถามการออม → คำนวณจาก net_savings จริง
- ให้คำแนะนำเป็นข้อ bullet ชัดเจน actionable
- ไม่เกิน 3 paragraph ต่อการตอบ เว้นแต่ user ขอรายละเอียด
- ใช้ emoji น้อยๆ เสริมความชัดเจน ไม่ใช้มากเกินไป`
}

// ── Main handler ────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const body: ChatRequest = await req.json()
  const { user_id, conversation_id, message, context_month } = body

  if (!user_id || !message?.trim()) {
    return new Response(JSON.stringify({ error: 'user_id and message required' }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')!
  const month = context_month ?? new Date().toISOString().slice(0, 7)

  // 1. Get or create conversation
  let convId = conversation_id
  if (!convId) {
    const { data: conv } = await supabase
      .from('ai_conversations')
      .insert({ user_id, title: message.slice(0, 60) })
      .select('id')
      .single()
    convId = conv?.id ?? null
  }

  // 2. Load conversation history (last 10 messages)
  const { data: history } = await supabase
    .from('ai_messages')
    .select('role, content')
    .eq('conversation_id', convId)
    .order('created_at', { ascending: true })
    .limit(10)

  // 3. Build financial context
  const ctx = await buildFinancialContext(user_id, month, supabase)

  // 4. Save user message
  if (convId) {
    await supabase.from('ai_messages').insert({
      conversation_id: convId,
      role:    'user',
      content: message,
      context_snapshot: ctx,
    })
  }

  // 5. Call Claude with streaming
  const messages = [
    ...(history ?? []).map(h => ({ role: h.role, content: h.content })),
    { role: 'user', content: message },
  ]

  const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         anthropicKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system:     buildSystemPrompt(ctx),
      stream:     true,
      messages,
    }),
  })

  if (!claudeRes.ok || !claudeRes.body) {
    const err = await claudeRes.text()
    return new Response(JSON.stringify({ error: err }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  // 6. Pipe Claude SSE → client SSE, collect full text for DB save
  let fullText = ''

  const { readable, writable } = new TransformStream()
  const writer = writable.getWriter()
  const encoder = new TextEncoder()

  // Async: read Claude stream → forward to client + accumulate
  ;(async () => {
    try {
      const reader  = claudeRes.body!.getReader()
      const decoder = new TextDecoder()
      let   buffer  = ''

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
            // Forward raw SSE event to client
            await writer.write(encoder.encode(`data: ${data}\n\n`))

            // Accumulate text delta
            if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
              fullText += evt.delta.text ?? ''
            }
          } catch { /* skip malformed */ }
        }
      }

      // Save complete assistant message to DB
      if (convId && fullText) {
        await supabase.from('ai_messages').insert({
          conversation_id: convId,
          role:    'assistant',
          content: fullText,
        })
      }

      // Send conversation_id so client can persist it
      await writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'conversation_id', id: convId })}\n\n`))
      await writer.write(encoder.encode('data: [DONE]\n\n'))
    } finally {
      writer.close()
    }
  })()

  return new Response(readable, {
    headers: {
      ...CORS,
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
    },
  })
})
