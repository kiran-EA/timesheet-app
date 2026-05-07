"""
Bulk import Harish's April–May 2026 timesheet entries.
Usage:
  python import_harish_april.py          # dry run — shows what will be inserted
  python import_harish_april.py --execute # actually deletes old + inserts new
"""
import sys, uuid, psycopg2, requests
from dotenv import load_dotenv
import os

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

DRY_RUN = "--execute" not in sys.argv

# ── DB ────────────────────────────────────────────────────────────────────────
conn = psycopg2.connect(
    host=os.getenv("REDSHIFT_HOST"),
    port=int(os.getenv("REDSHIFT_PORT", 5432)),
    dbname=os.getenv("REDSHIFT_DATABASE"),
    user=os.getenv("REDSHIFT_USER"),
    password=os.getenv("REDSHIFT_PASSWORD"),
    sslmode="require",
)
cur = conn.cursor()

# ── Harish user_id ────────────────────────────────────────────────────────────
cur.execute("SELECT user_id, full_name FROM users WHERE email = 'harish.shegokar@expressanalytics.net'")
row = cur.fetchone()
if not row:
    print("ERROR: Harish not found in users table.")
    sys.exit(1)
HARISH_ID, HARISH_NAME = row
print(f"Found user: {HARISH_NAME}  ({HARISH_ID})\n")

# ── JIRA title lookup ─────────────────────────────────────────────────────────
JIRA_DOMAIN = os.getenv("JIRA_DOMAIN")
JIRA_EMAIL  = os.getenv("JIRA_EMAIL")
JIRA_TOKEN  = os.getenv("JIRA_TOKEN")

UNIQUE_TICKETS = ["HSB-7", "LAM-2781", "DS-2329"]

print("── JIRA ticket titles ──────────────────────────────────────────────────")
TITLES = {}
for t in UNIQUE_TICKETS:
    r = requests.get(
        f"https://{JIRA_DOMAIN}/rest/api/3/issue/{t}",
        auth=(JIRA_EMAIL, JIRA_TOKEN),
    )
    if r.ok:
        TITLES[t] = r.json()["fields"]["summary"]
        print(f"  {t}: {TITLES[t]}")
    else:
        TITLES[t] = t   # fallback to ticket key
        print(f"  {t}: FETCH ERROR {r.status_code} — using key as title")
print()

# ── Timesheet data ────────────────────────────────────────────────────────────
# Each entry: (date_str, jira_key, work_description, hours)
#
# Pattern Apr 1–3:  2.5 + 1 + 1.5 + 4 + 4 = 13h/day
# Pattern Apr 6+:   2.5 + 1 + 1.5 + 2 + 2 =  9h/day
# May 4 skipped (not in source data)

def day_entries(date_str, india_hrs, doc_hrs):
    return [
        (date_str, "HSB-7",    "Data Science Call",                                      2.5),
        (date_str, "LAM-2781", "Production Issues and Mail Response and Operational Work", 1.0),
        (date_str, "HSB-7",    "Sprint Call + Handshake Call(LP+DS)",                    1.5),
        (date_str, "HSB-7",    "India Prospect Call",                                    india_hrs),
        (date_str, "DS-2329",  "Solution Document for the Client",                       doc_hrs),
    ]

RAW = []

# April 1–3 (higher hours)
for d in ["2026-04-01", "2026-04-02", "2026-04-03"]:
    RAW.extend(day_entries(d, 4, 4))

# April 6–10
for d in ["2026-04-06", "2026-04-07", "2026-04-08", "2026-04-09", "2026-04-10"]:
    RAW.extend(day_entries(d, 2, 2))

# April 13–17
for d in ["2026-04-13", "2026-04-14", "2026-04-15", "2026-04-16", "2026-04-17"]:
    RAW.extend(day_entries(d, 2, 2))

# April 20–24
for d in ["2026-04-20", "2026-04-21", "2026-04-22", "2026-04-23", "2026-04-24"]:
    RAW.extend(day_entries(d, 2, 2))

# April 27–30
for d in ["2026-04-27", "2026-04-28", "2026-04-29", "2026-04-30"]:
    RAW.extend(day_entries(d, 2, 2))

# May 1
RAW.extend(day_entries("2026-05-01", 2, 2))

# May 5  (May 4 not in source data)
RAW.extend(day_entries("2026-05-05", 2, 2))

# ── Preview ───────────────────────────────────────────────────────────────────
print(f"── Entries to insert: {len(RAW)} ──────────────────────────────────────")
from collections import defaultdict
by_day = defaultdict(float)
for date_str, key, desc, hrs in RAW:
    by_day[date_str] += hrs
for d in sorted(by_day):
    print(f"  {d}  {by_day[d]:.1f}h  ({sum(1 for r in RAW if r[0]==d)} entries)")
print(f"\nTotal hours: {sum(r[3] for r in RAW):.1f}")
print()

if DRY_RUN:
    print("DRY RUN — pass --execute to apply changes.")
    conn.close()
    sys.exit(0)

# ── Delete existing Apr 1 – May 5 entries for Harish ─────────────────────────
cur.execute(
    "DELETE FROM timesheet_entries WHERE user_id = %s AND entry_date BETWEEN '2026-04-01' AND '2026-05-05'",
    (HARISH_ID,),
)
deleted = cur.rowcount
print(f"Deleted {deleted} existing entries.")

# ── Insert ────────────────────────────────────────────────────────────────────
INSERT_SQL = """
INSERT INTO timesheet_entries
  (id, user_id, task_id, task_title, entry_date, work_description, hours, status, created_at)
VALUES (%s, %s, %s, %s, %s, %s, %s, 'pending', NOW())
"""
for date_str, key, desc, hrs in RAW:
    cur.execute(INSERT_SQL, (
        str(uuid.uuid4())[:12],
        HARISH_ID,
        key,
        TITLES.get(key, key)[:20],
        date_str,
        desc,
        hrs,
    ))

conn.commit()
print(f"Inserted {len(RAW)} entries for {HARISH_NAME}.")
conn.close()
