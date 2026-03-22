// app/api/subscription/route.ts
// ─────────────────────────────────────────────────────────────
// GET  /api/subscription       → get current subscription + usage
// POST /api/subscription/slip  → upload slip + trigger verify
// ─────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient }        from '@/supabase/client'
import { getServerSession }          from 'next-auth'
import { authOptions }               from '@/app/api/auth/[...nextauth]/options'
import { PLANS, checkTransactionQuota, checkAiChatQuota, checkReceiptQuota } from '@/lib/subscription'
import type { Plan } from '@/lib/subscription'

// ── GET: current subscription + quota status ─────────────────

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId   = session.user.id
  const supabase = createServerClient()

  // Fetch user + active subscription
  const [{ data: user }, { data: sub }] = await Promise.all([
    supabase.from('users').select('plan').eq('id', userId).single(),
    supabase.from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const plan = (user?.plan ?? 'free') as Plan

  // Check quota in parallel
  const [txnQuota, chatQuota, ocrQuota] = await Promise.all([
    checkTransactionQuota(userId, plan),
    checkAiChatQuota(userId, plan),
    checkReceiptQuota(userId, plan),
  ])

  return NextResponse.json({
    plan,
    planConfig:   PLANS[plan],
    subscription: sub ?? null,
    quota: {
      transactions:    txnQuota,
      ai_chat:         chatQuota,
      receipt_scans:   ocrQuota,
    },
  })
}


// ── POST /api/subscription/slip ───────────────────────────────
// Upload payment slip + trigger Edge Function verify

// app/api/subscription/slip/route.ts
import type { NextRequest } from 'next/server'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = session.user.id
  const form   = await req.formData()
  const file   = form.get('file')     as File | null
  const planKey= form.get('plan_key') as string | null

  if (!file || !planKey) {
    return NextResponse.json({ error: 'file and plan_key required' }, { status: 400 })
  }

  if (!['pro_monthly','pro_annual','business_monthly','business_annual'].includes(planKey)) {
    return NextResponse.json({ error: 'invalid plan_key' }, { status: 400 })
  }

  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: 'ไฟล์ใหญ่เกิน 10MB' }, { status: 400 })
  }

  const supabase = createServerClient()

  // Upload to storage: slips/{userId}/{timestamp}.jpg
  const ext  = file.name.split('.').pop() ?? 'jpg'
  const path = `${userId}/${Date.now()}.${ext}`
  const buf  = await file.arrayBuffer()

  const { error: uploadErr } = await supabase.storage
    .from('slips')
    .upload(path, buf, { contentType: file.type, upsert: false })

  if (uploadErr) return NextResponse.json({ error: uploadErr.message }, { status: 500 })

  // Get signed URL (1 hour) for Edge Function to fetch
  const { data: { signedUrl } } = await supabase.storage
    .from('slips')
    .createSignedUrl(path, 3600)

  // Insert payment_slip row
  const { data: slip, error: slipErr } = await supabase
    .from('payment_slips')
    .insert({
      user_id:   userId,
      image_url: path,
      status:    'pending',
    })
    .select()
    .single()

  if (slipErr || !slip) {
    return NextResponse.json({ error: slipErr?.message ?? 'insert failed' }, { status: 500 })
  }

  // Invoke verify-slip Edge Function (fire-and-forget → realtime pushes result)
  supabase.functions.invoke('verify-slip', {
    body: {
      user_id:   userId,
      slip_id:   slip.id,
      plan_key:  planKey,
      image_url: signedUrl,
    },
  })

  return NextResponse.json({
    slip_id: slip.id,
    status:  'pending',
    message: 'กำลังตรวจสอบสลิป...',
  })
}
