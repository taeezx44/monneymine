'use client'

// components/dashboard/RecentTransactions.tsx

import { useState } from 'react'

interface Transaction {
  id: string
  merchant: string
  category: string
  category_icon: string
  category_color: string
  amount: number
  type: 'income' | 'expense'
  date: string
  time: string
  has_receipt: boolean
  ai_tagged: boolean
}

const MOCK_TRANSACTIONS: Transaction[] = [
  { id: '1',  merchant: 'ข้าวมันไก่ประตูน้ำ', category: 'อาหาร',    category_icon: '🍜', category_color: '#f97316', amount: 65,    type: 'expense', date: 'วันนี้',     time: '12:34', has_receipt: true,  ai_tagged: true  },
  { id: '2',  merchant: 'Grab',                category: 'เดินทาง',  category_icon: '🚗', category_color: '#60a5fa', amount: 120,   type: 'expense', date: 'วันนี้',     time: '09:12', has_receipt: false, ai_tagged: true  },
  { id: '3',  merchant: 'เงินเดือน ม.ค.',      category: 'เงินเดือน',category_icon: '💵', category_color: '#84cc16', amount: 21250, type: 'income',  date: 'เมื่อวาน',   time: '08:00', has_receipt: false, ai_tagged: false },
  { id: '4',  merchant: 'Villa Market',         category: 'ช้อปปิ้ง', category_icon: '🛍️', category_color: '#e879f9', amount: 1240,  type: 'expense', date: 'เมื่อวาน',   time: '18:22', has_receipt: true,  ai_tagged: true  },
  { id: '5',  merchant: 'Netflix',              category: 'บันเทิง',  category_icon: '🎮', category_color: '#a78bfa', amount: 279,   type: 'expense', date: '15 ม.ค.',    time: '00:00', has_receipt: false, ai_tagged: true  },
  { id: '6',  merchant: 'True Move H',          category: 'บิล',      category_icon: '📄', category_color: '#94a3b8', amount: 599,   type: 'expense', date: '14 ม.ค.',    time: '10:05', has_receipt: true,  ai_tagged: false },
  { id: '7',  merchant: 'MRT สายสีน้ำเงิน',    category: 'เดินทาง',  category_icon: '🚗', category_color: '#60a5fa', amount: 42,    type: 'expense', date: '14 ม.ค.',    time: '08:30', has_receipt: false, ai_tagged: true  },
  { id: '8',  merchant: 'Freelance project',    category: 'รายได้',   category_icon: '💻', category_color: '#84cc16', amount: 8500,  type: 'income',  date: '13 ม.ค.',    time: '15:00', has_receipt: false, ai_tagged: false },
]

type FilterType = 'all' | 'income' | 'expense'

export function RecentTransactions() {
  const [filter, setFilter] = useState<FilterType>('all')

  const filtered = MOCK_TRANSACTIONS.filter(
    (t) => filter === 'all' || t.type === filter
  )

  return (
    <>
      <div className="txn-card card">
        <div className="txn-header">
          <div className="card-label" style={{ marginBottom: 0 }}>Recent Transactions</div>
          <div className="txn-filter">
            {(['all', 'income', 'expense'] as FilterType[]).map((f) => (
              <button
                key={f}
                className={`filter-btn ${filter === f ? 'filter-btn--active' : ''}`}
                onClick={() => setFilter(f)}
              >
                {f === 'all' ? 'All' : f === 'income' ? '↑ Income' : '↓ Expense'}
              </button>
            ))}
          </div>
        </div>

        <div className="txn-list">
          {filtered.map((txn, i) => (
            <div
              key={txn.id}
              className="txn-row"
              style={{ animationDelay: `${i * 30}ms` }}
            >
              {/* Icon */}
              <div
                className="txn-icon"
                style={{ background: txn.category_color + '22', borderColor: txn.category_color + '44' }}
              >
                {txn.category_icon}
              </div>

              {/* Info */}
              <div className="txn-info">
                <div className="txn-merchant">{txn.merchant}</div>
                <div className="txn-meta">
                  <span className="txn-cat" style={{ color: txn.category_color }}>{txn.category}</span>
                  <span className="txn-dot">·</span>
                  <span className="txn-time">{txn.date} {txn.time}</span>
                  {txn.has_receipt && <span className="txn-badge txn-badge--receipt">📎 สลิป</span>}
                  {txn.ai_tagged  && <span className="txn-badge txn-badge--ai">✦ AI</span>}
                </div>
              </div>

              {/* Amount */}
              <div className={`txn-amount mono ${txn.type === 'income' ? 'txn-amount--in' : 'txn-amount--out'}`}>
                {txn.type === 'income' ? '+' : '-'}฿{txn.amount.toLocaleString()}
              </div>
            </div>
          ))}
        </div>

        <button className="txn-see-all">ดูทั้งหมด →</button>
      </div>

      <style jsx>{`
        .txn-card {}
        .txn-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 20px;
        }
        .txn-filter {
          display: flex;
          gap: 4px;
          background: #0d0d0f;
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 8px;
          padding: 3px;
        }
        .filter-btn {
          padding: 4px 12px;
          border: none;
          border-radius: 5px;
          background: transparent;
          color: #555550;
          font-size: 11px;
          font-family: 'Geist Mono', monospace;
          cursor: pointer;
          transition: background 0.15s, color 0.15s;
          white-space: nowrap;
        }
        .filter-btn--active { background: rgba(255,255,255,0.08); color: #e8e6e0; }

        .txn-list { display: flex; flex-direction: column; }

        .txn-row {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 12px 0;
          border-bottom: 1px solid rgba(255,255,255,0.04);
          animation: fadeUp 0.3s ease both;
        }
        .txn-row:last-child { border-bottom: none; }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .txn-icon {
          width: 38px; height: 38px;
          border-radius: 10px;
          border: 1px solid;
          display: flex; align-items: center; justify-content: center;
          font-size: 16px;
          flex-shrink: 0;
        }

        .txn-info { flex: 1; min-width: 0; }
        .txn-merchant {
          font-size: 14px;
          color: #e8e6e0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .txn-meta {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-top: 3px;
          flex-wrap: wrap;
        }
        .txn-cat  { font-size: 11px; font-weight: 500; }
        .txn-dot  { color: #333330; font-size: 11px; }
        .txn-time { font-size: 11px; color: #444440; font-family: 'Geist Mono', monospace; }

        .txn-badge {
          font-size: 10px;
          padding: 1px 6px;
          border-radius: 4px;
          font-family: 'Geist Mono', monospace;
          letter-spacing: 0.3px;
        }
        .txn-badge--receipt { background: rgba(96,165,250,0.12); color: #60a5fa; }
        .txn-badge--ai      { background: rgba(132,204,22,0.12);  color: #84cc16; }

        .txn-amount {
          font-size: 14px;
          font-weight: 500;
          white-space: nowrap;
          flex-shrink: 0;
        }
        .txn-amount--in  { color: #84cc16; }
        .txn-amount--out { color: #f5f3ed; }

        .txn-see-all {
          margin-top: 16px;
          width: 100%;
          padding: 10px;
          background: transparent;
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 8px;
          color: #555550;
          font-size: 13px;
          font-family: 'Geist', sans-serif;
          cursor: pointer;
          transition: border-color 0.15s, color 0.15s;
        }
        .txn-see-all:hover { border-color: rgba(255,255,255,0.15); color: #e8e6e0; }
      `}</style>
    </>
  )
}
