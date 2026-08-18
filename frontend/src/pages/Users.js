import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { Plus } from "lucide-react";

const empty = { name: "", email: "", password: "", role: "sales" };
const roles = ["admin", "manager", "sales", "accountant"];

export default function Users() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [list, setList] = useState([]);
  const [modal, setModal] = useState(false);
  const [f, setF] = useState(empty);
  const [editId, setEditId] = useState(null);

  const load = () => api.get("/users").then((r) => setList(r.data));
  useEffect(() => { load(); }, []);

  const open = (u) => { if (u) { setEditId(u.id); setF({ name: u.name, email: u.email, password: "", role: u.role }); } else { setEditId(null); setF(empty); } setModal(true); };
  const save = async () => {
    try {
      if (editId) { const b = { name: f.name, role: f.role }; if (f.password) b.password = f.password; await api.put(`/users/${editId}`, b); }
      else await api.post("/users", f);
      toast.success("Saved"); setModal(false); load();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };
  const toggle = async (u) => { await api.put(`/users/${u.id}`, { disabled: !u.disabled }); load(); };

  return (
    <div className="space-y-4" data-testid="users-page">
      <div className="flex justify-between items-center">
        <h1 className="font-display text-3xl">User Management</h1>
        {isAdmin && <button data-testid="add-user" onClick={() => open(null)} className="flex items-center gap-1 bg-emerald-brand text-white px-4 py-2 rounded-md text-sm font-semibold"><Plus className="w-4 h-4" />Add User</button>}
      </div>
      <div className="bg-card border rounded-md overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-muted-foreground border-b bg-muted/40"><th className="p-3">Name</th><th>Email</th><th>Role</th><th>Status</th><th>Last Login</th>{isAdmin && <th></th>}</tr></thead>
          <tbody>{list.map((u) => (
            <tr key={u.id} className="border-b last:border-0 hover:bg-muted/40" data-testid={`user-row-${u.email}`}>
              <td className="p-3 font-medium">{u.name}</td><td>{u.email}</td><td className="capitalize">{u.role}</td>
              <td>{u.disabled ? <span className="text-destructive">Disabled</span> : <span className="text-green-600">Active</span>}</td>
              <td className="text-xs">{u.last_login ? new Date(u.last_login).toLocaleString("en-IN") : "—"}</td>
              {isAdmin && <td className="space-x-2"><button onClick={() => open(u)} className="text-gold">Edit</button><button onClick={() => toggle(u)} className="text-destructive">{u.disabled ? "Enable" : "Disable"}</button></td>}
            </tr>))}</tbody>
        </table>
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setModal(false)}>
          <div className="bg-card rounded-md w-full max-w-md p-5" onClick={(e) => e.stopPropagation()} data-testid="user-modal">
            <h2 className="font-display text-2xl mb-4">{editId ? "Edit" : "Add"} User</h2>
            <div className="space-y-3">
              <div><label className="text-sm">Name</label><input data-testid="uf-name" className="w-full mt-1 px-3 py-2 border rounded" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
              <div><label className="text-sm">Email</label><input data-testid="uf-email" className="w-full mt-1 px-3 py-2 border rounded disabled:bg-muted" value={f.email} disabled={!!editId} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
              <div><label className="text-sm">{editId ? "New Password (blank = keep)" : "Password"}</label><input data-testid="uf-password" type="password" className="w-full mt-1 px-3 py-2 border rounded" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></div>
              <div><label className="text-sm">Role</label><select data-testid="uf-role" className="w-full mt-1 px-3 py-2 border rounded capitalize" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{roles.map((r) => <option key={r} value={r}>{r}</option>)}</select></div>
            </div>
            <div className="flex justify-end gap-2 mt-5"><button onClick={() => setModal(false)} className="px-4 py-2 border rounded-md">Cancel</button><button data-testid="save-user" onClick={save} className="px-5 py-2 bg-emerald-brand text-white rounded-md font-semibold">Save</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
