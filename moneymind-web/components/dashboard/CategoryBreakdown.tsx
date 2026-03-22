'use client'

// components/dashboard/CategoryBreakdown.tsx
// Donut chart + ranked list with budget progress bars

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { useMemo } from 'react'

interface CategoryBreakdownProps {
  month: Date
}

const CATEGORIES = [
  { name: 'Food & Drink',  name_th: 'อาหาร',     icon: '🍜', color: '#f97316', budget: 8000 },
  { name: 'Transport',     name_th: 'เดินทาง',    icon: '🚗', color: '#60a5fa', budget: 3000 },
  { name: 'Shopping',      name_th: 'ช้อปปิ้ง',  icon: '🛍️', color: '#e879f9', budget: 5000 },
  { name: 'Entertainment', name_th: 'บันเทิง',    icon: '🎮', color: '#a78bfa', budget: 2000 },
  { name: 'Health',        name_th: 'สุขภาพ',     icon: '💊', color: '#34d399', budget: 2500 },
  { name: 'Bills',         name_th: 'บิล',         icon: '📄', color: '#94a3b8', budget: 6000 },
]

function getMockAmounts(month: Date) {
  const seed = month.getMonth() + 1
  return CATEGORIES.map((c) => ({
    ...c,
    amount: Math.round((Math.random() * 0.8 + 0.2) * c.budget * (seed * 0.08 + 0.9)),
  }))
}

const CustomPieTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div style={{
      background: '#1a1a1d',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 8,
      padding: '8px 12px',
      fontFamily: 'Geist Mono, monospace',
      fontSize: 12,
    }}>
      <div style={{ color: d.color, marginBottom: 4 }}>{d.icon} {d.name_th}</div>
      <div style={{ color: '#e8e6e0' }}>฿{d.amount.toLocaleString()}</div>
      <div style={{ color: '#555550', fontSize: 11 }}>{d.percent}% of total</div>
    </div>
  )
}

export function CategoryBreakdown({ month }: CategoryBreakdownProps) {
  const data = useMemo(() => {
    const cats = getMockAmounts(month)
    const total = cats.reduce((s, c) => s + c.amount, 0)
    return cats
      .map((c) => ({ ...c, percent: Math.round((c.amount / total) * 100) }))
      .sort((a, b) => b.amount - a.amount)
  }, [month])

  const total = data.reduce((s, c) => s + c.amount, 0)

  return (
    <>
      <div className="cat-card card">
        <div className="card-label">Spending by Category</div>

        {/* Donut */}
        <div className="donut-wrap">
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie
                data={data} dataKey="amount"
                cx="50%" cy="50%"
                innerRadius={52} outerRadius={76}
                paddingAngle={3}
                strokeWidth={0}
              >
                {data.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} opacity={0.9} />
                ))}
              </Pie>
              <Tooltip content={<CustomPieTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="donut-center">
            <div className="donut-total mono">฿{(total / 1000).toFixed(1)}k</div>
            <div className="donut-label">total</div>
          </div>
        </div>

        {/* Category rows */}
        <div className="cat-list">
          {data.map((cat) => {
            const pct = Math.min(100, Math.round((cat.amount / cat.budget) * 100))
            const overBudget = cat.amount > cat.budget
            return (
              <div key={cat.name} className="cat-row">
                <div className="cat-row-top">
                  <div className="cat-info">
                    <span className="cat-icon">{cat.icon}</span>
                    <span className="cat-name">{cat.name_th}</span>
                  </div>
                  <div className="cat-amounts">
                    <span className={`cat-spent mono ${overBudget ? 'over' : ''}`}>
                      ฿{cat.amount.toLocaleString()}
                    </span>
                    <span className="cat-budget-val mono">/ ฿{cat.budget.toLocaleString()}</span>
                  </div>
                </div>
                <div className="cat-bar-bg">
                  <div
                    className={`cat-bar-fill ${overBudget ? 'cat-bar-over' : ''}`}
                    style={{ width: `${pct}%`, background: overBudget ? '#f87171' : cat.color }}
                  />
                </div>
                {overBudget && (
                  <div className="cat-over-tag">⚠ เกิน budget {pct - 100}%</div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <style jsx>{`
        .cat-card { display: flex; flex-direction: column; gap: 0; }
        .donut-wrap { position: relative; margin: -8px 0 4px; }
        .donut-center {
          position: absolute;
          top: 50%; left: 50%;
          transform: translate(-50%, -50%);
          text-align: center;
          pointer-events: none;
        }
        .donut-total { font-size: 18px; font-weight: 500; color: #f5f3ed; letter-spacing: -0.5px; }
        .donut-label { font-size: 10px; color: #555550; letter-spacing: 1px; text-transform: uppercase; font-family: 'Geist Mono', monospace; margin-top: 2px; }

        .cat-list { display: flex; flex-direction: column; gap: 14px; margin-top: 8px; }
        .cat-row { display: flex; flex-direction: column; gap: 5px; }
        .cat-row-top { display: flex; align-items: center; justify-content: space-between; }
        .cat-info { display: flex; align-items: center; gap: 7px; }
        .cat-icon { font-size: 14px; }
        .cat-name { font-size: 13px; color: #c8c6c0; }
        .cat-amounts { display: flex; align-items: baseline; gap: 3px; }
        .cat-spent { font-size: 13px; color: #e8e6e0; }
        .cat-spent.over { color: #f87171; }
        .cat-budget-val { font-size: 11px; color: #444440; }

        .cat-bar-bg {
          height: 3px;
          background: rgba(255,255,255,0.06);
          border-radius: 99px;
          overflow: hidden;
        }
        .cat-bar-fill {
          height: 100%;
          border-radius: 99px;
          transition: width 0.6s cubic-bezier(0.16,1,0.3,1);
          opacity: 0.85;
        }
        .cat-over-tag {
          font-size: 10px;
          color: #f87171;
          font-family: 'Geist Mono', monospace;
          letter-spacing: 0.3px;
        }
      `}</style>
    </>
  )
}
