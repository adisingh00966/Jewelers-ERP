import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { fmtErr } from "@/lib/api";
import { toast } from "sonner";
import { Gem } from "lucide-react";

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("adisingh00966@gmail.com");
  const [password, setPassword] = useState("admin123");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      await login(email, password);
      toast.success("Welcome back");
      nav("/");
    } catch (e) {
      setErr(fmtErr(e.response?.data?.detail) || e.message);
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:block relative bg-emerald-brand">
        <img src="https://images.unsplash.com/photo-1640183298005-3a4497cc6a37?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200" alt="jewellery" className="absolute inset-0 w-full h-full object-cover opacity-40" />
        <div className="absolute inset-0 flex flex-col justify-end p-12 text-white">
          <Gem className="w-12 h-12 text-gold mb-4" />
          <h1 className="font-display text-5xl leading-tight tracking-tight">Vaishno Jewelers</h1>
          <p className="mt-3 text-white/80 max-w-md">Complete jewellery shop management — billing, inventory, rates, customers and reports in one premium suite.</p>
        </div>
      </div>
      <div className="flex items-center justify-center p-8 bg-background">
        <form onSubmit={submit} className="w-full max-w-sm" data-testid="login-form">
          <div className="lg:hidden flex items-center gap-2 mb-6"><Gem className="w-7 h-7 text-gold" /><span className="font-display text-2xl">Vaishno Jewelers</span></div>
          <p className="uppercase tracking-[0.2em] text-xs text-muted-foreground mb-2">Sign in</p>
          <h2 className="font-display text-3xl mb-6">Welcome back</h2>
          {err && <div className="mb-4 text-sm text-destructive bg-destructive/10 p-3 rounded-md" data-testid="login-error">{err}</div>}
          <label className="text-sm font-medium">Email</label>
          <input data-testid="login-email" className="w-full mt-1 mb-4 px-3 py-2 border rounded-md bg-white" value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
          <label className="text-sm font-medium">Password</label>
          <input data-testid="login-password" className="w-full mt-1 mb-6 px-3 py-2 border rounded-md bg-white" value={password} onChange={(e) => setPassword(e.target.value)} type="password" required />
          <button data-testid="login-submit" disabled={busy} className="w-full bg-emerald-brand text-white py-2.5 rounded-md font-semibold hover:opacity-90 transition-opacity disabled:opacity-50">{busy ? "Signing in…" : "Sign In"}</button>
          <p className="text-xs text-muted-foreground mt-4">Demo: admin / manager@shop.com / sales@shop.com — password123</p>
        </form>
      </div>
    </div>
  );
}
