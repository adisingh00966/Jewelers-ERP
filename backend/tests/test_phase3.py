"""Phase-3 backend tests: Expenses, Old Gold (incl. Sale exchange), Cash Book, Dashboard net_sales."""
import os
import time
import uuid
from datetime import date, timedelta

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
TODAY = date.today().isoformat()


def _login(creds):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:200]}"
    s.headers.update({"Authorization": f"Bearer {r.json()['token']}"})
    return s


@pytest.fixture(scope="module")
def admin(): return _login(ADMIN)

@pytest.fixture(scope="module")
def sales(): return _login(SALES)

@pytest.fixture(scope="module")
def accounts(): return _login(ACCOUNTS)


# ==================== EXPENSES ====================
class TestExpenses:
    created_ids = []

    def test_seed_expenses_and_totals(self, admin):
        r = admin.get(f"{API}/expenses", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "expenses" in d and "total" in d and "by_category" in d
        assert len(d["expenses"]) >= 6
        assert d["total"] > 0
        # sum matches
        computed = round(sum(e["amount"] for e in d["expenses"]), 2)
        assert abs(computed - d["total"]) < 0.5
        # by_category dict is populated
        assert isinstance(d["by_category"], dict) and len(d["by_category"]) >= 1

    def test_create_expense_persists(self, admin):
        payload = {"date": TODAY, "category": "Miscellaneous",
                   "description": "TEST_expense_" + uuid.uuid4().hex[:6],
                   "amount": 123.45, "payment_mode": "cash"}
        r = admin.post(f"{API}/expenses", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        e = r.json()
        assert "id" in e and e["amount"] == 123.45
        assert e["category"] == "Miscellaneous"
        assert e["date"] == TODAY
        TestExpenses.created_ids.append(e["id"])
        # persistence via GET list
        lst = admin.get(f"{API}/expenses", timeout=15).json()["expenses"]
        assert any(x["id"] == e["id"] for x in lst)

    def test_amount_must_be_positive(self, admin):
        r = admin.post(f"{API}/expenses",
                       json={"date": TODAY, "category": "Miscellaneous",
                             "amount": 0, "payment_mode": "cash"}, timeout=15)
        assert r.status_code == 400
        r2 = admin.post(f"{API}/expenses",
                        json={"date": TODAY, "category": "Miscellaneous",
                              "amount": -5, "payment_mode": "cash"}, timeout=15)
        assert r2.status_code == 400

    def test_category_and_date_filter(self, admin):
        # add a distinct-category expense
        payload = {"date": TODAY, "category": "Marketing",
                   "description": "TEST_mkt", "amount": 999,
                   "payment_mode": "upi"}
        eid = admin.post(f"{API}/expenses", json=payload, timeout=15).json()["id"]
        TestExpenses.created_ids.append(eid)
        r = admin.get(f"{API}/expenses", params={"category": "Marketing"}, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert all(e["category"] == "Marketing" for e in data["expenses"])
        # date filter (today only)
        r2 = admin.get(f"{API}/expenses",
                       params={"start": TODAY, "end": TODAY}, timeout=15).json()
        assert all(e["date"] == TODAY for e in r2["expenses"])
        assert any(e["id"] == eid for e in r2["expenses"])

    def test_delete_expense_and_role_gating(self, admin, sales):
        # create then delete via admin
        eid = admin.post(f"{API}/expenses",
                         json={"date": TODAY, "category": "Repair",
                               "description": "TEST_del", "amount": 10,
                               "payment_mode": "cash"}, timeout=15).json()["id"]
        # sales role should be blocked from delete
        rs = sales.delete(f"{API}/expenses/{eid}", timeout=15)
        assert rs.status_code == 403
        rd = admin.delete(f"{API}/expenses/{eid}", timeout=15)
        assert rd.status_code == 200
        # confirm removed
        lst = admin.get(f"{API}/expenses", timeout=15).json()["expenses"]
        assert not any(x["id"] == eid for x in lst)

    @classmethod
    def teardown_class(cls):
        s = _login(ADMIN)
        for eid in cls.created_ids:
            s.delete(f"{API}/expenses/{eid}", timeout=15)


# ==================== OLD GOLD ====================
class TestOldGold:
    created_desc_prefix = "TEST_OG_"

    def test_create_old_gold_math(self, admin):
        payload = {"customer_name": "TEST_OG_Cust", "mobile": "9800000001",
                   "description": self.created_desc_prefix + "chain",
                   "gross_weight": 10.5, "stone_weight": 0.5,
                   "purity": "22K", "rate_per_gram": 6000,
                   "deduction_pct": 10, "settlement_type": "cash",
                   "cash_paid": 54000}
        r = admin.post(f"{API}/old-gold", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        # net = 10.0, ded_amount = 10*6000*0.10 = 6000, final = 60000-6000 = 54000
        assert d["net_weight"] == 10.0
        assert d["deduction_amount"] == 6000.0
        assert d["final_value"] == 54000.0
        assert d["settlement_type"] == "cash"
        assert d["date"] == TODAY

    def test_search_by_customer_and_mobile(self, admin):
        # ensure at least one entry with our test customer
        r1 = admin.get(f"{API}/old-gold", params={"search": "TEST_OG"}, timeout=15)
        assert r1.status_code == 200
        assert any("TEST_OG" in (o.get("customer_name") or "") for o in r1.json())
        r2 = admin.get(f"{API}/old-gold", params={"search": "9800000001"}, timeout=15).json()
        assert any(o.get("mobile") == "9800000001" for o in r2)

    def test_negative_weight_rejected(self, admin):
        r = admin.post(f"{API}/old-gold",
                       json={"customer_name": "X", "description": "y",
                             "gross_weight": -1, "purity": "22K",
                             "rate_per_gram": 6000}, timeout=15)
        assert r.status_code == 400


# ==================== OLD GOLD EXCHANGE inside NEW SALE ====================
class TestSaleOldGoldExchange:
    def test_sale_with_old_gold_exchange_credits_and_records_link(self, admin):
        prods = admin.get(f"{API}/products", timeout=15).json()
        p = next((x for x in prods if x["sku"] == "GR001"), prods[0])
        cust = admin.get(f"{API}/customers", timeout=15).json()[0]
        rate = 6820
        item = {"product_id": p["id"], "name": p["name"], "sku": p["sku"],
                "metal_type": p["metal_type"], "purity": p["purity"],
                "gross_weight": 8.5, "stone_weight": 0.5,
                "rate_per_gram": rate, "making_charge": 500,
                "making_charge_type": "per_gram", "wastage_pct": 8,
                "stone_charge": 0, "other_charges": 0, "quantity": 1}
        og = {"net_weight": 5.0, "purity": "22K", "rate_per_gram": 6000,
              "deduction_pct": 10, "description": "TEST_exchange_bangle"}
        # expected exchange = 5*6000*0.9 = 27000
        payload = {"customer_id": cust["id"], "customer_name": cust["name"],
                   "customer_mobile": cust["mobile"], "items": [item],
                   "discount": 0, "gst_pct": 3.0, "round_off": 0,
                   "payments": {"cash": 20000},
                   "old_gold": og}
        r = admin.post(f"{API}/sales", json=payload, timeout=20)
        assert r.status_code == 200, r.text
        sale = r.json()
        assert sale["exchange_value"] == 27000.0
        assert sale["payments"].get("exchange") == 27000.0
        # received includes cash + exchange
        assert abs(sale["received"] - (20000 + 27000)) < 0.5
        # balance = grand_total - received
        assert abs(sale["balance_due"] - round(sale["grand_total"] - sale["received"], 2)) < 0.5
        inv = sale["invoice_no"]

        # old_gold record created with settlement_type=exchange linked to invoice_no
        og_list = admin.get(f"{API}/old-gold", params={"search": cust["mobile"]}, timeout=15).json()
        match = [o for o in og_list if o.get("invoice_no") == inv]
        assert match, f"no old_gold entry linked to {inv}"
        assert match[0]["settlement_type"] == "exchange"
        assert match[0]["final_value"] == 27000.0
        assert match[0]["cash_paid"] == 0


# ==================== CASH BOOK ====================
class TestCashBook:
    def test_get_cashbook_today_structure(self, admin):
        r = admin.get(f"{API}/cashbook", timeout=15)
        assert r.status_code == 200
        d = r.json()
        for k in ("date", "opening", "cash_sales", "refunds", "expenses_cash",
                  "old_gold_cash", "cash_in", "cash_out", "closing", "closed", "summary"):
            assert k in d, f"missing {k}"
        assert d["date"] == TODAY
        # closing math
        assert abs(d["closing"] - round(d["opening"] + d["cash_in"] - d["cash_out"], 2)) < 0.5
        for k in ("cash", "upi", "card", "bank", "credit", "expenses"):
            assert k in d["summary"]

    def test_cashbook_expenses_reflect_cash_only(self, admin):
        # create one cash expense today and one upi expense; expenses_cash should include only cash
        cash_amt = 111.11
        upi_amt = 222.22
        e1 = admin.post(f"{API}/expenses",
                        json={"date": TODAY, "category": "Miscellaneous",
                              "description": "TEST_cb_cash", "amount": cash_amt,
                              "payment_mode": "cash"}, timeout=15).json()
        e2 = admin.post(f"{API}/expenses",
                        json={"date": TODAY, "category": "Miscellaneous",
                              "description": "TEST_cb_upi", "amount": upi_amt,
                              "payment_mode": "upi"}, timeout=15).json()
        try:
            cb = admin.get(f"{API}/cashbook", timeout=15).json()
            # cash expenses include our cash_amt
            assert cb["expenses_cash"] >= cash_amt - 0.01
            # summary.expenses (total) includes both
            assert cb["summary"]["expenses"] >= cash_amt + upi_amt - 0.01
        finally:
            admin.delete(f"{API}/expenses/{e1['id']}", timeout=15)
            admin.delete(f"{API}/expenses/{e2['id']}", timeout=15)

    def test_close_day_role_gating(self, sales):
        r = sales.post(f"{API}/cashbook/close", timeout=15)
        assert r.status_code == 403

    def test_close_day_marks_closed_and_becomes_next_day_opening(self, admin):
        # Use an isolated past date to not pollute today's flow
        d1 = (date.today() - timedelta(days=400)).isoformat()
        d2 = (date.today() - timedelta(days=399)).isoformat()
        # close d1
        r = admin.post(f"{API}/cashbook/close", params={"date": d1}, timeout=15)
        assert r.status_code == 200
        closing_d1 = r.json()["closing"]
        # cashbook for d1 now shows closed
        cb1 = admin.get(f"{API}/cashbook", params={"date": d1}, timeout=15).json()
        assert cb1["closed"] is True
        # cashbook for d2 opening equals d1 closing
        cb2 = admin.get(f"{API}/cashbook", params={"date": d2}, timeout=15).json()
        assert abs(cb2["opening"] - closing_d1) < 0.5


# ==================== DASHBOARD net_sales ====================
class TestDashboardNetSales:
    def test_dashboard_expenses_and_net_sales(self, admin):
        # add a cash expense today and verify net_sales = total_sales - expenses
        e = admin.post(f"{API}/expenses",
                       json={"date": TODAY, "category": "Miscellaneous",
                             "description": "TEST_dash", "amount": 77.77,
                             "payment_mode": "cash"}, timeout=15).json()
        try:
            d = admin.get(f"{API}/dashboard", timeout=15).json()
            today = d["today"]
            assert "expenses" in today
            assert "net_sales" in today
            assert today["expenses"] >= 77.77 - 0.01
            assert abs(today["net_sales"] - round(today["total_sales"] - today["expenses"], 2)) < 0.5
        finally:
            admin.delete(f"{API}/expenses/{e['id']}", timeout=15)
