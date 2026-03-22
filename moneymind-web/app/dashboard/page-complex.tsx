'use client'

// app/dashboard/page.tsx
// ─────────────────────────────────────────────
// Main Dashboard — AI Smart Expense Tracker
// ─────────────────────────────────────────────

import { useState } from 'react'
import { SummaryCards } from '@/components/dashboard/SummaryCards'
import { SpendingChart } from '@/components/dashboard/SpendingChart'
import { CategoryBreakdown } from '@/components/dashboard/CategoryBreakdown'
import { RecentTransactions } from '@/components/dashboard/RecentTransactions'
import { AiInsightBanner } from '@/components/dashboard/AiInsightBanner'
import { MonthPicker } from '@/components/dashboard/MonthPicker'

export default function DashboardPage() {
  const [selectedMonth, setSelectedMonth] = useState(new Date())

  return (
    <div className="dashboard-root">
      {/* Header */}
      <header className="dash-header">
        <div className="dash-header-left">
          <span className="logo-mark">◈</span>
          <div>
            <h1 className="dash-title">MoneyMind</h1>
            <p className="dash-sub">Financial Intelligence</p>
          </div>
        </div>
        <div className="dash-header-right">
          <MonthPicker value={selectedMonth} onChange={setSelectedMonth} />
          <button className="btn-add">
            <span>+</span> Add Transaction
          </button>
        </div>
      </header>

      {/* AI Insight Banner */}
      <AiInsightBanner month={selectedMonth} />

      {/* Summary Cards */}
      <SummaryCards month={selectedMonth} />

      {/* Main Grid */}
      <div className="dash-grid">
        <div className="dash-grid-main">
          <SpendingChart month={selectedMonth} />
        </div>
        <div className="dash-grid-side">
          <CategoryBreakdown month={selectedMonth} />
        </div>
      </div>

      {/* Recent Transactions */}
      <RecentTransactions />

      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=Geist+Mono:wght@300;400;500;600&family=Geist:wght@300;400;500&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        body {
          background: #0a0a0b;
          color: #e8e6e0;
          font-family: 'Geist', sans-serif;
          min-height: 100vh;
        }

        .dashboard-root {
          max-width: 1280px;
          margin: 0 auto;
          padding: 32px 24px 64px;
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        /* ── Header ── */
        .dash-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-bottom: 8px;
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .dash-header-left { display: flex; align-items: center; gap: 14px; }
        .logo-mark {
          font-size: 28px;
          color: #84cc16;
          line-height: 1;
          filter: drop-shadow(0 0 12px rgba(132,204,22,0.4));
        }
        .dash-title {
          font-family: 'DM Serif Display', serif;
          font-size: 22px;
          font-weight: 400;
          color: #f5f3ed;
          line-height: 1.1;
          letter-spacing: -0.3px;
        }
        .dash-sub {
          font-size: 11px;
          color: #555550;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          font-family: 'Geist Mono', monospace;
          margin-top: 2px;
        }
        .dash-header-right { display: flex; align-items: center; gap: 12px; }

        .btn-add {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 18px;
          background: #84cc16;
          color: #0a0a0b;
          border: none;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 500;
          font-family: 'Geist', sans-serif;
          cursor: pointer;
          transition: background 0.15s, transform 0.1s;
        }
        .btn-add span { font-size: 18px; line-height: 1; margin-top: -1px; }
        .btn-add:hover { background: #a3e635; }
        .btn-add:active { transform: scale(0.97); }

        /* ── Main grid ── */
        .dash-grid {
          display: grid;
          grid-template-columns: 1fr 340px;
          gap: 16px;
        }
        @media (max-width: 900px) {
          .dash-grid { grid-template-columns: 1fr; }
        }
        .dash-grid-main { min-width: 0; }
        .dash-grid-side { min-width: 0; }

        /* ── Shared card ── */
        .card {
          background: #111113;
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 16px;
          padding: 24px;
        }
        .card-label {
          font-size: 11px;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          color: #555550;
          font-family: 'Geist Mono', monospace;
          margin-bottom: 16px;
        }
        .mono {
          font-family: 'Geist Mono', monospace;
        }
        .amount-positive { color: #84cc16; }
        .amount-negative { color: #f87171; }
      `}</style>
    </div>
  )
}
