import { useState } from "react";
import api, { inr } from "@/lib/api";
import { toast } from "sonner";
import { Search } from "lucide-react";

export default function SalesReturns() {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState([]);
  const [sale, setSale] = useState(null);
  const [sel, setSel] = useState({});
  const [reason, setReason] = useState("");
  const [mode, setMode] = useState("cash");
  const [history, setHistory] = useState([]);

  const find = () => api.get("/sales", { params: { search } }).then((r) => setResults(r.data));
  const loadHistory = () => api.get("/sales-returns").then((r) => setHistory(r.data));
  const pick = (s) => { setSale(s); setResults([]); const m = {}; s.items.forEach((it, i) => m[i] = { checked: false, qty: it.quantity, amount: it.line_total, product_id: it.product_id, name: it.name }); setSel(m); };

  const submit = async () => {
    const items = Object.values(sel).filter((x) => x.checked).map((x) => ({ product_id: x.product_id, name: x.name, quantity: +x.qty, amount: +x.amount }));
    if (!items.length) return toast.error("Select at least one item to return");
    try { await api.post("/sales-returns", { sale_id: sale.id, items, reason, refund_mode: mode }); toast.success("Sales return processed, stock restored"); setSale(null); setSearch(""); loadHistory(); }
    catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  return (
    <div className="space-y-4" data-testid="sales-returns-page">
      <h1 className="font-display text-3xl">Sales Returns</h1>
      <div className="flex gap-2">
        <div className="relative flex-1"><Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" /><input data-testid="return-search" className="w-full pl-9 pr-3 py-2 border rounded-md" placeholder="Search invoice no, customer, mobile…" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && find()} /></div>
        <button onClick={find} className="bg-emerald-brand text-white px-4 rounded-md text-sm">Search</button>
        <button onClick={loadHistory} className="border px-4 rounded-md text-sm">History</button>
      </div>

      {results.length > 0 && (
        <div className="bg-card border rounded-md divide-y">{results.map((s) => (
          <div key={s.id} className="p-3 flex justify-between hover:bg-muted/40 cursor-pointer" onClick={() => pick(s)} data-testid={`return-result-${s.invoice_no}`}><span><b>{s.invoice_no}</b> · {s.customer_name}</span><span>{inr(s.grand_total)} · {s.date}</span></div>
        ))}</div>
      )}

      {sale && (
        <div className="bg-card border rounded-md p-4" data-testid="return-detail">
          <h2 className="font-semibold mb-2">{sale.invoice_no} — {sale.customer_name}</h2>
          <table className="w-full text-sm mb-3">
            <thead><tr className="text-left text-muted-foreground border-b"><th className="py-2">Return</th><th>Item</th><th>Original</th><th>Qty</th><th>Return Amount</th></tr></thead>
            <tbody>{sale.items.map((it, i) => (
              <tr key={i} className="border-b last:border-0">
                <td className="py-2"><input data-testid={`return-check-${i}`} type="checkbox" checked={sel[i]?.checked || false} onChange={(e) => setSel({ ...sel, [i]: { ...sel[i], checked: e.target.checked } })} /></td>
                <td>{it.name}</td><td>{inr(it.line_total)}</td>
                <td><input type="number" className="w-16 px-2 py-1 border rounded" value={sel[i]?.qty} onChange={(e) => setSel({ ...sel, [i]: { ...sel[i], qty: e.target.value } })} /></td>
                <td><input type="number" className="w-28 px-2 py-1 border rounded" value={sel[i]?.amount} onChange={(e) => setSel({ ...sel, [i]: { ...sel[i], amount: e.target.value } })} /></td>
              </tr>))}</tbody>
          </table>
          <div className="flex flex-wrap gap-3 items-end">
            <div><label className="text-xs">Reason</label><input className="px-2 py-1.5 border rounded block mt-1" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
            <div><label className="text-xs">Refund Mode</label><select className="px-2 py-1.5 border rounded block mt-1" value={mode} onChange={(e) => setMode(e.target.value)}><option>cash</option><option>upi</option><option>bank</option><option value="credit">credit adjustment</option></select></div>
            <button data-testid="submit-return" onClick={submit} className="bg-emerald-brand text-white px-5 py-2 rounded-md font-semibold">Process Return</button>
          </div>
        </div>
      )}

      {history.length > 0 && (
        <div className="bg-card border rounded-md overflow-x-auto">
          <table className="w-full text-sm"><thead><tr className="text-left text-muted-foreground border-b bg-muted/40"><th className="p-3">Return No</th><th>Invoice</th><th>Customer</th><th>Amount</th><th>Refund</th><th>Date</th></tr></thead>
            <tbody>{history.map((r) => <tr key={r.id} className="border-b last:border-0"><td className="p-3 font-mono text-xs">{r.return_no}</td><td>{r.invoice_no}</td><td>{r.customer_name}</td><td>{inr(r.total)}</td><td>{r.refund_mode}</td><td>{r.date}</td></tr>)}</tbody></table>
        </div>
      )}
    </div>
  );
}
