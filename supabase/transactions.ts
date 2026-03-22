// supabase/transactions.ts
// ─────────────────────────────────────────────
// CRUD helpers for transactions + receipt upload
// ─────────────────────────────────────────────

import { supabase, createServerClient, type Transaction, type TransactionType } from './client'

// ── Create transaction ────────────────────────

export interface CreateTransactionInput {
  type: TransactionType
  amount: number
  note?: string
  merchant?: string
  category_id?: string
  wallet_id?: string
  transacted_at?: string  // ISO string, defaults to now
  receipt_image?: File    // optional slip/receipt
}

export async function createTransaction(
  userId: string,
  input: CreateTransactionInput
): Promise<{ transaction: Transaction | null; error: string | null }> {

  let receiptUrl: string | null = null

  // 1. Upload receipt image to Supabase Storage (if provided)
  if (input.receipt_image) {
    const ext = input.receipt_image.name.split('.').pop()
    const path = `${userId}/${Date.now()}.${ext}`

    const { error: uploadErr } = await supabase.storage
      .from('receipts')
      .upload(path, input.receipt_image, { upsert: false })

    if (uploadErr) return { transaction: null, error: uploadErr.message }

    const { data: { publicUrl } } = supabase.storage.from('receipts').getPublicUrl(path)
    receiptUrl = publicUrl
  }

  // 2. Insert transaction
  const { data, error } = await supabase
    .from('transactions')
    .insert({
      user_id:        userId,
      type:           input.type,
      amount:         input.amount,
      note:           input.note ?? null,
      merchant:       input.merchant ?? null,
      category_id:    input.category_id ?? null,
      wallet_id:      input.wallet_id ?? null,
      transacted_at:  input.transacted_at ?? new Date().toISOString(),
    })
    .select('*, category:categories(*), wallet:wallets(id,name,icon,color)')
    .single()

  if (error) return { transaction: null, error: error.message }

  // 3. If receipt, create receipt row and trigger OCR (async)
  if (receiptUrl && data) {
    await supabase.from('receipts').insert({
      user_id:        userId,
      transaction_id: data.id,
      image_url:      receiptUrl,
      status:         'pending',
    })
    // Non-blocking: queue OCR processing via Edge Function
    supabase.functions.invoke('process-receipt', {
      body: { receipt_url: receiptUrl, transaction_id: data.id, user_id: userId }
    })
  }

  return { transaction: data, error: null }
}

// ── Update transaction ────────────────────────

export async function updateTransaction(
  id: string,
  updates: Partial<Pick<Transaction, 'amount' | 'note' | 'merchant' | 'category_id' | 'transacted_at'>>
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('transactions')
    .update(updates)
    .eq('id', id)
  return { error: error?.message ?? null }
}

// ── Delete transaction ────────────────────────

export async function deleteTransaction(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('transactions').delete().eq('id', id)
  return { error: error?.message ?? null }
}

// ── AI auto-categorize (calls Edge Function) ──

export interface OcrResult {
  amount:      number | null
  merchant:    string | null
  date:        string | null       // ISO date
  items:       Array<{ name: string; price: number }> | null
  confidence:  number              // 0–1
  category_id: string | null       // matched category UUID
  raw_text:    string
}

export async function processReceiptOcr(imageFile: File, userId: string): Promise<OcrResult | null> {
  // Convert image to base64
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(imageFile)
  })

  const { data, error } = await supabase.functions.invoke<OcrResult>('ocr-receipt', {
    body: { image_base64: base64, mime_type: imageFile.type, user_id: userId }
  })

  if (error || !data) return null
  return data
}

// ── Get transactions with filters ─────────────

export interface TransactionFilters {
  type?:        TransactionType
  category_id?: string
  wallet_id?:   string
  from?:        string  // ISO date
  to?:          string  // ISO date
  search?:      string  // merchant full-text search
  limit?:       number
  offset?:      number
}

export async function fetchTransactions(
  userId: string,
  filters: TransactionFilters = {}
): Promise<Transaction[]> {
  let query = supabase
    .from('transactions')
    .select('*, category:categories(*), wallet:wallets(id,name,icon,color)')
    .eq('user_id', userId)
    .order('transacted_at', { ascending: false })
    .limit(filters.limit ?? 50)
    .range(filters.offset ?? 0, (filters.offset ?? 0) + (filters.limit ?? 50) - 1)

  if (filters.type)        query = query.eq('type', filters.type)
  if (filters.category_id) query = query.eq('category_id', filters.category_id)
  if (filters.wallet_id)   query = query.eq('wallet_id', filters.wallet_id)
  if (filters.from)        query = query.gte('transacted_at', filters.from)
  if (filters.to)          query = query.lte('transacted_at', filters.to)
  if (filters.search)      query = query.ilike('merchant', `%${filters.search}%`)

  const { data } = await query
  return data ?? []
}

// ── Server-side: apply AI category to transaction (Edge Function use) ──

export async function applyAiCategory(
  transactionId: string,
  categoryId: string,
  confidence: number,
  merchantNormalized?: string,
  tags?: string[]
): Promise<void> {
  const server = createServerClient()
  await server.from('transactions').update({
    ai_category_id:         categoryId,
    ai_confidence:          confidence,
    ai_merchant_normalized: merchantNormalized ?? null,
    ai_tags:                tags ?? null,
  }).eq('id', transactionId)
}
