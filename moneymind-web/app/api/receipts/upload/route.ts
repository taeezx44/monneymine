// app/api/receipts/upload/route.ts
// ─────────────────────────────────────────────────────────────
// POST /api/receipts/upload
//   - รับ multipart/form-data: file + transaction_id (optional)
//   - Validate: size ≤ 10MB, type = image/*
//   - Upload → Supabase Storage
//   - Insert receipts row
//   - Invoke ocr-receipt Edge Function (non-blocking)
//   - Return { receipt_id, status: 'processing' }
// ─────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/supabase/client'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/options'

const MAX_FILE_SIZE = 10 * 1024 * 1024  // 10 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic']

export async function POST(req: NextRequest) {
  try {
    // Auth
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const userId = session.user.id

    // Parse multipart
    const form = await req.formData()
    const file          = form.get('file')          as File | null
    const transactionId = form.get('transaction_id') as string | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Validate
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'ไฟล์ใหญ่เกิน 10MB' }, { status: 400 })
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'รองรับเฉพาะ JPEG, PNG, WebP, HEIC' }, { status: 400 })
    }

    const supabase = createServerClient()

    // Upload to Supabase Storage  receipts/{userId}/{timestamp}.{ext}
    const ext      = file.name.split('.').pop() ?? 'jpg'
    const path     = `${userId}/${Date.now()}.${ext}`
    const buffer   = await file.arrayBuffer()

    const { error: uploadErr } = await supabase.storage
      .from('receipts')
      .upload(path, buffer, { contentType: file.type, upsert: false })

    if (uploadErr) {
      return NextResponse.json({ error: uploadErr.message }, { status: 500 })
    }

    // Get signed URL (private bucket)
    const { data: { signedUrl } } = await supabase.storage
      .from('receipts')
      .createSignedUrl(path, 60 * 60)  // 1 hour

    // Insert receipt row
    const { data: receipt, error: insertErr } = await supabase
      .from('receipts')
      .insert({
        user_id:        userId,
        transaction_id: transactionId ?? null,
        image_url:      path,             // store path, not full URL
        status:         'pending',
      })
      .select()
      .single()

    if (insertErr || !receipt) {
      return NextResponse.json({ error: insertErr?.message ?? 'Insert failed' }, { status: 500 })
    }

    // Invoke Edge Function (fire-and-forget — client polls via realtime)
    supabase.functions.invoke('ocr-receipt', {
      body: {
        receipt_id: receipt.id,
        image_url:  signedUrl,
        user_id:    userId,
      },
    })

    return NextResponse.json({
      receipt_id: receipt.id,
      status:     'processing',
      message:    'กำลังสแกนสลิป...',
    })

  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// ─────────────────────────────────────────────────────────────
// GET /api/receipts/[id]  — poll receipt status
// ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('receipts')
    .select('*')
    .eq('id', id)
    .eq('user_id', session.user.id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json(data)
}
