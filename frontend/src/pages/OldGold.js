import { useEffect, useState, useMemo } from "react";
import api, { inr } from "@/lib/api";
import { toast } from "sonner";
import { Plus, Search } from "lucide-react";

const empty = { customer_name: "", mobile: "", address: "", description: "", gross_weight: 0, stone_weight: 0, purity: "22K", testing_result: "", rate_per_gram: 0, deduction_pct: 0, settlement_type: "cash", cash_paid: 0 };

export default function OldGold() {
  const [list, setList] = useState([]);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(false);
  const [f, setF] = useState(empty);

  const load = () => api.get("/old-gold", { params: { search } }).then((r) => setList(r.data));
  useEffect(() => { load(); }, [search]);

  const calc = useMemo(() => {
    const net = +(f.gross_weight - f.stone_weight).toFixed(3);
    const ded = net * f.rate_per_gram * f.deduction_pct / 100;
    return { net, ded, final: net * f.rate_per_gram - ded };
  }, [f]);

  const save = async () => {
    if (!f.customer_name || !f.description) return toast.error("Enter customer and jewellery description");
    try {
      await api.post("/old-gold", { ...f, gross_weight: +f.gross_weight, stone_weight: +f.stone_weight, rate_per_gram: +f.rate_per_gram, deduction_pct: +f.deduction_pct, cash_paid: f.settlement_type === "exchange" ? 0 : (f.settlement_type === "partial" ? +f.cash_paid : calc.final) });
      toast.success("Old gold purchase recorded"); setModal(false); setF(empty); load();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  return (
    <div className="space-y-4" data-testid="oldgold-page">
      <div className="flex justify-between items-center">
        <div><h1 className="font-display text-3xl">Old Gold Purchase / Exchange</h1><p className="text-sm text-muted-foreground">Buy old jewellery — pay cash or exchange against a new sale via New Sale screen.</p></div>
        <button data-testid="add-oldgold" onClick={() => { setF(empty); setModal(true); }} className="flex items-center gap-1 bg-emerald-brand text-white px-4 py-2 rounded-md text-sm font-semibold"><Plus className="w-4 h-4" />New Entry</button>
      </div>
      <div className="relative"><Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" /><input data-testid="oldgold-search" className="w-full pl-9 pr-3 py-2 border rounded-md" placeholder="Search customer or mobile…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>

      <div className="bg-card border rounded-md overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-muted-foreground border-b bg-muted/40"><th className="p-3">Date</th><th>Customer</th><th>Item</th><th>Net Wt</th><th>Purity</th><th>Rate/g</th><th>Deduction</th><th>Final Value</th><th>Settlement</th></tr></thead>
          <tbody>{list.map((o) => (
            <tr key={o.id} className="border-b last:border-0 hover:bg-muted/40" data-testid={`oldgold-row-${o.id}`}>
              <td className="p-3">{o.date}</td><td className="font-medium">{o.customer_name}</td><td className="truncate max-w-[160px]">{o.description}</td><td>{o.net_weight}g</td><td>{o.purity}</td><td>{inr(o.rate_per_gram)}</td><td>{inr(o.deduction_amount)}</td><td className="font-semibold text-gold">{inr(o.final_value)}</td>
              <td><span className="px-2 py-0.5 rounded text-xs bg-muted capitalize">{o.settlement_type}{o.invoice_no ? ` · ${o.invoice_no}` : ""}</span></td>
            </tr>))}</tbody>
        </table>
        {!list.length && <p className="p-6 text-center text-muted-foreground">No old gold entries</p>}
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setModal(false)}>
          <div className="bg-card rounded-md w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5" onClick={(e) => e.stopPropagation()} data-testid="oldgold-modal">
            <h2 className="font-display text-2xl mb-4">Old Gold Purchase</h2>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              {[["customer_name", "Customer Name*"], ["mobile", "Mobile"], ["description", "Jewellery Description*"], ["purity", "Purity"], ["testing_result", "Testing Result"]].map(([k, l]) => (
                <div key={k}><label className="text-xs">{l}</label><input data-testid={`og-${k}`} className="w-full mt-1 px-2 py-1.5 border rounded" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></div>
              ))}
              {[["gross_weight", "Gross Wt (g)"], ["stone_weight", "Stone Wt (g)"], ["rate_per_gram", "Rate per gram"], ["deduction_pct", "Deduction %"]].map(([k, l]) => (
                <div key={k}><label className="text-xs">{l}</label><input data-testid={`og-${k}`} type="number" className="w-full mt-1 px-2 py-1.5 border rounded" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></div>
              ))}
              <div><label className="text-xs">Settlement</label><select data-testid="og-settlement" className="w-full mt-1 px-2 py-1.5 border rounded" value={f.settlement_type} onChange={(e) => setF({ ...f, settlement_type: e.target.value })}><option value="cash">Cash Payment</option><option value="partial">Partial + Cash</option><option value="exchange">Exchange (record only)</option></select></div>
              {f.settlement_type === "partial" && <div><label className="text-xs">Cash Paid ₹</label><input type="number" className="w-full mt-1 px-2 py-1.5 border rounded" value={f.cash_paid} onChange={(e) => setF({ ...f, cash_paid: e.target.value })} /></div>}
            </div>
            <div className="grid grid-cols-3 gap-2 mt-4 bg-muted/40 rounded p-3 text-sm">
              <span>Net Weight: <b>{calc.net}g</b></span><span>Deduction: <b>{inr(calc.ded)}</b></span><span className="text-gold font-semibold">Final Value: {inr(calc.final)}</span>
            </div>
            <div className="flex justify-end gap-2 mt-5"><button onClick={() => setModal(false)} className="px-4 py-2 border rounded-md">Cancel</button><button data-testid="save-oldgold" onClick={save} className="px-5 py-2 bg-emerald-brand text-white rounded-md font-semibold">Save</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
