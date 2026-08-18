# PRD — Shree Gold & Silver Jewellers ERP

## Original Problem Statement
Production-ready Gold & Silver Jewellery Shop Management & Billing Software for a real Indian jewellery shop (INR ₹, grams). Full scope: billing, sales, purchases, returns, stock, customers, gold/silver rates, girvi/gold-loan, payments, expenses, reports, dashboard, user management.

## Stack (platform)
React + FastAPI + MongoDB. JWT auth via httpOnly cookie (+ Bearer fallback). Browser print-to-PDF + CSV export.

## User Personas
- Admin (Shop Owner): full access, users, settings, rates.
- Manager: operations + rates/settings, view users.
- Sales Staff: billing, inventory, customers.
- Accountant: reports, ledgers.

## Roles / Auth
- admin / manager / sales / accountant. Role-gated endpoints via require_role.
- Seeded: adisingh00966@gmail.com/admin123 (admin); manager@shop.com, sales@shop.com, accounts@shop.com / password123.

## Implemented (Phase 1 — 2026-06, tested 100% backend/frontend)
- Auth: login/logout/me, brute-force-safe login, admin seeding.
- Dashboard: today KPIs (sales/cash/upi/card/bank/credit/orders), inventory stock (gold/silver g, low/out), weekly sales chart, top items (month), recent sales/customers, stock alerts.
- Metal Rates: 24K/22K/20K/18K + silver per 10g, per-gram auto-calc, history, rate-at-time-of-sale stored on invoice.
- Inventory: 20 seeded products, CRUD, search, metal filter, net-weight auto-calc, dup SKU/barcode + negative-weight validation, stock adjustment, soft delete, CSV export.
- Customers: 10 seeded, CRUD, search, detail (purchases/outstanding/history), CSV.
- Billing/New Sale: barcode/SKU scan + product search, per-item live math (net, metal, wastage, making per_gram/fixed/percentage, stone, other), discount, configurable GST (CGST+SGST split), round-off, mixed payments, change/return display, stock reduction, customer ledger, audit log, invoice number generation.
- Invoice: A4 tax invoice (shop details, items, GST breakdown, payments, terms, signature), print/PDF, WhatsApp share.
- Sales History: search, date filter, CSV, open invoice.
- Reports: date presets + custom range, gross/net/discount/GST/received/outstanding + by-metal, sales detail, CSV.
- Settings: shop + invoice + GST config (admin/manager edit).
- Users: admin CRUD, disable/enable, reset password, roles.
- Audit logs on create/update; last_login tracking.

## Implemented — Phase 2 (2026-06, tested 100% backend 15/15 + frontend)
- Shop identity: name "Vaishno Jewelers", address "Khairetwa Chauraha, jhanga To Kaptanganj Road." (prints on invoice + girvi receipt; brand shown in sidebar/login). Stat numbers switched to normal Manrope font.
- Girvi (Gold Loan): create account (customer/ID proof/jewellery/loan/interest rate+type monthly-daily-fixed-custom/due date/est value+LTV), live time-based interest accrual, part-payments (interest-first / principal / mixed) with payment history, full settlement + Release (blocked while outstanding>0), printable Girvi receipt, statuses Active/Partially Paid/Due Soon/Overdue/Closed, dashboard KPI row, /girvi/summary.
- Suppliers: CRUD, search, detail with purchase ledger + outstanding.
- Purchases: new purchase with multi-item, GST, paid/balance + payment status; auto stock-in (increments existing product or auto-creates new product); history + CSV.
- Returns: Sales Returns (search sale, select items, refund mode, restores stock + customer ledger credit) and Purchase Returns (reduces stock, blocks if insufficient). Role-gated (sales role cannot purchase/purchase-return; nav hidden).
- Seed: 5 suppliers, 4 girvi accounts (GRV-2026-101..104).

## Backlog (remaining)
- P1: Expenses module; daily cash management/closing; customer ledger record-payment UI; supplier payments.
- P2: Barcode label printing/generation; estimated profit reporting; old-gold purchase/exchange; backup/restore/export-all; granular permission matrix; dark mode; audit-log viewer UI.

## Next Tasks
1. Expenses + cash book (done).
2. Old-gold exchange (done).
