import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { inr, exportCSV } from "@/lib/api";
import { Search, Download, Plus } from "lucide-react";

export default function Sales() {
  const nav = useNavigate();
  const [list, setList] = useState([]);
  const [search, setSearch] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  const load = () => api.get("/sales", { params: { search, start, end } }).then((r) => setList(r.data));
  useEffect(() => { load(); }, [search, start, end]);

  return (
    <div className="space-y-4" data-testid="sales-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl">Sales History</h1>
        <div className="flex gap-2">
          <button data-testid="export-sales" onClick={() => exportCSV("sales.csv", list.map((s) => ({ Invoice: s.invoice_no, Date: s.date, Customer: s.customer_name, Total: s.grand_total, Received: s.received, Due: s.balance_due })))} className="flex items-center gap-1 border px-3 py-2 rounded-md text-sm"><Download className="w-4 h-4" />CSV</button>
          <button onClick={() => nav("/sales/new")} className="flex items-center gap-1 bg-emerald-brand text-white px-4 py-2 rounded-md text-sm font-semibold"><Plus className="w-4 h-4" />New Sale</button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]"><Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" /><input data-testid="sales-search" className="w-full pl-9 pr-3 py-2 border rounded-md" placeholder="Invoice, customer, mobile…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <input type="date" className="border rounded-md px-3" value={start} onChange={(e) => setStart(e.target.value)} />
        <input type="date" className="border rounded-md px-3" value={end} onChange={(e) => setEnd(e.target.value)} />
      </div>
      <div className="bg-card border rounded-md overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-muted-foreground border-b bg-muted/40"><th className="p-3">Invoice</th><th>Date</th><th>Customer</th><th>Total</th><th>Received</th><th>Due</th></tr></thead>
          <tbody>{list.map((s) => (
            <tr key={s.id} onClick={() => nav(`/invoice/${s.id}`)} className="border-b last:border-0 hover:bg-muted/40 cursor-pointer" data-testid={`sale-row-${s.invoice_no}`}>
              <td className="p-3 font-mono text-xs text-gold">{s.invoice_no}</td><td>{s.date}</td><td className="font-medium">{s.customer_name}</td><td>{inr(s.grand_total)}</td><td>{inr(s.received)}</td><td className={s.balance_due > 0 ? "text-destructive" : ""}>{inr(s.balance_due)}</td>
            </tr>))}</tbody>
        </table>
        {!list.length && <p className="p-6 text-center text-muted-foreground">No sales found</p>}
      </div>
    </div>
  );
}
