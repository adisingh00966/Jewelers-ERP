import { useEffect, useState } from "react";
import api, { inr } from "@/lib/api";
import { toast } from "sonner";
import { Plus, Search, X } from "lucide-react";

const empty = { name: "", mobile: "", address: "", gstin: "", bank: "", notes: "" };

export default function Suppliers() {
  const [list, setList] = useState([]);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(false);
  const [f, setF] = useState(empty);
  const [detail, setDetail] = useState(null);

  const load = () => api.get("/suppliers", { params: { search } }).then((r) => setList(r.data));
  useEffect(() => { load(); }, [search]);

  const save = async () => {
    try { await api.post("/suppliers", f); toast.success("Supplier added"); setModal(false); setF(empty); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };
  const openDetail = (id) => api.get(`/suppliers/${id}`).then((r) => setDetail(r.data));

  return (
    <div className="space-y-4" data-testid="suppliers-page">
      <div className="flex justify-between items-center">
        <h1 className="font-display text-3xl">Suppliers</h1>
        <button data-testid="add-supplier" onClick={() => { setF(empty); setModal(true); }} className="flex items-center gap-1 bg-emerald-brand text-white px-4 py-2 rounded-md text-sm font-semibold"><Plus className="w-4 h-4" />Add Supplier</button>
      </div>
      <div className="relative"><Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" /><input data-testid="supplier-search" className="w-full pl-9 pr-3 py-2 border rounded-md" placeholder="Search name or mobile…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>

      <div className="bg-card border rounded-md overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-muted-foreground border-b bg-muted/40"><th className="p-3">Code</th><th>Name</th><th>Mobile</th><th>GSTIN</th></tr></thead>
          <tbody>{list.map((s) => (
            <tr key={s.id} onClick={() => openDetail(s.id)} className="border-b last:border-0 hover:bg-muted/40 cursor-pointer" data-testid={`supplier-row-${s.mobile}`}>
              <td className="p-3 font-mono text-xs">{s.code}</td><td className="font-medium">{s.name}</td><td>{s.mobile}</td><td>{s.gstin || "—"}</td>
            </tr>))}</tbody>
        </table>
        {!list.length && <p className="p-6 text-center text-muted-foreground">No suppliers</p>}
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setModal(false)}>
          <div className="bg-card rounded-md w-full max-w-md p-5" onClick={(e) => e.stopPropagation()} data-testid="supplier-modal">
            <h2 className="font-display text-2xl mb-4">Add Supplier</h2>
            <div className="space-y-3">
              {[["name", "Name*"], ["mobile", "Mobile*"], ["gstin", "GSTIN"], ["address", "Address"], ["bank", "Bank Details"]].map(([k, l]) => (
                <div key={k}><label className="text-sm">{l}</label><input data-testid={`sf-${k}`} className="w-full mt-1 px-3 py-2 border rounded" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></div>
              ))}
            </div>
            <div className="flex justify-end gap-2 mt-5"><button onClick={() => setModal(false)} className="px-4 py-2 border rounded-md">Cancel</button><button data-testid="save-supplier" onClick={save} className="px-5 py-2 bg-emerald-brand text-white rounded-md font-semibold">Save</button></div>
          </div>
        </div>
      )}

      {detail && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setDetail(null)}>
          <div className="bg-card rounded-md w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-start"><h2 className="font-display text-2xl">{detail.supplier.name}</h2><button onClick={() => setDetail(null)}><X className="w-5 h-5" /></button></div>
            <p className="text-muted-foreground text-sm">{detail.supplier.mobile} · {detail.supplier.gstin}</p>
            <div className="grid grid-cols-2 gap-3 my-4">
              <div className="border rounded-md p-3"><div className="text-xs uppercase text-muted-foreground">Total Purchases</div><div className="text-xl font-bold">{inr(detail.total_purchases)}</div></div>
              <div className="border rounded-md p-3"><div className="text-xs uppercase text-muted-foreground">Outstanding</div><div className="text-xl font-bold text-destructive">{inr(detail.outstanding)}</div></div>
            </div>
            <h3 className="font-semibold mb-2">Purchase Ledger</h3>
            <table className="w-full text-sm"><thead><tr className="text-left text-muted-foreground border-b"><th className="py-2">No</th><th>Date</th><th>Total</th><th>Paid</th><th>Balance</th></tr></thead>
              <tbody>{detail.purchases.map((p) => <tr key={p.id} className="border-b last:border-0"><td className="py-2">{p.purchase_no}</td><td>{p.date}</td><td>{inr(p.grand_total)}</td><td>{inr(p.paid_amount)}</td><td>{inr(p.balance)}</td></tr>)}</tbody></table>
            {!detail.purchases.length && <p className="text-muted-foreground text-sm">No purchases yet</p>}
          </div>
        </div>
      )}
    </div>
  );
}
