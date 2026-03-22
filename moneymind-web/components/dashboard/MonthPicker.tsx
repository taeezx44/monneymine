'use client'

import { useState } from 'react'

interface MonthPickerProps {
  value: Date
  onChange: (date: Date) => void
}

export function MonthPicker({ value, onChange }: MonthPickerProps) {
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ]

  const currentYear = new Date().getFullYear()
  const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i)

  const handleMonthChange = (month: number) => {
    const newDate = new Date(value.getFullYear(), month, 1)
    onChange(newDate)
  }

  const handleYearChange = (year: number) => {
    const newDate = new Date(year, value.getMonth(), 1)
    onChange(newDate)
  }

  return (
    <div className="month-picker">
      <select
        value={value.getMonth()}
        onChange={(e) => handleMonthChange(Number(e.target.value))}
        className="month-select"
      >
        {months.map((month, index) => (
          <option key={month} value={index}>
            {month}
          </option>
        ))}
      </select>
      
      <select
        value={value.getFullYear()}
        onChange={(e) => handleYearChange(Number(e.target.value))}
        className="year-select"
      >
        {years.map((year) => (
          <option key={year} value={year}>
            {year}
          </option>
        ))}
      </select>

      <style jsx>{`
        .month-picker {
          display: flex;
          gap: 4px;
        }
        
        .month-select,
        .year-select {
          background: #111113;
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 6px;
          padding: 6px 8px;
          color: #e8e6e0;
          font-size: 12px;
          font-family: 'Geist', sans-serif;
          cursor: pointer;
        }
        
        .month-select:hover,
        .year-select:hover {
          border-color: rgba(255,255,255,0.2);
        }
        
        .month-select:focus,
        .year-select:focus {
          outline: none;
          border-color: #84cc16;
        }
      `}</style>
    </div>
  )
}
