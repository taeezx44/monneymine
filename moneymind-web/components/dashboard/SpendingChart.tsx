'use client'

// components/dashboard/SpendingChart.tsx
// Area chart: daily income vs expense for the selected month

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend
} from 'recharts'
import { useMemo, useState } from 'react'

interface SpendingChartProps {
  month: Date
}

type ViewMode = 'daily' | 'weekly'

// Generate mock daily data for a given month
function generateDailyData(month: Date) {
  const year  = month.getFullYear()
  const mon   = month.getMonth()
  const days  = new Date(year, mon + 1, 0).getDate()
  const seed  = mon + 1

  return Array.from({ length: days }, (_, i) => {
    const d = i + 1
    const isWeekend = new Date(year, mon, d).getDay() % 6 === 0
    const income  = d === 1 || d === 15 ? 21250 : isWeekend ? 0 : Math.round((Math.random() * 400 + 50) * seed * 0.1)
    const expense = Math.round((Math.random() * 1200 + 300) * (isWeekend ? 1.6 : 1) * seed * 0.08)
    return {
      day: `${d}`,
      income,
      expense,
      label: `${d}/${mon + 1}`,
    }
  })
}

// Aggregate to weekly
function toWeekly(daily: ReturnType<typeof generateDailyData>) {
  const weeks: { week: string; income: number; expense: number }[] = []
  for (let i = 0; i < daily.length; i += 7) {
    const slice = daily.slice(i, i + 7)
    weeks.push({
      week: `W${Math.floor(i / 7) + 1}`,
      income:  slice.reduce((s, d) => s + d.income, 0),
      expense: slice.reduce((s, d) => s + d.expense, 0),
    })
  }
  return weeks
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: '#1a1a1d',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 10,
      padding: '10px 14px',
      fontFamily: 'Geist Mono, monospace',
      fontSize: 12,
    }}>
      <div style={{ color: '#888', marginBottom: 6, fontSize: 11 }}>{payload[0]?.payload?.label || label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} style={{ color: p.color, display: 'flex', justifyContent: 'space-between', gap: 16 }}>
          <span>{p.dataKey === 'income' ? 'Income' : 'Expense'}</span>
          <span>฿{p.value.toLocaleString()}</span>
        </div>
      ))}
    </div>
  )
}

export function SpendingChart({ month }: SpendingChartProps) {
  const [view, setView] = useState<ViewMode>('daily')
  const daily  = useMemo(() => generateDailyData(month), [month])
  const weekly = useMemo(() => toWeekly(daily), [daily])
  const data   = view === 'daily' ? daily : weekly
  const xKey   = view === 'daily' ? 'day' : 'week'

  const totalIncome  = daily.reduce((s, d) => s + d.income, 0)
  const totalExpense = daily.reduce((s, d) => s + d.expense, 0)

  return (
    <>
      <div className="chart-card card">
        <div className="chart-header">
          <div>
            <div className="card-label">Cash Flow</div>
            <div className="chart-totals">
              <span className="chart-total-item">
                <span className="dot dot--income" />
                <span className="mono">฿{totalIncome.toLocaleString()}</span>
                <span className="chart-total-tag">income</span>
              </span>
              <span className="chart-total-item">
                <span className="dot dot--expense" />
                <span className="mono">฿{totalExpense.toLocaleString()}</span>
                <span className="chart-total-tag">expense</span>
              </span>
            </div>
          </div>
          <div className="view-toggle">
            {(['daily', 'weekly'] as ViewMode[]).map((v) => (
              <button
                key={v}
                className={`view-btn ${view === v ? 'view-btn--active' : ''}`}
                onClick={() => setView(v)}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        <div className="chart-wrap">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={data} margin={{ top: 4, right: 0, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="gradIncome" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#84cc16" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#84cc16" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradExpense" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#f87171" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#f87171" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis
                dataKey={xKey}
                tick={{ fill: '#555550', fontSize: 10, fontFamily: 'Geist Mono' }}
                axisLine={false} tickLine={false}
                interval={view === 'daily' ? 4 : 0}
              />
              <YAxis
                tick={{ fill: '#555550', fontSize: 10, fontFamily: 'Geist Mono' }}
                axisLine={false} tickLine={false}
                tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.08)', strokeWidth: 1 }} />
              <Area
                type="monotone" dataKey="income"
                stroke="#84cc16" strokeWidth={1.5}
                fill="url(#gradIncome)" dot={false} activeDot={{ r: 4, fill: '#84cc16' }}
              />
              <Area
                type="monotone" dataKey="expense"
                stroke="#f87171" strokeWidth={1.5}
                fill="url(#gradExpense)" dot={false} activeDot={{ r: 4, fill: '#f87171' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <style jsx>{`
        .chart-card { height: 100%; }
        .chart-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          margin-bottom: 20px;
        }
        .chart-totals {
          display: flex;
          gap: 20px;
          margin-top: 6px;
        }
        .chart-total-item {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 14px;
          color: #e8e6e0;
        }
        .chart-total-tag {
          font-size: 11px;
          color: #555550;
          font-family: 'Geist Mono', monospace;
        }
        .dot {
          width: 6px; height: 6px;
          border-radius: 50%;
          display: inline-block;
        }
        .dot--income  { background: #84cc16; }
        .dot--expense { background: #f87171; }

        .view-toggle {
          display: flex;
          background: #0d0d0f;
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 8px;
          padding: 3px;
          gap: 2px;
        }
        .view-btn {
          padding: 4px 12px;
          border: none;
          border-radius: 6px;
          background: transparent;
          color: #555550;
          font-size: 11px;
          font-family: 'Geist Mono', monospace;
          letter-spacing: 0.5px;
          cursor: pointer;
          transition: background 0.15s, color 0.15s;
        }
        .view-btn--active {
          background: rgba(255,255,255,0.08);
          color: #e8e6e0;
        }
        .chart-wrap { margin: 0 -4px; }
      `}</style>
    </>
  )
}
