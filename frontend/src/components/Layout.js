import { useState, useEffect } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import api, { inr } from "@/lib/api";
import {
  LayoutDashboard, TrendingUp, Package, Users as UsersIcon, ShoppingCart,
  FileBarChart, Settings as Cog, Gem, LogOut, Menu, X, UserCog, ScrollText, Plus,
  RotateCcw, Truck, ShoppingBag, Landmark as LandmarkIcon, Receipt, Coins, BookOpen,
} from "lucide-react";

const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/sales/new", label: "New Sale", icon: Plus },
  { to: "/sales", label: "Sales History", icon: ShoppingCart },
  { to: "/sales/returns", label: "Sales Returns", icon: RotateCcw },
  { to: "/purchases", label: "Purchases", icon: ShoppingBag, roles: ["admin", "manager", "accountant"] },
  { to: "/purchases/returns", label: "Purchase Returns", icon: RotateCcw, roles: ["admin", "manager", "accountant"] },
  { to: "/suppliers", label: "Suppliers", icon: Truck, roles: ["admin", "manager", "accountant"] },
  { to: "/products", label: "Inventory", icon: Package },
  { to: "/old-gold", label: "Old Gold", icon: Coins },
  { to: "/girvi", label: "Girvi Loans", icon: LandmarkIcon },
  { to: "/customers", label: "Customers", icon: UsersIcon },
  { to: "/rates", label: "Metal Rates", icon: TrendingUp },
  { to: "/expenses", label: "Expenses", icon: Receipt },
  { to: "/cashbook", label: "Cash Book", icon: BookOpen, roles: ["admin", "manager", "accountant"] },
  { to: "/reports", label: "Reports", icon: FileBarChart },
  { to: "/settings", label: "Settings", icon: Cog },
  { to: "/users", label: "Users", icon: UserCog, roles: ["admin", "manager"] },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const nav_ = useNavigate();
  const [open, setOpen] = useState(false);
  const [rate, setRate] = useState(null);

  useEffect(() => { api.get("/rates/current").then((r) => setRate(r.data)).catch(() => {}); }, []);

  const items = nav.filter((n) => !n.roles || n.roles.includes(user?.role));

  return (
    <div className="min-h-screen flex bg-background">
      {open && <div className="fixed inset-0 bg-black/40 z-30 lg:hidden" onClick={() => setOpen(false)} />}
      <aside className={`fixed lg:static z-40 w-64 h-screen bg-emerald-brand text-white flex flex-col transition-transform ${open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}>
        <div className="p-5 flex items-center gap-2 border-b border-white/10">
          <Gem className="w-7 h-7 text-gold" />
          <div><div className="font-display text-lg leading-none">Vaishno Jewelers</div><div className="text-[10px] tracking-[0.2em] text-white/50 uppercase">Jewellers ERP</div></div>
        </div>
        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {items.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} onClick={() => setOpen(false)} data-testid={`nav-${n.label.toLowerCase().replace(/ /g, "-")}`}
              className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors ${isActive ? "bg-gold text-black font-semibold" : "text-white/75 hover:bg-white/10"}`}>
              <n.icon className="w-4 h-4" />{n.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-white/10">
          <div className="px-3 py-2 text-sm"><div className="font-semibold truncate">{user?.name}</div><div className="text-[11px] text-gold uppercase tracking-wide">{user?.role}</div></div>
          <button data-testid="logout-btn" onClick={async () => { await logout(); nav_("/login"); }} className="flex items-center gap-2 w-full px-3 py-2 text-sm text-white/75 hover:bg-white/10 rounded-md"><LogOut className="w-4 h-4" />Logout</button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b bg-card flex items-center justify-between px-4 lg:px-6 sticky top-0 z-20">
          <button className="lg:hidden" onClick={() => setOpen(true)}><Menu className="w-6 h-6" /></button>
          <div className="hidden md:flex items-center gap-1 text-xs">
            <ScrollText className="w-4 h-4 text-gold mr-1" />
            {rate ? (
              <div className="flex gap-4 font-medium">
                <span>Gold 22K <b className="text-gold">{inr(rate.gold_22k)}</b>/10g</span>
                <span>Gold 24K <b className="text-gold">{inr(rate.gold_24k)}</b>/10g</span>
                <span>Silver <b className="text-gold">{inr(rate.silver_per_10g)}</b>/10g</span>
              </div>
            ) : <span className="text-muted-foreground">No rate set</span>}
          </div>
          <div className="w-8 h-8 rounded-full bg-emerald-brand text-white flex items-center justify-center text-sm font-semibold">{user?.name?.[0]}</div>
        </header>
        <main className="flex-1 p-4 lg:p-6 overflow-x-hidden"><Outlet /></main>
      </div>
    </div>
  );
}
