import { useEffect, useState } from "react";
import api, { inr, exportCSV } from "@/lib/api";
import { Download } from "lucide-react";

const presets = {
  today: () => { const d = new Date().toISOString().slice(0, 10); return [d, d]; },
  yesterday: () => { const d = new Date(Date.now() - 864e5).toISOString().slice(0, 10); return [d, d]; },
  week: () => { const e = new Date().toISOString().slice(0, 10); const s = new Date(Date.now() - 6 * 864e5).toISOString().slice(0, 10); return [s, e]; },
  month: () => { const n = new Date(); const s = new Date(n.getFullYear(), n.getMonth(), 1).toISOString().slice(0, 10); return [s, n.toISOString().slice(0, 10)]; },
  lastmonth: () => { const n = new Date(); const s = new Date(n.getFullYear(), n.getMonth() - 1, 1).toISOString().slice(0, 10); const e = new Date(n.getFullYear(), n.getMonth(), 0).toISOString().slice(0, 10); return [s, e]; },
};

export default function Reports() {
  const [start, setStart] = useState(presets.month()[0]);
  const [end, setEnd] = useState(presets.month()[1]);
  const [r, setR] = useState(null);

  const load = () => api.get("/reports/sales", { params: { start, end } }).then((x) => setR(x.data));
  useEffect(() => { load(); }, [start, end]);
  const setPreset = (k) => { const [s, e] = presets[k](); setStart(s); setEnd(e); };

  return (
    <div className="space-y-5" data-testid="reports-page">
      <h1 className="font-display text-3xl">Reports</h1>
      <div className="flex flex-wrap gap-2 items-center">
        {Object.keys(presets).map((k) => <button key={k} data-testid={`preset-${k}`} onClick={() => setPreset(k)} className="border px-3 py-1.5 rounded-md text-sm capitalize hover:bg-muted">{k}</button>)}
        <input type="date" className="border rounded-md px-3 py-1.5" value={start} onChange={(e) => setStart(e.target.value)} />
        <input type="date" className="border rounded-md px-3 py-1.5" value={end} onChange={(e) => setEnd(e.target.value)} />
      </div>

      {r && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat l="Invoices" v={r.count} />
            <Stat l="Gross Sales" v={inr(r.gross)} />
            <Stat l="Discounts" v={inr(r.discount)} />
            <Stat l="GST Collected" v={inr(r.gst)} />
            <Stat l="Net Sales" v={inr(r.net)} />
            <Stat l="Received" v={inr(r.received)} />
            <Stat l="Outstanding" v={inr(r.due)} />
            <Stat l="Gold Sales" v={inr(r.by_metal?.Gold || 0)} />
          </div>

          <div className="flex justify-between items-center">
            <h2 className="font-semibold">Sales Detail</h2>
            <button data-testid="export-report" onClick={() => exportCSV(`report_${start}_${end}.csv`, r.sales.map((s) => ({ Invoice: s.invoice_no, Date: s.date, Customer: s.customer_name, Subtotal: s.subtotal, GST: s.gst_amount, Total: s.grand_total, Received: s.received, Due: s.balance_due })))} className="flex items-center gap-1 border px-3 py-2 rounded-md text-sm"><Download className="w-4 h-4" />Export CSV</button>
          </div>
          <div className="bg-card border rounded-md overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-muted-foreground border-b bg-muted/40"><th className="p-3">Invoice</th><th>Date</th><th>Customer</th><th>Subtotal</th><th>GST</th><th>Total</th></tr></thead>
              <tbody>{r.sales.map((s) => <tr key={s.id} className="border-b last:border-0 hover:bg-muted/40"><td className="p-3 font-mono text-xs">{s.invoice_no}</td><td>{s.date}</td><td>{s.customer_name}</td><td>{inr(s.subtotal)}</td><td>{inr(s.gst_amount)}</td><td className="font-semibold">{inr(s.grand_total)}</td></tr>)}</tbody>
            </table>
            {!r.sales.length && <p className="p-6 text-center text-muted-foreground">No data in range</p>}
          </div>
        </>
      )}
    </div>
  );
}
const Stat = ({ l, v }) => <div className="bg-card border rounded-md p-4"><div className="text-xs uppercase tracking-wide text-muted-foreground">{l}</div><div className="text-xl font-bold mt-1">{v}</div></div>;
