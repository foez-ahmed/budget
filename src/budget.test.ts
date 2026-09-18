import { describe, expect, it } from 'vitest'
import { calculateTotals, daysInMonth, filterTransactions, monthTotals, transactionsToCsv, type Transaction } from './budget'

const rows: Transaction[] = [
  { id: '1', date: '2026-09-02', type: 'Expense', category: 'Food', description: 'Groceries, weekly', source: 'Cash', amount: 105, savings: 11, total: 116 },
  { id: '2', date: '2026-09-01', type: 'Income', category: '', description: 'Salary', source: 'Cash', amount: 2000, savings: 0, total: 2000 },
  { id: '3', date: '2026-08-31', type: 'Expense', category: 'Tax', description: '"Quarterly"', source: 'Bank', amount: 80, savings: 0, total: 80 },
]

describe('budget rules', () => {
  it('rounds applicable savings up and exempts tax and donation', () => {
    expect(calculateTotals('Expense', 105, 'Food')).toEqual({ savings: 11, total: 116 })
    expect(calculateTotals('Expense', 105, 'Tax')).toEqual({ savings: 0, total: 105 })
    expect(calculateTotals('Income', 105)).toEqual({ savings: 0, total: 105 })
  })
  it('rejects fractional amounts', () => {
    expect(() => calculateTotals('Expense', 105.5, 'Food')).toThrow('whole BDT')
  })
  it('allows negative expense amounts', () => {
    expect(calculateTotals('Expense', -100, 'Food')).toEqual({ savings: -10, total: -110 })
    expect(() => calculateTotals('Income', -100)).toThrow('positive whole BDT')
  })
  it('calculates monthly totals from stored values once', () => {
    expect(monthTotals(rows, '2026-09')).toMatchObject({ income: 2000, enteredExpenses: 105, savings: 11, deductions: 116, remaining: 1884 })
  })
  it('calculates the number of days in a month', () => {
    expect(daysInMonth('2026-02')).toBe(28)
    expect(daysInMonth('2024-02')).toBe(29)
  })
  it('filters and sorts newest first', () => {
    expect(filterTransactions(rows, { from: '', to: '', type: 'Expense', category: 'All' }).map((row) => row.id)).toEqual(['1', '3'])
  })
  it('escapes CSV cells', () => {
    expect(transactionsToCsv(rows)).toContain('"Groceries, weekly"')
    expect(transactionsToCsv(rows)).toContain('"""Quarterly"""')
  })
})
