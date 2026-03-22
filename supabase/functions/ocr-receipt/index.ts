// supabase/functions/ocr-receipt/index.ts
// ─────────────────────────────────────────────────────────────
// Edge Function: OCR สลิป/ใบเสร็จ
//   1. รับ image_base64 หรือ image_url
//   2. ส่งให้ Google Vision API → ได้ raw text
//   3. ส่ง raw text ให้ Claude → parse amount / merchant / date / category
//   4. update receipts table + trigger ai categorize
// ─────────────────────────────────────────────────────────────

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── Types ──────────────────────────────────────────────────

interface OcrRequest {
  receipt_id:   string       // UUID ใน receipts table
  image_url?:   string       // Supabase Storage URL
  image_base64?: string      // base64 string (from mobile camera)
  mime_type?:   string       // image/jpeg | image/png
  user_id:      string
}

export interface OcrResult {
  amount:      number | null
  merchant:    string | null
  date:        string | null          // YYYY-MM-DD
  items:       LineItem[] | null
  category_id: string | null
  category_name: string | null
  confidence:  number                 // 0–1
  raw_text:    string
  summary:     string                 // Thai summary for UI
}

interface LineItem {
  name:  string
  price: number
  qty?:  number
}

// ── Google Vision OCR ──────────────────────────────────────

async function runGoogleVisionOcr(
  imageBase64: string,
  mimeType = 'image/jpeg'
): Promise<string> {
  const apiKey = Deno.env.get('GOOGLE_CLOUD_API_KEY')
  if (!apiKey) throw new Error('GOOGLE_CLOUD_API_KEY not set')

  const body = {
    requests: [{
      image:    { content: imageBase64 },
      features: [{ type: 'DOCUMENT_TEXT_DETECTION', maxResults: 1 }],
      imageContext: { languageHints: ['th', 'en'] },   // Thai + English
    }],
  }

  const res = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  )

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Google Vision error: ${err}`)
  }

  const data = await res.json()
  const annotation = data.responses?.[0]?.fullTextAnnotation
  return annotation?.text ?? ''
}

// ── Claude: Parse OCR text → structured data ──────────────

async function parseWithClaude(
  rawText: string,
  userId: string,
  supabase: ReturnType<typeof createClient>
): Promise<OcrResult> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set')

  // ดึง categories ของ user (+ system defaults) เพื่อให้ Claude เลือกได้
  const { data: categories } = await supabase
    .from('categories')
    .select('id, name, name_th, type')
    .or(`user_id.eq.${userId},user_id.is.null`)
    .eq('type', 'expense')

  const catList = (categories ?? [])
    .map(c => `${c.id}|${c.name}|${c.name_th ?? ''}`)
    .join('\n')

  const systemPrompt = `You are a Thai receipt/slip parser. Extract structured financial data from OCR text.
Always respond with ONLY valid JSON, no markdown, no explanation.

Available expense categories (id|english|thai):
${catList}

Rules:
- amount: total amount paid (number, no commas/currency symbols). If multiple totals, use the final/grand total.
- merchant: shop/restaurant/service name in Thai or English as shown on receipt
- date: YYYY-MM-DD format. If year missing assume current year 2025. Thai Buddhist year (2568) → subtract 543.
- items: array of {name, price, qty} line items if clearly listed, else null
- category_id: pick the best matching category UUID from the list above, or null if unclear
- category_name: the English name of matched category
- confidence: 0.0-1.0 how confident you are in the extraction
- summary: 1-sentence Thai description e.g. "ใบเสร็จจาก 7-Eleven มูลค่า ฿127"
`

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: `Parse this receipt OCR text:\n\n${rawText}`,
      }],
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Claude API error: ${err}`)
  }

  const data = await res.json()
  const text = data.content?.[0]?.text ?? '{}'

  try {
    const parsed = JSON.parse(text)
    return {
      amount:        typeof parsed.amount === 'number' ? parsed.amount : null,
      merchant:      parsed.merchant   ?? null,
      date:          parsed.date       ?? null,
      items:         Array.isArray(parsed.items) ? parsed.items : null,
      category_id:   parsed.category_id   ?? null,
      category_name: parsed.category_name ?? null,
      confidence:    typeof parsed.confidence === 'number' ? Math.min(1, Math.max(0, parsed.confidence)) : 0.5,
      raw_text:      rawText,
      summary:       parsed.summary ?? 'OCR สำเร็จ',
    }
  } catch {
    // Fallback: try regex amount extraction if JSON parse fails
    const amountMatch = rawText.match(/(?:total|รวม|ยอดรวม|ยอด)\s*:?\s*([0-9,]+\.?[0-9]*)/i)
    return {
      amount:      amountMatch ? parseFloat(amountMatch[1].replace(/,/g, '')) : null,
      merchant:    null,
      date:        null,
      items:       null,
      category_id: null,
      category_name: null,
      confidence:  0.3,
      raw_text:    rawText,
      summary:     'OCR สำเร็จ (parse บางส่วน)',
    }
  }
}

// ── Fetch image from Supabase Storage → base64 ────────────

async function urlToBase64(url: string): Promise<{ base64: string; mimeType: string }> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`)
  const buffer = await res.arrayBuffer()
  const bytes   = new Uint8Array(buffer)
  let binary = ''
  bytes.forEach(b => binary += String.fromCharCode(b))
  const base64 = btoa(binary)
  const mimeType = res.headers.get('content-type') ?? 'image/jpeg'
  return { base64, mimeType }
}

// ── Main handler ───────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const body: OcrRequest = await req.json()
    const { receipt_id, image_url, image_base64, mime_type = 'image/jpeg', user_id } = body

    if (!receipt_id || !user_id) {
      return new Response(JSON.stringify({ error: 'receipt_id and user_id are required' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // 1. Mark receipt as processing
    await supabase
      .from('receipts')
      .update({ status: 'processing' })
      .eq('id', receipt_id)

    // 2. Get image as base64
    let imgBase64 = image_base64 ?? ''
    let imgMime   = mime_type
    if (!imgBase64 && image_url) {
      const fetched = await urlToBase64(image_url)
      imgBase64 = fetched.base64
      imgMime   = fetched.mimeType
    }
    if (!imgBase64) throw new Error('No image provided')

    // 3. Google Vision OCR
    const rawText = await runGoogleVisionOcr(imgBase64, imgMime)

    if (!rawText.trim()) {
      await supabase.from('receipts').update({
        status: 'failed',
        error_message: 'ไม่พบข้อความในรูปภาพ — กรุณาถ่ายรูปใหม่ให้ชัดขึ้น',
        processed_at: new Date().toISOString(),
      }).eq('id', receipt_id)

      return new Response(JSON.stringify({ error: 'no_text_detected' }), {
        status: 422, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // 4. Claude parse
    const result = await parseWithClaude(rawText, user_id, supabase)

    // 5. Update receipts table
    await supabase.from('receipts').update({
      status:          'done',
      ocr_raw_text:    result.raw_text,
      ocr_amount:      result.amount,
      ocr_merchant:    result.merchant,
      ocr_date:        result.date,
      ocr_items:       result.items,
      ocr_confidence:  result.confidence,
      processed_at:    new Date().toISOString(),
    }).eq('id', receipt_id)

    // 6. If confidence high enough + receipt linked to a transaction → auto-apply category
    if (result.confidence >= 0.6 && result.category_id) {
      const { data: receipt } = await supabase
        .from('receipts')
        .select('transaction_id')
        .eq('id', receipt_id)
        .single()

      if (receipt?.transaction_id) {
        await supabase.from('transactions').update({
          ai_category_id:         result.category_id,
          ai_confidence:          result.confidence,
          ai_merchant_normalized: result.merchant,
          ...(result.merchant ? { merchant: result.merchant } : {}),
          ...(result.amount   ? { amount:   result.amount   } : {}),
        }).eq('id', receipt.transaction_id)
      }
    }

    // 7. Create notification
    await supabase.from('notifications').insert({
      user_id,
      type:  'receipt_done',
      title: 'สแกนสลิปสำเร็จ',
      body:  result.summary,
      data:  { receipt_id, amount: result.amount, merchant: result.merchant },
    })

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[ocr-receipt]', msg)
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
