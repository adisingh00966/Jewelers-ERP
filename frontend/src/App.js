import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { Toaster } from "sonner";
import Layout from "@/components/Layout";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Rates from "@/pages/Rates";
import Products from "@/pages/Products";
import Customers from "@/pages/Customers";
import CustomerDetail from "@/pages/CustomerDetail";
import Suppliers from "@/pages/Suppliers";
import Purchases from "@/pages/Purchases";
import Girvi from "@/pages/Girvi";
import SalesReturns from "@/pages/SalesReturns";
import PurchaseReturns from "@/pages/PurchaseReturns";
import Expenses from "@/pages/Expenses";
import OldGold from "@/pages/OldGold";
import CashBook from "@/pages/CashBook";
import NewSale from "@/pages/NewSale";
import Sales from "@/pages/Sales";
import Invoice from "@/pages/Invoice";
import Reports from "@/pages/Reports";
import Settings from "@/pages/Settings";
import Users from "@/pages/Users";

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center font-display text-2xl">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function App() {
  return (
    <div className="App">
      <AuthProvider>
        <BrowserRouter>
          <Toaster position="top-right" richColors />
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/invoice/:id" element={<Protected><Invoice /></Protected>} />
            <Route path="/" element={<Protected><Layout /></Protected>}>
              <Route index element={<Dashboard />} />
              <Route path="rates" element={<Rates />} />
              <Route path="products" element={<Products />} />
              <Route path="customers" element={<Customers />} />
              <Route path="customers/:id" element={<CustomerDetail />} />
              <Route path="sales/new" element={<NewSale />} />
              <Route path="sales" element={<Sales />} />
              <Route path="sales/returns" element={<SalesReturns />} />
              <Route path="purchases" element={<Purchases />} />
              <Route path="purchases/returns" element={<PurchaseReturns />} />
              <Route path="suppliers" element={<Suppliers />} />
              <Route path="girvi" element={<Girvi />} />
              <Route path="expenses" element={<Expenses />} />
              <Route path="old-gold" element={<OldGold />} />
              <Route path="cashbook" element={<CashBook />} />
              <Route path="reports" element={<Reports />} />
              <Route path="settings" element={<Settings />} />
              <Route path="users" element={<Users />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </div>
  );
}
export default App;
