import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api, { inr } from "@/lib/api";
import { Printer, ArrowLeft, MessageCircle } from "lucide-react";

export default function Invoice() {
  const { id } = useParams();
  const nav = useNavigate();
  const [s, setS] = useState(null);
  const [shop, setShop] = useState({});
  useEffect(() => {
    api.get(`/sales/${id}`).then((r) => setS(r.data));
    api.get("/settings").then((r) => setShop(r.data || {}));
  }, [id]);
  if (!s) return <div className="p-6">Loading…</div>;

  const whatsapp = () => {
    const msg = `Invoice ${s.invoice_no}\n${shop.shop_name || "Jewellers"}\nTotal: ${inr(s.grand_total)}\nThank you!`;
    window.open(`https://wa.me/${s.customer_mobile ? "91" + s.customer_mobile.replace(/\D/g, "") : ""}?text=${encodeURIComponent(msg)}`, "_blank");
  };

  return (
    <div className="min-h-screen bg-muted/40 py-6">
      <div className="max-w-3xl mx-auto px-4 flex justify-between mb-4 no-print">
        <button onClick={() => nav(-1)} className="flex items-center gap-1 text-sm"><ArrowLeft className="w-4 h-4" />Back</button>
        <div className="flex gap-2">
          <button data-testid="whatsapp-invoice" onClick={whatsapp} className="flex items-center gap-1 border bg-green-600 text-white px-4 py-2 rounded-md text-sm"><MessageCircle className="w-4 h-4" />WhatsApp</button>
          <button data-testid="print-invoice" onClick={() => window.print()} className="flex items-center gap-1 bg-emerald-brand text-white px-4 py-2 rounded-md text-sm"><Printer className="w-4 h-4" />Print / PDF</button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto bg-white p-8 shadow print-area" data-testid="invoice-doc">
        <div className="flex justify-between items-start border-b-2 border-emerald-brand pb-4">
          <div>
            <h1 className="font-display text-3xl text-emerald-brand">{shop.shop_name || "Jewellers"}</h1>
            <p className="text-sm text-gray-600">{shop.address}, {shop.city}, {shop.state} {shop.pincode}</p>
            <p className="text-sm text-gray-600">📞 {shop.mobile} {shop.email && `· ${shop.email}`}</p>
            {shop.gstin && <p className="text-sm text-gray-600">GSTIN: {shop.gstin}</p>}
          </div>
          <div className="text-right">
            <div className="text-2xl font-display font-bold text-gold">TAX INVOICE</div>
            <p className="text-sm mt-1"><b>{s.invoice_no}</b></p>
            <p className="text-sm">Date: {s.date}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 py-4 text-sm">
          <div><p className="uppercase text-xs text-gray-500 tracking-wide mb-1">Billed To</p><p className="font-semibold">{s.customer_name}</p><p>{s.customer_mobile}</p></div>
          <div className="text-right"><p className="uppercase text-xs text-gray-500 tracking-wide mb-1">Salesperson</p><p>{s.salesperson}</p></div>
        </div>

        <table className="w-full text-xs border-collapse">
          <thead><tr className="bg-emerald-brand text-white"><th className="p-2 text-left">Item</th><th>Purity</th><th>Gross</th><th>Net</th><th>Rate/g</th><th>Making</th><th>Wastage</th><th className="text-right p-2">Amount</th></tr></thead>
          <tbody>{s.items.map((it, i) => (
            <tr key={i} className="border-b"><td className="p-2">{it.name} <span className="text-gray-400">({it.metal_type})</span></td><td className="text-center">{it.purity}</td><td className="text-center">{it.gross_weight}g</td><td className="text-center">{it.net_weight}g</td><td className="text-center">{inr(it.rate_per_gram)}</td><td className="text-center">{inr(it.making_value)}</td><td className="text-center">{inr(it.wastage_value)}</td><td className="text-right p-2">{inr(it.line_total)}</td></tr>
          ))}</tbody>
        </table>

        <div className="flex justify-end mt-4">
          <div className="w-64 text-sm space-y-1">
            <Row l="Subtotal" v={inr(s.subtotal)} />
            {s.discount > 0 && <Row l="Discount" v={"-" + inr(s.discount)} />}
            <Row l={`CGST (${s.gst_pct / 2}%)`} v={inr(s.cgst)} />
            <Row l={`SGST (${s.gst_pct / 2}%)`} v={inr(s.sgst)} />
            {s.round_off !== 0 && <Row l="Round Off" v={inr(s.round_off)} />}
            <div className="flex justify-between border-t-2 border-emerald-brand pt-1 font-bold text-base"><span>Grand Total</span><span>{inr(s.grand_total)}</span></div>
            <Row l="Received" v={inr(s.received)} />
            {s.balance_due >= 0 ? <Row l="Balance Due" v={inr(s.balance_due)} /> : <Row l="Change / Return" v={inr(-s.balance_due)} />}
          </div>
        </div>

        <div className="mt-4 text-xs">
          <p className="font-semibold">Payment:</p>
          {Object.entries(s.payments || {}).filter(([, v]) => +v > 0).map(([k, v]) => <span key={k} className="mr-3 capitalize">{k}: {inr(v)}</span>)}
        </div>

        <div className="mt-8 flex justify-between items-end text-xs text-gray-500">
          <div className="max-w-xs"><p className="font-semibold mb-1">Terms &amp; Conditions</p><p>{shop.terms || "Goods once sold will not be taken back."}</p></div>
          <div className="text-center"><div className="border-t border-gray-400 w-40 pt-1">{shop.owner_name || "Authorized Signature"}</div><div className="text-[10px] text-gray-400">{shop.owner_name ? "Authorized Signatory" : ""}</div></div>
        </div>
      </div>
    </div>
  );
}
const Row = ({ l, v }) => <div className="flex justify-between"><span>{l}</span><span>{v}</span></div>;
