import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";

const fields = [["shop_name", "Shop Name"], ["owner_name", "Owner Name"], ["address", "Address"], ["city", "City"], ["state", "State"], ["pincode", "Pincode"], ["mobile", "Mobile"], ["email", "Email"], ["gstin", "GSTIN"], ["invoice_prefix", "Invoice Prefix"], ["terms", "Terms & Conditions"]];

export default function Settings() {
  const { user } = useAuth();
  const canEdit = ["admin", "manager"].includes(user?.role);
  const isAdmin = user?.role === "admin";
  const [f, setF] = useState({});
  const [confirm, setConfirm] = useState("");
  const [showClear, setShowClear] = useState(false);
  useEffect(() => { api.get("/settings").then((r) => setF(r.data || {})); }, []);
  const save = async () => { try { await api.put("/settings", f); toast.success("Settings saved"); } catch { toast.error("Failed"); } };
  const clearData = async () => {
    try { const { data } = await api.post("/admin/clear-transactions"); toast.success(`Cleared ${data.total} records`); setShowClear(false); setConfirm(""); }
    catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  return (
    <div className="space-y-5 max-w-2xl" data-testid="settings-page">
      <h1 className="font-display text-3xl">Settings</h1>
      <div className="bg-card border rounded-md p-5 space-y-3">
        <h2 className="font-semibold">Shop & Invoice Details</h2>
        {fields.map(([k, l]) => (
          <div key={k}><label className="text-sm">{l}</label>
            {k === "terms" ? <textarea data-testid={`set-${k}`} className="w-full mt-1 px-3 py-2 border rounded-md" rows={2} value={f[k] || ""} disabled={!canEdit} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
              : <input data-testid={`set-${k}`} className="w-full mt-1 px-3 py-2 border rounded-md" value={f[k] || ""} disabled={!canEdit} onChange={(e) => setF({ ...f, [k]: e.target.value })} />}
          </div>
        ))}
        <div><label className="text-sm">Default GST %</label><input data-testid="set-gst" type="number" className="w-full mt-1 px-3 py-2 border rounded-md" value={f.gst_pct ?? ""} disabled={!canEdit} onChange={(e) => setF({ ...f, gst_pct: +e.target.value })} /></div>
        {canEdit && <button data-testid="save-settings" onClick={save} className="bg-emerald-brand text-white px-5 py-2 rounded-md font-semibold">Save Settings</button>}
      </div>

      {isAdmin && (
        <div className="bg-card border border-destructive/40 rounded-md p-5">
          <h2 className="font-semibold text-destructive">Danger Zone</h2>
          <p className="text-sm text-muted-foreground mt-1">Permanently delete all sales, purchases, returns, girvi, expenses, cash-book and old-gold entries. Products, customers, suppliers, rates and settings are kept.</p>
          <button data-testid="open-clear-data" onClick={() => setShowClear(true)} className="mt-3 bg-destructive text-white px-5 py-2 rounded-md font-semibold text-sm">Clear All Sales & Purchase Data</button>
        </div>
      )}

      {showClear && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowClear(false)}>
          <div className="bg-card rounded-md w-full max-w-md p-5" onClick={(e) => e.stopPropagation()} data-testid="clear-data-modal">
            <h2 className="font-display text-2xl mb-2 text-destructive">Clear All Transaction Data?</h2>
            <p className="text-sm text-muted-foreground mb-3">This cannot be undone. Type <b>CLEAR</b> to confirm.</p>
            <input data-testid="clear-confirm-input" className="w-full px-3 py-2 border rounded mb-4" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Type CLEAR" />
            <div className="flex justify-end gap-2">
              <button onClick={() => { setShowClear(false); setConfirm(""); }} className="px-4 py-2 border rounded-md">Cancel</button>
              <button data-testid="confirm-clear-data" disabled={confirm !== "CLEAR"} onClick={clearData} className="px-5 py-2 bg-destructive text-white rounded-md font-semibold disabled:opacity-40">Delete Everything</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
