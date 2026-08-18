import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import api, { inr } from "@/lib/api";
import { toast } from "sonner";
import { Plus, Trash2, Search, ScanLine } from "lucide-react";

function calcItem(it) {
  const net = +(it.gross_weight - it.stone_weight).toFixed(3);
  const metal = net * it.rate_per_gram;
  const wWt = +(net * it.wastage_pct / 100).toFixed(3);
  const wVal = wWt * it.rate_per_gram;
  let making = 0;
  if (it.making_charge_type === "per_gram") making = it.making_charge * net;
  else if (it.making_charge_type === "percentage") making = (metal + wVal) * it.making_charge / 100;
  else making = it.making_charge;
  const line = (metal + wVal + making + it.stone_charge + it.other_charges) * it.quantity;
  return { net, metal, wWt, wVal, making, line };
}

export default function NewSale() {
  const nav = useNavigate();
  const [rate, setRate] = useState(null);
  const [custList, setCustList] = useState([]);
  const [cust, setCust] = useState(null);
  const [custSearch, setCustSearch] = useState("");
  const [items, setItems] = useState([]);
  const [barcode, setBarcode] = useState("");
  const [prodSearch, setProdSearch] = useState("");
  const [prodResults, setProdResults] = useState([]);
  const [discount, setDiscount] = useState(0);
  const [gstPct, setGstPct] = useState(3);
  const [roundOff, setRoundOff] = useState(0);
  const [pay, setPay] = useState({ cash: "", upi: "", card: "", bank: "" });
  const [og, setOg] = useState({ net_weight: "", purity: "22K", rate_per_gram: "", deduction_pct: "", description: "" });

  useEffect(() => { api.get("/rates/current").then((r) => setRate(r.data)); }, []);
  useEffect(() => { if (custSearch) api.get("/customers", { params: { search: custSearch } }).then((r) => setCustList(r.data)); else setCustList([]); }, [custSearch]);
  useEffect(() => { if (prodSearch) api.get("/products", { params: { search: prodSearch } }).then((r) => setProdResults(r.data.filter((p) => !p.deleted))); else setProdResults([]); }, [prodSearch]);

  const rateFor = (p) => {
    if (!rate) return 0;
    if (p.metal_type === "Silver") return rate.silver_per_10g / 10;
    const map = { "24K": rate.gold_24k, "22K": rate.gold_22k, "20K": rate.gold_20k, "18K": rate.gold_18k };
    return (map[p.purity] || rate.gold_22k) / 10;
  };

  const addProduct = (p) => {
    setItems([...items, {
      product_id: p.id, name: p.name, sku: p.sku, metal_type: p.metal_type, purity: p.purity,
      gross_weight: p.gross_weight, stone_weight: p.stone_weight, rate_per_gram: +rateFor(p).toFixed(2),
      making_charge: p.making_charge, making_charge_type: p.making_charge_type, wastage_pct: p.wastage_pct,
      stone_charge: p.stone_charge, other_charges: p.other_charges, quantity: 1,
    }]);
    setProdSearch(""); setProdResults([]);
  };

  const scan = async () => {
    if (!barcode) return;
    try { const { data } = await api.get(`/products/barcode/${barcode}`); addProduct(data); setBarcode(""); toast.success(`Added ${data.name}`); }
    catch { toast.error("HUID Code not found in inventory"); }
  };

  const upd = (i, k, v) => { const n = [...items]; n[i][k] = k === "making_charge_type" ? v : (k === "quantity" ? parseInt(v || 1) : +v); setItems(n); };

  const totals = useMemo(() => {
    const sub = items.reduce((s, it) => s + calcItem(it).line, 0);
    const taxable = sub - +discount;
    const gst = taxable * +gstPct / 100;
    const grand = taxable + gst + +roundOff;
    const exchange = (+og.net_weight || 0) > 0 ? (+og.net_weight) * (+og.rate_per_gram || 0) * (1 - (+og.deduction_pct || 0) / 100) : 0;
    const received = Object.values(pay).reduce((s, v) => s + (+v || 0), 0) + exchange;
    return { sub, gst, grand, exchange, received, balance: grand - received };
  }, [items, discount, gstPct, roundOff, pay, og]);

  const save = async () => {
    if (!items.length) return toast.error("Add at least one item");
    if (!cust && !custSearch) return toast.error("Select or enter a customer");
    try {
      const { data } = await api.post("/sales", {
        customer_id: cust?.id || "", customer_name: cust?.name || custSearch,
        customer_mobile: cust?.mobile || "", items,
        discount: +discount, gst_pct: +gstPct, round_off: +roundOff,
        payments: Object.fromEntries(Object.entries(pay).map(([k, v]) => [k, +v || 0])),
        old_gold: (+og.net_weight || 0) > 0 ? { net_weight: +og.net_weight, purity: og.purity, rate_per_gram: +og.rate_per_gram || 0, deduction_pct: +og.deduction_pct || 0, description: og.description } : null,
      });
      toast.success("Sale created: " + data.invoice_no);
      nav(`/invoice/${data.id}`);
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  return (
    <div className="space-y-4" data-testid="new-sale-page">
      <h1 className="font-display text-3xl">New Sale / Billing</h1>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          {/* customer */}
          <div className="bg-card border rounded-md p-4">
            <h2 className="font-semibold mb-2">Customer</h2>
            {cust ? (
              <div className="flex items-center justify-between bg-muted/50 rounded p-2"><span>{cust.name} · {cust.mobile}</span><button className="text-destructive text-sm" onClick={() => setCust(null)}>Change</button></div>
            ) : (
              <div className="relative">
                <input data-testid="sale-customer-search" className="w-full px-3 py-2 border rounded-md" placeholder="Search customer name/mobile or type walk-in name" value={custSearch} onChange={(e) => setCustSearch(e.target.value)} />
                {custList.length > 0 && <div className="absolute z-10 bg-card border rounded-md w-full mt-1 max-h-48 overflow-y-auto shadow">{custList.map((c) => <div key={c.id} className="px-3 py-2 hover:bg-muted cursor-pointer text-sm" onClick={() => { setCust(c); setCustList([]); }}>{c.name} · {c.mobile}</div>)}</div>}
              </div>
            )}
          </div>

          {/* add products */}
          <div className="bg-card border rounded-md p-4">
            <h2 className="font-semibold mb-2">Add Items</h2>
            <div className="flex gap-2 mb-2">
            <div className="flex-1 relative"><Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" /><input className="w-full pl-9 pr-3 py-2 border rounded-md uppercase" placeholder="Enter 6-digit HUID Code..." value={barcode} onChange={(e) => setBarcode(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === "Enter" && scan()} /></div>
             <button onClick={scan} className="bg-emerald-brand text-white px-4 rounded-md text-sm">Find & Add</button>
             </div>
            <div className="relative"><Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" /><input data-testid="sale-product-search" className="w-full pl-9 pr-3 py-2 border rounded-md" placeholder="Search product by name…" value={prodSearch} onChange={(e) => setProdSearch(e.target.value)} />
              {prodResults.length > 0 && <div className="absolute z-10 bg-card border rounded-md w-full mt-1 max-h-56 overflow-y-auto shadow">{prodResults.map((p) => <div key={p.id} data-testid={`prod-opt-${p.sku}`} className="px-3 py-2 hover:bg-muted cursor-pointer text-sm flex justify-between" onClick={() => addProduct(p)}><span>{p.name} <span className="text-xs text-muted-foreground">{p.sku}</span></span><span>{p.net_weight}g · {p.quantity} in stock</span></div>)}</div>}
            </div>
          </div>

          {/* item lines */}
          {items.map((it, i) => {
            const c = calcItem(it);
            return (
              <div key={i} className="bg-card border rounded-md p-4" data-testid={`sale-item-${i}`}>
                <div className="flex justify-between items-center mb-2"><b>{it.name}</b><button onClick={() => setItems(items.filter((_, x) => x !== i))} className="text-destructive"><Trash2 className="w-4 h-4" /></button></div>
                <div className="grid grid-cols-3 lg:grid-cols-4 gap-2 text-xs">
                  {[["gross_weight", "Gross Wt"], ["stone_weight", "Stone Wt"], ["rate_per_gram", "Rate/g"], ["wastage_pct", "Wastage %"], ["making_charge", "Making"], ["stone_charge", "Stone ₹"], ["other_charges", "Other ₹"], ["quantity", "Qty"]].map(([k, l]) => (
                    <div key={k}><label>{l}</label><input data-testid={`item-${i}-${k}`} type="number" className="w-full mt-0.5 px-2 py-1 border rounded" value={it[k]} onChange={(e) => upd(i, k, e.target.value)} /></div>
                  ))}
                  <div><label>Making Type</label><select className="w-full mt-0.5 px-1 py-1 border rounded" value={it.making_charge_type} onChange={(e) => upd(i, "making_charge_type", e.target.value)}><option value="per_gram">/gram</option><option value="fixed">Fixed</option><option value="percentage">%</option></select></div>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 mt-2 text-xs bg-muted/40 rounded p-2">
                  <span>Net: <b>{c.net}g</b></span><span>Metal: <b>{inr(c.metal)}</b></span><span>Wastage: <b>{inr(c.wVal)}</b></span><span>Making: <b>{inr(c.making)}</b></span><span className="font-semibold text-gold">Line: {inr(c.line)}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* summary */}
        <div className="bg-card border rounded-md p-4 h-fit lg:sticky lg:top-20 space-y-2" data-testid="sale-summary">
          <h2 className="font-semibold">Bill Summary</h2>
          <Row label="Subtotal" value={inr(totals.sub)} />
          <div className="flex justify-between items-center text-sm"><span>Discount ₹</span><input data-testid="sale-discount" type="number" className="w-24 px-2 py-1 border rounded text-right" value={discount} onChange={(e) => setDiscount(e.target.value)} /></div>
          <div className="flex justify-between items-center text-sm"><span>GST %</span><input data-testid="sale-gst" type="number" className="w-24 px-2 py-1 border rounded text-right" value={gstPct} onChange={(e) => setGstPct(e.target.value)} /></div>
          <Row label="GST Amount" value={inr(totals.gst)} />
          <div className="flex justify-between items-center text-sm"><span>Round Off ₹</span><input type="number" className="w-24 px-2 py-1 border rounded text-right" value={roundOff} onChange={(e) => setRoundOff(e.target.value)} /></div>
          <div className="flex justify-between border-t pt-2 font-bold text-lg"><span>Grand Total</span><span className="text-gold">{inr(totals.grand)}</span></div>
          <div className="border-t pt-2">
            <p className="text-xs uppercase text-muted-foreground mb-1">Old Gold Exchange (optional)</p>
            <div className="grid grid-cols-2 gap-1 mb-1">
              <input data-testid="og-net" type="number" placeholder="Net wt (g)" className="px-2 py-1 border rounded text-sm" value={og.net_weight} onChange={(e) => setOg({ ...og, net_weight: e.target.value })} />
              <input data-testid="og-rate" type="number" placeholder="Rate/g" className="px-2 py-1 border rounded text-sm" value={og.rate_per_gram} onChange={(e) => setOg({ ...og, rate_per_gram: e.target.value })} />
              <input type="number" placeholder="Deduction %" className="px-2 py-1 border rounded text-sm" value={og.deduction_pct} onChange={(e) => setOg({ ...og, deduction_pct: e.target.value })} />
              <input placeholder="Description" className="px-2 py-1 border rounded text-sm" value={og.description} onChange={(e) => setOg({ ...og, description: e.target.value })} />
            </div>
            {totals.exchange > 0 && <Row label="Exchange Credit" value={inr(totals.exchange)} />}
          </div>
          <div className="border-t pt-2">
            <p className="text-xs uppercase text-muted-foreground mb-1">Payment</p>
            {["cash", "upi", "card", "bank"].map((k) => (
              <div key={k} className="flex justify-between items-center text-sm mb-1"><span className="capitalize">{k}</span><input data-testid={`pay-${k}`} type="number" className="w-28 px-2 py-1 border rounded text-right" value={pay[k]} onChange={(e) => setPay({ ...pay, [k]: e.target.value })} /></div>
            ))}
          </div>
          <Row label="Received" value={inr(totals.received)} />
          {totals.balance >= 0
            ? <Row label="Balance Due" value={inr(totals.balance)} bold />
            : <Row label="Change / Return" value={inr(-totals.balance)} bold />}
          <button data-testid="complete-sale" onClick={save} className="w-full bg-emerald-brand text-white py-2.5 rounded-md font-semibold mt-2 flex items-center justify-center gap-1"><Plus className="w-4 h-4" />Complete Sale</button>
        </div>
      </div>
    </div>
  );
}
const Row = ({ label, value, bold }) => <div className={`flex justify-between text-sm ${bold ? "font-semibold" : ""}`}><span>{label}</span><span>{value}</span></div>;
