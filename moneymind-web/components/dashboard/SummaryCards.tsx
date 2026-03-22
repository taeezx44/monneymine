'use client'

// components/dashboard/SummaryCards.tsx

import { useEffect, useState } from 'react'

interface SummaryCardsProps {
  month: Date
}

interface CardData {
  label: string
  value: number
  change: number      // % change vs last month
  prefix: string
  type: 'income' | 'expense' | 'savings' | 'neutral'
}

// Mock data — swap with useMonthlySummary(userId, month)
function getMockData(month: Date): CardData[] {
  const seed = month.getMonth()
  return [
    {
      label: 'Total Income',
      value: 42500 + seed * 1200,
      change: 8.3,
      prefix: '฿',
      type: 'income',
    },
    {
      label: 'Total Expense',
      value: 28340 + seed * 800,
      change: -3.1,
      prefix: '฿',
      type: 'expense',
    },
    {
      label: 'Net Savings',
      value: 14160 + seed * 400,
      change: 12.7,
      prefix: '฿',
      type: 'savings',
    },
    {
      label: 'Transactions',
      value: 47 + seed,
      change: 5.2,
      prefix: '',
      type: 'neutral',
    },
  ]
}

function formatThb(value: number, prefix: string): string {
  if (!prefix) return value.toString()
  return prefix + value.toLocaleString('th-TH', { maximumFractionDigits: 0 })
}

export function SummaryCards({ month }: SummaryCardsProps) {
  const [cards, setCards] = useState<CardData[]>([])
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    setVisible(false)
    const t = setTimeout(() => {
      setCards(getMockData(month))
      setVisible(true)
    }, 80)
    return () => clearTimeout(t)
  }, [month])

  return (
    <>
      <div className="summary-grid">
        {cards.map((card, i) => (
          <div
            key={card.label}
            className={`summary-card summary-card--${card.type}`}
            style={{ animationDelay: `${i * 60}ms` }}
            data-visible={visible}
          >
            <div className="sc-label">{card.label}</div>
            <div className="sc-value mono">
              {formatThb(card.value, card.prefix)}
            </div>
            <div className={`sc-change ${card.change >= 0 ? 'sc-change--up' : 'sc-change--down'}`}>
              <span className="sc-change-arrow">{card.change >= 0 ? '↑' : '↓'}</span>
              <span>{Math.abs(card.change)}% vs last month</span>
            </div>
            <div className="sc-accent-bar" />
          </div>
        ))}
      </div>

      <style jsx>{`
        .summary-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
        }
        @media (max-width: 900px) {
          .summary-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 500px) {
          .summary-grid { grid-template-columns: 1fr; }
        }

        .summary-card {
          background: #111113;
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 14px;
          padding: 20px 20px 16px;
          position: relative;
          overflow: hidden;
          opacity: 0;
          transform: translateY(10px);
          transition: opacity 0.35s ease, transform 0.35s ease, border-color 0.2s;
        }
        .summary-card[data-visible='true'] {
          opacity: 1;
          transform: translateY(0);
        }
        .summary-card:hover {
          border-color: rgba(255,255,255,0.13);
        }

        .sc-label {
          font-size: 11px;
          letter-spacing: 1.3px;
          text-transform: uppercase;
          color: #555550;
          font-family: 'Geist Mono', monospace;
          margin-bottom: 10px;
        }
        .sc-value {
          font-size: 26px;
          font-weight: 500;
          color: #f5f3ed;
          letter-spacing: -1px;
          line-height: 1;
          margin-bottom: 10px;
        }
        .sc-change {
          font-size: 12px;
          display: flex;
          align-items: center;
          gap: 4px;
          font-family: 'Geist Mono', monospace;
        }
        .sc-change--up  { color: #84cc16; }
        .sc-change--down { color: #f87171; }
        .sc-change-arrow { font-size: 10px; }

        /* Colored bottom accent bar */
        .sc-accent-bar {
          position: absolute;
          bottom: 0; left: 0; right: 0;
          height: 2px;
        }
        .summary-card--income  .sc-accent-bar { background: #84cc16; }
        .summary-card--expense .sc-accent-bar { background: #f87171; }
        .summary-card--savings .sc-accent-bar { background: #34d399; }
        .summary-card--neutral .sc-accent-bar { background: #60a5fa; }

        /* Faint glow behind value */
        .summary-card--income::before,
        .summary-card--expense::before,
        .summary-card--savings::before {
          content: '';
          position: absolute;
          top: -20px; left: -20px;
          width: 120px; height: 120px;
          border-radius: 50%;
          opacity: 0.04;
          pointer-events: none;
        }
        .summary-card--income::before  { background: #84cc16; }
        .summary-card--expense::before { background: #f87171; }
        .summary-card--savings::before { background: #34d399; }
      `}</style>
    </>
  )
}
