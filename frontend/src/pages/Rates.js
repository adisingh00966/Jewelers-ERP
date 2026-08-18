import { useEffect, useState } from "react";
import api, { inr } from "@/lib/api";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";

export default function Rates() {
  const { user } = useAuth();
  const canEdit = ["admin", "manager"].includes(user?.role);
  const [cur, setCur] = useState(null);
  const [hist, setHist] = useState([]);
  const [f, setF] = useState({ gold_24k: "", gold_22k: "", gold_20k: "", gold_18k: "", silver_per_10g: "" });

  const load = () => {
    api.get("/rates/current").then((r) => { setCur(r.data); if (r.data) setF({ gold_24k: r.data.gold_24k, gold_22k: r.data.gold_22k, gold_20k: r.data.gold_20k, gold_18k: r.data.gold_18k, silver_per_10g: r.data.silver_per_10g }); });
    api.get("/rates/history").then((r) => setHist(r.data));
  };
  useEffect(load, []);

  const save = async () => {
    try {
      await api.post("/rates", { gold_24k: +f.gold_24k, gold_22k: +f.gold_22k, gold_20k: +f.gold_20k, gold_18k: +f.gold_18k, silver_per_10g: +f.silver_per_10g });
      toast.success("Rates updated"); load();
    } catch (e) { toast.error("Failed to save"); }
  };

  const RateBox = ({ label, per10, k }) => (
    <div className="bg-card border rounded-md p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold text-gold mt-1">{inr(per10)}<span className="text-sm text-muted-foreground font-sans"> /10g</span></div>
      <div className="text-sm text-muted-foreground">{inr(per10 / 10)} /gram</div>
    </div>
  );

  return (
    <div className="space-y-6" data-testid="rates-page">
      <h1 className="font-display text-3xl">Metal Rate Management</h1>
      {cur && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <RateBox label="Gold 24K" per10={cur.gold_24k} />
          <RateBox label="Gold 22K" per10={cur.gold_22k} />
          <RateBox label="Gold 20K" per10={cur.gold_20k} />
          <RateBox label="Gold 18K" per10={cur.gold_18k} />
          <RateBox label="Silver" per10={cur.silver_per_10g} />
        </div>
      )}

      {canEdit && (
        <div className="bg-card border rounded-md p-5">
          <h2 className="font-semibold mb-4">Update Rates (per 10g)</h2>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {["gold_24k", "gold_22k", "gold_20k", "gold_18k", "silver_per_10g"].map((k) => (
              <div key={k}><label className="text-xs capitalize">{k.replace(/_/g, " ")}</label>
                <input data-testid={`rate-${k}`} type="number" className="w-full mt-1 px-3 py-2 border rounded-md" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></div>
            ))}
          </div>
          <button data-testid="save-rates" onClick={save} className="mt-4 bg-emerald-brand text-white px-5 py-2 rounded-md font-semibold">Save Rates</button>
        </div>
      )}

      <div className="bg-card border rounded-md p-5">
        <h2 className="font-semibold mb-3">Rate History</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-muted-foreground border-b"><th className="py-2">Date</th><th>24K</th><th>22K</th><th>20K</th><th>18K</th><th>Silver</th><th>By</th></tr></thead>
            <tbody>{hist.map((h) => (<tr key={h.id} className="border-b last:border-0 hover:bg-muted/50"><td className="py-2">{new Date(h.created_at).toLocaleString("en-IN")}</td><td>{inr(h.gold_24k)}</td><td>{inr(h.gold_22k)}</td><td>{inr(h.gold_20k)}</td><td>{inr(h.gold_18k)}</td><td>{inr(h.silver_per_10g)}</td><td>{h.created_by}</td></tr>))}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
