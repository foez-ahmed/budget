import { useEffect, useMemo, useState } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { auth, db, firebaseConfigured } from "./firebase";
import {
  calculateTotals,
  daysInMonth,
  EXPENSE_CATEGORIES,
  filterTransactions,
  monthTotals,
  transactionsToCsv,
  type ExpenseCategory,
  type Transaction,
  type TransactionType,
} from "./budget";
import "./App.css";

const today = (() => {
  const date = new Date();
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
})();
const PIE_COLORS = ["#397a59", "#f28f72", "#f2c875", "#78a8c7", "#b68bc4", "#82b9a4", "#d889a4", "#8f9b70"];
const previewRows: Transaction[] = [
  {
    id: "preview-1",
    date: today,
    type: "Income",
    category: "",
    description: "Monthly salary",
    source: "Cash",
    amount: 3200,
    savings: 0,
    total: 3200,
  },
  {
    id: "preview-2",
    date: today,
    type: "Expense",
    category: "Food",
    description: "Market run",
    source: "Cash",
    amount: 105,
    savings: 11,
    total: 116,
  },
  {
    id: "preview-3",
    date: today,
    type: "Expense",
    category: "Internet",
    description: "Home connection",
    source: "Bank",
    amount: 55,
    savings: 6,
    total: 61,
  },
  {
    id: "preview-4",
    date: today,
    type: "Expense",
    category: "Fuel",
    description: "Car fuel",
    source: "Cash",
    amount: 72,
    savings: 8,
    total: 80,
  },
];

type FormState = {
  type: TransactionType;
  date: string;
  category: ExpenseCategory | "";
  description: string;
  amount: string;
  source: string;
};
const emptyForm: FormState = {
  type: "Expense",
  date: today,
  category: "Food",
  description: "",
  amount: "",
  source: "Cash",
};
type CategoryBudgets = Partial<Record<ExpenseCategory, number>>;

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [rows, setRows] = useState<Transaction[]>(previewRows);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [filters, setFilters] = useState({
    from: "",
    to: "",
    type: "All" as "All" | TransactionType,
    category: "All" as "All" | ExpenseCategory,
  });
  const [status, setStatus] = useState("");
  const [toast, setToast] = useState("");
  const [categoryBudgets, setCategoryBudgets] = useState<CategoryBudgets>({});
  const [budgetDraft, setBudgetDraft] = useState<CategoryBudgets>({});

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 3200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => (auth ? onAuthStateChanged(auth, setUser) : undefined), []);
  useEffect(() => {
    if (!user || !db) return;
    const transactionQuery = query(
      collection(db, "transactions"),
      orderBy("date", "desc"),
    );
    return onSnapshot(
      transactionQuery,
      (snapshot) =>
        setRows(
          snapshot.docs.map(
            (item) => ({ id: item.id, ...item.data() }) as Transaction,
          ),
        ),
      () =>
        setStatus(
          "Unable to load transactions. Check your connection and Firestore rules.",
        ),
    );
  }, [user]);

  useEffect(() => {
    if (!user || !db) return;
    return onSnapshot(
      doc(db, "budgets", "main"),
      (snapshot) => {
        const budgets = (snapshot.data()?.budgets || {}) as CategoryBudgets;
        setCategoryBudgets(budgets);
        setBudgetDraft(budgets);
      },
      () =>
        setStatus(
          "Unable to load category budgets. Check your permissions and connection.",
        ),
    );
  }, [user]);

  const totals = useMemo(() => monthTotals(rows, month), [rows, month]);
  const visibleRows = useMemo(
    () => filterTransactions(rows, filters),
    [rows, filters],
  );
  const visibleTotal = useMemo(
    () => visibleRows.reduce((sum, row) => sum + row.total, 0),
    [visibleRows],
  );
  const categoryTotals = useMemo(
    () =>
      totals.rows
        .filter((row) => row.type === "Expense")
        .reduce<Record<string, number>>(
          (acc, row) => ({
            ...acc,
            [row.category]: (acc[row.category] || 0) + row.total,
          }),
          {},
        ),
    [totals.rows],
  );
  const categorySummary = useMemo(
    () =>
      EXPENSE_CATEGORIES.map((category) => {
        const rows = totals.rows.filter(
          (row) => row.type === "Expense" && row.category === category,
        );
        const entered = rows.reduce((sum, row) => sum + row.amount, 0);
        const savings = rows.reduce((sum, row) => sum + row.savings, 0);
        const total = rows.reduce((sum, row) => sum + row.total, 0);
        const budget = categoryBudgets[category] || 0;
        return {
          category,
          entered,
          savings,
          total,
          budget,
          difference: budget - total,
        };
      }).filter((row) => row.entered > 0 || row.budget > 0),
    [categoryBudgets, totals.rows],
  );
  const maxCategory = Math.max(...Object.values(categoryTotals), 1);
  const pieCategories = useMemo(
    () =>
      Object.entries(categoryTotals)
        .filter(([, value]) => value > 0)
        .sort((a, b) => b[1] - a[1]),
    [categoryTotals],
  );
  const pieTotal = pieCategories.reduce((sum, [, value]) => sum + value, 0);
  const pieGradient = (() => {
    if (!pieTotal) return "#edf1eb";
    let start = 0;
    const segments = pieCategories.map(([, value], index) => {
      const end = start + (value / pieTotal) * 100;
      const segment = `${PIE_COLORS[index % PIE_COLORS.length]} ${start}% ${end}%`;
      start = end;
      return segment;
    });
    return `conic-gradient(${segments.join(", ")})`;
  })();
  const budgetTotal = Object.values(categoryBudgets).reduce(
    (sum, value) => sum + (value || 0),
    0,
  );
  const currentMonth = new Date(`${month}-01T12:00:00`).toLocaleDateString(
    undefined,
    { month: "long", year: "numeric" },
  );
  const monthDayCount = daysInMonth(month);
  const amountPreview = form.amount
    && Number.isInteger(Number(form.amount))
    && Number(form.amount) > 0
    ? calculateTotals(form.type, Number(form.amount), form.category)
    : { savings: 0, total: 0 };

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const amount = Number(form.amount);
    if (
      !form.description.trim() ||
      !form.date ||
      !Number.isInteger(amount) ||
      amount <= 0 ||
      (form.type === "Expense" && !form.category)
    ) {
      setStatus(
        "Complete every required field with a positive whole BDT amount.",
      );
      return;
    }
    const calculated = calculateTotals(form.type, amount, form.category);
    const wasEditing = Boolean(editingId);
    const data = {
      ...form,
      description: form.description.trim(),
      amount,
      savings: calculated.savings,
      total: calculated.total,
      updatedAt: serverTimestamp(),
    };
    try {
      if (db && user) {
        if (editingId)
          await updateDoc(doc(db, "transactions", editingId), data);
        else
          await addDoc(collection(db, "transactions"), {
            ...data,
            createdAt: serverTimestamp(),
            createdBy: user.uid,
          });
      } else {
        setRows((current) => [
          { ...data, id: editingId || `preview-${Date.now()}` } as Transaction,
          ...current.filter((row) => row.id !== editingId),
        ]);
      }
      setForm(emptyForm);
      setEditingId(null);
      setStatus("");
      setToast(wasEditing ? "Transaction updated." : "Transaction recorded.");
    } catch {
      setStatus(
        "Could not save this transaction. Check your permissions and connection.",
      );
    }
  }

  async function saveBudgets(event: React.FormEvent) {
    event.preventDefault();
    const budgets = Object.fromEntries(
      EXPENSE_CATEGORIES.map((category) => [
        category,
        budgetDraft[category] || 0,
      ]),
    ) as CategoryBudgets;
    if (
      Object.values(budgets).some(
        (value) => !Number.isInteger(value) || value < 0,
      )
    ) {
      setStatus("Category budgets must be whole BDT amounts of zero or more.");
      return;
    }
    try {
      if (db && user)
        await setDoc(doc(db, "budgets", "main"), {
          budgets,
          updatedAt: serverTimestamp(),
          updatedBy: user.uid,
        });
      setCategoryBudgets(budgets);
      setBudgetDraft(budgets);
      setStatus("Category budgets saved for the whole household.");
    } catch {
      setStatus(
        "Could not save category budgets. Check your permissions and connection.",
      );
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this transaction? This cannot be undone."))
      return;
    try {
      if (db && user) await deleteDoc(doc(db, "transactions", id));
      else setRows((current) => current.filter((row) => row.id !== id));
      setStatus("Transaction deleted.");
    } catch {
      setStatus("Could not delete this transaction.");
    }
  }

  async function removeMonth() {
    const monthRows = rows.filter((row) => row.date.slice(0, 7) === month);
    if (!monthRows.length) {
      setStatus(`There are no transactions to delete for ${currentMonth}.`);
      return;
    }
    const confirmation = window.prompt(
      `This will permanently delete ${monthRows.length} transaction${monthRows.length === 1 ? "" : "s"} from ${currentMonth}. Type DELETE to confirm.`,
    );
    if (confirmation !== "DELETE") {
      setStatus("Monthly deletion cancelled. Nothing was deleted.");
      return;
    }
    try {
      if (db && user) {
        const firestore = db;
        for (let index = 0; index < monthRows.length; index += 450) {
          const batch = writeBatch(firestore);
          monthRows.slice(index, index + 450).forEach((row) => {
            batch.delete(doc(firestore, "transactions", row.id));
          });
          await batch.commit();
        }
      } else {
        setRows((current) =>
          current.filter((row) => row.date.slice(0, 7) !== month),
        );
      }
      setStatus(`${currentMonth} transactions deleted.`);
    } catch {
      setStatus(
        "Could not delete this month. Check your permissions and connection.",
      );
    }
  }

  function edit(row: Transaction) {
    setEditingId(row.id);
    setForm({
      type: row.type,
      date: row.date,
      category: row.category,
      description: row.description,
      amount: String(row.amount),
      source: row.source,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function downloadCsv() {
    const blob = new Blob([transactionsToCsv(visibleRows)], {
      type: "text/csv;charset=utf-8",
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `household-budget-${month}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  if (firebaseConfigured && !user)
    return (
      <main className="auth-page">
        <div className="auth-panel">
          <span className="eyebrow">HOUSEHOLD LEDGER</span>
          <h1>Welcome back.</h1>
          <p>Sign in to your shared household budget.</p>
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              try {
                if (auth)
                  await signInWithEmailAndPassword(auth, email, password);
              } catch {
                setAuthError(
                  "Sign-in failed. Check your email, password, and approved household access.",
                );
              }
            }}
          >
            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </label>
            {authError && <p className="error">{authError}</p>}
            <button className="primary" type="submit">
              Sign in <span>→</span>
            </button>
          </form>
          <small>
            Access is limited to the two approved household accounts.
          </small>
        </div>
      </main>
    );

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">+</span>
          <span>
            <strong>Household</strong>
            <small>shared budget</small>
          </span>
        </div>
        <div className="header-actions">
          <span className="sync-dot">
            ● {firebaseConfigured ? "Synced" : "Preview mode"}
          </span>
          {user && (
            <button
              className="text-button"
              onClick={() => auth && signOut(auth)}
            >
              Sign out
            </button>
          )}
          <span className="avatar">
            {user?.email?.[0].toUpperCase() || "H"}
          </span>
        </div>
      </header>
      <section className="content">
        <div className="intro">
          <div>
            <span className="eyebrow">{currentMonth.toUpperCase()}</span>
            <h1>Monthly overview</h1>
            <p>Here is the shape of your money this month.</p>
          </div>
          <div className="month-picker">
            <button
              aria-label="Previous month"
              onClick={() =>
                setMonth((value) => {
                  const date = new Date(`${value}-01T12:00:00`);
                  date.setMonth(date.getMonth() - 1);
                  return date.toISOString().slice(0, 7);
                })
              }
            >
              ‹
            </button>
            <strong>{currentMonth}</strong>
            <button
              aria-label="Next month"
              onClick={() =>
                setMonth((value) => {
                  const date = new Date(`${value}-01T12:00:00`);
                  date.setMonth(date.getMonth() + 1);
                  return date.toISOString().slice(0, 7);
                })
              }
            >
              ›
            </button>
          </div>
        </div>
        {!firebaseConfigured && (
          <div className="notice">
            Preview data is local to this browser. Add your Firebase values from{" "}
            <code>.env.example</code> before using real household data.
          </div>
        )}
        {status && (
          <div className="status" role="status">
            {status}
          </div>
        )}
        {toast && (
          <div className="toast" role="status" aria-live="polite">
            <span aria-hidden="true">✓</span>
            {toast}
          </div>
        )}
        <div className="metrics">
          <Metric label="Total income" value={totals.income} tone="green" />
          <Metric
            label="Entered expenses"
            value={totals.enteredExpenses}
            tone="coral"
          />
          <Metric
            label="Savings set aside"
            value={totals.savings}
            tone="amber"
          />
          <Metric label="Net remaining" value={totals.remaining} tone="ink" />
        </div>
        <div className="workspace">
          <details className="panel chart-panel">
            <summary className="panel-heading">
              <div>
                <span className="eyebrow">MONTHLY PULSE</span>
                <h3>Income vs. outflow</h3>
              </div>
              <span className="total-pill">
                {totals.deductions.toLocaleString()} deducted
              </span>
            </summary>
            <div className="comparison">
              <div className="bar-group">
                <div
                  className="bar income"
                  style={{
                    height: `${Math.max(10, Math.min(100, (totals.income / Math.max(totals.income, totals.deductions, 1)) * 100))}%`,
                  }}
                >
                    <span>BDT {totals.income.toLocaleString()}</span>
                </div>
                <small>Income</small>
              </div>
              <div className="bar-group">
                <div
                  className="bar expense"
                  style={{
                    height: `${Math.max(10, Math.min(100, (totals.deductions / Math.max(totals.income, totals.deductions, 1)) * 100))}%`,
                  }}
                >
                    <span>BDT {totals.deductions.toLocaleString()}</span>
                </div>
                <small>Outflow</small>
              </div>
              <div className="bar-group">
                <div
                  className="bar remaining"
                  style={{
                    height: `${Math.max(10, Math.min(100, (Math.max(totals.remaining, 0) / Math.max(totals.income, 1)) * 100))}%`,
                  }}
                >
                    <span>BDT {Math.max(totals.remaining, 0).toLocaleString()}</span>
                </div>
                <small>Remaining</small>
              </div>
            </div>
            <div className="expense-pie-section">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">CATEGORY MIX</span>
                  <h3>Where the money went</h3>
                </div>
                <span>BDT {pieTotal.toLocaleString()} total</span>
              </div>
              {pieCategories.length ? (
                <div className="expense-pie-layout">
                  <div
                    className="expense-pie"
                    style={{ background: pieGradient }}
                    role="img"
                    aria-label="Expense breakdown pie chart by category"
                  >
                    <div className="expense-pie-hole">
                      <strong>BDT {pieTotal.toLocaleString()}</strong>
                      <span>spent</span>
                    </div>
                  </div>
                  <div className="expense-pie-legend">
                    {pieCategories.map(([category, value], index) => {
                      const limit = categoryBudgets[category as ExpenseCategory] || 0;
                      return (
                        <div className="pie-legend-row" key={category}>
                          <span>
                            <i style={{ background: PIE_COLORS[index % PIE_COLORS.length] }} />
                            {category}
                          </span>
                          <strong>
                            BDT {value.toLocaleString()}
                            {limit ? ` / ${limit.toLocaleString()}` : ""}
                          </strong>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <p className="muted">No expenses recorded this month.</p>
              )}
            </div>
            <div className="breakdown">
              <div className="panel-heading">
                <h3>Expense breakdown</h3>
                <span>by total deduction</span>
              </div>
              {Object.entries(categoryTotals).length ? (
                Object.entries(categoryTotals)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 5)
                  .map(([category, value]) => (
                    <div className="breakdown-row" key={category}>
                      <div>
                        <span>{category}</span>
                        <strong>BDT {value.toLocaleString()}</strong>
                      </div>
                      <div className="track">
                        <i
                          style={{ width: `${(value / maxCategory) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))
              ) : (
                <p className="muted">No expenses recorded this month.</p>
              )}
            </div>
            <div className="budget-section">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">HOUSEHOLD LIMITS</span>
                  <h3>Category budgets</h3>
                </div>
                <span>BDT {budgetTotal.toLocaleString()} planned</span>
              </div>
              <p className="muted budget-help">
                Set a monthly limit for any category. Limits are shared by both household accounts.
              </p>
              <form className="budget-form" onSubmit={saveBudgets}>
                {EXPENSE_CATEGORIES.map((category) => {
                  const spent = categoryTotals[category] || 0;
                  const limit = budgetDraft[category] || 0;
                  return (
                    <label className="budget-field" key={category}>
                      <span>{category}</span>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        inputMode="numeric"
                        aria-label={`${category} monthly budget in BDT`}
                        placeholder="No limit"
                        value={budgetDraft[category] ?? ""}
                        onChange={(event) => {
                          const value = event.target.value;
                          if (value !== "" && !/^\d+$/.test(value)) {
                            setStatus("Category budgets must be whole BDT amounts.");
                            return;
                          }
                          setBudgetDraft({
                            ...budgetDraft,
                            [category]: value === "" ? undefined : Number(value),
                          });
                        }}
                      />
                      {limit > 0 && (
                        <small
                          className={
                            spent > limit ? "over-budget" : "under-budget"
                          }
                        >
                          BDT {spent.toLocaleString()} / {limit.toLocaleString()}
                        </small>
                      )}
                    </label>
                  );
                })}
                <button className="primary wide" type="submit">
                  Save category budgets <span>→</span>
                </button>
              </form>
            </div>
            <div className="category-summary-section">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">MONTHLY REPORT</span>
                  <h3>Category totals</h3>
                </div>
                <span>{currentMonth}</span>
              </div>
              {categorySummary.length ? (
                <div className="category-summary-table-wrap">
                  <table className="category-summary-table">
                    <thead>
                      <tr>
                        <th>Category</th>
                        <th className="number">Entered</th>
                        <th className="number">Savings</th>
                        <th className="number">Total</th>
                        <th className="number">Budget</th>
                        <th className="number">Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {categorySummary.map((row) => (
                        <tr key={row.category}>
                          <td>{row.category}</td>
                          <td className="number">BDT {row.entered.toLocaleString()}</td>
                          <td className="number savings">BDT {row.savings.toLocaleString()}</td>
                          <td className="number"><strong>BDT {row.total.toLocaleString()}</strong></td>
                          <td className="number">{row.budget ? `BDT ${row.budget.toLocaleString()}` : "—"}</td>
                          <td className={`number ${row.difference < 0 ? "over-budget" : "under-budget"}`}>
                            {row.budget ? `${row.difference < 0 ? "-" : ""}BDT ${Math.abs(row.difference).toLocaleString()}` : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="muted">No category totals for this month yet.</p>
              )}
            </div>
          </details>
          <section className="panel form-panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">QUICK ENTRY</span>
                <h2>{editingId ? "Edit transaction" : "Add transaction"}</h2>
              </div>
              {editingId && (
                <button
                  className="text-button"
                  onClick={() => {
                    setEditingId(null);
                    setForm(emptyForm);
                  }}
                >
                  Cancel
                </button>
              )}
            </div>
            <form onSubmit={submit}>
              <div className="segmented">
                <button
                  type="button"
                  className={form.type === "Expense" ? "selected" : ""}
                  onClick={() => setForm({ ...form, type: "Expense" })}
                >
                  Expense
                </button>
                <button
                  type="button"
                  className={
                    form.type === "Income" ? "selected income-tab" : ""
                  }
                  onClick={() =>
                    setForm({ ...form, type: "Income", category: "" })
                  }
                >
                  Income
                </button>
              </div>
              <div className="field-grid">
                <label>
                  Date
                  <input
                    type="date"
                    value={form.date}
                    onChange={(event) =>
                      setForm({ ...form, date: event.target.value })
                    }
                    required
                  />
                </label>
                <label>
                  Amount (BDT)
                  <input
                    type="number"
                    min="1"
                    step="1"
                    placeholder="0"
                    value={form.amount}
                    onChange={(event) =>
                      setForm({ ...form, amount: event.target.value })
                    }
                    required
                  />
                </label>
              </div>
              {form.type === "Expense" && (
                <label>
                  Category
                  <select
                    value={form.category}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        category: event.target.value as ExpenseCategory,
                      })
                    }
                    required
                  >
                    <option value="">Choose a category</option>
                    {EXPENSE_CATEGORIES.map((category) => (
                      <option key={category}>{category}</option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                Description
                <input
                  placeholder="What was this for?"
                  value={form.description}
                  onChange={(event) =>
                    setForm({ ...form, description: event.target.value })
                  }
                  required
                />
              </label>
              <label>
                Source
                <input
                  value={form.source}
                  onChange={(event) =>
                    setForm({ ...form, source: event.target.value })
                  }
                  required
                />
              </label>
              {form.type === "Expense" && form.amount && (
                <div className="calculation">
                  <span>
                    10% savings rule{" "}
                    {form.category === "Tax" || form.category === "Donation"
                      ? "(exempt)"
                      : ""}
                  </span>
                  <strong>
                    +BDT {amountPreview.savings} savings{" "}
                    <b>→ BDT {amountPreview.total} total</b>
                  </strong>
                </div>
              )}
              <button className="primary wide" type="submit">
                {editingId ? "Update transaction" : "Save transaction"}{" "}
                <span>→</span>
              </button>
            </form>
            <div className="quick-budget-progress">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">THIS MONTH</span>
                  <h3>Budget progress</h3>
                </div>
                <span>{currentMonth}</span>
              </div>
              {Object.entries(categoryBudgets).some(([, limit]) => limit) ? (
                <div className="quick-budget-list">
                  {EXPENSE_CATEGORIES.filter((category) => categoryBudgets[category]).map((category) => {
                    const spent = categoryTotals[category] || 0;
                    const limit = categoryBudgets[category] || 0;
                    const percentage = Math.min(100, (spent / limit) * 100);
                    const budgetDays = Math.round((spent / limit) * monthDayCount);
                    return (
                      <div className="quick-budget-row" key={category}>
                        <div className="quick-budget-label">
                          <span>{category}</span>
                          <strong className={spent > limit ? "over-budget" : ""}>
                            {budgetDays}/{monthDayCount} days · BDT {spent.toLocaleString()} / {limit.toLocaleString()}
                          </strong>
                        </div>
                        <div className="quick-budget-track">
                          <i
                            className={spent > limit ? "over-budget" : ""}
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="muted quick-budget-empty">Set category limits below to see progress here.</p>
              )}
            </div>
          </section>
        </div>
        <section className="panel history-panel">
          <div className="history-heading">
            <div>
              <span className="eyebrow">LEDGER</span>
              <h2>Transaction history</h2>
            </div>
            <button className="outline-button" onClick={downloadCsv}>
              ↓ Export CSV
            </button>
            <button
              className="danger-button"
              onClick={removeMonth}
              disabled={!totals.rows.length}
            >
              Delete {currentMonth}
            </button>
          </div>
          <div className="filters">
            <input
              type="date"
              aria-label="Filter from date"
              value={filters.from}
              onChange={(event) =>
                setFilters({ ...filters, from: event.target.value })
              }
            />
            <span>to</span>
            <input
              type="date"
              aria-label="Filter to date"
              value={filters.to}
              onChange={(event) =>
                setFilters({ ...filters, to: event.target.value })
              }
            />
            <select
              aria-label="Filter type"
              value={filters.type}
              onChange={(event) =>
                setFilters({
                  ...filters,
                  type: event.target.value as "All" | TransactionType,
                })
              }
            >
              <option>All</option>
              <option>Income</option>
              <option>Expense</option>
            </select>
            <select
              aria-label="Filter category"
              value={filters.category}
              onChange={(event) =>
                setFilters({
                  ...filters,
                  category: event.target.value as "All" | ExpenseCategory,
                })
              }
            >
              <option>All</option>
              {EXPENSE_CATEGORIES.map((category) => (
                <option key={category}>{category}</option>
              ))}
            </select>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Category</th>
                  <th>Description</th>
                  <th>Source</th>
                  <th className="number">Amount (BDT)</th>
                  <th className="number">Savings</th>
                  <th className="number">Total</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      {new Date(`${row.date}T12:00:00`).toLocaleDateString(
                        undefined,
                        { month: "short", day: "numeric", year: "numeric" },
                      )}
                    </td>
                    <td>
                      <span className={`type-badge ${row.type.toLowerCase()}`}>
                        {row.type}
                      </span>
                    </td>
                    <td>{row.category || "—"}</td>
                    <td className="description">{row.description}</td>
                    <td>{row.source}</td>
                    <td className="number">BDT {row.amount.toLocaleString()}</td>
                    <td className="number savings">
                      {row.savings ? `BDT ${row.savings}` : "—"}
                    </td>
                    <td className="number">
                      <strong>BDT {row.total.toLocaleString()}</strong>
                    </td>
                    <td className="actions">
                      <button
                        aria-label={`Edit ${row.description}`}
                        onClick={() => edit(row)}
                      >
                        ✎
                      </button>
                      <button
                        aria-label={`Delete ${row.description}`}
                        onClick={() => remove(row.id)}
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={7} className="number total-label">Total</td>
                  <td className="number">
                    <strong>BDT {visibleTotal.toLocaleString()}</strong>
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
            {!visibleRows.length && (
              <div className="empty">
                <strong>No transactions found</strong>
                <span>Try changing your filters or add a new entry above.</span>
              </div>
            )}
          </div>
        </section>
        <footer>
          <span>Household ledger · private by design</span>
          <span>All totals include savings set aside</span>
        </footer>
      </section>
    </main>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div className={`metric ${tone}`}>
      <span>{label}</span>
      <strong>BDT {value.toLocaleString()}</strong>
      <i />
    </div>
  );
}

export default App;
