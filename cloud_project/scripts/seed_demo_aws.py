"""Seed Sai/Siddhardth quick-test profiles into the AWS RDS (and supporting demo data).

Unlike scripts/seed.py, this is intentionally allowed against the private RDS used by
the cloud_project stack. Simulated funds only.

Banks may already exist from supabase/banks.sql with different UUIDs — always resolve
bank rows by name (and insert catalog rows only when missing).
"""
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from uuid import NAMESPACE_URL, uuid5

from argon2 import PasswordHasher
import psycopg

uid = lambda name: uuid5(NAMESPACE_URL, "paylink.demo/" + name)
ph = PasswordHasher()

admin = os.environ.get("ADMIN_DATABASE_URL")
if not admin:
    raise SystemExit("ADMIN_DATABASE_URL is required")

BANK_SPECS = [
    ("Meridian Bank", "110000001"),
    ("Northstar Credit Union", "110000002"),
    ("Pacific Trust", "110000003"),
]


def bank_id(conn, name: str, routing: str):
    row = conn.execute("SELECT id FROM paylink.banks WHERE name=%s", (name,)).fetchone()
    if row:
        return row[0]
    # Prefer deterministic demo UUID when inserting fresh; fall back if PK clashes.
    try:
        conn.execute(
            "INSERT INTO paylink.banks(id,routing_number,name) VALUES(%s,%s,%s)",
            (uid(name), routing, name),
        )
        return uid(name)
    except psycopg.errors.UniqueViolation:
        conn.rollback()
        row = conn.execute("SELECT id FROM paylink.banks WHERE name=%s OR routing_number=%s", (name, routing)).fetchone()
        if not row:
            raise
        return row[0]


with psycopg.connect(admin) as c:
    banks = {name: bank_id(c, name, route) for name, route in BANK_SPECS}
    c.commit()

    for username, name, phone in [
        ("sai", "Sai Kadamati", "+15550101001"),
        ("siddhardth", "Siddhardth", "+15550101002"),
        ("maya", "Maya Chen", "+15550101003"),
        ("alex", "Alex Morgan", "+15550101004"),
    ]:
        c.execute(
            """INSERT INTO paylink.users(id,username,email,phone,full_name,password_hash)
               VALUES(%s,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING""",
            (
                uid(username),
                username,
                username + "@paylink.test",
                phone,
                name,
                ph.hash("PaylinkDemo!2026"),
            ),
        )

    specs = [
        ("sai-checking", "sai", "Meridian Bank", "Everyday checking", "checking", 245000, "100000004821"),
        ("sai-savings", "sai", "Northstar Credit Union", "Rainy day fund", "savings", 580000, "100000009304"),
        ("joint", "sai", "Pacific Trust", "Shared expenses", "checking", 125000, "100000007106"),
        ("sid-checking", "siddhardth", "Meridian Bank", "Everyday checking", "checking", 180000, "100000003209"),
        ("maya-checking", "maya", "Northstar Credit Union", "Maya checking", "checking", 120000, "100000002081"),
        ("alex-checking", "alex", "Pacific Trust", "Alex checking", "checking", 100000, "100000008801"),
    ]
    for key, owner, bank, label, kind, balance, number in specs:
        c.execute(
            """INSERT INTO paylink.bank_accounts(id,bank_id,account_number,account_type,label,balance_cents,opening_balance_cents)
               VALUES(%s,%s,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING""",
            (uid(key), banks[bank], number, kind, label, balance, balance),
        )
        c.execute(
            "INSERT INTO paylink.account_holders(user_id,account_id) VALUES(%s,%s) ON CONFLICT DO NOTHING",
            (uid(owner), uid(key)),
        )
    c.execute(
        "INSERT INTO paylink.account_holders(user_id,account_id) VALUES(%s,%s) ON CONFLICT DO NOTHING",
        (uid("siddhardth"), uid("joint")),
    )

    history = [
        ("maya-checking", "sai-checking", "maya", 6500, "Dinner, on me", 0),
        ("sai-checking", "sid-checking", "sai", 4200, "Coffee & catch-up", 1),
        ("alex-checking", "sai-checking", "alex", 12500, "Weekend trip", 2),
        ("sai-checking", "joint", "sai", 18000, "Shared groceries", 3),
        ("sai-checking", "maya-checking", "sai", 2800, "Lunch at the market", 4),
        ("sid-checking", "sai-checking", "siddhardth", 8500, "Utilities split", 5),
        ("sai-checking", "sai-savings", "sai", 25000, "A little for later", 6),
    ]
    for i, (source, dest, actor, amount, memo, days) in enumerate(history):
        key = uid("seed-transfer-" + str(i))
        result = c.execute(
            "SELECT id,created_at FROM paylink.transfers WHERE initiated_by=%s AND idempotency_key=%s",
            (uid(actor), key),
        ).fetchone()
        if not result:
            row = c.execute(
                "SELECT id FROM paylink.execute_transfer(%s,%s,%s,%s,%s,%s)",
                (uid(actor), uid(source), uid(dest), amount, memo, key),
            ).fetchone()
            c.execute(
                "UPDATE paylink.transfers SET created_at=%s WHERE id=%s",
                (datetime.now(timezone.utc) - timedelta(days=days, hours=2), row[0]),
            )

    for u in ("sai", "siddhardth"):
        row = c.execute("SELECT username,full_name FROM paylink.users WHERE username=%s", (u,)).fetchone()
        print("ok", dict(row) if hasattr(row, "keys") else row)

print("AWS demo profiles ready: sai / siddhardth (quick test + password PaylinkDemo!2026)")
