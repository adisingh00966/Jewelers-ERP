import { useEffect, useState } from "react";
import api, { inr, exportCSV } from "@/lib/api";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

const CATS = ["Rent", "Electricity", "Salary", "Transport", "Packaging", "Marketing", "Repair", "Maintenance", "Miscellaneous"];
const today = () => new Date().toISOString().slice(0, 10);
const empty = () => ({ date: today(), category: "Rent", description: "", amount: 0, payment_mode: "cash" });

export default function Expenses() {
  const [data, setData] = useState({ expenses: [], total: 0, by_category: {} });
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [cat, setCat] = useState("");
  const [modal, setModal] = useState(false);
  const [f, setF] = useState(empty());

  const load = () => api.get("/expenses", { params: { start, end, category: cat } }).then((r) => setData(r.data));
  useEffect(() => { load(); }, [start, end, cat]);

  const save = async () => {
    if (!f.amount || f.amount <= 0) return toast.error("Enter a valid amount");
    try { await api.post("/expenses", { ...f, amount: +f.amount }); toast.success("Expense logged"); setModal(false); setF(empty()); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };
  const del = async (id) => { await api.delete(`/expenses/${id}`); toast.success("Deleted"); load(); };

  return (
    <div className="space-y-4" data-testid="expenses-page">
      <div className="flex justify-between items-center">
        <h1 className="font-display text-3xl">Expenses</h1>
        <button data-testid="add-expense" onClick={() => { setF(empty()); setModal(true); }} className="flex items-center gap-1 bg-emerald-brand text-white px-4 py-2 rounded-md text-sm font-semibold"><Plus className="w-4 h-4" />Add Expense</button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-card border rounded-md p-4"><div className="text-xs uppercase text-muted-foreground">Total Expenses</div><div className="text-2xl font-bold text-destructive">{inr(data.total)}</div></div>
        {Object.entries(data.by_category).slice(0, 3).map(([k, v]) => (
          <div key={k} className="bg-card border rounded-md p-4"><div className="text-xs uppercase text-muted-foreground">{k}</div><div className="text-2xl font-bold">{inr(v)}</div></div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <input type="date" className="border rounded-md px-3 py-1.5" value={start} onChange={(e) => setStart(e.target.value)} />
        <input type="date" className="border rounded-md px-3 py-1.5" value={end} onChange={(e) => setEnd(e.target.value)} />
        <select data-testid="expense-cat-filter" value={cat} onChange={(e) => setCat(e.target.value)} className="border rounded-md px-3 py-1.5"><option value="">All Categories</option>{CATS.map((c) => <option key={c}>{c}</option>)}</select>
        <button onClick={() => exportCSV("expenses.csv", data.expenses.map((e) => ({ Date: e.date, Category: e.category, Description: e.description, Amount: e.amount, Mode: e.payment_mode, By: e.added_by })))} className="border px-3 py-1.5 rounded-md text-sm">Export CSV</button>
      </div>

      <div className="bg-card border rounded-md overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-muted-foreground border-b bg-muted/40"><th className="p-3">Date</th><th>Category</th><th>Description</th><th>Mode</th><th>Amount</th><th>By</th><th></th></tr></thead>
          <tbody>{data.expenses.map((e) => (
            <tr key={e.id} className="border-b last:border-0 hover:bg-muted/40" data-testid={`expense-row-${e.id}`}>
              <td className="p-3">{e.date}</td><td>{e.category}</td><td>{e.description}</td><td className="capitalize">{e.payment_mode}</td><td className="font-semibold">{inr(e.amount)}</td><td>{e.added_by}</td>
              <td><button onClick={() => del(e.id)} className="text-destructive"><Trash2 className="w-4 h-4" /></button></td>
            </tr>))}</tbody>
        </table>
        {!data.expenses.length && <p className="p-6 text-center text-muted-foreground">No expenses</p>}
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setModal(false)}>
          <div className="bg-card rounded-md w-full max-w-md p-5" onClick={(e) => e.stopPropagation()} data-testid="expense-modal">
            <h2 className="font-display text-2xl mb-4">Add Expense</h2>
            <div className="space-y-3">
              <div><label className="text-sm">Date</label><input data-testid="ef-date" type="date" className="w-full mt-1 px-3 py-2 border rounded" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></div>
              <div><label className="text-sm">Category</label><select data-testid="ef-category" className="w-full mt-1 px-3 py-2 border rounded" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{CATS.map((c) => <option key={c}>{c}</option>)}</select></div>
              <div><label className="text-sm">Description</label><input data-testid="ef-desc" className="w-full mt-1 px-3 py-2 border rounded" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
              <div><label className="text-sm">Amount ₹</label><input data-testid="ef-amount" type="number" className="w-full mt-1 px-3 py-2 border rounded" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></div>
              <div><label className="text-sm">Payment Mode</label><select className="w-full mt-1 px-3 py-2 border rounded" value={f.payment_mode} onChange={(e) => setF({ ...f, payment_mode: e.target.value })}><option>cash</option><option>upi</option><option>card</option><option>bank</option></select></div>
            </div>
            <div className="flex justify-end gap-2 mt-5"><button onClick={() => setModal(false)} className="px-4 py-2 border rounded-md">Cancel</button><button data-testid="save-expense" onClick={save} className="px-5 py-2 bg-emerald-brand text-white rounded-md font-semibold">Save</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
