import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import api, { inr } from "@/lib/api";
import { ArrowLeft } from "lucide-react";

export default function CustomerDetail() {
  const { id } = useParams();
  const [d, setD] = useState(null);
  useEffect(() => { api.get(`/customers/${id}`).then((r) => setD(r.data)); }, [id]);
  if (!d) return <div>Loading…</div>;
  const c = d.customer;
  return (
    <div className="space-y-5" data-testid="customer-detail">
      <Link to="/customers" className="flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="w-4 h-4" />Back</Link>
      <div className="bg-card border rounded-md p-5">
        <h1 className="font-display text-3xl">{c.name}</h1>
        <p className="text-muted-foreground">{c.mobile} · {c.city}, {c.state} {c.pincode}</p>
        <p className="text-sm mt-1">{c.address}</p>
        {c.gstin && <p className="text-sm">GSTIN: {c.gstin}</p>}
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <div className="bg-card border rounded-md p-4"><div className="text-xs uppercase text-muted-foreground">Total Purchases</div><div className="text-2xl font-bold">{inr(d.total_purchases)}</div></div>
        <div className="bg-card border rounded-md p-4"><div className="text-xs uppercase text-muted-foreground">Outstanding</div><div className="text-2xl font-bold text-destructive">{inr(d.total_outstanding)}</div></div>
        <div className="bg-card border rounded-md p-4"><div className="text-xs uppercase text-muted-foreground">Invoices</div><div className="text-2xl font-bold">{d.sales.length}</div></div>
      </div>
      <div className="bg-card border rounded-md p-5">
        <h2 className="font-semibold mb-3">Purchase & Ledger History</h2>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-muted-foreground border-b"><th className="py-2">Invoice</th><th>Date</th><th>Total</th><th>Received</th><th>Due</th></tr></thead>
          <tbody>{d.sales.map((s) => (
            <tr key={s.id} className="border-b last:border-0 hover:bg-muted/40"><td className="py-2"><Link className="text-gold" to={`/invoice/${s.id}`}>{s.invoice_no}</Link></td><td>{s.date}</td><td>{inr(s.grand_total)}</td><td>{inr(s.received)}</td><td className={s.balance_due > 0 ? "text-destructive" : ""}>{inr(s.balance_due)}</td></tr>
          ))}</tbody>
        </table>
        {!d.sales.length && <p className="text-muted-foreground text-sm">No transactions</p>}
      </div>
    </div>
  );
}
