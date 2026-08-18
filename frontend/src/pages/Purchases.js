import { useEffect, useState, useMemo } from "react";
import api, { inr, exportCSV } from "@/lib/api";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

const CATS = ["Ring", "Chain", "Necklace", "Bracelet", "Bangle", "Earrings", "Nose Pin", "Pendant", "Mangalsutra", "Anklet", "Toe Ring", "Silver Item", "Other"];
const blankItem = { name: "", sku: "", category: "Ring", metal_type: "Gold", purity: "22K", gross_weight: 0, stone_weight: 0, rate_per_gram: 0, making_charges: 0, quantity: 1 };

export default function Purchases() {
  const [tab, setTab] = useState("new");
  const [history, setHistory] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [supplierId, setSupplierId] = useState("");
  const [items, setItems] = useState([{ ...blankItem }]);
  const [gstPct, setGstPct] = useState(3);
  const [paid, setPaid] = useState(0);
  const [mode, setMode] = useState("cash");

  const load = () => api.get("/purchases").then((r) => setHistory(r.data));
  useEffect(() => { load(); api.get("/suppliers").then((r) => setSuppliers(r.data)); }, []);

  const upd = (i, k, v) => { const n = [...items]; n[i][k] = ["name", "sku", "category", "metal_type", "purity"].includes(k) ? v : +v; setItems(n); };
  const totals = useMemo(() => {
    const sub = items.reduce((s, it) => s + ((it.gross_weight - it.stone_weight) * it.rate_per_gram + +it.making_charges) * it.quantity, 0);
    const gst = sub * gstPct / 100;
    return { sub, gst, grand: sub + gst };
  }, [items, gstPct]);

  const save = async () => {
    if (!supplierId) return toast.error("Select a supplier");
    if (!items.some((i) => i.name)) return toast.error("Add at least one item");
    const sup = suppliers.find((s) => s.id === supplierId);
    try {
      await api.post("/purchases", { supplier_id: supplierId, supplier_name: sup.name, items: items.filter((i) => i.name), gst_pct: +gstPct, paid_amount: +paid, payment_mode: mode });
      toast.success("Purchase recorded, stock updated");
      setItems([{ ...blankItem }]); setPaid(0); setSupplierId(""); load(); setTab("history");
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  return (
    <div className="space-y-4" data-testid="purchases-page">
      <h1 className="font-display text-3xl">Purchases</h1>
      <div className="flex gap-2 border-b">
        <button data-testid="tab-new-purchase" onClick={() => setTab("new")} className={`px-4 py-2 ${tab === "new" ? "border-b-2 border-gold font-semibold" : "text-muted-foreground"}`}>New Purchase</button>
        <button data-testid="tab-purchase-history" onClick={() => setTab("history")} className={`px-4 py-2 ${tab === "history" ? "border-b-2 border-gold font-semibold" : "text-muted-foreground"}`}>History</button>
      </div>

      {tab === "new" ? (
        <div className="grid lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-3">
            <div className="bg-card border rounded-md p-4">
              <label className="text-sm">Supplier</label>
              <select data-testid="purchase-supplier" className="w-full mt-1 px-3 py-2 border rounded-md" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                <option value="">Select supplier…</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            {items.map((it, i) => (
              <div key={i} className="bg-card border rounded-md p-4" data-testid={`purchase-item-${i}`}>
                <div className="flex justify-between mb-2"><b>Item {i + 1}</b>{items.length > 1 && <button onClick={() => setItems(items.filter((_, x) => x !== i))} className="text-destructive"><Trash2 className="w-4 h-4" /></button>}</div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
                  <div className="col-span-2"><label>Name</label><input data-testid={`pi-name-${i}`} className="w-full mt-0.5 px-2 py-1 border rounded" value={it.name} onChange={(e) => upd(i, "name", e.target.value)} /></div>
                  <div><label className="font-semibold text-emerald-700">HUID Code</label><input className="w-full mt-0.5 px-2 py-1 border rounded uppercase font-mono" placeholder="e.g. AB1234"value={it.sku} onChange={(e) => upd(i, "sku", e.target.value.toUpperCase())}  /></div>
                  <div><label>Category</label><select className="w-full mt-0.5 px-1 py-1 border rounded" value={it.category} onChange={(e) => upd(i, "category", e.target.value)}>{CATS.map((c) => <option key={c}>{c}</option>)}</select></div>
                  <div><label>Metal</label><select className="w-full mt-0.5 px-1 py-1 border rounded" value={it.metal_type} onChange={(e) => upd(i, "metal_type", e.target.value)}><option>Gold</option><option>Silver</option></select></div>
                  <div><label>Purity</label><input className="w-full mt-0.5 px-2 py-1 border rounded" value={it.purity} onChange={(e) => upd(i, "purity", e.target.value)} /></div>
                  {[["gross_weight", "Gross Wt"], ["stone_weight", "Stone Wt"], ["rate_per_gram", "Rate/g"], ["making_charges", "Making ₹"], ["quantity", "Qty"]].map(([k, l]) => (
                    <div key={k}><label>{l}</label><input data-testid={`pi-${k}-${i}`} type="number" className="w-full mt-0.5 px-2 py-1 border rounded" value={it[k]} onChange={(e) => upd(i, k, e.target.value)} /></div>
                  ))}
                </div>
              </div>
            ))}
            <button onClick={() => setItems([...items, { ...blankItem }])} className="flex items-center gap-1 border px-3 py-2 rounded-md text-sm"><Plus className="w-4 h-4" />Add Item</button>
          </div>
          <div className="bg-card border rounded-md p-4 h-fit space-y-2">
            <h2 className="font-semibold">Summary</h2>
            <div className="flex justify-between text-sm"><span>Subtotal</span><span>{inr(totals.sub)}</span></div>
            <div className="flex justify-between items-center text-sm"><span>GST %</span><input type="number" className="w-20 px-2 py-1 border rounded text-right" value={gstPct} onChange={(e) => setGstPct(e.target.value)} /></div>
            <div className="flex justify-between text-sm"><span>GST</span><span>{inr(totals.gst)}</span></div>
            <div className="flex justify-between border-t pt-2 font-bold"><span>Grand Total</span><span className="text-gold">{inr(totals.grand)}</span></div>
            <div className="flex justify-between items-center text-sm"><span>Paid ₹</span><input data-testid="purchase-paid" type="number" className="w-28 px-2 py-1 border rounded text-right" value={paid} onChange={(e) => setPaid(e.target.value)} /></div>
            <div className="flex justify-between items-center text-sm"><span>Mode</span><select className="border rounded px-2 py-1" value={mode} onChange={(e) => setMode(e.target.value)}><option>cash</option><option>upi</option><option>bank</option></select></div>
            <button data-testid="save-purchase" onClick={save} className="w-full bg-emerald-brand text-white py-2.5 rounded-md font-semibold mt-2">Record Purchase</button>
          </div>
        </div>
      ) : (
        <div className="bg-card border rounded-md overflow-x-auto">
          <div className="p-3 flex justify-end"><button onClick={() => exportCSV("purchases.csv", history.map((p) => ({ No: p.purchase_no, Date: p.date, Supplier: p.supplier_name, Total: p.grand_total, Paid: p.paid_amount, Status: p.payment_status })))} className="border px-3 py-1.5 rounded text-sm">Export CSV</button></div>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-muted-foreground border-b bg-muted/40"><th className="p-3">No</th><th>Date</th><th>Supplier</th><th>Items</th><th>Total</th><th>Paid</th><th>Status</th></tr></thead>
            <tbody>{history.map((p) => (
              <tr key={p.id} className="border-b last:border-0 hover:bg-muted/40" data-testid={`purchase-row-${p.purchase_no}`}>
                <td className="p-3 font-mono text-xs">{p.purchase_no}</td><td>{p.date}</td><td>{p.supplier_name}</td><td>{p.items.length}</td><td>{inr(p.grand_total)}</td><td>{inr(p.paid_amount)}</td>
                <td><span className={`px-2 py-0.5 rounded text-xs ${p.payment_status === "Paid" ? "bg-green-100 text-green-700" : p.payment_status === "Partial" ? "bg-orange-100 text-orange-700" : "bg-red-100 text-red-700"}`}>{p.payment_status}</span></td>
              </tr>))}</tbody>
          </table>
          {!history.length && <p className="p-6 text-center text-muted-foreground">No purchases</p>}
        </div>
      )}
    </div>
  );
}
