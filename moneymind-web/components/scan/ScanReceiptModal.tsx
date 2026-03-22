'use client'

// components/scan/ScanReceiptModal.tsx
// ─────────────────────────────────────────────────────────────
// Full scan flow:
//   Drag-drop / Browse / Camera → Preview → Scanning animation
//   → Result card (amount, merchant, date, items, category)
//   → Confirm → creates transaction
// ─────────────────────────────────────────────────────────────

import { useState, useRef, useCallback, useEffect } from 'react'
import { useReceiptOcr } from '@/hooks/useReceiptOcr'

interface ScanReceiptModalProps {
  onClose:   () => void
  onConfirm: (data: ConfirmPayload) => Promise<void>
}

interface ConfirmPayload {
  amount:      number
  merchant:    string
  date:        string
  category_id: string | null
  receipt_id:  string
  notes:       string
}

// ── Helpers ────────────────────────────────────────────────

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader()
    r.onload  = () => res(r.result as string)
    r.onerror = rej
    r.readAsDataURL(file)
  })
}

function formatDate(iso: string | null): string {
  if (!iso) return ''
  try {
    return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium' }).format(new Date(iso))
  } catch { return iso }
}

// ── Scanning animation line component ─────────────────────

function ScanLine({ active }: { active: boolean }) {
  return (
    <>
      <div className={`scan-line ${active ? 'scan-line--active' : ''}`} />
      <style jsx>{`
        .scan-line {
          position: absolute;
          left: 0; right: 0;
          height: 2px;
          background: linear-gradient(90deg, transparent, #84cc16, #a3e635, #84cc16, transparent);
          opacity: 0;
          pointer-events: none;
          box-shadow: 0 0 12px rgba(132,204,22,.6);
        }
        .scan-line--active {
          opacity: 1;
          animation: scanMove 1.6s ease-in-out infinite;
        }
        @keyframes scanMove {
          0%   { top: 8%; }
          50%  { top: 88%; }
          100% { top: 8%; }
        }
      `}</style>
    </>
  )
}

// ── Progress bar ───────────────────────────────────────────

function ProgressBar({ value }: { value: number }) {
  return (
    <>
      <div className="prog-bg">
        <div className="prog-fill" style={{ width: `${value}%` }} />
      </div>
      <style jsx>{`
        .prog-bg {
          height: 3px;
          background: rgba(255,255,255,.07);
          border-radius: 99px;
          overflow: hidden;
          margin-top: 12px;
        }
        .prog-fill {
          height: 100%;
          background: linear-gradient(90deg, #84cc16, #a3e635);
          border-radius: 99px;
          transition: width .4s ease;
        }
      `}</style>
    </>
  )
}

// ── Main Component ─────────────────────────────────────────

export function ScanReceiptModal({ onClose, onConfirm }: ScanReceiptModalProps) {
  const { upload, state, progress, result, receiptId, errorMsg, reset } = useReceiptOcr()
  const [preview,  setPreview]  = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [notes,    setNotes]    = useState('')
  const [editAmount,   setEditAmount]   = useState('')
  const [editMerchant, setEditMerchant] = useState('')
  const [confirming, setConfirming]     = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // Sync edit fields when result arrives
  useEffect(() => {
    if (result) {
      setEditAmount(result.amount?.toString() ?? '')
      setEditMerchant(result.merchant ?? '')
    }
  }, [result])

  const handleFile = useCallback(async (file: File) => {
    const dataUrl = await fileToDataUrl(file)
    setPreview(dataUrl)
    await upload(file)
  }, [upload])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file?.type.startsWith('image/')) handleFile(file)
  }, [handleFile])

  const handleConfirm = async () => {
    if (!result || !receiptId) return
    const amount = parseFloat(editAmount)
    if (isNaN(amount) || amount <= 0) return
    setConfirming(true)
    await onConfirm({
      amount,
      merchant:    editMerchant || 'ไม่ระบุร้านค้า',
      date:        result.date ?? new Date().toISOString().split('T')[0],
      category_id: result.category_id,
      receipt_id:  receiptId,
      notes,
    })
    setConfirming(false)
    onClose()
  }

  const handleRetry = () => {
    reset()
    setPreview(null)
    setNotes('')
    setEditAmount('')
    setEditMerchant('')
  }

  // ── Render ────────────────────────────────────────────────

  return (
    <>
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal" onClick={e => e.stopPropagation()}>

          {/* Header */}
          <div className="modal-header">
            <div className="modal-header-left">
              <span className="modal-icon">⊡</span>
              <div>
                <div className="modal-title">Scan Receipt</div>
                <div className="modal-sub">สแกนสลิป / ใบเสร็จ</div>
              </div>
            </div>
            <button className="close-btn" onClick={onClose}>✕</button>
          </div>

          {/* ── STEP 1: Upload zone ── */}
          {state === 'idle' && !preview && (
            <div
              className={`drop-zone ${dragOver ? 'drop-zone--over' : ''}`}
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="drop-icon">⊡</div>
              <div className="drop-title">วางรูปสลิปที่นี่</div>
              <div className="drop-sub">หรือคลิกเพื่อเลือกไฟล์ · JPEG, PNG, WebP · ไม่เกิน 10MB</div>
              <div className="drop-actions">
                <button className="drop-btn" onClick={e => { e.stopPropagation(); fileInputRef.current?.click() }}>
                  📁 เลือกไฟล์
                </button>
                <button
                  className="drop-btn drop-btn--camera"
                  onClick={e => {
                    e.stopPropagation()
                    if (fileInputRef.current) {
                      fileInputRef.current.setAttribute('capture', 'environment')
                      fileInputRef.current.click()
                    }
                  }}
                >
                  📷 ถ่ายรูป
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={e => {
                  const file = e.target.files?.[0]
                  if (file) handleFile(file)
                }}
              />
            </div>
          )}

          {/* ── STEP 2: Preview + scanning ── */}
          {preview && (state === 'uploading' || state === 'processing') && (
            <div className="scan-area">
              <div className="scan-img-wrap">
                <img src={preview} alt="receipt preview" className="scan-img" />
                <ScanLine active={state === 'processing'} />
                <div className="scan-corners">
                  <span className="corner tl" /><span className="corner tr" />
                  <span className="corner bl" /><span className="corner br" />
                </div>
              </div>
              <div className="scan-status">
                <div className="scan-status-text">
                  {state === 'uploading'   && '⬆ กำลังอัปโหลด...'}
                  {state === 'processing'  && '✦ AI กำลังสแกนและวิเคราะห์...'}
                </div>
                <ProgressBar value={progress} />
                <div className="scan-steps">
                  <span className={`step ${progress > 20 ? 'done' : progress > 5 ? 'active' : ''}`}>Upload</span>
                  <span className="step-sep">→</span>
                  <span className={`step ${progress > 50 ? 'done' : progress > 30 ? 'active' : ''}`}>OCR</span>
                  <span className="step-sep">→</span>
                  <span className={`step ${progress > 80 ? 'done' : progress > 60 ? 'active' : ''}`}>AI Parse</span>
                  <span className="step-sep">→</span>
                  <span className={`step ${progress >= 100 ? 'done' : ''}`}>Done</span>
                </div>
              </div>
            </div>
          )}

          {/* ── STEP 3: Result ── */}
          {state === 'done' && result && (
            <div className="result-area">
              {/* Left: image thumbnail */}
              {preview && (
                <div className="result-thumb-wrap">
                  <img src={preview} alt="receipt" className="result-thumb" />
                  <div className="confidence-badge">
                    ✦ {Math.round(result.confidence * 100)}% confident
                  </div>
                </div>
              )}

              {/* Right: parsed fields */}
              <div className="result-fields">
                <div className="result-header">
                  <span className="result-check">✓</span>
                  <span className="result-header-text">สแกนสำเร็จ</span>
                </div>

                {/* Amount */}
                <div className="field-group">
                  <label className="field-label">ยอดเงิน (฿)</label>
                  <div className="field-input-wrap">
                    <span className="field-prefix">฿</span>
                    <input
                      className="field-input field-input--amount"
                      type="number"
                      value={editAmount}
                      onChange={e => setEditAmount(e.target.value)}
                      placeholder="0.00"
                      step="0.01"
                    />
                  </div>
                </div>

                {/* Merchant */}
                <div className="field-group">
                  <label className="field-label">ร้านค้า / บริการ</label>
                  <input
                    className="field-input"
                    type="text"
                    value={editMerchant}
                    onChange={e => setEditMerchant(e.target.value)}
                    placeholder="ชื่อร้านค้า"
                  />
                </div>

                {/* Date */}
                <div className="field-row">
                  <div className="field-group field-group--half">
                    <label className="field-label">วันที่</label>
                    <div className="field-static">{result.date ? formatDate(result.date) : 'ไม่พบ'}</div>
                  </div>
                  {/* Category */}
                  <div className="field-group field-group--half">
                    <label className="field-label">หมวดหมู่ (AI)</label>
                    <div className="field-static field-cat">
                      {result.category_name
                        ? <><span className="cat-dot" />AI: {result.category_name}</>
                        : 'ไม่ได้จัดหมวด'
                      }
                    </div>
                  </div>
                </div>

                {/* Line items */}
                {result.items && result.items.length > 0 && (
                  <div className="items-box">
                    <div className="field-label" style={{ marginBottom: 8 }}>รายการสินค้า</div>
                    {result.items.map((item, i) => (
                      <div key={i} className="item-row">
                        <span className="item-name">{item.name}</span>
                        <span className="item-price">฿{item.price.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Notes */}
                <div className="field-group">
                  <label className="field-label">หมายเหตุ (ถ้ามี)</label>
                  <input
                    className="field-input"
                    type="text"
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="เพิ่มหมายเหตุ..."
                  />
                </div>

                {/* Actions */}
                <div className="result-actions">
                  <button className="btn-retry" onClick={handleRetry}>↺ สแกนใหม่</button>
                  <button
                    className="btn-confirm"
                    onClick={handleConfirm}
                    disabled={!editAmount || confirming}
                  >
                    {confirming ? '...' : '✓ บันทึกรายการ'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── STEP 4: Error ── */}
          {state === 'failed' && (
            <div className="error-area">
              <div className="error-icon">✕</div>
              <div className="error-title">OCR ล้มเหลว</div>
              <div className="error-msg">{errorMsg}</div>
              <div className="error-tips">
                <div className="tip">• ถ่ายรูปให้สว่างและชัดเจน</div>
                <div className="tip">• วางสลิปบนพื้นเรียบ</div>
                <div className="tip">• ภาพต้องไม่เบลอหรือเอียงมาก</div>
              </div>
              <button className="btn-confirm" onClick={handleRetry} style={{ marginTop: 16 }}>
                ↺ ลองอีกครั้ง
              </button>
            </div>
          )}

        </div>
      </div>

      <style jsx>{`
        @import url('https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400;500&family=Geist:wght@400;500&display=swap');

        .modal-overlay {
          position: fixed; inset: 0; z-index: 1000;
          background: rgba(0,0,0,.7);
          backdrop-filter: blur(6px);
          display: flex; align-items: center; justify-content: center;
          padding: 20px;
          animation: fadeIn .2s ease;
        }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

        .modal {
          background: #111113;
          border: 1px solid rgba(255,255,255,.09);
          border-radius: 20px;
          width: 100%; max-width: 680px;
          max-height: 90vh;
          overflow-y: auto;
          padding: 28px;
          display: flex; flex-direction: column; gap: 24px;
          animation: slideUp .25s cubic-bezier(.16,1,.3,1);
          font-family: 'Geist', sans-serif;
        }
        @keyframes slideUp { from { transform: translateY(20px); opacity:0; } to { transform:none; opacity:1; } }

        /* Header */
        .modal-header { display: flex; align-items: center; justify-content: space-between; }
        .modal-header-left { display: flex; align-items: center; gap: 12px; }
        .modal-icon { font-size: 22px; color: #84cc16; }
        .modal-title { font-size: 17px; font-weight: 500; color: #f5f3ed; }
        .modal-sub { font-size: 11px; color: #555550; margin-top: 1px; font-family: 'Geist Mono', monospace; letter-spacing: .5px; }
        .close-btn { background: none; border: none; color: #555550; font-size: 16px; cursor: pointer; padding: 4px 8px; border-radius: 6px; transition: color .15s, background .15s; }
        .close-btn:hover { color: #e8e6e0; background: rgba(255,255,255,.06); }

        /* Drop zone */
        .drop-zone {
          border: 1px dashed rgba(255,255,255,.15);
          border-radius: 16px;
          padding: 48px 32px;
          text-align: center;
          cursor: pointer;
          transition: border-color .15s, background .15s;
        }
        .drop-zone:hover, .drop-zone--over {
          border-color: rgba(132,204,22,.5);
          background: rgba(132,204,22,.04);
        }
        .drop-icon { font-size: 40px; margin-bottom: 12px; color: #555550; }
        .drop-title { font-size: 16px; color: #c8c6c0; margin-bottom: 6px; }
        .drop-sub { font-size: 12px; color: #444440; margin-bottom: 20px; font-family: 'Geist Mono', monospace; }
        .drop-actions { display: flex; gap: 10px; justify-content: center; }
        .drop-btn {
          padding: 9px 20px;
          background: rgba(255,255,255,.05);
          border: 1px solid rgba(255,255,255,.1);
          border-radius: 8px;
          color: #c8c6c0;
          font-size: 13px;
          cursor: pointer;
          font-family: 'Geist', sans-serif;
          transition: background .15s, border-color .15s;
        }
        .drop-btn:hover { background: rgba(255,255,255,.1); border-color: rgba(255,255,255,.2); }
        .drop-btn--camera { border-color: rgba(132,204,22,.3); color: #84cc16; background: rgba(132,204,22,.06); }
        .drop-btn--camera:hover { background: rgba(132,204,22,.12); }

        /* Scan area */
        .scan-area { display: flex; flex-direction: column; gap: 16px; }
        .scan-img-wrap {
          position: relative;
          border-radius: 12px;
          overflow: hidden;
          max-height: 320px;
          background: #0a0a0b;
        }
        .scan-img { width: 100%; display: block; object-fit: contain; max-height: 320px; opacity: .85; }
        .scan-corners { position: absolute; inset: 12px; pointer-events: none; }
        .corner { position: absolute; width: 18px; height: 18px; border-color: #84cc16; border-style: solid; opacity: .7; }
        .tl { top: 0; left: 0;  border-width: 2px 0 0 2px; border-radius: 3px 0 0 0; }
        .tr { top: 0; right: 0; border-width: 2px 2px 0 0; border-radius: 0 3px 0 0; }
        .bl { bottom: 0; left: 0;  border-width: 0 0 2px 2px; border-radius: 0 0 0 3px; }
        .br { bottom: 0; right: 0; border-width: 0 2px 2px 0; border-radius: 0 0 3px 0; }

        .scan-status { padding: 4px 0; }
        .scan-status-text { font-size: 13px; color: #84cc16; font-family: 'Geist Mono', monospace; }
        .scan-steps { display: flex; align-items: center; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
        .step { font-size: 11px; font-family: 'Geist Mono', monospace; color: #333330; transition: color .3s; }
        .step.active { color: #84cc16; }
        .step.done   { color: #555550; }
        .step-sep { font-size: 11px; color: #222220; }

        /* Result */
        .result-area { display: flex; gap: 20px; align-items: flex-start; }
        .result-thumb-wrap { flex-shrink: 0; position: relative; }
        .result-thumb { width: 120px; border-radius: 10px; object-fit: cover; aspect-ratio: 3/4; border: 1px solid rgba(255,255,255,.08); }
        .confidence-badge {
          margin-top: 6px;
          font-size: 10px; font-family: 'Geist Mono', monospace;
          color: #84cc16;
          background: rgba(132,204,22,.1);
          border-radius: 5px; padding: 3px 6px;
          text-align: center;
        }

        .result-fields { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 14px; }
        .result-header { display: flex; align-items: center; gap: 8px; }
        .result-check { color: #34d399; font-size: 18px; }
        .result-header-text { font-size: 15px; color: #e8e6e0; font-weight: 500; }

        .field-group { display: flex; flex-direction: column; gap: 5px; }
        .field-group--half { flex: 1; }
        .field-row { display: flex; gap: 12px; }
        .field-label { font-size: 10px; color: #555550; text-transform: uppercase; letter-spacing: 1px; font-family: 'Geist Mono', monospace; }
        .field-input-wrap { position: relative; display: flex; align-items: center; }
        .field-prefix { position: absolute; left: 12px; color: #555550; font-family: 'Geist Mono', monospace; font-size: 14px; pointer-events: none; }
        .field-input {
          width: 100%;
          background: rgba(255,255,255,.04);
          border: 1px solid rgba(255,255,255,.1);
          border-radius: 8px;
          padding: 9px 12px;
          color: #e8e6e0;
          font-size: 14px;
          font-family: 'Geist', sans-serif;
          outline: none;
          transition: border-color .15s;
        }
        .field-input--amount { padding-left: 28px; font-family: 'Geist Mono', monospace; font-size: 16px; font-weight: 500; color: #84cc16; }
        .field-input:focus { border-color: rgba(132,204,22,.5); }
        .field-static { font-size: 13px; color: #c8c6c0; padding: 9px 0; font-family: 'Geist Mono', monospace; }
        .field-cat { display: flex; align-items: center; gap: 6px; }
        .cat-dot { width: 6px; height: 6px; border-radius: 50%; background: #84cc16; display: inline-block; }

        .items-box {
          background: rgba(255,255,255,.03);
          border: 1px solid rgba(255,255,255,.07);
          border-radius: 8px;
          padding: 10px 12px;
        }
        .item-row { display: flex; justify-content: space-between; padding: 3px 0; }
        .item-name  { font-size: 12px; color: #888882; }
        .item-price { font-size: 12px; color: #c8c6c0; font-family: 'Geist Mono', monospace; }

        .result-actions { display: flex; gap: 10px; margin-top: 4px; }
        .btn-retry {
          padding: 9px 16px;
          background: transparent;
          border: 1px solid rgba(255,255,255,.1);
          border-radius: 8px;
          color: #888882;
          font-size: 13px;
          cursor: pointer;
          font-family: 'Geist', sans-serif;
          transition: border-color .15s, color .15s;
        }
        .btn-retry:hover { border-color: rgba(255,255,255,.2); color: #c8c6c0; }
        .btn-confirm {
          flex: 1;
          padding: 9px 20px;
          background: #84cc16;
          border: none;
          border-radius: 8px;
          color: #0a0a0b;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          font-family: 'Geist', sans-serif;
          transition: background .15s, transform .1s;
        }
        .btn-confirm:hover:not(:disabled) { background: #a3e635; }
        .btn-confirm:active { transform: scale(.97); }
        .btn-confirm:disabled { opacity: .4; cursor: not-allowed; }

        /* Error */
        .error-area { text-align: center; padding: 24px 0; display: flex; flex-direction: column; align-items: center; gap: 10px; }
        .error-icon { font-size: 36px; color: #f87171; }
        .error-title { font-size: 16px; color: #e8e6e0; font-weight: 500; }
        .error-msg { font-size: 13px; color: #888882; }
        .error-tips { text-align: left; background: rgba(255,255,255,.03); border-radius: 10px; padding: 14px 16px; width: 100%; max-width: 340px; }
        .tip { font-size: 12px; color: #555550; margin-bottom: 4px; font-family: 'Geist Mono', monospace; }
      `}</style>
    </>
  )
}
