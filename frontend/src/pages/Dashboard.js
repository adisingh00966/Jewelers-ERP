import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api, { inr } from "@/lib/api";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from "recharts";
import { IndianRupee, Package, AlertTriangle, Users, Wallet, Smartphone, CreditCard, Building2, Landmark } from "lucide-react";

const Card = ({ title, value, icon: Icon, accent }) => (
  <div className="bg-card border rounded-md p-4" data-testid={`stat-${title.toLowerCase().replace(/ /g, "-")}`}>
    <div className="flex items-center justify-between">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{title}</span>
      <Icon className={`w-4 h-4 ${accent || "text-gold"}`} />
    </div>
    <div className="mt-2 text-2xl font-bold">{value}</div>
  </div>
);

export default function Dashboard() {
  const [d, setD] = useState(null);
  useEffect(() => { api.get("/dashboard").then((r) => setD(r.data)); }, []);
  if (!d) return <div>Loading…</div>;
  const t = d.today, inv = d.inventory;
  return (
    <div className="space-y-6" data-testid="dashboard">
      <div><h1 className="font-display text-3xl">Dashboard</h1><p className="text-muted-foreground text-sm">Today's business overview</p></div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card title="Today's Sales" value={inr(t.total_sales)} icon={IndianRupee} />
        <Card title="Expenses" value={inr(t.expenses)} icon={AlertTriangle} accent="text-orange-500" />
        <Card title="Credit / Due" value={inr(t.credit)} icon={AlertTriangle} accent="text-destructive" />
        <Card title="Net Sales" value={inr(t.net_sales)} icon={IndianRupee} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card title="Cash" value={inr(t.cash)} icon={Wallet} />
        <Card title="UPI" value={inr(t.upi)} icon={Smartphone} />
        <Card title="Card" value={inr(t.card)} icon={CreditCard} />
        <Card title="Bank" value={inr(t.bank)} icon={Building2} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card title="Active Girvi" value={d.girvi.active_count} icon={Landmark} />
        <Card title="Girvi Outstanding" value={inr(d.girvi.total_outstanding)} icon={IndianRupee} />
        <Card title="Girvi Due Soon" value={d.girvi.due_soon} icon={AlertTriangle} accent="text-orange-500" />
        <Card title="Girvi Overdue" value={d.girvi.overdue} icon={AlertTriangle} accent="text-destructive" />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-card border rounded-md p-4">
          <h2 className="font-semibold mb-4">Weekly Sales</h2>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={d.graph}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
              <XAxis dataKey="date" fontSize={12} /><YAxis fontSize={12} tickFormatter={(v) => "₹" + v / 1000 + "k"} />
              <Tooltip formatter={(v) => inr(v)} />
              <Bar dataKey="sales" fill="hsl(var(--gold))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Card title="Gold Stock (g)" value={inv.gold_stock} icon={Landmark} />
            <Card title="Silver Stock (g)" value={inv.silver_stock} icon={Landmark} />
            <Card title="Items" value={inv.total_items} icon={Package} />
            <Card title="Low Stock" value={inv.low_stock} icon={AlertTriangle} accent="text-orange-500" />
          </div>
          <div className="bg-card border rounded-md p-4">
            <h2 className="font-semibold mb-3">Top Items (Month)</h2>
            {d.top_items.length ? d.top_items.map((i) => (
              <div key={i.name} className="flex justify-between text-sm py-1.5 border-b last:border-0"><span className="truncate">{i.name}</span><span className="font-semibold">{inr(i.value)}</span></div>
            )) : <p className="text-sm text-muted-foreground">No sales yet</p>}
          </div>
        </div>
      </div>

      {(d.alerts.low_stock.length > 0 || d.alerts.out_of_stock.length > 0) && (
        <div className="bg-orange-50 border border-orange-200 rounded-md p-4">
          <h2 className="font-semibold text-orange-700 flex items-center gap-2 mb-2"><AlertTriangle className="w-4 h-4" />Stock Alerts</h2>
          <div className="flex flex-wrap gap-2 text-sm">
            {d.alerts.out_of_stock.map((p) => <span key={p.id} className="bg-destructive/10 text-destructive px-2 py-1 rounded">{p.name} — OUT</span>)}
            {d.alerts.low_stock.map((p) => <span key={p.id} className="bg-orange-100 text-orange-700 px-2 py-1 rounded">{p.name} — {p.quantity} left</span>)}
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-card border rounded-md p-4">
          <div className="flex justify-between mb-3"><h2 className="font-semibold">Recent Sales</h2><Link to="/sales" className="text-xs text-gold">View all</Link></div>
          {d.recent_sales.map((s) => (
            <Link to={`/invoice/${s.id}`} key={s.id} className="flex justify-between text-sm py-2 border-b last:border-0 hover:bg-muted/50 px-1 rounded">
              <span><b>{s.invoice_no}</b> · {s.customer_name}</span><span className="font-semibold">{inr(s.grand_total)}</span>
            </Link>
          ))}
        </div>
        <div className="bg-card border rounded-md p-4">
          <div className="flex justify-between mb-3"><h2 className="font-semibold flex items-center gap-2"><Users className="w-4 h-4" />Recent Customers</h2><Link to="/customers" className="text-xs text-gold">View all</Link></div>
          {d.recent_customers.map((c) => (
            <Link to={`/customers/${c.id}`} key={c.id} className="flex justify-between text-sm py-2 border-b last:border-0 hover:bg-muted/50 px-1 rounded"><span>{c.name}</span><span className="text-muted-foreground">{c.mobile}</span></Link>
          ))}
        </div>
      </div>
    </div>
  );
}
