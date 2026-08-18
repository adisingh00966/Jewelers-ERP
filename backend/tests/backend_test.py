"""Backend API tests for Jewellery Shop Management app."""
import os
import time
import uuid
import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL")
            or frontend_env.get("REACT_APP_BACKEND_URL")).rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"email": "adisingh00966@gmail.com", "password": "admin123"}
MANAGER = {"email": "manager@shop.com", "password": "password123"}
SALES = {"email": "sales@shop.com", "password": "password123"}
ACCOUNTS = {"email": "accounts@shop.com", "password": "password123"}


def _login(creds):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, f"login failed for {creds['email']}: {r.status_code} {r.text[:200]}"
    data = r.json()
    assert "token" in data and data["token"]
    assert "user" in data and data["user"]["email"] == creds["email"].lower()
    s.headers.update({"Authorization": f"Bearer {data['token']}"})
    return s, data


# ---------- Auth ----------
class TestAuth:
    def test_admin_login(self):
        s, d = _login(ADMIN)
        assert d["user"]["role"] == "admin"

    def test_all_demo_users_login(self):
        for creds, role in [(MANAGER, "manager"), (SALES, "sales"), (ACCOUNTS, "accountant")]:
            s, d = _login(creds)
            assert d["user"]["role"] == role

    def test_invalid_login(self):
        r = requests.post(f"{API}/auth/login",
                          json={"email": "adisingh00966@gmail.com", "password": "wrong"},
                          timeout=30)
        assert r.status_code == 401

    def test_me_requires_auth(self):
        r = requests.get(f"{API}/auth/me", timeout=30)
        assert r.status_code == 401

    def test_me_returns_user(self):
        s, _ = _login(ADMIN)
        r = s.get(f"{API}/auth/me", timeout=30)
        assert r.status_code == 200
        assert r.json()["email"] == ADMIN["email"]


# ---------- Metal Rates ----------
class TestRates:
    def test_current_rate_exists(self):
        s, _ = _login(ADMIN)
        r = s.get(f"{API}/rates/current", timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d and "gold_22k" in d and d["gold_22k"] > 0

    def test_set_rate_admin_and_history_grows(self):
        s, _ = _login(ADMIN)
        before = s.get(f"{API}/rates/history").json()
        payload = {"gold_24k": 75000, "gold_22k": 68500, "gold_20k": 62500,
                   "gold_18k": 56000, "silver_per_10g": 960}
        r = s.post(f"{API}/rates", json=payload, timeout=30)
        assert r.status_code == 200
        after = s.get(f"{API}/rates/history").json()
        assert len(after) == len(before) + 1
        cur = s.get(f"{API}/rates/current").json()
        assert cur["gold_22k"] == 68500

    def test_sales_role_cannot_update_rate(self):
        s, _ = _login(SALES)
        r = s.post(f"{API}/rates", json={"gold_24k": 1, "gold_22k": 1, "gold_20k": 1,
                                          "gold_18k": 1, "silver_per_10g": 1}, timeout=30)
        assert r.status_code == 403


# ---------- Customers ----------
class TestCustomers:
    created = []

    def test_seed_customers_present(self):
        s, _ = _login(ADMIN)
        r = s.get(f"{API}/customers", timeout=30)
        assert r.status_code == 200
        assert len(r.json()) >= 10

    def test_search_customer(self):
        s, _ = _login(ADMIN)
        r = s.get(f"{API}/customers", params={"search": "Suresh"}, timeout=30)
        assert r.status_code == 200
        assert any("Suresh" in c["name"] for c in r.json())

    def test_create_and_duplicate_mobile(self):
        s, _ = _login(ADMIN)
        mob = "9111100" + str(int(time.time()) % 1000).zfill(3)
        payload = {"name": "TEST_Cust", "mobile": mob, "city": "Test"}
        r = s.post(f"{API}/customers", json=payload, timeout=30)
        assert r.status_code == 200, r.text
        cid = r.json()["id"]
        TestCustomers.created.append((s, cid))
        # verify persistence via detail endpoint
        r2 = s.get(f"{API}/customers/{cid}", timeout=30)
        assert r2.status_code == 200
        assert r2.json()["customer"]["name"] == "TEST_Cust"
        # duplicate mobile
        rd = s.post(f"{API}/customers", json=payload, timeout=30)
        assert rd.status_code == 400

    def test_customer_detail_aggregates(self):
        s, _ = _login(ADMIN)
        cust = s.get(f"{API}/customers", timeout=30).json()[0]
        r = s.get(f"{API}/customers/{cust['id']}", timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert "total_purchases" in d and "total_outstanding" in d and "sales" in d


# ---------- Products ----------
class TestProducts:
    def test_list_products_and_filters(self):
        s, _ = _login(ADMIN)
        all_p = s.get(f"{API}/products", timeout=30).json()
        assert len(all_p) >= 20
        gold = s.get(f"{API}/products", params={"metal": "Gold"}, timeout=30).json()
        assert all(p["metal_type"] == "Gold" for p in gold) and len(gold) > 0
        sr = s.get(f"{API}/products", params={"search": "GR001"}, timeout=30).json()
        assert any(p["sku"] == "GR001" for p in sr)

    def test_barcode_lookup(self):
        s, _ = _login(ADMIN)
        r = s.get(f"{API}/products/barcode/GR001", timeout=30)
        assert r.status_code == 200 and r.json()["sku"] == "GR001"

    def test_create_product_validations(self):
        s, _ = _login(ADMIN)
        sku = f"TEST_SKU_{uuid.uuid4().hex[:6]}"
        body = {"name": "TEST_Product", "sku": sku, "category": "Ring",
                "metal_type": "Gold", "purity": "22K", "gross_weight": 10.0,
                "stone_weight": 1.0, "making_charge": 500, "making_charge_type": "per_gram",
                "wastage_pct": 8, "quantity": 5, "min_stock": 1}
        r = s.post(f"{API}/products", json=body, timeout=30)
        assert r.status_code == 200
        p = r.json()
        assert p["net_weight"] == 9.0
        # duplicate SKU
        rd = s.post(f"{API}/products", json=body, timeout=30)
        assert rd.status_code == 400
        # duplicate barcode (default barcode == sku)
        body2 = dict(body); body2["sku"] = sku + "X"; body2["barcode"] = sku
        rb = s.post(f"{API}/products", json=body2, timeout=30)
        assert rb.status_code == 400
        # negative weight
        body3 = dict(body); body3["sku"] = sku + "Y"; body3["gross_weight"] = -1
        rn = s.post(f"{API}/products", json=body3, timeout=30)
        assert rn.status_code == 400

    def test_update_and_stock_adjust(self):
        s, _ = _login(ADMIN)
        sku = f"TEST_ADJ_{uuid.uuid4().hex[:6]}"
        r = s.post(f"{API}/products", json={"name": "TEST_Adj", "sku": sku, "category": "Ring",
                   "metal_type": "Silver", "purity": "925", "gross_weight": 5,
                   "stone_weight": 0, "quantity": 10}, timeout=30)
        pid = r.json()["id"]
        # update
        u = s.put(f"{API}/products/{pid}",
                  json={"name": "TEST_Adj2", "sku": sku, "category": "Ring",
                        "metal_type": "Silver", "purity": "925", "gross_weight": 6,
                        "stone_weight": 1, "quantity": 10}, timeout=30)
        assert u.status_code == 200 and u.json()["net_weight"] == 5.0 and u.json()["name"] == "TEST_Adj2"
        # adjust
        a = s.post(f"{API}/products/{pid}/adjust", params={"qty": -3, "reason": "test"}, timeout=30)
        assert a.status_code == 200 and a.json()["quantity"] == 7
        # negative stock blocked
        a2 = s.post(f"{API}/products/{pid}/adjust", params={"qty": -100}, timeout=30)
        assert a2.status_code == 400


# ---------- Sales ----------
class TestSales:
    def test_create_sale_reduces_stock_and_math(self):
        s, _ = _login(ADMIN)
        prods = s.get(f"{API}/products", timeout=30).json()
        p = next(x for x in prods if x["sku"] == "GR001")  # Gold 22K 8.5/0.5 mc=500 per_gram wp=8
        cust = s.get(f"{API}/customers", timeout=30).json()[0]
        rate = 6820  # per gram
        stock_before = p["quantity"]
        item = {"product_id": p["id"], "name": p["name"], "sku": p["sku"],
                "metal_type": "Gold", "purity": "22K",
                "gross_weight": 8.5, "stone_weight": 0.5,
                "rate_per_gram": rate, "making_charge": 500,
                "making_charge_type": "per_gram", "wastage_pct": 8,
                "stone_charge": 0, "other_charges": 0, "quantity": 1}
        payload = {"customer_id": cust["id"], "customer_name": cust["name"],
                   "customer_mobile": cust["mobile"], "items": [item],
                   "discount": 100, "gst_pct": 3.0, "round_off": 0,
                   "payments": {"cash": 30000, "upi": 30000}}
        r = s.post(f"{API}/sales", json=payload, timeout=30)
        assert r.status_code == 200, r.text
        sale = r.json()
        # Expected math: net=8.0, metal=8*6820=54560, wastage=8*0.08*6820=4364.8,
        # making=500*8=4000, subtotal=62924.80
        assert abs(sale["subtotal"] - 62924.80) < 0.5, sale["subtotal"]
        taxable = sale["subtotal"] - 100
        gst = round(taxable * 0.03, 2)
        assert abs(sale["gst_amount"] - gst) < 0.5
        assert abs(sale["cgst"] - gst / 2) < 0.5
        assert abs(sale["grand_total"] - round(taxable + gst, 2)) < 0.5
        assert sale["received"] == 60000
        assert sale["balance_due"] == round(sale["grand_total"] - 60000, 2)
        assert sale["invoice_no"].startswith("INV-")
        # stock reduced
        p_after = s.get(f"{API}/products/barcode/GR001", timeout=30).json()
        assert p_after["quantity"] == stock_before - 1
        # sale retrievable
        g = s.get(f"{API}/sales/{sale['id']}", timeout=30)
        assert g.status_code == 200

    def test_sales_list_search_and_date(self):
        s, _ = _login(ADMIN)
        r = s.get(f"{API}/sales", timeout=30)
        assert r.status_code == 200 and len(r.json()) >= 1
        rs = s.get(f"{API}/sales", params={"search": "INV-"}, timeout=30)
        assert rs.status_code == 200 and len(rs.json()) >= 1

    def test_no_items_rejected(self):
        s, _ = _login(ADMIN)
        r = s.post(f"{API}/sales", json={"customer_name": "X", "items": [],
                                          "payments": {}}, timeout=30)
        assert r.status_code == 400


# ---------- Dashboard & Reports ----------
class TestDashboardReports:
    def test_dashboard(self):
        s, _ = _login(ADMIN)
        r = s.get(f"{API}/dashboard", timeout=30)
        assert r.status_code == 200
        d = r.json()
        for k in ("today", "inventory", "graph", "top_items",
                  "recent_sales", "recent_customers", "alerts"):
            assert k in d
        assert len(d["graph"]) == 7

    def test_report_sales(self):
        s, _ = _login(ADMIN)
        r = s.get(f"{API}/reports/sales", timeout=30)
        assert r.status_code == 200
        d = r.json()
        for k in ("count", "gross", "discount", "gst", "net", "received", "due", "sales"):
            assert k in d


# ---------- Settings ----------
class TestSettings:
    def test_get_settings(self):
        s, _ = _login(ADMIN)
        r = s.get(f"{API}/settings", timeout=30)
        assert r.status_code == 200
        assert r.json().get("shop_name")

    def test_admin_update_settings(self):
        s, _ = _login(ADMIN)
        cur = s.get(f"{API}/settings", timeout=30).json()
        new_terms = cur.get("terms", "") + " TEST"
        r = s.put(f"{API}/settings", json={**cur, "terms": new_terms}, timeout=30)
        assert r.status_code == 200
        # revert
        s.put(f"{API}/settings", json={**cur, "terms": cur.get("terms", "")}, timeout=30)

    def test_sales_cannot_update_settings(self):
        s, _ = _login(SALES)
        r = s.put(f"{API}/settings", json={"terms": "x"}, timeout=30)
        assert r.status_code == 403


# ---------- Users role-gating ----------
class TestUsers:
    def test_admin_can_create_and_update_user(self):
        s, _ = _login(ADMIN)
        email = f"TEST_u_{uuid.uuid4().hex[:6]}@shop.com"
        r = s.post(f"{API}/users", json={"name": "TEST_U", "email": email,
                                         "password": "pass1234", "role": "sales"}, timeout=30)
        assert r.status_code == 200
        uid = r.json()["id"]
        # duplicate email
        rd = s.post(f"{API}/users", json={"name": "X", "email": email,
                                          "password": "x", "role": "sales"}, timeout=30)
        assert rd.status_code == 400
        # update disable
        u = s.put(f"{API}/users/{uid}", json={"disabled": True}, timeout=30)
        assert u.status_code == 200 and u.json()["disabled"] is True
        # disabled user cannot login
        rl = requests.post(f"{API}/auth/login",
                           json={"email": email, "password": "pass1234"}, timeout=30)
        assert rl.status_code == 403
        # re-enable
        s.put(f"{API}/users/{uid}", json={"disabled": False}, timeout=30)

    def test_sales_role_cannot_create_user(self):
        s, _ = _login(SALES)
        r = s.post(f"{API}/users", json={"name": "X", "email": "x@x.com",
                                         "password": "x", "role": "sales"}, timeout=30)
        assert r.status_code == 403

    def test_accountant_cannot_create_user(self):
        s, _ = _login(ACCOUNTS)
        r = s.post(f"{API}/users", json={"name": "X", "email": "y@y.com",
                                         "password": "x", "role": "sales"}, timeout=30)
        assert r.status_code == 403


# ---------- Audit Logs ----------
class TestAudit:
    def test_audit_logs_populated(self):
        s, _ = _login(ADMIN)
        r = s.get(f"{API}/audit-logs", timeout=30)
        assert r.status_code == 200
        assert isinstance(r.json(), list) and len(r.json()) > 0

    def test_sales_cannot_read_audit(self):
        s, _ = _login(SALES)
        r = s.get(f"{API}/audit-logs", timeout=30)
        assert r.status_code == 403
