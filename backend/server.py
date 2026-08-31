from dotenv import load_dotenv
from pathlib import Path
import os
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, Query
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from typing import List, Optional, Literal
from datetime import datetime, timezone, timedelta, date
from bson import ObjectId
import logging, uuid, bcrypt, jwt

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api = APIRouter(prefix="/api")

JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGO = "HS256"

# ---------- helpers ----------
def hash_password(p): return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()
def verify_password(p, h): return bcrypt.checkpw(p.encode(), h.encode())

def now_utc(): return datetime.now(timezone.utc)
def today_str(): return now_utc().date().isoformat()

def create_access_token(uid, email, role):
    payload = {"sub": uid, "email": email, "role": role,
               "exp": now_utc() + timedelta(hours=12), "type": "access"}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)

def oid(x): return str(x) if isinstance(x, ObjectId) else x

def clean(doc):
    if not doc: return doc
    doc = dict(doc)
    if "_id" in doc:
        doc["id"] = str(doc["_id"]); doc.pop("_id")
    doc.pop("password_hash", None)
    return doc

async def get_current_user(request: Request):
    token = request.cookies.get("access_token")
    if not token:
        h = request.headers.get("Authorization", "")
        if h.startswith("Bearer "): token = h[7:]
    if not token:
        raise HTTPException(401, "Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user: raise HTTPException(401, "User not found")
        if user.get("disabled"): raise HTTPException(403, "Account disabled")
        return clean(user)
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")

def require_role(*roles):
    async def dep(user=Depends(get_current_user)):
        if roles and user["role"] not in roles and user["role"] != "admin":
            raise HTTPException(403, "Insufficient permissions")
        return user
    return dep

async def audit(user, action, entity, entity_id="", details=""):
    await db.audit_logs.insert_one({
        "user_id": user["id"], "user_name": user.get("name"), "action": action,
        "entity": entity, "entity_id": entity_id, "details": details,
        "created_at": now_utc().isoformat()})

# ---------- models ----------
class LoginReq(BaseModel):
    email: str
    password: str

class UserCreate(BaseModel):
    name: str
    email: str
    password: str
    role: Literal["admin", "manager", "sales", "accountant"] = "sales"

class UserUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    disabled: Optional[bool] = None
    password: Optional[str] = None

# ---------- auth ----------

from passlib.context import CryptContext
temp_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

@api.get("/create-admin")
async def create_admin():
    exists = await db.users.find_one({"email": "admin@gmail.com"})
    if exists:
        return {"msg": "Admin pehle se bana hua hai!"}
    
    await db.users.insert_one({
        "email": "admin@gmail.com",
        "password_hash": temp_pwd_context.hash("123456"),
        "role": "admin",
        "disabled": False
    })
    return {"msg": "SUCCESS! Email: admin@gmail.com | Password: 123456"}

@api.post("/auth/login")
async def login(body: LoginReq, response: Response):
    email = body.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(401, "Invalid email or password")
    if user.get("disabled"):
        raise HTTPException(403, "Account disabled")
    token = create_access_token(str(user["_id"]), email, user["role"])
    response.set_cookie("access_token", token, httponly=True, secure=False,
                        samesite="lax", max_age=43200, path="/")
    await db.users.update_one({"_id": user["_id"]}, {"$set": {"last_login": now_utc().isoformat()}})
    return {"user": clean(user), "token": token}

@api.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    return {"ok": True}

@api.get("/auth/me")
async def me(user=Depends(get_current_user)):
    return user

# ---------- users ----------
@api.get("/users")
async def list_users(user=Depends(require_role("admin", "manager"))):
    docs = await db.users.find().sort("created_at", -1).to_list(500)
    return [clean(d) for d in docs]

@api.post("/users")
async def create_user(body: UserCreate, user=Depends(require_role("admin"))):
    email = body.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(400, "Email already exists")
    doc = {"name": body.name, "email": email, "password_hash": hash_password(body.password),
           "role": body.role, "disabled": False, "created_at": now_utc().isoformat()}
    res = await db.users.insert_one(doc)
    await audit(user, "create", "user", str(res.inserted_id), body.email)
    return clean(await db.users.find_one({"_id": res.inserted_id}))

@api.put("/users/{uid}")
async def update_user(uid: str, body: UserUpdate, user=Depends(require_role("admin"))):
    upd = {}
    if body.name is not None: upd["name"] = body.name
    if body.role is not None: upd["role"] = body.role
    if body.disabled is not None: upd["disabled"] = body.disabled
    if body.password: upd["password_hash"] = hash_password(body.password)
    if not upd: raise HTTPException(400, "Nothing to update")
    await db.users.update_one({"_id": ObjectId(uid)}, {"$set": upd})
    await audit(user, "update", "user", uid, str(list(upd.keys())))
    return clean(await db.users.find_one({"_id": ObjectId(uid)}))

# ---------- metal rates ----------
class RateReq(BaseModel):
    gold_24k: float  # per 10g
    gold_22k: float
    gold_20k: float
    gold_18k: float
    silver_per_10g: float

@api.get("/rates/current")
async def current_rate(user=Depends(get_current_user)):
    doc = await db.metal_rates.find_one(sort=[("created_at", -1)])
    return clean(doc) if doc else None

@api.get("/rates/history")
async def rate_history(user=Depends(get_current_user)):
    docs = await db.metal_rates.find().sort("created_at", -1).to_list(200)
    return [clean(d) for d in docs]

@api.post("/rates")
async def set_rate(body: RateReq, user=Depends(require_role("admin", "manager"))):
    doc = body.model_dump()
    doc["created_at"] = now_utc().isoformat()
    doc["created_by"] = user.get("name")
    res = await db.metal_rates.insert_one(doc)
    await audit(user, "create", "metal_rate", str(res.inserted_id))
    return clean(await db.metal_rates.find_one({"_id": res.inserted_id}))

# ---------- customers ----------
class CustomerReq(BaseModel):
    name: str
    mobile: str
    alt_mobile: Optional[str] = ""
    address: Optional[str] = ""
    city: Optional[str] = ""
    state: Optional[str] = ""
    pincode: Optional[str] = ""
    email: Optional[str] = ""
    gstin: Optional[str] = ""
    id_proof: Optional[str] = ""
    notes: Optional[str] = ""

@api.get("/customers")
async def list_customers(search: Optional[str] = None, user=Depends(get_current_user)):
    q = {}
    if search:
        q = {"$or": [{"name": {"$regex": search, "$options": "i"}},
                     {"mobile": {"$regex": search, "$options": "i"}}]}
    docs = await db.customers.find(q).sort("created_at", -1).to_list(1000)
    return [clean(d) for d in docs]

@api.get("/customers/{cid}")
async def get_customer(cid: str, user=Depends(get_current_user)):
    c = await db.customers.find_one({"_id": ObjectId(cid)})
    if not c: raise HTTPException(404, "Not found")
    sales = await db.sales.find({"customer_id": cid}).sort("created_at", -1).to_list(500)
    total = sum(s.get("grand_total", 0) for s in sales)
    due = sum(s.get("balance_due", 0) for s in sales)
    return {"customer": clean(c), "sales": [clean(s) for s in sales],
            "total_purchases": total, "total_outstanding": due}

@api.post("/customers")
async def create_customer(body: CustomerReq, user=Depends(get_current_user)):
    if await db.customers.find_one({"mobile": body.mobile}):
        raise HTTPException(400, "Customer with this mobile already exists")
    doc = body.model_dump()
    doc["created_at"] = now_utc().isoformat()
    doc["code"] = "CUST" + str(await db.customers.count_documents({}) + 1001)
    res = await db.customers.insert_one(doc)
    await audit(user, "create", "customer", str(res.inserted_id), body.name)
    return clean(await db.customers.find_one({"_id": res.inserted_id}))

@api.put("/customers/{cid}")
async def update_customer(cid: str, body: CustomerReq, user=Depends(get_current_user)):
    await db.customers.update_one({"_id": ObjectId(cid)}, {"$set": body.model_dump()})
    return clean(await db.customers.find_one({"_id": ObjectId(cid)}))

# ---------- products ----------
class ProductReq(BaseModel):
    name: str
    sku: str
    barcode: Optional[str] = ""
    category: str
    metal_type: Literal["Gold", "Silver"]
    purity: str
    gross_weight: float
    stone_weight: float = 0
    making_charge: float = 0
    making_charge_type: Literal["per_gram", "fixed", "percentage"] = "per_gram"
    wastage_pct: float = 0
    stone_charge: float = 0
    other_charges: float = 0
    purchase_price: float = 0
    selling_price: float = 0
    quantity: int = 1
    min_stock: int = 1
    supplier: Optional[str] = ""
    image: Optional[str] = ""
    description: Optional[str] = ""

@api.get("/products")
async def list_products(search: Optional[str] = None, metal: Optional[str] = None,
                        user=Depends(get_current_user)):
    q = {}
    if metal: q["metal_type"] = metal
    if search:
        q["$or"] = [{"name": {"$regex": search, "$options": "i"}},
                    {"sku": {"$regex": search, "$options": "i"}},
                    {"barcode": {"$regex": search, "$options": "i"}}]
    docs = await db.products.find(q).sort("created_at", -1).to_list(2000)
    return [clean(d) for d in docs]

@api.get("/products/barcode/{code}")
async def product_by_barcode(code: str, user=Depends(get_current_user)):
    p = await db.products.find_one({"$or": [{"barcode": code}, {"sku": code}]})
    if not p: raise HTTPException(404, "Product not found")
    return clean(p)

@api.post("/products")
async def create_product(body: ProductReq, user=Depends(get_current_user)):
    if body.gross_weight < 0 or body.stone_weight < 0:
        raise HTTPException(400, "Weight cannot be negative")
    if await db.products.find_one({"sku": body.sku}):
        raise HTTPException(400, "SKU already exists")
    if body.barcode and await db.products.find_one({"barcode": body.barcode}):
        raise HTTPException(400, "Barcode already exists")
    doc = body.model_dump()
    doc["net_weight"] = round(body.gross_weight - body.stone_weight, 3)
    doc["created_at"] = now_utc().isoformat()
    if not doc.get("barcode"): doc["barcode"] = doc["sku"]
    res = await db.products.insert_one(doc)
    await db.stock_movements.insert_one({"product_id": str(res.inserted_id), "type": "initial",
        "qty": body.quantity, "created_at": now_utc().isoformat()})
    await audit(user, "create", "product", str(res.inserted_id), body.name)
    return clean(await db.products.find_one({"_id": res.inserted_id}))

@api.put("/products/{pid}")
async def update_product(pid: str, body: ProductReq, user=Depends(get_current_user)):
    doc = body.model_dump()
    doc["net_weight"] = round(body.gross_weight - body.stone_weight, 3)
    await db.products.update_one({"_id": ObjectId(pid)}, {"$set": doc})
    await audit(user, "update", "product", pid, body.name)
    return clean(await db.products.find_one({"_id": ObjectId(pid)}))

@api.delete("/products/{pid}")
async def delete_product(pid: str, user=Depends(require_role("admin", "manager"))):
    await db.products.update_one({"_id": ObjectId(pid)}, {"$set": {"deleted": True}})
    await audit(user, "delete", "product", pid)
    return {"ok": True}

@api.post("/products/{pid}/adjust")
async def adjust_stock(pid: str, qty: int = Query(...), reason: str = Query(""),
                       user=Depends(get_current_user)):
    p = await db.products.find_one({"_id": ObjectId(pid)})
    if not p: raise HTTPException(404, "Not found")
    new_q = p.get("quantity", 0) + qty
    if new_q < 0: raise HTTPException(400, "Stock cannot go negative")
    await db.products.update_one({"_id": ObjectId(pid)}, {"$set": {"quantity": new_q}})
    await db.stock_movements.insert_one({"product_id": pid, "type": "adjustment", "qty": qty,
        "reason": reason, "created_at": now_utc().isoformat()})
    await audit(user, "adjust", "product", pid, f"{qty} {reason}")
    return clean(await db.products.find_one({"_id": ObjectId(pid)}))

# ---------- sales ----------
class SaleItem(BaseModel):
    product_id: Optional[str] = ""
    name: str
    sku: Optional[str] = ""
    metal_type: str
    purity: str
    gross_weight: float
    stone_weight: float = 0
    rate_per_gram: float
    making_charge: float = 0
    making_charge_type: str = "per_gram"
    wastage_pct: float = 0
    stone_charge: float = 0
    other_charges: float = 0
    quantity: int = 1

class SaleReq(BaseModel):
    customer_id: Optional[str] = ""
    customer_name: str
    customer_mobile: Optional[str] = ""
    salesperson: Optional[str] = ""
    items: List[SaleItem]
    discount: float = 0
    gst_pct: float = 3.0
    round_off: float = 0
    payments: dict = {}  # {cash, upi, card, bank}
    old_gold: Optional[dict] = None  # {net_weight, purity, rate_per_gram, deduction_pct, description}
    notes: Optional[str] = ""

def compute_item(it: SaleItem):
    net = round(it.gross_weight - it.stone_weight, 3)
    metal_value = net * it.rate_per_gram
    wastage_weight = round(net * it.wastage_pct / 100, 3)
    wastage_value = wastage_weight * it.rate_per_gram
    if it.making_charge_type == "per_gram":
        making = it.making_charge * net
    elif it.making_charge_type == "percentage":
        making = (metal_value + wastage_value) * it.making_charge / 100
    else:
        making = it.making_charge
    subtotal = metal_value + wastage_value + making + it.stone_charge + it.other_charges
    subtotal *= it.quantity
    return {"net_weight": net, "metal_value": round(metal_value, 2),
            "wastage_weight": wastage_weight, "wastage_value": round(wastage_value, 2),
            "making_value": round(making, 2), "line_total": round(subtotal, 2)}

@api.post("/sales")
async def create_sale(body: SaleReq, user=Depends(get_current_user)):
    if not body.items: raise HTTPException(400, "No items")
    items_out = []
    subtotal = 0
    for it in body.items:
        if it.gross_weight < 0 or it.stone_weight < 0:
            raise HTTPException(400, "Weight cannot be negative")
        if it.product_id:
            p = await db.products.find_one({"_id": ObjectId(it.product_id)})
            if p and p.get("quantity", 0) < it.quantity:
                raise HTTPException(400, f"Insufficient stock for {it.name}")
        calc = compute_item(it)
        merged = {**it.model_dump(), **calc}
        items_out.append(merged)
        subtotal += calc["line_total"]
    subtotal = round(subtotal, 2)
    taxable = subtotal - body.discount
    gst_amount = round(taxable * body.gst_pct / 100, 2)
    grand = round(taxable + gst_amount + body.round_off, 2)
    payments = dict(body.payments)
    exchange_value = 0
    og = body.old_gold
    if og and float(og.get("net_weight", 0) or 0) > 0:
        nw = float(og["net_weight"]); rate = float(og.get("rate_per_gram", 0) or 0)
        ded = float(og.get("deduction_pct", 0) or 0)
        exchange_value = round(nw * rate * (1 - ded / 100), 2)
        payments["exchange"] = exchange_value
    received = sum(float(v or 0) for v in payments.values())
    balance = round(grand - received, 2)

    count = await db.sales.count_documents({})
    invoice_no = f"INV-{datetime.now().year}-{count + 1001}"
    doc = {"invoice_no": invoice_no, "customer_id": body.customer_id,
           "customer_name": body.customer_name, "customer_mobile": body.customer_mobile,
           "salesperson": body.salesperson or user.get("name"), "items": items_out,
           "subtotal": subtotal, "discount": body.discount, "gst_pct": body.gst_pct,
           "gst_amount": gst_amount, "cgst": round(gst_amount / 2, 2), "sgst": round(gst_amount / 2, 2),
           "round_off": body.round_off, "grand_total": grand, "payments": payments,
           "old_gold": og if exchange_value else None, "exchange_value": exchange_value,
           "received": round(received, 2), "balance_due": balance, "notes": body.notes,
           "date": today_str(), "created_at": now_utc().isoformat(), "created_by": user.get("name")}
    res = await db.sales.insert_one(doc)
    if exchange_value:
        await db.old_gold.insert_one({"customer_name": body.customer_name, "mobile": body.customer_mobile,
            "description": og.get("description", ""), "net_weight": float(og["net_weight"]),
            "purity": og.get("purity", ""), "rate_per_gram": float(og.get("rate_per_gram", 0) or 0),
            "deduction_pct": float(og.get("deduction_pct", 0) or 0), "final_value": exchange_value,
            "settlement_type": "exchange", "cash_paid": 0, "invoice_no": invoice_no,
            "date": today_str(), "created_at": now_utc().isoformat(), "created_by": user.get("name")})
    # reduce stock
    for it in body.items:
        if it.product_id:
            await db.products.update_one({"_id": ObjectId(it.product_id)},
                                         {"$inc": {"quantity": -it.quantity}})
            await db.stock_movements.insert_one({"product_id": it.product_id, "type": "sale",
                "qty": -it.quantity, "ref": invoice_no, "created_at": now_utc().isoformat()})
    if body.customer_id:
        await db.customer_ledger.insert_one({"customer_id": body.customer_id, "type": "sale",
            "ref": invoice_no, "debit": grand, "credit": received, "balance": balance,
            "date": today_str(), "created_at": now_utc().isoformat()})
    await audit(user, "create", "sale", str(res.inserted_id), invoice_no)
    return clean(await db.sales.find_one({"_id": res.inserted_id}))

@api.get("/sales")
async def list_sales(search: Optional[str] = None, start: Optional[str] = None,
                     end: Optional[str] = None, user=Depends(get_current_user)):
    q = {}
    if search:
        q["$or"] = [{"invoice_no": {"$regex": search, "$options": "i"}},
                    {"customer_name": {"$regex": search, "$options": "i"}},
                    {"customer_mobile": {"$regex": search, "$options": "i"}}]
    if start or end:
        dr = {}
        if start: dr["$gte"] = start
        if end: dr["$lte"] = end
        q["date"] = dr
    docs = await db.sales.find(q).sort("created_at", -1).to_list(2000)
    return [clean(d) for d in docs]

@api.get("/sales/{sid}")
async def get_sale(sid: str, user=Depends(get_current_user)):
    s = await db.sales.find_one({"_id": ObjectId(sid)})
    if not s: raise HTTPException(404, "Not found")
    return clean(s)

# ---------- settings ----------
@api.get("/settings")
async def get_settings(user=Depends(get_current_user)):
    s = await db.settings.find_one({"key": "shop"})
    return clean(s) if s else {}

@api.put("/settings")
async def update_settings(body: dict, user=Depends(require_role("admin", "manager"))):
    body["key"] = "shop"
    await db.settings.update_one({"key": "shop"}, {"$set": body}, upsert=True)
    return clean(await db.settings.find_one({"key": "shop"}))

# ---------- dashboard ----------
@api.get("/dashboard")
async def dashboard(user=Depends(get_current_user)):
    t = today_str()
    todays = await db.sales.find({"date": t}).to_list(5000)
    total_sales = sum(s.get("grand_total", 0) for s in todays)
    cash = upi = card = bank = credit = 0
    for s in todays:
        p = s.get("payments", {})
        cash += float(p.get("cash", 0) or 0); upi += float(p.get("upi", 0) or 0)
        card += float(p.get("card", 0) or 0); bank += float(p.get("bank", 0) or 0)
        credit += s.get("balance_due", 0)
    products = await db.products.find({"deleted": {"$ne": True}}).to_list(5000)
    gold_stock = sum(p.get("net_weight", 0) * p.get("quantity", 0) for p in products if p.get("metal_type") == "Gold")
    silver_stock = sum(p.get("net_weight", 0) * p.get("quantity", 0) for p in products if p.get("metal_type") == "Silver")
    low = [p for p in products if p.get("quantity", 0) <= p.get("min_stock", 1) and p.get("quantity", 0) > 0]
    out = [p for p in products if p.get("quantity", 0) <= 0]
    # weekly graph
    graph = []
    for i in range(6, -1, -1):
        d = (now_utc().date() - timedelta(days=i)).isoformat()
        day_sales = await db.sales.find({"date": d}).to_list(5000)
        graph.append({"date": d[5:], "sales": round(sum(s.get("grand_total", 0) for s in day_sales), 2)})
    recent = await db.sales.find().sort("created_at", -1).to_list(8)
    recent_cust = await db.customers.find().sort("created_at", -1).to_list(6)
    # top items
    item_map = {}
    month_start = now_utc().replace(day=1).date().isoformat()
    month_sales = await db.sales.find({"date": {"$gte": month_start}}).to_list(5000)
    for s in month_sales:
        for it in s.get("items", []):
            item_map[it["name"]] = item_map.get(it["name"], 0) + it.get("line_total", 0)
    top = sorted([{"name": k, "value": round(v, 2)} for k, v in item_map.items()],
                 key=lambda x: -x["value"])[:5]
    girvi_docs = await db.girvi_accounts.find().to_list(5000)
    gviews = [girvi_view(g) for g in girvi_docs]
    gactive = [g for g in gviews if g["status"] != "Closed"]
    girvi_stats = {"active_count": len(gactive),
                   "total_loan": round(sum(g["outstanding_principal"] for g in gactive), 2),
                   "total_outstanding": round(sum(g["total_outstanding"] for g in gactive), 2),
                   "overdue": len([g for g in gviews if g["status"] == "Overdue"]),
                   "due_soon": len([g for g in gviews if g["status"] == "Due Soon"])}
    exp_today = await db.expenses.find({"date": t}).to_list(5000)
    total_exp = round(sum(e.get("amount", 0) for e in exp_today), 2)
    return {
        "today": {"total_sales": round(total_sales, 2), "net_sales": round(total_sales - total_exp, 2),
                  "cash": round(cash, 2), "upi": round(upi, 2), "card": round(card, 2),
                  "bank": round(bank, 2), "credit": round(credit, 2), "orders": len(todays),
                  "expenses": total_exp, "purchases": 0, "returns": 0},
        "inventory": {"gold_stock": round(gold_stock, 2), "silver_stock": round(silver_stock, 2),
                      "total_items": len(products), "low_stock": len(low), "out_of_stock": len(out)},
        "graph": graph, "top_items": top,
        "recent_sales": [clean(s) for s in recent],
        "recent_customers": [clean(c) for c in recent_cust],
        "alerts": {"low_stock": [clean(p) for p in low[:10]], "out_of_stock": [clean(p) for p in out[:10]]},
        "girvi": girvi_stats,
    }

# ---------- reports ----------
@api.get("/reports/sales")
async def report_sales(start: Optional[str] = None, end: Optional[str] = None,
                       user=Depends(get_current_user)):
    q = {}
    if start or end:
        dr = {}
        if start: dr["$gte"] = start
        if end: dr["$lte"] = end
        q["date"] = dr
    sales = await db.sales.find(q).sort("created_at", -1).to_list(10000)
    gross = sum(s.get("subtotal", 0) for s in sales)
    disc = sum(s.get("discount", 0) for s in sales)
    gst = sum(s.get("gst_amount", 0) for s in sales)
    net = sum(s.get("grand_total", 0) for s in sales)
    received = sum(s.get("received", 0) for s in sales)
    due = sum(s.get("balance_due", 0) for s in sales)
    by_cat = {}
    for s in sales:
        for it in s.get("items", []):
            by_cat[it.get("metal_type", "Other")] = by_cat.get(it.get("metal_type", "Other"), 0) + it.get("line_total", 0)
    return {"count": len(sales), "gross": round(gross, 2), "discount": round(disc, 2),
            "gst": round(gst, 2), "net": round(net, 2), "received": round(received, 2),
            "due": round(due, 2), "by_metal": {k: round(v, 2) for k, v in by_cat.items()},
            "sales": [clean(s) for s in sales]}

@api.get("/audit-logs")
async def audit_logs(user=Depends(require_role("admin", "manager"))):
    docs = await db.audit_logs.find().sort("created_at", -1).to_list(300)
    return [clean(d) for d in docs]

# ==================== SUPPLIERS ====================
class SupplierReq(BaseModel):
    name: str
    mobile: str
    address: Optional[str] = ""
    gstin: Optional[str] = ""
    bank: Optional[str] = ""
    notes: Optional[str] = ""

@api.get("/suppliers")
async def list_suppliers(search: Optional[str] = None, user=Depends(get_current_user)):
    q = {}
    if search:
        q = {"$or": [{"name": {"$regex": search, "$options": "i"}},
                     {"mobile": {"$regex": search, "$options": "i"}}]}
    docs = await db.suppliers.find(q).sort("created_at", -1).to_list(1000)
    return [clean(d) for d in docs]

@api.get("/suppliers/{sid}")
async def get_supplier(sid: str, user=Depends(get_current_user)):
    s = await db.suppliers.find_one({"_id": ObjectId(sid)})
    if not s: raise HTTPException(404, "Not found")
    purchases = await db.purchases.find({"supplier_id": sid}).sort("created_at", -1).to_list(500)
    total = sum(p.get("grand_total", 0) for p in purchases)
    paid = sum(p.get("paid_amount", 0) for p in purchases)
    return {"supplier": clean(s), "purchases": [clean(p) for p in purchases],
            "total_purchases": round(total, 2), "outstanding": round(total - paid, 2)}

@api.post("/suppliers")
async def create_supplier(body: SupplierReq, user=Depends(get_current_user)):
    if await db.suppliers.find_one({"mobile": body.mobile}):
        raise HTTPException(400, "Supplier with this mobile already exists")
    doc = body.model_dump()
    doc["created_at"] = now_utc().isoformat()
    doc["code"] = "SUP" + str(await db.suppliers.count_documents({}) + 101)
    res = await db.suppliers.insert_one(doc)
    await audit(user, "create", "supplier", str(res.inserted_id), body.name)
    return clean(await db.suppliers.find_one({"_id": res.inserted_id}))

@api.put("/suppliers/{sid}")
async def update_supplier(sid: str, body: SupplierReq, user=Depends(get_current_user)):
    await db.suppliers.update_one({"_id": ObjectId(sid)}, {"$set": body.model_dump()})
    return clean(await db.suppliers.find_one({"_id": ObjectId(sid)}))

# ==================== PURCHASES ====================
class PurchaseItem(BaseModel):
    product_id: Optional[str] = ""
    name: str
    sku: Optional[str] = ""
    category: Optional[str] = "Other"
    metal_type: Literal["Gold", "Silver"]
    purity: str
    gross_weight: float
    stone_weight: float = 0
    rate_per_gram: float
    making_charges: float = 0
    quantity: int = 1

class PurchaseReq(BaseModel):
    supplier_id: str
    supplier_name: str
    metal_type: Optional[str] = ""
    items: List[PurchaseItem]
    gst_pct: float = 3.0
    paid_amount: float = 0
    payment_mode: Optional[str] = "cash"
    notes: Optional[str] = ""

@api.post("/purchases")
async def create_purchase(body: PurchaseReq, user=Depends(require_role("admin", "manager", "accountant"))):
    if not body.items: raise HTTPException(400, "No items")
    items_out = []
    subtotal = 0
    count = await db.purchases.count_documents({})
    pur_no = f"PUR-{datetime.now().year}-{count + 101}"
    for it in body.items:
        if it.gross_weight < 0 or it.stone_weight < 0:
            raise HTTPException(400, "Weight cannot be negative")
        net = round(it.gross_weight - it.stone_weight, 3)
        line = round((net * it.rate_per_gram + it.making_charges) * it.quantity, 2)
        subtotal += line
        items_out.append({**it.model_dump(), "net_weight": net, "line_total": line})
        # auto stock in
        if it.product_id:
            await db.products.update_one({"_id": ObjectId(it.product_id)}, {"$inc": {"quantity": it.quantity}})
            await db.stock_movements.insert_one({"product_id": it.product_id, "type": "purchase",
                "qty": it.quantity, "ref": pur_no, "created_at": now_utc().isoformat()})
        else:
            sku = it.sku or (it.name[:3].upper() + str(count) + str(len(items_out)))
            if not await db.products.find_one({"sku": sku}):
                pr = await db.products.insert_one({"name": it.name, "sku": sku, "barcode": sku,
                    "category": it.category, "metal_type": it.metal_type, "purity": it.purity,
                    "gross_weight": it.gross_weight, "stone_weight": it.stone_weight, "net_weight": net,
                    "making_charge": it.making_charges, "making_charge_type": "fixed", "wastage_pct": 0,
                    "stone_charge": 0, "other_charges": 0, "purchase_price": round(line / it.quantity, 2),
                    "selling_price": 0, "quantity": it.quantity, "min_stock": 2,
                    "supplier": body.supplier_name, "image": "", "description": "",
                    "created_at": now_utc().isoformat()})
                await db.stock_movements.insert_one({"product_id": str(pr.inserted_id), "type": "purchase",
                    "qty": it.quantity, "ref": pur_no, "created_at": now_utc().isoformat()})
    subtotal = round(subtotal, 2)
    gst_amount = round(subtotal * body.gst_pct / 100, 2)
    grand = round(subtotal + gst_amount, 2)
    doc = {"purchase_no": pur_no, "supplier_id": body.supplier_id, "supplier_name": body.supplier_name,
           "items": items_out, "subtotal": subtotal, "gst_pct": body.gst_pct, "gst_amount": gst_amount,
           "grand_total": grand, "paid_amount": body.paid_amount, "payment_mode": body.payment_mode,
           "balance": round(grand - body.paid_amount, 2),
           "payment_status": "Paid" if body.paid_amount >= grand else ("Partial" if body.paid_amount > 0 else "Unpaid"),
           "notes": body.notes, "date": today_str(), "created_at": now_utc().isoformat(), "created_by": user.get("name")}
    res = await db.purchases.insert_one(doc)
    await audit(user, "create", "purchase", str(res.inserted_id), pur_no)
    return clean(await db.purchases.find_one({"_id": res.inserted_id}))

@api.get("/purchases")
async def list_purchases(search: Optional[str] = None, start: Optional[str] = None,
                         end: Optional[str] = None, user=Depends(get_current_user)):
    q = {}
    if search:
        q["$or"] = [{"purchase_no": {"$regex": search, "$options": "i"}},
                    {"supplier_name": {"$regex": search, "$options": "i"}}]
    if start or end:
        dr = {}
        if start: dr["$gte"] = start
        if end: dr["$lte"] = end
        q["date"] = dr
    docs = await db.purchases.find(q).sort("created_at", -1).to_list(2000)
    return [clean(d) for d in docs]

@api.get("/purchases/{pid}")
async def get_purchase(pid: str, user=Depends(get_current_user)):
    p = await db.purchases.find_one({"_id": ObjectId(pid)})
    if not p: raise HTTPException(404, "Not found")
    return clean(p)

# ==================== RETURNS ====================
class ReturnItem(BaseModel):
    product_id: Optional[str] = ""
    name: str
    quantity: int = 1
    amount: float

class SaleReturnReq(BaseModel):
    sale_id: str
    items: List[ReturnItem]
    reason: Optional[str] = ""
    refund_mode: Literal["cash", "upi", "bank", "credit"] = "cash"

@api.post("/sales-returns")
async def create_sale_return(body: SaleReturnReq, user=Depends(get_current_user)):
    sale = await db.sales.find_one({"_id": ObjectId(body.sale_id)})
    if not sale: raise HTTPException(404, "Sale not found")
    total = round(sum(it.amount for it in body.items), 2)
    count = await db.sales_returns.count_documents({})
    ret_no = f"SR-{datetime.now().year}-{count + 101}"
    for it in body.items:
        if it.product_id:
            await db.products.update_one({"_id": ObjectId(it.product_id)}, {"$inc": {"quantity": it.quantity}})
            await db.stock_movements.insert_one({"product_id": it.product_id, "type": "sale_return",
                "qty": it.quantity, "ref": ret_no, "created_at": now_utc().isoformat()})
    doc = {"return_no": ret_no, "sale_id": body.sale_id, "invoice_no": sale.get("invoice_no"),
           "customer_id": sale.get("customer_id"), "customer_name": sale.get("customer_name"),
           "items": [it.model_dump() for it in body.items], "total": total, "reason": body.reason,
           "refund_mode": body.refund_mode, "date": today_str(), "created_at": now_utc().isoformat(),
           "created_by": user.get("name")}
    res = await db.sales_returns.insert_one(doc)
    await db.sales.update_one({"_id": ObjectId(body.sale_id)}, {"$inc": {"returned_amount": total}})
    if sale.get("customer_id"):
        await db.customer_ledger.insert_one({"customer_id": sale["customer_id"], "type": "sale_return",
            "ref": ret_no, "debit": 0, "credit": total, "date": today_str(), "created_at": now_utc().isoformat()})
    await audit(user, "create", "sale_return", str(res.inserted_id), ret_no)
    return clean(await db.sales_returns.find_one({"_id": res.inserted_id}))

@api.get("/sales-returns")
async def list_sale_returns(user=Depends(get_current_user)):
    docs = await db.sales_returns.find().sort("created_at", -1).to_list(1000)
    return [clean(d) for d in docs]

class PurchaseReturnReq(BaseModel):
    purchase_id: str
    items: List[ReturnItem]
    reason: Optional[str] = ""

@api.post("/purchase-returns")
async def create_purchase_return(body: PurchaseReturnReq, user=Depends(require_role("admin", "manager", "accountant"))):
    pur = await db.purchases.find_one({"_id": ObjectId(body.purchase_id)})
    if not pur: raise HTTPException(404, "Purchase not found")
    total = round(sum(it.amount for it in body.items), 2)
    count = await db.purchase_returns.count_documents({})
    ret_no = f"PR-{datetime.now().year}-{count + 101}"
    for it in body.items:
        if it.product_id:
            prod = await db.products.find_one({"_id": ObjectId(it.product_id)})
            if prod and prod.get("quantity", 0) < it.quantity:
                raise HTTPException(400, f"Insufficient stock to return {it.name}")
            await db.products.update_one({"_id": ObjectId(it.product_id)}, {"$inc": {"quantity": -it.quantity}})
            await db.stock_movements.insert_one({"product_id": it.product_id, "type": "purchase_return",
                "qty": -it.quantity, "ref": ret_no, "created_at": now_utc().isoformat()})
    doc = {"return_no": ret_no, "purchase_id": body.purchase_id, "purchase_no": pur.get("purchase_no"),
           "supplier_id": pur.get("supplier_id"), "supplier_name": pur.get("supplier_name"),
           "items": [it.model_dump() for it in body.items], "total": total, "reason": body.reason,
           "date": today_str(), "created_at": now_utc().isoformat(), "created_by": user.get("name")}
    res = await db.purchase_returns.insert_one(doc)
    await audit(user, "create", "purchase_return", str(res.inserted_id), ret_no)
    return clean(await db.purchase_returns.find_one({"_id": res.inserted_id}))

@api.get("/purchase-returns")
async def list_purchase_returns(user=Depends(get_current_user)):
    docs = await db.purchase_returns.find().sort("created_at", -1).to_list(1000)
    return [clean(d) for d in docs]

# ==================== GIRVI (GOLD LOAN) ====================
class GirviReq(BaseModel):
    customer_name: str
    mobile: str
    address: Optional[str] = ""
    id_proof_type: Optional[str] = ""
    id_proof_number: Optional[str] = ""
    loan_amount: float
    interest_rate: float  # % per month (or per day for daily)
    interest_type: Literal["monthly", "daily", "fixed", "custom"] = "monthly"
    due_date: str
    item_description: str
    gross_weight: float
    stone_weight: float = 0
    purity: str
    metal_type: Literal["Gold", "Silver"] = "Gold"
    estimated_value: float

def girvi_pending_accrual(acc):
    if acc.get("interest_type") == "fixed": return 0
    last = date.fromisoformat(acc.get("last_accrual_date", acc["date"])[:10])
    days = (now_utc().date() - last).days
    if days <= 0: return 0
    p = acc.get("outstanding_principal", acc["loan_amount"])
    r = acc["interest_rate"] / 100
    if acc.get("interest_type") == "daily":
        return p * r * days
    return p * r * (days / 30)

def girvi_view(acc):
    a = dict(acc)
    accrued = round(acc.get("accrued_interest", 0) + girvi_pending_accrual(acc), 2)
    out_prin = round(acc.get("outstanding_principal", acc["loan_amount"]), 2)
    out_int = round(max(0, accrued - acc.get("interest_paid", 0)), 2)
    a["current_interest"] = accrued
    a["outstanding_interest"] = out_int
    a["outstanding_principal"] = out_prin
    a["total_outstanding"] = round(out_prin + out_int, 2)
    if acc.get("status") == "Closed":
        a["status"] = "Closed"
    else:
        today = now_utc().date()
        due = date.fromisoformat(acc["due_date"][:10])
        if today > due:
            a["status"] = "Overdue"
        elif (due - today).days <= 7:
            a["status"] = "Due Soon"
        elif acc.get("interest_paid", 0) > 0 or acc.get("outstanding_principal", acc["loan_amount"]) < acc["loan_amount"]:
            a["status"] = "Partially Paid"
        else:
            a["status"] = "Active"
    return clean(a)

@api.post("/girvi")
async def create_girvi(body: GirviReq, user=Depends(get_current_user)):
    if body.gross_weight < 0 or body.loan_amount <= 0:
        raise HTTPException(400, "Invalid weight or loan amount")
    count = await db.girvi_accounts.count_documents({})
    girvi_no = f"GRV-{datetime.now().year}-{count + 101}"
    net = round(body.gross_weight - body.stone_weight, 3)
    ltv = round(body.loan_amount / body.estimated_value * 100, 1) if body.estimated_value else 0
    now_iso = now_utc().isoformat()
    accrued = round(body.loan_amount * body.interest_rate / 100, 2) if body.interest_type == "fixed" else 0
    doc = {"girvi_no": girvi_no, "customer_name": body.customer_name, "mobile": body.mobile,
           "address": body.address, "id_proof_type": body.id_proof_type, "id_proof_number": body.id_proof_number,
           "loan_amount": body.loan_amount, "interest_rate": body.interest_rate, "interest_type": body.interest_type,
           "due_date": body.due_date, "item_description": body.item_description, "gross_weight": body.gross_weight,
           "stone_weight": body.stone_weight, "net_weight": net, "purity": body.purity, "metal_type": body.metal_type,
           "estimated_value": body.estimated_value, "ltv": ltv, "outstanding_principal": body.loan_amount,
           "interest_paid": 0, "accrued_interest": accrued, "last_accrual_date": now_iso,
           "status": "Active", "date": now_iso, "created_at": now_iso, "created_by": user.get("name")}
    res = await db.girvi_accounts.insert_one(doc)
    await audit(user, "create", "girvi", str(res.inserted_id), girvi_no)
    return girvi_view(await db.girvi_accounts.find_one({"_id": res.inserted_id}))

@api.get("/girvi")
async def list_girvi(status: Optional[str] = None, search: Optional[str] = None, user=Depends(get_current_user)):
    q = {}
    if search:
        q["$or"] = [{"girvi_no": {"$regex": search, "$options": "i"}},
                    {"customer_name": {"$regex": search, "$options": "i"}},
                    {"mobile": {"$regex": search, "$options": "i"}}]
    docs = await db.girvi_accounts.find(q).sort("created_at", -1).to_list(2000)
    views = [girvi_view(d) for d in docs]
    if status:
        views = [v for v in views if v["status"] == status]
    return views

@api.get("/girvi/summary")
async def girvi_summary(user=Depends(get_current_user)):
    docs = await db.girvi_accounts.find().to_list(5000)
    views = [girvi_view(d) for d in docs]
    active = [v for v in views if v["status"] != "Closed"]
    return {"active_count": len(active),
            "total_loan": round(sum(v["outstanding_principal"] for v in active), 2),
            "total_outstanding": round(sum(v["total_outstanding"] for v in active), 2),
            "overdue": len([v for v in views if v["status"] == "Overdue"]),
            "due_soon": len([v for v in views if v["status"] == "Due Soon"])}

@api.get("/girvi/{gid}")
async def get_girvi(gid: str, user=Depends(get_current_user)):
    acc = await db.girvi_accounts.find_one({"_id": ObjectId(gid)})
    if not acc: raise HTTPException(404, "Not found")
    payments = await db.girvi_payments.find({"girvi_id": gid}).sort("created_at", 1).to_list(500)
    v = girvi_view(acc)
    v["payments"] = [clean(p) for p in payments]
    return v

class GirviPaymentReq(BaseModel):
    amount: float
    mode: Literal["cash", "upi", "bank", "card"] = "cash"
    pay_type: Literal["interest", "principal", "mixed"] = "mixed"

@api.post("/girvi/{gid}/payment")
async def girvi_payment(gid: str, body: GirviPaymentReq, user=Depends(get_current_user)):
    acc = await db.girvi_accounts.find_one({"_id": ObjectId(gid)})
    if not acc: raise HTTPException(404, "Not found")
    if acc.get("status") == "Closed": raise HTTPException(400, "Account already closed")
    if body.amount <= 0: raise HTTPException(400, "Invalid amount")
    accrued = round(acc.get("accrued_interest", 0) + girvi_pending_accrual(acc), 2)
    out_int = round(max(0, accrued - acc.get("interest_paid", 0)), 2)
    int_pay = 0.0
    prin_pay = 0.0
    if body.pay_type == "principal":
        prin_pay = min(body.amount, acc.get("outstanding_principal", 0))
    else:
        int_pay = min(body.amount, out_int)
        prin_pay = min(body.amount - int_pay, acc.get("outstanding_principal", 0))
    new_int_paid = acc.get("interest_paid", 0) + int_pay
    new_out_prin = round(acc.get("outstanding_principal", acc["loan_amount"]) - prin_pay, 2)
    await db.girvi_accounts.update_one({"_id": ObjectId(gid)}, {"$set": {
        "accrued_interest": accrued, "last_accrual_date": now_utc().isoformat(),
        "interest_paid": round(new_int_paid, 2), "outstanding_principal": new_out_prin}})
    pdoc = {"girvi_id": gid, "girvi_no": acc.get("girvi_no"), "amount": round(body.amount, 2),
            "interest_portion": round(int_pay, 2), "principal_portion": round(prin_pay, 2),
            "mode": body.mode, "pay_type": body.pay_type, "date": today_str(),
            "created_at": now_utc().isoformat(), "created_by": user.get("name")}
    res = await db.girvi_payments.insert_one(pdoc)
    await audit(user, "payment", "girvi", gid, f"{acc.get('girvi_no')} ₹{body.amount}")
    return {"payment": clean(await db.girvi_payments.find_one({"_id": res.inserted_id})),
            "account": girvi_view(await db.girvi_accounts.find_one({"_id": ObjectId(gid)}))}

@api.post("/girvi/{gid}/release")
async def girvi_release(gid: str, force: bool = False, user=Depends(get_current_user)):
    acc = await db.girvi_accounts.find_one({"_id": ObjectId(gid)})
    if not acc: raise HTTPException(404, "Not found")
    if acc.get("status") == "Closed": raise HTTPException(400, "Already closed")
    v = girvi_view(acc)
    if v["total_outstanding"] > 0 and not (force and user["role"] == "admin"):
        raise HTTPException(400, f"Outstanding ₹{v['total_outstanding']} must be cleared before release")
    await db.girvi_accounts.update_one({"_id": ObjectId(gid)}, {"$set": {
        "status": "Closed", "release_date": today_str(), "released_by": user.get("name")}})
    await audit(user, "release", "girvi", gid, acc.get("girvi_no"))
    return girvi_view(await db.girvi_accounts.find_one({"_id": ObjectId(gid)}))

# ==================== EXPENSES ====================
EXPENSE_CATS = ["Rent", "Electricity", "Salary", "Transport", "Packaging", "Marketing", "Repair", "Maintenance", "Miscellaneous"]

class ExpenseReq(BaseModel):
    date: str
    category: str
    description: Optional[str] = ""
    amount: float
    payment_mode: Literal["cash", "upi", "card", "bank"] = "cash"

@api.post("/expenses")
async def create_expense(body: ExpenseReq, user=Depends(get_current_user)):
    if body.amount <= 0: raise HTTPException(400, "Amount must be positive")
    doc = body.model_dump()
    doc["added_by"] = user.get("name")
    doc["created_at"] = now_utc().isoformat()
    res = await db.expenses.insert_one(doc)
    await audit(user, "create", "expense", str(res.inserted_id), f"{body.category} ₹{body.amount}")
    return clean(await db.expenses.find_one({"_id": res.inserted_id}))

@api.get("/expenses")
async def list_expenses(start: Optional[str] = None, end: Optional[str] = None,
                        category: Optional[str] = None, user=Depends(get_current_user)):
    q = {}
    if category: q["category"] = category
    if start or end:
        dr = {}
        if start: dr["$gte"] = start
        if end: dr["$lte"] = end
        q["date"] = dr
    docs = await db.expenses.find(q).sort("date", -1).to_list(5000)
    total = round(sum(e.get("amount", 0) for e in docs), 2)
    by_cat = {}
    for e in docs:
        by_cat[e["category"]] = round(by_cat.get(e["category"], 0) + e.get("amount", 0), 2)
    return {"expenses": [clean(d) for d in docs], "total": total, "by_category": by_cat}

@api.delete("/expenses/{eid}")
async def delete_expense(eid: str, user=Depends(require_role("admin", "manager", "accountant"))):
    await db.expenses.delete_one({"_id": ObjectId(eid)})
    await audit(user, "delete", "expense", eid)
    return {"ok": True}

# ==================== OLD GOLD PURCHASE / EXCHANGE ====================
class OldGoldReq(BaseModel):
    customer_name: str
    mobile: Optional[str] = ""
    address: Optional[str] = ""
    description: str
    gross_weight: float
    stone_weight: float = 0
    purity: str
    testing_result: Optional[str] = ""
    rate_per_gram: float
    deduction_pct: float = 0
    settlement_type: Literal["cash", "exchange", "partial"] = "cash"
    cash_paid: float = 0

@api.post("/old-gold")
async def create_old_gold(body: OldGoldReq, user=Depends(get_current_user)):
    if body.gross_weight < 0 or body.stone_weight < 0:
        raise HTTPException(400, "Weight cannot be negative")
    net = round(body.gross_weight - body.stone_weight, 3)
    ded_amount = round(net * body.rate_per_gram * body.deduction_pct / 100, 2)
    final_value = round(net * body.rate_per_gram - ded_amount, 2)
    doc = body.model_dump()
    doc.update({"net_weight": net, "deduction_amount": ded_amount, "final_value": final_value,
                "date": today_str(), "created_at": now_utc().isoformat(), "created_by": user.get("name")})
    res = await db.old_gold.insert_one(doc)
    await audit(user, "create", "old_gold", str(res.inserted_id), f"{body.customer_name} ₹{final_value}")
    return clean(await db.old_gold.find_one({"_id": res.inserted_id}))

@api.get("/old-gold")
async def list_old_gold(search: Optional[str] = None, user=Depends(get_current_user)):
    q = {}
    if search:
        q["$or"] = [{"customer_name": {"$regex": search, "$options": "i"}},
                    {"mobile": {"$regex": search, "$options": "i"}}]
    docs = await db.old_gold.find(q).sort("created_at", -1).to_list(2000)
    return [clean(d) for d in docs]

# ==================== DAILY CASH BOOK ====================
@api.get("/cashbook")
async def cashbook(date: Optional[str] = None, user=Depends(get_current_user)):
    d = date or today_str()
    prev = await db.cash_closings.find({"date": {"$lt": d}}).sort("date", -1).to_list(1)
    opening = round(prev[0]["closing"], 2) if prev else 0
    sales = await db.sales.find({"date": d}).to_list(5000)
    cash_sales = upi = card = bank = credit = 0
    for s in sales:
        p = s.get("payments", {})
        cash_sales += float(p.get("cash", 0) or 0); upi += float(p.get("upi", 0) or 0)
        card += float(p.get("card", 0) or 0); bank += float(p.get("bank", 0) or 0)
        credit += s.get("balance_due", 0)
    returns = await db.sales_returns.find({"date": d}).to_list(5000)
    refunds = round(sum(r.get("total", 0) for r in returns if r.get("refund_mode") == "cash"), 2)
    exps = await db.expenses.find({"date": d}).to_list(5000)
    exp_cash = round(sum(e.get("amount", 0) for e in exps if e.get("payment_mode") == "cash"), 2)
    exp_total = round(sum(e.get("amount", 0) for e in exps), 2)
    og = await db.old_gold.find({"date": d}).to_list(5000)
    og_cash = round(sum(o.get("cash_paid", 0) for o in og if o.get("settlement_type") in ("cash", "partial")), 2)
    cash_in = round(cash_sales, 2)
    cash_out = round(refunds + exp_cash + og_cash, 2)
    closing = round(opening + cash_in - cash_out, 2)
    existing = await db.cash_closings.find_one({"date": d})
    return {"date": d, "opening": opening, "cash_sales": round(cash_sales, 2), "refunds": refunds,
            "expenses_cash": exp_cash, "old_gold_cash": og_cash, "cash_in": cash_in, "cash_out": cash_out,
            "closing": closing, "closed": bool(existing),
            "summary": {"cash": round(cash_sales, 2), "upi": round(upi, 2), "card": round(card, 2),
                        "bank": round(bank, 2), "credit": round(credit, 2), "expenses": exp_total}}

@api.post("/cashbook/close")
async def close_cashbook(date: Optional[str] = None, user=Depends(require_role("admin", "manager", "accountant"))):
    cb = await cashbook(date=date, user=user)
    await db.cash_closings.update_one({"date": cb["date"]},
        {"$set": {"date": cb["date"], "opening": cb["opening"], "closing": cb["closing"],
                  "closed_by": user.get("name"), "closed_at": now_utc().isoformat()}}, upsert=True)
    await audit(user, "close", "cashbook", cb["date"], f"closing ₹{cb['closing']}")
    return {"ok": True, "closing": cb["closing"]}

# ==================== ADMIN — CLEAR TRANSACTIONS ====================
@api.post("/admin/clear-transactions")
async def clear_transactions(user=Depends(require_role("admin"))):
    cols = ["sales", "sales_returns", "purchases", "purchase_returns", "old_gold",
            "girvi_accounts", "girvi_payments", "expenses", "stock_movements",
            "customer_ledger", "cash_closings"]
    cleared = {}
    for c in cols:
        r = await db[c].delete_many({})
        cleared[c] = r.deleted_count
    await audit(user, "clear", "transactions", "", str(cleared))
    return {"ok": True, "cleared": cleared, "total": sum(cleared.values())}

# ---------- seed ----------
async def seed():
    admin_email = os.environ["ADMIN_EMAIL"].lower()
    admin_pw = os.environ["ADMIN_PASSWORD"]
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one({"name": "Shop Owner", "email": admin_email,
            "password_hash": hash_password(admin_pw), "role": "admin", "disabled": False,
            "created_at": now_utc().isoformat()})
    elif not verify_password(admin_pw, existing["password_hash"]):
        await db.users.update_one({"email": admin_email}, {"$set": {"password_hash": hash_password(admin_pw)}})
    # extra demo users
    for u in [("Rahul Manager", "manager@shop.com", "manager"),
              ("Priya Sales", "sales@shop.com", "sales"),
              ("Amit Accounts", "accounts@shop.com", "accountant")]:
        if not await db.users.find_one({"email": u[1]}):
            await db.users.insert_one({"name": u[0], "email": u[1],
                "password_hash": hash_password("password123"), "role": u[2],
                "disabled": False, "created_at": now_utc().isoformat()})

    if not await db.settings.find_one({"key": "shop"}):
        await db.settings.insert_one({"key": "shop", "shop_name": "Vaishno Jewelers",
            "owner_name": "Ritik Varma",
            "address": "Khairetwa Chauraha, jhanga To Kaptanganj Road.", "city": "", "state": "",
            "pincode": "", "mobile": "", "email": "",
            "gstin": "", "invoice_prefix": "INV", "gst_pct": 3.0,
            "terms": "Goods once sold will not be taken back."})

    if not await db.metal_rates.find_one():
        await db.metal_rates.insert_one({"gold_24k": 74500, "gold_22k": 68200, "gold_20k": 62000,
            "gold_18k": 55800, "silver_per_10g": 950, "created_at": now_utc().isoformat(),
            "created_by": "System"})

    if await db.app_meta.find_one({"key": "samples_seeded"}):
        return

    if await db.customers.count_documents({}) == 0:
        names = [("Suresh Agarwal", "9829011111", "Jaipur"), ("Meena Sharma", "9829022222", "Ajmer"),
                 ("Vikram Singh", "9829033333", "Udaipur"), ("Kavita Jain", "9829044444", "Kota"),
                 ("Rohit Gupta", "9829055555", "Jaipur"), ("Anita Verma", "9829066666", "Jodhpur"),
                 ("Deepak Mehta", "9829077777", "Bikaner"), ("Pooja Rathore", "9829088888", "Alwar"),
                 ("Sanjay Bhandari", "9829099999", "Jaipur"), ("Neha Kapoor", "9829000000", "Sikar")]
        for i, (n, m, c) in enumerate(names):
            await db.customers.insert_one({"name": n, "mobile": m, "city": c, "state": "Rajasthan",
                "address": f"{i+1}, Main Bazaar", "pincode": "302001", "email": "", "gstin": "",
                "alt_mobile": "", "id_proof": "", "notes": "", "code": f"CUST{1001+i}",
                "created_at": now_utc().isoformat()})

    if await db.products.count_documents({}) == 0:
        prods = [
            ("Gold Ring Classic", "GR001", "Ring", "Gold", "22K", 8.5, 0.5, 500, "per_gram", 8, 0, 0, 45),
            ("Gold Chain 20in", "GC002", "Chain", "Gold", "22K", 22.0, 0, 450, "per_gram", 6, 0, 0, 12),
            ("Gold Necklace Bridal", "GN003", "Necklace", "Gold", "22K", 45.0, 3.0, 700, "per_gram", 10, 5000, 0, 3),
            ("Gold Bangle Pair", "GB004", "Bangle", "Gold", "22K", 30.0, 0, 550, "per_gram", 7, 0, 0, 8),
            ("Gold Earrings Jhumka", "GE005", "Earrings", "Gold", "22K", 12.0, 1.0, 600, "fixed", 5, 2000, 0, 15),
            ("Gold Mangalsutra", "GM006", "Mangalsutra", "Gold", "22K", 18.0, 0.5, 500, "per_gram", 8, 0, 0, 10),
            ("Gold Pendant Om", "GP007", "Pendant", "Gold", "18K", 5.0, 0.2, 400, "fixed", 6, 800, 0, 20),
            ("Gold Nose Pin", "GNP008", "Nose Pin", "Gold", "22K", 1.2, 0.1, 300, "fixed", 4, 200, 0, 30),
            ("Gold Bracelet Men", "GBR009", "Bracelet", "Gold", "22K", 15.0, 0, 500, "per_gram", 7, 0, 0, 7),
            ("Gold Anklet", "GA010", "Anklet", "Gold", "18K", 20.0, 0, 400, "per_gram", 8, 0, 0, 5),
            ("Silver Anklet Pair", "SA011", "Anklet", "Silver", "925", 55.0, 0, 15, "per_gram", 5, 0, 0, 25),
            ("Silver Payal Heavy", "SP012", "Anklet", "Silver", "925", 90.0, 0, 12, "per_gram", 6, 0, 0, 12),
            ("Silver Ring", "SR013", "Ring", "Silver", "925", 6.0, 0.3, 20, "fixed", 4, 100, 0, 40),
            ("Silver Chain", "SC014", "Chain", "Silver", "925", 40.0, 0, 14, "per_gram", 5, 0, 0, 18),
            ("Silver Bowl Set", "SB015", "Silver Item", "Silver", "999", 200.0, 0, 10, "per_gram", 3, 0, 0, 6),
            ("Silver Toe Ring", "STR016", "Toe Ring", "Silver", "925", 4.0, 0, 25, "fixed", 4, 50, 0, 50),
            ("Gold Ring Diamond", "GRD017", "Ring", "Gold", "18K", 6.0, 1.5, 800, "fixed", 5, 15000, 0, 4),
            ("Gold Chain Rope", "GCR018", "Chain", "Gold", "24K", 25.0, 0, 300, "per_gram", 4, 0, 0, 3),
            ("Silver Bangle", "SBG019", "Bangle", "Silver", "925", 35.0, 0, 15, "per_gram", 5, 0, 0, 20),
            ("Gold Earrings Studs", "GES020", "Earrings", "Gold", "22K", 4.0, 0.5, 600, "fixed", 5, 500, 0, 22),
        ]
        for (n, sku, cat, metal, pur, gw, sw, mc, mct, wp, sc, oc, qty) in prods:
            nw = round(gw - sw, 3)
            await db.products.insert_one({"name": n, "sku": sku, "barcode": sku, "category": cat,
                "metal_type": metal, "purity": pur, "gross_weight": gw, "stone_weight": sw,
                "net_weight": nw, "making_charge": mc, "making_charge_type": mct, "wastage_pct": wp,
                "stone_charge": sc, "other_charges": oc, "purchase_price": 0,
                "selling_price": 0, "quantity": qty, "min_stock": 5, "supplier": "Kohinoor Bullion",
                "image": "", "description": "", "created_at": now_utc().isoformat()})

    if await db.expenses.count_documents({}) == 0:
        import random as _r
        ecats = [("Rent", 25000, "Shop monthly rent"), ("Electricity", 3200, "Power bill"),
                 ("Salary", 18000, "Staff salary"), ("Packaging", 1500, "Jewellery boxes"),
                 ("Marketing", 5000, "Festival ads"), ("Maintenance", 2000, "AC service")]
        for i, (c, amt, desc) in enumerate(ecats):
            dd = (now_utc().date() - timedelta(days=_r.randint(0, 5))).isoformat()
            await db.expenses.insert_one({"date": dd, "category": c, "description": desc,
                "amount": amt, "payment_mode": _r.choice(["cash", "upi", "bank"]),
                "added_by": "System", "created_at": now_utc().isoformat()})

    # sample sales across last 7 days
    if await db.suppliers.count_documents({}) == 0:
        sups = [("Kohinoor Bullion", "9812000001", "27ABCDS1111A1Z1"),
                ("Rajwada Gold Traders", "9812000002", "08XYZDS2222B1Z2"),
                ("Shree Silver Mart", "9812000003", "09PQRDS3333C1Z3"),
                ("Ganpati Jewels Supply", "9812000004", ""),
                ("Metro Gold House", "9812000005", "07LMNDS4444D1Z4")]
        for i, (n, m, g) in enumerate(sups):
            await db.suppliers.insert_one({"name": n, "mobile": m, "gstin": g, "address": "Sarafa Bazaar",
                "bank": "", "notes": "", "code": f"SUP{101+i}", "created_at": now_utc().isoformat()})

    if await db.girvi_accounts.count_documents({}) == 0:
        gsamples = [
            ("Ramesh Yadav", "9811100001", 50000, 2.0, "monthly", 20, "Gold necklace 22K", 28.0, "22K", 190000),
            ("Sunita Devi", "9811100002", 25000, 2.5, "monthly", -5, "Gold bangles pair", 18.5, "22K", 120000),
            ("Imran Khan", "9811100003", 80000, 1.8, "monthly", 60, "Gold chain + ring", 42.0, "22K", 285000),
            ("Lakshmi Bai", "9811100004", 15000, 3.0, "monthly", 5, "Silver anklets", 250.0, "925", 32000),
        ]
        for i, (n, m, la, ir, it, ddoff, desc, gw, pur, ev) in enumerate(gsamples):
            start = now_utc() - timedelta(days=45)
            due = (now_utc().date() + timedelta(days=ddoff)).isoformat()
            metal = "Silver" if pur == "925" else "Gold"
            await db.girvi_accounts.insert_one({"girvi_no": f"GRV-2026-{101+i}", "customer_name": n,
                "mobile": m, "address": "Gandhi Nagar", "id_proof_type": "Aadhaar",
                "id_proof_number": f"XXXX-XXXX-{1000+i}", "loan_amount": la, "interest_rate": ir,
                "interest_type": it, "due_date": due, "item_description": desc, "gross_weight": gw,
                "stone_weight": 0, "net_weight": gw, "purity": pur, "metal_type": metal,
                "estimated_value": ev, "ltv": round(la/ev*100, 1), "outstanding_principal": la,
                "interest_paid": 0, "accrued_interest": 0, "last_accrual_date": start.isoformat(),
                "status": "Active", "date": start.isoformat(), "created_at": start.isoformat(),
                "created_by": "System"})

    if await db.sales.count_documents({}) == 0:
        custs = await db.customers.find().to_list(10)
        prods = await db.products.find().to_list(20)
        import random
        for i in range(15):
            c = random.choice(custs); p = random.choice(prods)
            d = (now_utc().date() - timedelta(days=random.randint(0, 6))).isoformat()
            it = SaleItem(product_id=str(p["_id"]), name=p["name"], sku=p["sku"],
                metal_type=p["metal_type"], purity=p["purity"], gross_weight=p["gross_weight"],
                stone_weight=p["stone_weight"],
                rate_per_gram=(6820 if p["metal_type"] == "Gold" else 95) / 10 * 10 / 10,
                making_charge=p["making_charge"], making_charge_type=p["making_charge_type"],
                wastage_pct=p["wastage_pct"], stone_charge=p["stone_charge"],
                other_charges=p["other_charges"], quantity=1)
            it.rate_per_gram = 6820 if p["metal_type"] == "Gold" else 95
            calc = compute_item(it)
            sub = calc["line_total"]; gst = round(sub * 0.03, 2); grand = round(sub + gst, 2)
            pay = {"cash": grand} if i % 3 else {"upi": grand}
            await db.sales.insert_one({"invoice_no": f"INV-2026-{1001+i}", "customer_id": str(c["_id"]),
                "customer_name": c["name"], "customer_mobile": c["mobile"], "salesperson": "Priya Sales",
                "items": [{**it.model_dump(), **calc}], "subtotal": sub, "discount": 0, "gst_pct": 3.0,
                "gst_amount": gst, "cgst": round(gst/2,2), "sgst": round(gst/2,2), "round_off": 0,
                "grand_total": grand, "payments": pay, "received": grand, "balance_due": 0,
                "notes": "", "date": d, "created_at": now_utc().isoformat(), "created_by": "System"})

    await db.app_meta.update_one({"key": "samples_seeded"},
        {"$set": {"key": "samples_seeded", "at": now_utc().isoformat()}}, upsert=True)

@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await seed()

app.include_router(api)
app.add_middleware(CORSMiddleware, allow_credentials=True,
    allow_origins=('https://flourishing-starlight-8599db.netlify.app',
         "http://localhost:3000",
        "http://localhost:5173"),
    allow_methods=["*"],
      allow_headers=["*"])
logging.basicConfig(level=logging.INFO)

@app.on_event("shutdown")
async def shutdown():
    client.close()
