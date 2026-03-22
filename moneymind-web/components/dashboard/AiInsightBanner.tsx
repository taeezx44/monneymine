'use client'

// components/dashboard/AiInsightBanner.tsx
// AI-generated financial insight strip

import { useEffect, useState } from 'react'

interface AiInsightBannerProps {
  month: Date
}

const MOCK_INSIGHTS = [
  { icon: '📊', message: 'คุณใช้เงินกับ อาหาร 42% ของรายจ่ายทั้งหมด — สูงกว่าค่าเฉลี่ยของคุณ 18%', type: 'warning' },
  { icon: '✨', message: 'ยอดเงินออมเดือนนี้ดีที่สุดใน 3 เดือน — เพิ่มขึ้น ฿2,300 จากเดือนที่แล้ว', type: 'positive' },
  { icon: '💡', message: 'ลด Grab 2 ครั้ง/สัปดาห์ จะออมได้เพิ่ม ฿960/เดือน', type: 'tip' },
]

export function AiInsightBanner({ month }: AiInsightBannerProps) {
  const [insight] = useState(() => MOCK_INSIGHTS[month.getMonth() % MOCK_INSIGHTS.length])
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 200)
    return () => clearTimeout(t)
  }, [])

  return (
    <>
      <div className={`insight-banner insight-banner--${insight.type} ${visible ? 'visible' : ''}`}>
        <div className="insight-left">
          <span className="insight-icon">{insight.icon}</span>
          <div>
            <div className="insight-label">AI Insight</div>
            <div className="insight-text">{insight.message}</div>
          </div>
        </div>
        <button className="insight-ask" onClick={() => {}}>
          ถาม AI เพิ่มเติม ↗
        </button>
      </div>

      <style jsx>{`
        .insight-banner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 14px 20px;
          border-radius: 12px;
          border: 1px solid;
          opacity: 0;
          transform: translateY(-6px);
          transition: opacity 0.4s ease, transform 0.4s ease;
        }
        .insight-banner.visible {
          opacity: 1;
          transform: translateY(0);
        }
        .insight-banner--warning  { background: rgba(251,191,36,0.06); border-color: rgba(251,191,36,0.2); }
        .insight-banner--positive { background: rgba(132,204,22,0.06); border-color: rgba(132,204,22,0.2); }
        .insight-banner--tip      { background: rgba(96,165,250,0.06); border-color: rgba(96,165,250,0.2); }

        .insight-left { display: flex; align-items: center; gap: 14px; }
        .insight-icon { font-size: 22px; flex-shrink: 0; }
        .insight-label {
          font-size: 10px;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          color: #555550;
          font-family: 'Geist Mono', monospace;
          margin-bottom: 3px;
        }
        .insight-text { font-size: 13px; color: #c8c6c0; line-height: 1.4; }

        .insight-ask {
          flex-shrink: 0;
          padding: 6px 14px;
          background: transparent;
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 7px;
          color: #888882;
          font-size: 12px;
          font-family: 'Geist', sans-serif;
          cursor: pointer;
          white-space: nowrap;
          transition: border-color 0.15s, color 0.15s;
        }
        .insight-ask:hover { border-color: rgba(255,255,255,0.25); color: #e8e6e0; }

        @media (max-width: 600px) {
          .insight-ask { display: none; }
        }
      `}</style>
    </>
  )
}


// ─────────────────────────────────────────────
// MonthPicker — compact prev/next month selector
// ─────────────────────────────────────────────

interface MonthPickerProps {
  value: Date
  onChange: (d: Date) => void
}

const MONTHS_TH = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']

export function MonthPicker({ value, onChange }: MonthPickerProps) {
  const prev = () => onChange(new Date(value.getFullYear(), value.getMonth() - 1, 1))
  const next = () => {
    const n = new Date(value.getFullYear(), value.getMonth() + 1, 1)
    if (n <= new Date()) onChange(n)
  }
  const isCurrentMonth =
    value.getMonth() === new Date().getMonth() &&
    value.getFullYear() === new Date().getFullYear()

  return (
    <>
      <div className="month-picker">
        <button className="mp-btn" onClick={prev}>‹</button>
        <span className="mp-label mono">
          {MONTHS_TH[value.getMonth()]} {value.getFullYear()}
        </span>
        <button className="mp-btn" onClick={next} disabled={isCurrentMonth}>›</button>
      </div>

      <style jsx>{`
        .month-picker {
          display: flex;
          align-items: center;
          gap: 8px;
          background: #111113;
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 8px;
          padding: 5px 10px;
        }
        .mp-btn {
          background: none;
          border: none;
          color: #666660;
          font-size: 16px;
          cursor: pointer;
          padding: 0 2px;
          line-height: 1;
          transition: color 0.15s;
        }
        .mp-btn:hover:not(:disabled) { color: #e8e6e0; }
        .mp-btn:disabled { opacity: 0.3; cursor: default; }
        .mp-label {
          font-size: 13px;
          color: #c8c6c0;
          min-width: 72px;
          text-align: center;
        }
      `}</style>
    </>
  )
}
