import { useEffect, useState } from "react";
import api, { inr, exportCSV } from "@/lib/api";
import { toast } from "sonner";
import { Plus, Search, Pencil, Download } from "lucide-react";

const CATS = ["Ring", "Chain", "Necklace", "Bracelet", "Bangle", "Earrings", "Nose Pin", "Pendant", "Mangalsutra", "Anklet", "Toe Ring", "Silver Item", "Other"];
const empty = { name: "", sku: "", barcode: "", category: "Ring", metal_type: "Gold", purity: "22K", gross_weight: "", stone_weight: "0", making_charge: "0", making_charge_type: "per_gram", wastage_pct: "0", stone_charge: "0", other_charges: "0", purchase_price: "0", selling_price: "0", quantity: "1", min_stock: "5", supplier: "", description: "" };

export default function Products() {
  const [list, setList] = useState([]);
  const [search, setSearch] = useState("");
  const [metal, setMetal] = useState("");
  const [modal, setModal] = useState(false);
  const [f, setF] = useState(empty);
  const [editId, setEditId] = useState(null);

  const load = () => api.get("/products", { params: { search, metal } }).then((r) => setList(r.data.filter((p) => !p.deleted)));
  useEffect(() => { load(); }, [search, metal]);

  const open = (p) => {
    if (p) { setEditId(p.id); setF({ ...empty, ...p }); } else { setEditId(null); setF(empty); }
    setModal(true);
  };
  const save = async () => {
    const body = { ...f };
    ["gross_weight", "stone_weight", "making_charge", "wastage_pct", "stone_charge", "other_charges", "purchase_price", "selling_price"].forEach((k) => body[k] = +body[k]);
    ["quantity", "min_stock"].forEach((k) => body[k] = parseInt(body[k]));
    try {
      if (editId) await api.put(`/products/${editId}`, body); else await api.post("/products", body);
      toast.success("Saved"); setModal(false); load();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  return (
    <div className="space-y-4" data-testid="products-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl">Inventory</h1>
        <div className="flex gap-2">
          <button data-testid="export-products" onClick={() => exportCSV("products.csv", list.map((p) => ({ SKU: p.sku, Name: p.name, Category: p.category, Metal: p.metal_type, Purity: p.purity, NetWeight: p.net_weight, Qty: p.quantity })))} className="flex items-center gap-1 border px-3 py-2 rounded-md text-sm"><Download className="w-4 h-4" />CSV</button>
          <button data-testid="add-product" onClick={() => open(null)} className="flex items-center gap-1 bg-emerald-brand text-white px-4 py-2 rounded-md text-sm font-semibold"><Plus className="w-4 h-4" />Add Product</button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]"><Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" /><input data-testid="product-search" className="w-full pl-9 pr-3 py-2 border rounded-md" placeholder="Search name, SKU, barcode…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <select data-testid="filter-metal" value={metal} onChange={(e) => setMetal(e.target.value)} className="border rounded-md px-3"><option value="">All Metals</option><option>Gold</option><option>Silver</option></select>
      </div>

      <div className="bg-card border rounded-md overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-muted-foreground border-b bg-muted/40"><th className="p-3">HUID</th><th>Name</th><th>Category</th><th>Metal</th><th>Purity</th><th>Net Wt</th><th>Qty</th><th>Making</th><th></th></tr></thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.id} className="border-b last:border-0 hover:bg-muted/40" data-testid={`product-row-${p.sku}`}>
                <td className="p-3 font-mono text-xs">{p.sku}</td><td className="font-medium">{p.name}</td><td>{p.category}</td>
                <td><span className={`px-2 py-0.5 rounded text-xs ${p.metal_type === "Gold" ? "bg-gold/20 text-yellow-800" : "bg-gray-200"}`}>{p.metal_type}</span></td>
                <td>{p.purity}</td><td>{p.net_weight}g</td>
                <td><span className={p.quantity <= 0 ? "text-destructive font-bold" : p.quantity <= p.min_stock ? "text-orange-500 font-semibold" : ""}>{p.quantity}</span></td>
                <td>{p.making_charge_type === "fixed" ? inr(p.making_charge) : p.making_charge_type === "percentage" ? p.making_charge + "%" : inr(p.making_charge) + "/g"}</td>
                <td><button data-testid={`edit-${p.sku}`} onClick={() => open(p)} className="text-gold"><Pencil className="w-4 h-4" /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!list.length && <p className="p-6 text-center text-muted-foreground">No products</p>}
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setModal(false)}>
          <div className="bg-card rounded-md w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5" onClick={(e) => e.stopPropagation()} data-testid="product-modal">
            <h2 className="font-display text-2xl mb-4">{editId ? "Edit" : "Add"} Product</h2>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              {[["name", "Name"], ["sku", "HUID Code"], ["barcode", "Barcode"]].map(([k, l]) => (
                <div key={k}><label className="text-xs">{l}</label><input data-testid={`pf-${k}`} className="w-full mt-1 px-2 py-1.5 border rounded" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></div>
              ))}
              <div><label className="text-xs">Category</label><select className="w-full mt-1 px-2 py-1.5 border rounded" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{CATS.map((c) => <option key={c}>{c}</option>)}</select></div>
              <div><label className="text-xs">Metal</label><select data-testid="pf-metal" className="w-full mt-1 px-2 py-1.5 border rounded" value={f.metal_type} onChange={(e) => setF({ ...f, metal_type: e.target.value })}><option>Gold</option><option>Silver</option></select></div>
              <div><label className="text-xs">Purity</label><input className="w-full mt-1 px-2 py-1.5 border rounded" value={f.purity} onChange={(e) => setF({ ...f, purity: e.target.value })} /></div>
              {[["gross_weight", "Gross Wt (g)"], ["stone_weight", "Stone Wt (g)"], ["making_charge", "Making Charge"], ["wastage_pct", "Wastage %"], ["stone_charge", "Stone Charge"], ["other_charges", "Other Charges"], ["quantity", "Quantity"], ["min_stock", "Min Stock"]].map(([k, l]) => (
                <div key={k}><label className="text-xs">{l}</label><input data-testid={`pf-${k}`} type="number" className="w-full mt-1 px-2 py-1.5 border rounded" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></div>
              ))}
              <div><label className="text-xs">Making Type</label><select className="w-full mt-1 px-2 py-1.5 border rounded" value={f.making_charge_type} onChange={(e) => setF({ ...f, making_charge_type: e.target.value })}><option value="per_gram">Per Gram</option><option value="fixed">Fixed</option><option value="percentage">Percentage</option></select></div>
              <div><label className="text-xs">Supplier</label><input className="w-full mt-1 px-2 py-1.5 border rounded" value={f.supplier} onChange={(e) => setF({ ...f, supplier: e.target.value })} /></div>
            </div>
            <div className="flex justify-end gap-2 mt-5"><button onClick={() => setModal(false)} className="px-4 py-2 border rounded-md">Cancel</button><button data-testid="save-product" onClick={save} className="px-5 py-2 bg-emerald-brand text-white rounded-md font-semibold">Save</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
