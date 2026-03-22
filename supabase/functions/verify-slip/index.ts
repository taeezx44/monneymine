// supabase/functions/verify-slip/index.ts
// ─────────────────────────────────────────────────────────────
// Edge Function: ตรวจสอบสลิปการโอนเงิน + activate subscription
//
// Flow:
//  1. รับ slip image (base64 หรือ storage URL)
//  2. OCR ด้วย Google Vision → ดึง amount / ref / bank / datetime
//  3. Claude ยืนยันความถูกต้อง + เทียบ amount กับ plan ที่เลือก
//  4. ถ้าผ่าน → create/extend subscription + unlock features
//  5. แจ้ง notification
// ─────────────────────────────────────────────────────────────

import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Expected amounts per plan (THB)
const PLAN_PRICES = {
  pro_monthly:      149,
  pro_annual:       1490,
  business_monthly: 349,
  business_annual:  3490,
}

type PlanKey = keyof typeof PLAN_PRICES

interface VerifyRequest {
  user_id:       string
  slip_id:       string       // payment_slips.id
  plan_key:      PlanKey      // 'pro_monthly' | 'pro_annual' | etc.
  image_url?:    string
  image_base64?: string
}

interface SlipData {
  amount:          number | null
  bank:            string | null
  ref_number:      string | null
  transfer_date:   string | null    // ISO datetime
  sender_account?: string | null
  receiver_account?:string | null
  confidence:      number           // 0-1
  verified:        boolean
  reject_reason?:  string
}

// ── Google Vision OCR ─────────────────────────────────────────

async function ocrSlip(imageBase64: string): Promise<string> {
  const apiKey = Deno.env.get('GOOGLE_CLOUD_API_KEY')
  if (!apiKey) throw new Error('GOOGLE_CLOUD_API_KEY not set')

  const res = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [{
          image:    { content: imageBase64 },
          features: [{ type: 'DOCUMENT_TEXT_DETECTION', maxResults: 1 }],
          imageContext: { languageHints: ['th', 'en'] },
        }],
      }),
    }
  )
  const data = await res.json()
  return data.responses?.[0]?.fullTextAnnotation?.text ?? ''
}

// ── Claude: parse + verify slip ───────────────────────────────

async function verifyWithClaude(rawText: string, expectedAmount: number): Promise<SlipData> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')!

  const systemPrompt = `You are a Thai bank transfer slip verifier. Parse OCR text from a Thai PromptPay/bank transfer slip.
Respond ONLY with valid JSON, no markdown.

Required fields:
- amount: numeric total transferred (number or null)
- bank: bank name / PromptPay (string or null)
- ref_number: reference/transaction ID (string or null)
- transfer_date: ISO 8601 datetime (string or null)
- sender_account: masked account (string or null)
- receiver_account: masked account (string or null)
- confidence: 0.0-1.0 how confident the OCR data is correct
- verified: true if amount matches expected AND slip looks genuine
- reject_reason: reason string if verified=false, else null

Expected amount to match: ฿${expectedAmount}
Consider verified=true ONLY if amount matches within ฿1 tolerance.
Watch for photoshopped slips: check for inconsistent fonts, missing bank logo references, or impossible dates.`

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key':    apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 512,
      system:     systemPrompt,
      messages:   [{ role: 'user', content: `Parse this slip OCR:\n\n${rawText}` }],
    }),
  })

  const data = await res.json()
  const text = data.content?.[0]?.text ?? '{}'

  try {
    return JSON.parse(text) as SlipData
  } catch {
    return {
      amount: null, bank: null, ref_number: null,
      transfer_date: null, confidence: 0.2,
      verified: false, reject_reason: 'ไม่สามารถอ่านข้อมูลสลิปได้',
    }
  }
}

// ── Activate subscription ─────────────────────────────────────

async function activateSubscription(
  userId: string,
  planKey: PlanKey,
  supabase: ReturnType<typeof createClient>
): Promise<void> {
  const isAnnual  = planKey.includes('annual')
  const planName  = planKey.includes('pro') ? 'pro' : 'business'
  const now       = new Date()
  const periodEnd = new Date(now)

  if (isAnnual) {
    periodEnd.setFullYear(periodEnd.getFullYear() + 1)
  } else {
    periodEnd.setMonth(periodEnd.getMonth() + 1)
  }

  // Upsert subscription (cancel old → create new)
  await supabase
    .from('subscriptions')
    .update({ status: 'cancelled', cancelled_at: now.toISOString() })
    .eq('user_id', userId)
    .eq('status', 'active')

  await supabase.from('subscriptions').insert({
    user_id:              userId,
    plan:                 planName,
    status:               'active',
    current_period_start: now.toISOString(),
    current_period_end:   periodEnd.toISOString(),
  })

  // Update users.plan
  await supabase.from('users').update({ plan: planName }).eq('id', userId)
}

// ── Main handler ──────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const body: VerifyRequest = await req.json()
    const { user_id, slip_id, plan_key, image_url, image_base64 } = body

    if (!user_id || !slip_id || !plan_key) {
      return new Response(JSON.stringify({ error: 'user_id, slip_id, plan_key required' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const supabase     = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )
    const expectedAmt  = PLAN_PRICES[plan_key]
    if (!expectedAmt) {
      return new Response(JSON.stringify({ error: `Unknown plan_key: ${plan_key}` }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // 1. Mark slip as processing
    await supabase.from('payment_slips')
      .update({ status: 'pending' })
      .eq('id', slip_id)

    // 2. Get image
    let imgBase64 = image_base64 ?? ''
    if (!imgBase64 && image_url) {
      const imgRes = await fetch(image_url)
      const buf    = await imgRes.arrayBuffer()
      const bytes  = new Uint8Array(buf)
      let   bin    = ''
      bytes.forEach(b => bin += String.fromCharCode(b))
      imgBase64 = btoa(bin)
    }
    if (!imgBase64) {
      return new Response(JSON.stringify({ error: 'No image provided' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // 3. OCR
    const rawText = await ocrSlip(imgBase64)
    if (!rawText.trim()) {
      await supabase.from('payment_slips').update({
        status: 'rejected', admin_note: 'ไม่พบข้อความในรูปภาพ',
      }).eq('id', slip_id)

      return new Response(JSON.stringify({ verified: false, reason: 'ไม่พบข้อความในสลิป' }), {
        status: 422, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // 4. Claude verify
    const result = await verifyWithClaude(rawText, expectedAmt)

    if (result.verified) {
      // 5a. Activate subscription
      await activateSubscription(user_id, plan_key, supabase)

      // Update slip status
      await supabase.from('payment_slips').update({
        status:      'verified',
        amount:       result.amount,
        verified_at:  new Date().toISOString(),
        admin_note:   `OCR confidence: ${result.confidence.toFixed(2)} | ref: ${result.ref_number ?? 'N/A'}`,
      }).eq('id', slip_id)

      // Notification
      const planLabel = plan_key.includes('pro') ? 'Pro' : 'Business'
      const period    = plan_key.includes('annual') ? 'รายปี' : 'รายเดือน'
      await supabase.from('notifications').insert({
        user_id,
        type:  'payment_verified',
        title: `ยืนยันการชำระเงินสำเร็จ 🎉`,
        body:  `คุณได้อัปเกรดเป็น ${planLabel} ${period} เรียบร้อยแล้ว`,
        data:  { plan: plan_key, amount: result.amount, ref: result.ref_number },
      })

      return new Response(JSON.stringify({
        verified:   true,
        plan:       plan_key.includes('pro') ? 'pro' : 'business',
        amount:     result.amount,
        ref_number: result.ref_number,
        bank:       result.bank,
      }), {
        status: 200,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })

    } else {
      // 5b. Reject
      await supabase.from('payment_slips').update({
        status:     'rejected',
        admin_note: result.reject_reason ?? 'การตรวจสอบล้มเหลว',
      }).eq('id', slip_id)

      await supabase.from('notifications').insert({
        user_id,
        type:  'payment_verified',
        title: 'ไม่สามารถยืนยันการชำระเงินได้',
        body:  result.reject_reason ?? 'กรุณาตรวจสอบสลิปและลองใหม่',
        data:  { slip_id, reason: result.reject_reason },
      })

      return new Response(JSON.stringify({
        verified: false,
        reason:   result.reject_reason,
      }), {
        status: 422,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[verify-slip]', msg)
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
