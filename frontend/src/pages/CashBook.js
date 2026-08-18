import { useEffect, useState } from "react";
import api, { inr } from "@/lib/api";
import { toast } from "sonner";
import { Wallet, Smartphone, CreditCard, Building2, Lock, CheckCircle2 } from "lucide-react";

const today = () => new Date().toISOString().slice(0, 10);

export default function CashBook() {
  const [date, setDate] = useState(today());
  const [cb, setCb] = useState(null);

  const load = () => api.get("/cashbook", { params: { date } }).then((r) => setCb(r.data));
  useEffect(() => { load(); }, [date]);

  const close = async () => {
    try { const { data } = await api.post("/cashbook/close", null, { params: { date } }); toast.success(`Day closed — closing cash ${inr(data.closing)}`); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  if (!cb) return <div>Loading…</div>;
  const Line = ({ l, v, sign, strong }) => (
    <div className={`flex justify-between py-2 border-b last:border-0 ${strong ? "font-bold text-base" : "text-sm"}`}>
      <span>{sign} {l}</span><span>{inr(v)}</span>
    </div>
  );
  const Pay = ({ l, v, icon: I }) => (
    <div className="bg-card border rounded-md p-4"><div className="flex items-center justify-between"><span className="text-xs uppercase text-muted-foreground">{l}</span><I className="w-4 h-4 text-gold" /></div><div className="text-xl font-bold mt-1">{inr(v)}</div></div>
  );

  return (
    <div className="space-y-5" data-testid="cashbook-page">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <h1 className="font-display text-3xl">Daily Cash Book</h1>
        <div className="flex items-center gap-2">
          <input data-testid="cashbook-date" type="date" className="border rounded-md px-3 py-2" value={date} onChange={(e) => setDate(e.target.value)} />
          {cb.closed ? <span className="flex items-center gap-1 text-green-600 text-sm font-semibold"><CheckCircle2 className="w-4 h-4" />Day Closed</span>
            : <button data-testid="close-day" onClick={close} className="flex items-center gap-1 bg-emerald-brand text-white px-4 py-2 rounded-md text-sm font-semibold"><Lock className="w-4 h-4" />Close Day</button>}
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-card border rounded-md p-5">
          <h2 className="font-semibold mb-2">Cash Flow — {cb.date}</h2>
          <Line l="Opening Cash" v={cb.opening} sign="" />
          <Line l="Cash Sales" v={cb.cash_sales} sign="+" />
          <Line l="Refunds (cash)" v={cb.refunds} sign="−" />
          <Line l="Expenses (cash)" v={cb.expenses_cash} sign="−" />
          <Line l="Old Gold Payout (cash)" v={cb.old_gold_cash} sign="−" />
          <div className="mt-2 pt-2 border-t-2 border-emerald-brand"><Line l="Closing Cash" v={cb.closing} sign="=" strong /></div>
        </div>
        <div className="space-y-3">
          <h2 className="font-semibold">Payment Summary</h2>
          <div className="grid grid-cols-2 gap-3">
            <Pay l="Cash" v={cb.summary.cash} icon={Wallet} />
            <Pay l="UPI" v={cb.summary.upi} icon={Smartphone} />
            <Pay l="Card" v={cb.summary.card} icon={CreditCard} />
            <Pay l="Bank" v={cb.summary.bank} icon={Building2} />
            <Pay l="Credit / Due" v={cb.summary.credit} icon={Wallet} />
            <Pay l="Expenses" v={cb.summary.expenses} icon={Wallet} />
          </div>
        </div>
      </div>
    </div>
  );
}
