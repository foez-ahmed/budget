export const EXPENSE_CATEGORIES = [
  'Tax', 'Donation', 'Food', 'Cloth', 'Medical', 'Essential', 'Rents', 'Fuel',
  'Vehicle Maintenance', 'Additional Transport', 'Electricity', 'Gas', 'Water',
  'Sewer', 'Garbage', 'Phone', 'Internet', 'Education', 'Occasional', 'Tour',
  'Special Event', 'Others',
] as const

export const BUDGET_CATEGORIES = ['Income', ...EXPENSE_CATEGORIES] as const

export type TransactionType = 'Income' | 'Expense'
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]
export type BudgetCategory = (typeof BUDGET_CATEGORIES)[number]

export type Transaction = {
  id: string
  date: string
  type: TransactionType
  category: ExpenseCategory | ''
  description: string
  source: string
  amount: number
  savings: number
  total: number
  createdBy?: string
}

export function calculateTotals(type: TransactionType, amount: number, category = '') {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error('Amount must be a positive whole BDT amount.')
  const savings = type === 'Expense' && category !== 'Tax' && category !== 'Donation'
    ? Math.ceil(amount * 0.1)
    : 0
  return { savings, total: amount + savings }
}

export function monthTotals(transactions: Transaction[], month: string) {
  const rows = transactions.filter((transaction) => transaction.date.slice(0, 7) === month)
  const income = rows.filter((row) => row.type === 'Income').reduce((sum, row) => sum + row.amount, 0)
  const expenses = rows.filter((row) => row.type === 'Expense')
  const enteredExpenses = expenses.reduce((sum, row) => sum + row.amount, 0)
  const savings = expenses.reduce((sum, row) => sum + row.savings, 0)
  const deductions = expenses.reduce((sum, row) => sum + row.total, 0)
  return { income, enteredExpenses, savings, deductions, remaining: income - deductions, rows }
}

export function daysInMonth(month: string) {
  const [year, monthNumber] = month.split('-').map(Number)
  return new Date(year, monthNumber, 0).getDate()
}

export function filterTransactions(transactions: Transaction[], filters: { from: string; to: string; type: 'All' | TransactionType; category: 'All' | ExpenseCategory }) {
  return transactions
    .filter((row) => (!filters.from || row.date >= filters.from) && (!filters.to || row.date <= filters.to))
    .filter((row) => filters.type === 'All' || row.type === filters.type)
    .filter((row) => filters.category === 'All' || row.category === filters.category)
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
}

export function csvCell(value: string | number) {
  const text = String(value)
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export function transactionsToCsv(transactions: Transaction[]) {
  const headers = ['Date', 'Type', 'Category', 'Description', 'Source', 'Amount', 'Savings', 'Total']
  return [headers, ...transactions.map((row) => [row.date, row.type, row.category, row.description, row.source, row.amount, row.savings, row.total])]
    .map((row) => row.map(csvCell).join(','))
    .join('\n')
}
