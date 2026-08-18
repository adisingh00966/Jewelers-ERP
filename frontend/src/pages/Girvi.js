import { useEffect, useState } from "react";
import api, { inr } from "@/lib/api";
import { toast } from "sonner";
import { Plus, Search, X, Printer } from "lucide-react";

const empty = { customer_name: "", mobile: "", address: "", id_proof_type: "Aadhaar", id_proof_number: "", loan_amount: 0, interest_rate: 2, interest_type: "monthly", due_date: "", item_description: "", gross_weight: 0, stone_weight: 0, purity: "22K", metal_type: "Gold", estimated_value: 0 };
const STATUS = ["Active", "Partially Paid", "Due Soon", "Overdue", "Closed"];
const badge = (s) => ({ Active: "bg-green-100 text-green-700", "Partially Paid": "bg-blue-100 text-blue-700", "Due Soon": "bg-orange-100 text-orange-700", Overdue: "bg-red-100 text-red-700", Closed: "bg-gray-200 text-gray-600" }[s] || "bg-gray-100");

export default function Girvi() {
  const [list, setList] = useState([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [modal, setModal] = useState(false);
  const [f, setF] = useState(empty);
  const [detail, setDetail] = useState(null);
  const [shop, setShop] = useState({});
  const [pay, setPay] = useState({ amount: 0, mode: "cash", pay_type: "mixed" });

  const load = () => api.get("/girvi", { params: { search, status } }).then((r) => setList(r.data));
  useEffect(() => { load(); }, [search, status]);
  useEffect(() => { api.get("/settings").then((r) => setShop(r.data || {})); }, []);

  const save = async () => {
    if (!f.customer_name || !f.loan_amount || !f.due_date) return toast.error("Fill customer, loan amount and due date");
    try { await api.post("/girvi", { ...f, loan_amount: +f.loan_amount, interest_rate: +f.interest_rate, gross_weight: +f.gross_weight, stone_weight: +f.stone_weight, estimated_value: +f.estimated_value }); toast.success("Girvi account created"); setModal(false); setF(empty); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };
  const openDetail = (id) => api.get(`/girvi/${id}`).then((r) => setDetail(r.data));
  const makePayment = async () => {
    try { const { data } = await api.post(`/girvi/${detail.id}/payment`, { amount: +pay.amount, mode: pay.mode, pay_type: pay.pay_type }); toast.success("Payment recorded"); setDetail({ ...data.account, payments: [...(detail.payments || []), data.payment] }); setPay({ amount: 0, mode: "cash", pay_type: "mixed" }); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };
  const release = async (force = false) => {
    try { const { data } = await api.post(`/girvi/${detail.id}/release`, null, { params: { force } }); toast.success("Girvi released & closed"); setDetail({ ...detail, ...data }); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  return (
    <div className="space-y-4" data-testid="girvi-page">
      <div className="flex justify-between items-center">
        <h1 className="font-display text-3xl">Girvi (Gold Loan)</h1>
        <button data-testid="new-girvi" onClick={() => { setF(empty); setModal(true); }} className="flex items-center gap-1 bg-emerald-brand text-white px-4 py-2 rounded-md text-sm font-semibold"><Plus className="w-4 h-4" />New Girvi</button>
      </div>
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]"><Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" /><input data-testid="girvi-search" className="w-full pl-9 pr-3 py-2 border rounded-md" placeholder="Girvi no, customer, mobile…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <select data-testid="girvi-status" value={status} onChange={(e) => setStatus(e.target.value)} className="border rounded-md px-3"><option value="">All Status</option>{STATUS.map((s) => <option key={s}>{s}</option>)}</select>
      </div>

      <div className="bg-card border rounded-md overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-muted-foreground border-b bg-muted/40"><th className="p-3">Girvi No</th><th>Customer</th><th>Item</th><th>Loan</th><th>Outstanding</th><th>Due</th><th>Status</th></tr></thead>
          <tbody>{list.map((g) => (
            <tr key={g.id} onClick={() => openDetail(g.id)} className="border-b last:border-0 hover:bg-muted/40 cursor-pointer" data-testid={`girvi-row-${g.girvi_no}`}>
              <td className="p-3 font-mono text-xs text-gold">{g.girvi_no}</td><td className="font-medium">{g.customer_name}</td><td className="truncate max-w-[160px]">{g.item_description}</td><td>{inr(g.loan_amount)}</td><td className="font-semibold">{inr(g.total_outstanding)}</td><td>{g.due_date?.slice(0, 10)}</td>
              <td><span className={`px-2 py-0.5 rounded text-xs ${badge(g.status)}`}>{g.status}</span></td>
            </tr>))}</tbody>
        </table>
        {!list.length && <p className="p-6 text-center text-muted-foreground">No girvi accounts</p>}
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setModal(false)}>
          <div className="bg-card rounded-md w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5" onClick={(e) => e.stopPropagation()} data-testid="girvi-modal">
            <h2 className="font-display text-2xl mb-4">New Girvi Account</h2>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              {[["customer_name", "Customer Name*"], ["mobile", "Mobile*"], ["address", "Address"], ["id_proof_type", "ID Proof Type"], ["id_proof_number", "ID Proof Number"], ["item_description", "Jewellery Description*"], ["purity", "Purity"]].map(([k, l]) => (
                <div key={k}><label className="text-xs">{l}</label><input data-testid={`gf-${k}`} className="w-full mt-1 px-2 py-1.5 border rounded" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></div>
              ))}
              <div><label className="text-xs">Metal</label><select className="w-full mt-1 px-2 py-1.5 border rounded" value={f.metal_type} onChange={(e) => setF({ ...f, metal_type: e.target.value })}><option>Gold</option><option>Silver</option></select></div>
              {[["gross_weight", "Gross Wt (g)"], ["stone_weight", "Stone Wt (g)"], ["estimated_value", "Est. Market Value*"], ["loan_amount", "Loan Amount*"], ["interest_rate", "Interest Rate %"]].map(([k, l]) => (
                <div key={k}><label className="text-xs">{l}</label><input data-testid={`gf-${k}`} type="number" className="w-full mt-1 px-2 py-1.5 border rounded" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></div>
              ))}
              <div><label className="text-xs">Interest Type</label><select data-testid="gf-interest_type" className="w-full mt-1 px-2 py-1.5 border rounded" value={f.interest_type} onChange={(e) => setF({ ...f, interest_type: e.target.value })}><option value="monthly">Monthly</option><option value="daily">Daily</option><option value="fixed">Fixed</option><option value="custom">Custom</option></select></div>
              <div><label className="text-xs">Due Date*</label><input data-testid="gf-due_date" type="date" className="w-full mt-1 px-2 py-1.5 border rounded" value={f.due_date} onChange={(e) => setF({ ...f, due_date: e.target.value })} /></div>
            </div>
            <div className="flex justify-end gap-2 mt-5"><button onClick={() => setModal(false)} className="px-4 py-2 border rounded-md">Cancel</button><button data-testid="save-girvi" onClick={save} className="px-5 py-2 bg-emerald-brand text-white rounded-md font-semibold">Create</button></div>
          </div>
        </div>
      )}

      {detail && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 no-print" onClick={() => setDetail(null)}>
          <div className="bg-card rounded-md w-full max-w-3xl max-h-[92vh] overflow-y-auto p-5" onClick={(e) => e.stopPropagation()} data-testid="girvi-detail">
            <div className="flex justify-between items-start no-print">
              <div><h2 className="font-display text-2xl">{detail.girvi_no}</h2><span className={`px-2 py-0.5 rounded text-xs ${badge(detail.status)}`}>{detail.status}</span></div>
              <div className="flex gap-2"><button onClick={() => window.print()} className="flex items-center gap-1 border px-3 py-1.5 rounded text-sm"><Printer className="w-4 h-4" />Receipt</button><button onClick={() => setDetail(null)}><X className="w-5 h-5" /></button></div>
            </div>

            <div className="print-area">
              <div className="hidden print:block text-center border-b-2 border-emerald-brand pb-2 mb-3"><h1 className="font-display text-2xl">{shop.shop_name}</h1><p className="text-xs">{shop.address}</p><p className="font-semibold mt-1">GIRVI RECEIPT — {detail.girvi_no}</p></div>
              <div className="grid grid-cols-2 gap-3 my-3 text-sm">
                <div><b>Customer:</b> {detail.customer_name}<br />{detail.mobile}<br />{detail.address}<br /><span className="text-xs">{detail.id_proof_type}: {detail.id_proof_number}</span></div>
                <div className="text-right"><b>Item:</b> {detail.item_description}<br />{detail.metal_type} {detail.purity} · {detail.net_weight}g<br />Est. Value: {inr(detail.estimated_value)} (LTV {detail.ltv}%)</div>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 my-3">
                <Box l="Loan Amount" v={inr(detail.loan_amount)} />
                <Box l="Interest" v={`${detail.interest_rate}% ${detail.interest_type}`} />
                <Box l="Outstanding Principal" v={inr(detail.outstanding_principal)} />
                <Box l="Outstanding Interest" v={inr(detail.outstanding_interest)} />
                <Box l="Total Outstanding" v={inr(detail.total_outstanding)} hi />
                <Box l="Interest Paid" v={inr(detail.interest_paid)} />
                <Box l="Due Date" v={detail.due_date?.slice(0, 10)} />
                <Box l="Started" v={detail.date?.slice(0, 10)} />
              </div>
              {detail.payments?.length > 0 && (
                <div className="my-3"><h3 className="font-semibold text-sm mb-1">Payment History</h3>
                  <table className="w-full text-xs"><thead><tr className="text-left border-b text-muted-foreground"><th className="py-1">Date</th><th>Amount</th><th>Interest</th><th>Principal</th><th>Mode</th></tr></thead>
                    <tbody>{detail.payments.map((p, i) => <tr key={i} className="border-b last:border-0"><td className="py-1">{p.date}</td><td>{inr(p.amount)}</td><td>{inr(p.interest_portion)}</td><td>{inr(p.principal_portion)}</td><td>{p.mode}</td></tr>)}</tbody></table>
                </div>
              )}
              <div className="hidden print:flex justify-between mt-8 text-xs"><span>Customer Signature</span><span>Authorized Signature</span></div>
            </div>

            {detail.status !== "Closed" && (
              <div className="border-t pt-4 mt-4 no-print">
                <h3 className="font-semibold mb-2">Record Payment</h3>
                <div className="flex flex-wrap gap-2 items-end">
                  <div><label className="text-xs">Amount</label><input data-testid="girvi-pay-amount" type="number" className="w-32 px-2 py-1.5 border rounded block mt-1" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} /></div>
                  <div><label className="text-xs">Type</label><select data-testid="girvi-pay-type" className="px-2 py-1.5 border rounded block mt-1" value={pay.pay_type} onChange={(e) => setPay({ ...pay, pay_type: e.target.value })}><option value="mixed">Interest + Principal</option><option value="interest">Interest Only</option><option value="principal">Principal Only</option></select></div>
                  <div><label className="text-xs">Mode</label><select className="px-2 py-1.5 border rounded block mt-1" value={pay.mode} onChange={(e) => setPay({ ...pay, mode: e.target.value })}><option>cash</option><option>upi</option><option>bank</option></select></div>
                  <button data-testid="girvi-make-payment" onClick={makePayment} className="bg-emerald-brand text-white px-4 py-2 rounded-md text-sm font-semibold">Pay</button>
                  <button data-testid="girvi-release" onClick={() => release(false)} className="border px-4 py-2 rounded-md text-sm">Release Girvi</button>
                </div>
                <p className="text-xs text-muted-foreground mt-2">Full settlement releases the pledged jewellery and closes the account.</p>
              </div>
            )}
            {detail.status === "Closed" && <div className="border-t pt-3 mt-3 text-sm text-green-700 no-print">✓ Released on {detail.release_date} — jewellery returned to customer.</div>}
          </div>
        </div>
      )}
    </div>
  );
}
const Box = ({ l, v, hi }) => <div className={`border rounded-md p-2 ${hi ? "bg-gold/10" : ""}`}><div className="text-[10px] uppercase text-muted-foreground">{l}</div><div className={`font-semibold ${hi ? "text-gold" : ""}`}>{v}</div></div>;
