"""Phase-2 backend tests: Suppliers, Purchases, Sales/Purchase Returns, Girvi, Dashboard, Shop info."""
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
    s.headers.update({"Authorization": f"Bearer {r.json()['token']}"})
    return s


def _get_product(sess, pid):
    """No GET /products/{id} endpoint; search list and filter by id."""
    lst = sess.get(f"{API}/products", timeout=15).json()
    for p in lst:
        if p.get("id") == pid:
            return p
    return None


@pytest.fixture(scope="module")
def admin(): return _login(ADMIN)

@pytest.fixture(scope="module")
def manager(): return _login(MANAGER)

@pytest.fixture(scope="module")
def sales(): return _login(SALES)

@pytest.fixture(scope="module")
def accounts(): return _login(ACCOUNTS)


# ---------- Shop info ----------
class TestShopInfo:
    def test_shop_name_and_address(self, admin):
        r = admin.get(f"{API}/settings", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d.get("shop_name") == "Vaishno Jewelers"
        assert "Khairetwa Chauraha" in d.get("address", "")


# ---------- Suppliers ----------
class TestSuppliers:
    def test_list_seeded(self, admin):
        r = admin.get(f"{API}/suppliers", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list) and len(data) >= 5
        names = [s["name"] for s in data]
        assert "Kohinoor Bullion" in names

    def test_create_supplier_and_get(self, admin):
        mob = "97000" + str(int(time.time()))[-5:]
        r = admin.post(f"{API}/suppliers",
                       json={"name": f"TEST_Supplier_{uuid.uuid4().hex[:6]}", "mobile": mob,
                             "gstin": "", "address": "Test", "bank": "", "notes": ""}, timeout=15)
        assert r.status_code == 200, r.text
        sid = r.json()["id"]
        # duplicate mobile blocked
        r2 = admin.post(f"{API}/suppliers",
                        json={"name": "TEST_Dup", "mobile": mob}, timeout=15)
        assert r2.status_code == 400
        # detail with ledger
        r3 = admin.get(f"{API}/suppliers/{sid}", timeout=15)
        assert r3.status_code == 200
        d = r3.json()
        assert "supplier" in d and "purchases" in d and "outstanding" in d


# ---------- Purchases ----------
class TestPurchases:
    def test_purchase_auto_creates_new_product_and_stock_in_existing(self, admin):
        # get a supplier
        sup = admin.get(f"{API}/suppliers", timeout=15).json()[0]
        # get an existing product
        prods = admin.get(f"{API}/products", timeout=15).json()
        target = prods[0]
        before_qty = target["quantity"]

        new_sku = f"TESTSKU{uuid.uuid4().hex[:6].upper()}"
        payload = {
            "supplier_id": sup["id"], "supplier_name": sup["name"],
            "items": [
                {"product_id": target["id"], "name": target["name"], "sku": target["sku"],
                 "metal_type": target["metal_type"], "purity": target["purity"],
                 "gross_weight": 10.0, "stone_weight": 0.0,
                 "rate_per_gram": 6800, "making_charges": 0, "quantity": 2},
                {"product_id": "", "name": "TEST_New_Bar", "sku": new_sku,
                 "category": "Other", "metal_type": "Gold", "purity": "24K",
                 "gross_weight": 5.0, "stone_weight": 0, "rate_per_gram": 7000,
                 "making_charges": 0, "quantity": 3},
            ],
            "gst_pct": 3.0, "paid_amount": 10000, "payment_mode": "bank"
        }
        r = admin.post(f"{API}/purchases", json=payload, timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["subtotal"] == round(10.0*6800*2 + 5.0*7000*3, 2)
        assert d["grand_total"] == round(d["subtotal"] * 1.03, 2)
        assert d["balance"] == round(d["grand_total"] - 10000, 2)
        assert d["payment_status"] == "Partial"

        # existing product qty increased
        after = _get_product(admin, target["id"])
        assert after and after["quantity"] == before_qty + 2

        # new product auto-created with sku
        prods_after = admin.get(f"{API}/products", timeout=15).json()
        skus = [p["sku"] for p in prods_after]
        assert new_sku in skus

        # list purchases includes it
        r2 = admin.get(f"{API}/purchases", timeout=15).json()
        assert any(p["purchase_no"] == d["purchase_no"] for p in r2)

    def test_sales_role_cannot_create_purchase(self, sales, admin):
        sup = admin.get(f"{API}/suppliers", timeout=15).json()[0]
        payload = {"supplier_id": sup["id"], "supplier_name": sup["name"],
                   "items": [{"product_id": "", "name": "X", "metal_type": "Gold",
                              "purity": "22K", "gross_weight": 1, "stone_weight": 0,
                              "rate_per_gram": 100, "quantity": 1}]}
        r = sales.post(f"{API}/purchases", json=payload, timeout=15)
        assert r.status_code == 403

    def test_accountant_can_create_purchase(self, accounts, admin):
        sup = admin.get(f"{API}/suppliers", timeout=15).json()[0]
        payload = {"supplier_id": sup["id"], "supplier_name": sup["name"],
                   "items": [{"product_id": "", "name": f"TEST_Acc_{uuid.uuid4().hex[:4]}",
                              "sku": f"ACC{uuid.uuid4().hex[:5].upper()}", "metal_type": "Gold",
                              "purity": "22K", "gross_weight": 1, "stone_weight": 0,
                              "rate_per_gram": 100, "quantity": 1}],
                   "gst_pct": 3.0, "paid_amount": 0}
        r = accounts.post(f"{API}/purchases", json=payload, timeout=15)
        assert r.status_code == 200, r.text


# ---------- Sales Returns ----------
class TestSalesReturns:
    def test_sales_return_restores_stock(self, admin):
        sales = admin.get(f"{API}/sales", timeout=15).json()
        assert sales, "seeded sales expected"
        target_sale = None
        for s in sales:
            if s.get("items") and s["items"][0].get("product_id"):
                target_sale = s; break
        assert target_sale
        item = target_sale["items"][0]
        pid = item["product_id"]
        pb = _get_product(admin, pid)
        if not pb:
            pytest.skip("product for seeded sale not found")
        before = pb["quantity"]
        r = admin.post(f"{API}/sales-returns", json={
            "sale_id": target_sale["id"],
            "items": [{"product_id": pid, "name": item["name"], "quantity": 1, "amount": 500}],
            "reason": "TEST", "refund_mode": "cash"}, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["total"] == 500
        after = _get_product(admin, pid)["quantity"]
        assert after == before + 1
        # history
        hist = admin.get(f"{API}/sales-returns", timeout=15).json()
        assert any(x["return_no"] == d["return_no"] for x in hist)


# ---------- Purchase Returns ----------
class TestPurchaseReturns:
    def test_purchase_return_reduces_stock_and_blocks_insufficient(self, admin):
        # need a purchase with a product_id item
        purs = admin.get(f"{API}/purchases", timeout=15).json()
        assert purs
        pur = None; item = None
        for p in purs:
            for it in p.get("items", []):
                if it.get("product_id"):
                    pur = p; item = it; break
            if pur: break
        assert pur, "need a purchase with product_id item"
        pid = item["product_id"]
        pb = _get_product(admin, pid)
        if not pb:
            pytest.skip("product for purchase not found")
        before = pb["quantity"]
        # reduce by 1
        r = admin.post(f"{API}/purchase-returns", json={
            "purchase_id": pur["id"],
            "items": [{"product_id": pid, "name": item["name"], "quantity": 1, "amount": 100}],
            "reason": "TEST"}, timeout=15)
        assert r.status_code == 200, r.text
        after = _get_product(admin, pid)["quantity"]
        assert after == before - 1

        # insufficient stock
        r2 = admin.post(f"{API}/purchase-returns", json={
            "purchase_id": pur["id"],
            "items": [{"product_id": pid, "name": item["name"],
                       "quantity": after + 5000, "amount": 100}]}, timeout=15)
        assert r2.status_code == 400

    def test_sales_role_cannot_create_purchase_return(self, sales, admin):
        purs = admin.get(f"{API}/purchases", timeout=15).json()
        assert purs
        r = sales.post(f"{API}/purchase-returns", json={
            "purchase_id": purs[0]["id"],
            "items": [{"product_id": "", "name": "X", "quantity": 1, "amount": 1}]}, timeout=15)
        assert r.status_code == 403


# ---------- Girvi ----------
class TestGirvi:
    def test_list_seeded_and_statuses(self, admin):
        r = admin.get(f"{API}/girvi", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert len(data) >= 4
        statuses = {v["status"] for v in data}
        # seed: due_date offsets +20 (Active/Due Soon), -5 (Overdue), +60 (Active), +5 (Due Soon)
        assert "Overdue" in statuses
        assert "Due Soon" in statuses or "Active" in statuses

    def test_search_and_status_filter(self, admin):
        r = admin.get(f"{API}/girvi?search=Ramesh", timeout=15).json()
        assert any("Ramesh" in v["customer_name"] for v in r)
        r2 = admin.get(f"{API}/girvi?status=Overdue", timeout=15).json()
        for v in r2:
            assert v["status"] == "Overdue"

    def test_validation_loan_and_weight(self, admin):
        base = {"customer_name": "TEST_Neg", "mobile": "9000000001", "loan_amount": 0,
                "interest_rate": 2, "interest_type": "monthly",
                "due_date": "2027-01-01", "item_description": "x",
                "gross_weight": 1, "purity": "22K", "estimated_value": 10000}
        r = admin.post(f"{API}/girvi", json=base, timeout=15)
        assert r.status_code == 400
        base2 = {**base, "loan_amount": 1000, "gross_weight": -1}
        r2 = admin.post(f"{API}/girvi", json=base2, timeout=15)
        assert r2.status_code == 400

    def test_full_lifecycle_create_pay_release(self, admin):
        payload = {"customer_name": f"TEST_Girvi_{uuid.uuid4().hex[:5]}",
                   "mobile": "90000" + str(int(time.time()))[-5:], "address": "",
                   "id_proof_type": "Aadhaar", "id_proof_number": "1111",
                   "loan_amount": 10000, "interest_rate": 2, "interest_type": "monthly",
                   "due_date": "2027-12-31", "item_description": "TEST item",
                   "gross_weight": 10.5, "stone_weight": 0.5, "purity": "22K",
                   "metal_type": "Gold", "estimated_value": 40000}
        r = admin.post(f"{API}/girvi", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        acc = r.json()
        assert acc["net_weight"] == 10.0
        assert acc["ltv"] == 25.0
        assert acc["status"] in ("Active",)
        gid = acc["id"]

        # release before paying should fail (outstanding = loan)
        rr = admin.post(f"{API}/girvi/{gid}/release", timeout=15)
        assert rr.status_code == 400

        # pay principal-only 3000
        rp = admin.post(f"{API}/girvi/{gid}/payment",
                        json={"amount": 3000, "mode": "cash", "pay_type": "principal"}, timeout=15)
        assert rp.status_code == 200, rp.text
        acc2 = rp.json()["account"]
        assert acc2["outstanding_principal"] == 7000
        assert acc2["status"] in ("Partially Paid", "Active", "Due Soon", "Overdue")

        # detail returns payment history
        d = admin.get(f"{API}/girvi/{gid}", timeout=15).json()
        assert len(d["payments"]) >= 1

        # pay the rest (principal + any tiny interest) then release
        remaining = d["total_outstanding"]
        rp2 = admin.post(f"{API}/girvi/{gid}/payment",
                         json={"amount": remaining + 5, "mode": "cash", "pay_type": "mixed"}, timeout=15)
        assert rp2.status_code == 200
        rel = admin.post(f"{API}/girvi/{gid}/release", timeout=15)
        assert rel.status_code == 200, rel.text
        assert rel.json()["status"] == "Closed"
        assert "release_date" in rel.json()

        # cannot pay after closed
        rp3 = admin.post(f"{API}/girvi/{gid}/payment",
                         json={"amount": 100, "pay_type": "principal"}, timeout=15)
        assert rp3.status_code == 400

    def test_interest_accrual_math_on_fresh_account(self, admin):
        # Create a fresh account and immediately verify pending accrual is ~0 (same day), then verify
        # response contains proper numeric fields and derived totals.
        payload = {"customer_name": f"TEST_Accrual_{uuid.uuid4().hex[:5]}",
                   "mobile": "91100" + str(int(time.time()))[-5:],
                   "loan_amount": 60000, "interest_rate": 2, "interest_type": "monthly",
                   "due_date": "2027-06-30", "item_description": "TEST",
                   "gross_weight": 20, "purity": "22K", "estimated_value": 200000}
        acc = admin.post(f"{API}/girvi", json=payload, timeout=15).json()
        assert acc["outstanding_principal"] == 60000
        assert acc["outstanding_interest"] == 0
        assert acc["total_outstanding"] == 60000
        assert acc["ltv"] == 30.0
        assert acc["net_weight"] == 20

    def test_summary(self, admin):
        r = admin.get(f"{API}/girvi/summary", timeout=15)
        assert r.status_code == 200
        d = r.json()
        for k in ("active_count", "total_outstanding", "overdue", "due_soon"):
            assert k in d
        # dashboard also exposes girvi
        dash = admin.get(f"{API}/dashboard", timeout=15).json()
        assert "girvi" in dash
        assert dash["girvi"]["active_count"] == d["active_count"]
