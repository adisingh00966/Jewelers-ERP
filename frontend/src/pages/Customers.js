import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { exportCSV } from "@/lib/api";
import { toast } from "sonner";
import { Plus, Search, Download } from "lucide-react";

const empty = { name: "", mobile: "", alt_mobile: "", address: "", city: "", state: "", pincode: "", email: "", gstin: "", id_proof: "", notes: "" };

export default function Customers() {
  const nav = useNavigate();
  const [list, setList] = useState([]);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(false);
  const [f, setF] = useState(empty);

  const load = () => api.get("/customers", { params: { search } }).then((r) => setList(r.data));
  useEffect(() => { load(); }, [search]);

  const save = async () => {
    try { await api.post("/customers", f); toast.success("Customer added"); setModal(false); setF(empty); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  return (
    <div className="space-y-4" data-testid="customers-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl">Customers</h1>
        <div className="flex gap-2">
          <button onClick={() => exportCSV("customers.csv", list.map((c) => ({ Code: c.code, Name: c.name, Mobile: c.mobile, City: c.city })))} className="flex items-center gap-1 border px-3 py-2 rounded-md text-sm"><Download className="w-4 h-4" />CSV</button>
          <button data-testid="add-customer" onClick={() => { setF(empty); setModal(true); }} className="flex items-center gap-1 bg-emerald-brand text-white px-4 py-2 rounded-md text-sm font-semibold"><Plus className="w-4 h-4" />Add Customer</button>
        </div>
      </div>
      <div className="relative"><Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" /><input data-testid="customer-search" className="w-full pl-9 pr-3 py-2 border rounded-md" placeholder="Search name or mobile…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>

      <div className="bg-card border rounded-md overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-muted-foreground border-b bg-muted/40"><th className="p-3">Code</th><th>Name</th><th>Mobile</th><th>City</th><th>State</th></tr></thead>
          <tbody>{list.map((c) => (
            <tr key={c.id} onClick={() => nav(`/customers/${c.id}`)} className="border-b last:border-0 hover:bg-muted/40 cursor-pointer" data-testid={`customer-row-${c.mobile}`}>
              <td className="p-3 font-mono text-xs">{c.code}</td><td className="font-medium">{c.name}</td><td>{c.mobile}</td><td>{c.city}</td><td>{c.state}</td>
            </tr>))}</tbody>
        </table>
        {!list.length && <p className="p-6 text-center text-muted-foreground">No customers</p>}
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setModal(false)}>
          <div className="bg-card rounded-md w-full max-w-lg p-5" onClick={(e) => e.stopPropagation()} data-testid="customer-modal">
            <h2 className="font-display text-2xl mb-4">Add Customer</h2>
            <div className="grid grid-cols-2 gap-3">
              {[["name", "Name*"], ["mobile", "Mobile*"], ["alt_mobile", "Alt Mobile"], ["email", "Email"], ["address", "Address"], ["city", "City"], ["state", "State"], ["pincode", "Pincode"], ["gstin", "GSTIN"], ["id_proof", "ID Proof"]].map(([k, l]) => (
                <div key={k}><label className="text-xs">{l}</label><input data-testid={`cf-${k}`} className="w-full mt-1 px-2 py-1.5 border rounded" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></div>
              ))}
            </div>
            <div className="flex justify-end gap-2 mt-5"><button onClick={() => setModal(false)} className="px-4 py-2 border rounded-md">Cancel</button><button data-testid="save-customer" onClick={save} className="px-5 py-2 bg-emerald-brand text-white rounded-md font-semibold">Save</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
