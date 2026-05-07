"""
Bulk import Ajmal's April 2026 timesheet entries.
Usage:
  python import_ajmal_april.py          # dry run — shows what will be inserted
  python import_ajmal_april.py --execute # actually deletes old + inserts new
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

# ── Ajmal user_id ─────────────────────────────────────────────────────────────
cur.execute("SELECT user_id, full_name FROM users WHERE email = 'ajmal.aksar@expressanalytics.net'")
row = cur.fetchone()
if not row:
    print("ERROR: Ajmal not found in users table.")
    sys.exit(1)
AJMAL_ID, AJMAL_NAME = row
print(f"Found user: {AJMAL_NAME}  ({AJMAL_ID})\n")

# ── JIRA title lookup ─────────────────────────────────────────────────────────
JIRA_DOMAIN = os.getenv("JIRA_DOMAIN")
JIRA_EMAIL  = os.getenv("JIRA_EMAIL")
JIRA_TOKEN  = os.getenv("JIRA_TOKEN")

UNIQUE_TICKETS = [
    "DS-2309","DS-2311","DS-2356","DS-2358","DS-2359",
    "DS-2386","DS-2387","DS-2388","DS-2389","DS-2391",
    "DS-2392","DS-2393","HSB-7",
]

print("── JIRA ticket titles ──────────────────────────────────────────────────")
TITLES = {}
for t in UNIQUE_TICKETS:
    r = requests.get(
        f"https://{JIRA_DOMAIN}/rest/api/3/issue/{t}",
        auth=(JIRA_EMAIL, JIRA_TOKEN), timeout=10,
    )
    if r.ok:
        TITLES[t] = r.json()["fields"]["summary"]
        print(f"  {t:10s}  {TITLES[t]}")
    else:
        TITLES[t] = t   # fallback to ticket ID
        print(f"  {t:10s}  [NOT FOUND — {r.status_code}]")
print()

# ── Raw entries from image ─────────────────────────────────────────────────────
# Format: (date, jira_ticket, work_description, hours)
RAW = [
    # ── 01-04-2026 ────────────────────────────────────────────────────────────
    ("2026-04-01","DS-2391","kAInet - Search Campaign Execution Bug Fixes",4),
    ("2026-04-01","DS-2391","Conversational AI using Savant Demo Ready Version",3),
    ("2026-04-01","DS-2356","Mail Template for kAInet",1.5),
    # no JIRA for "EA Website Revamp Draft" → skipped
    ("2026-04-01","HSB-7","Ad Hoc Call",0.75),
    ("2026-04-01","HSB-7","Handshake Call",1),
    ("2026-04-01","DS-2393","Mail Template for kAInet v2",0.5),
    ("2026-04-01","HSB-7","EA Website Revamp Call",1),

    # ── 02-04-2026 ────────────────────────────────────────────────────────────
    ("2026-04-02","DS-2359","Test - Company Knowledgebase",2),
    ("2026-04-02","DS-2356","Sprint Call",0.25),
    ("2026-04-02","DS-2356","kAInet - Search Campaign Execution Bug Fixes",4),
    ("2026-04-02","DS-2392","EA Website Revamp Draft",1.5),
    ("2026-04-02","HSB-7","Ad-Hoc Calls",0.75),
    ("2026-04-02","HSB-7","Handshake Call",1),

    # ── 03-04-2026 ────────────────────────────────────────────────────────────
    ("2026-04-03","HSB-7","Sprint Call",0.75),
    ("2026-04-03","DS-2356","kAInet - Search Campaign Execution Bug Fixes",3),
    ("2026-04-03","DS-2356","kAInet - Bug Fixes",3),
    ("2026-04-03","DS-2392","EA Website Revamp Draft",1),
    ("2026-04-03","HSB-7","Ad Hoc Calls",0.75),
    ("2026-04-03","HSB-7","Handshake Call",1.25),

    # ── 06-04-2026 ────────────────────────────────────────────────────────────
    ("2026-04-06","HSB-7","Sprint Call",1),
    ("2026-04-06","DS-2356","kAInet - Creative Assets Refactor",8),
    ("2026-04-06","DS-2356","kAInet - Pre-Billing Branch",1),
    ("2026-04-06","HSB-7","kAInet FE Call",1),
    ("2026-04-06","HSB-7","Handshake Call",1),
    ("2026-04-06","DS-2309","AmourPrint Call",1),

    # ── 07-04-2026 ────────────────────────────────────────────────────────────
    ("2026-04-07","HSB-7","Sprint Call",1),
    ("2026-04-07","DS-2356","kAInet - Creative Assets Optimization",6),
    ("2026-04-07","DS-2392","EA Website Revamp Draft",2),
    ("2026-04-07","HSB-7","kAInet FE Call",0.5),
    ("2026-04-07","HSB-7","Handshake Call",1),
    ("2026-04-07","DS-2309","AmourPrint Jira Call",1),

    # ── 08-04-2026 ────────────────────────────────────────────────────────────
    ("2026-04-08","DS-2358","kAIcreative v2",3.5),
    ("2026-04-08","HSB-7","Sprint Call",1),
    ("2026-04-08","DS-2392","kAInet - Campaign Execution Refactor",2),
    ("2026-04-08","DS-2392","kAInet Backend RWA",2),
    ("2026-04-08","HSB-7","Ad Hoc Calls + Interview",1),
    ("2026-04-08","HSB-7","Handshake Call",1),

    # ── 09-04-2026 ────────────────────────────────────────────────────────────
    ("2026-04-09","DS-2358","kAIcreative v2",3.5),
    ("2026-04-09","HSB-7","Sprint Call",1),
    ("2026-04-09","DS-2392","kAInet - Campaign Execution Refactor",2),
    ("2026-04-09","DS-2392","kAInet Backend RWA",2),
    ("2026-04-09","HSB-7","Ad Hoc Calls + Interview",1),
    ("2026-04-09","HSB-7","Handshake Call",1),

    # ── 10-04-2026 ────────────────────────────────────────────────────────────
    ("2026-04-10","DS-2358","kAIcreative v2",3.5),
    ("2026-04-10","HSB-7","Sprint Call",1),
    ("2026-04-10","DS-2392","kAInet - Campaign Execution Refactor",2),
    ("2026-04-10","DS-2392","kAInet Backend RWA",2),
    ("2026-04-10","HSB-7","Ad Hoc Calls",1),
    ("2026-04-10","HSB-7","Handshake Call",1),

    # ── 13-04-2026 ────────────────────────────────────────────────────────────
    ("2026-04-13","HSB-7","Sprint Call",1),
    ("2026-04-13","DS-2389","Code Fixes",1),
    ("2026-04-13","DS-2311","kAInet Feature Improvements",5),
    ("2026-04-13","HSB-7","Data Science Call",0.5),
    ("2026-04-13","DS-2388","Creative Brand Consistency Call",0.5),
    ("2026-04-13","DS-2388","Follow Up Code Fixes/Experiments",3),

    # ── 14-04-2026 ────────────────────────────────────────────────────────────
    ("2026-04-14","HSB-7","Sprint Call",0.75),
    ("2026-04-14","DS-2389","Code Fixes",1),
    ("2026-04-14","DS-2311","kAInet Feature Improvements",5),
    ("2026-04-14","DS-2392","Website Update",1),
    ("2026-04-14","HSB-7","Ad Hoc Calls + Interview",1.5),
    ("2026-04-14","HSB-7","Handshake Call",1),
    ("2026-04-14","DS-2388","Follow Up Code Fixes/Experiments",1),

    # ── 15-04-2026 ────────────────────────────────────────────────────────────
    ("2026-04-15","HSB-7","Sprint Call",1),
    ("2026-04-15","DS-2389","Code Fixes",1),
    ("2026-04-15","DS-2311","kAInet Feature Improvements",4),
    ("2026-04-15","HSB-7","Website Update Call",0.75),
    ("2026-04-15","DS-2388","Karl Braun - kAInet Demo",0.75),
    ("2026-04-15","DS-2309","AmourPrint Campaign Call",1),

    # ── 16-04-2026 ────────────────────────────────────────────────────────────
    ("2026-04-16","HSB-7","Sprint Call",1),
    ("2026-04-16","DS-2389","Code Fixes",1),
    ("2026-04-16","DS-2311","kAInet Feature Improvements",3),
    ("2026-04-16","HSB-7","Mumbai Meetup Plan Call",0.5),
    ("2026-04-16","DS-2309","Brand Consistency Meeting",0.5),
    ("2026-04-16","DS-2388","Follow Up Code Fixes/Experiments",2),

    # ── 17-04-2026 ────────────────────────────────────────────────────────────
    ("2026-04-17","HSB-7","Sprint Call",1),
    ("2026-04-17","DS-2389","Code Fixes + Interview",3),
    ("2026-04-17","DS-2311","kAInet - Competitive Intelligence",3),
    ("2026-04-17","HSB-7","Meta Support Call",0.5),
    ("2026-04-17","DS-2309","Brand Consistency Meeting",0.5),
    ("2026-04-17","DS-2388","Follow Up Code Fixes/Experiments",2),

    # ── 20-04-2026 ────────────────────────────────────────────────────────────
    ("2026-04-20","HSB-7","Sprint Call",1),
    ("2026-04-20","DS-2389","Code Fixes",1),
    ("2026-04-20","DS-2311","kAInet + Demo",3),
    ("2026-04-20","DS-2309","Innovative Beverage Concepts - kAInet Demo",1.5),
    ("2026-04-20","DS-2388","Follow Up Code Fixes/Experiments",3),

    # ── 21-04-2026 ────────────────────────────────────────────────────────────
    ("2026-04-21","DS-2389","Code Fixes",2),
    ("2026-04-21","HSB-7","Ad Hoc Calls + Interview",1.5),
    ("2026-04-21","DS-2311","Kundan Spaces - kAInet Demo",0.75),
    ("2026-04-21","DS-2309","AmourPrint Campaign",2),
    ("2026-04-21","DS-2388","Code Updates - kAIcreative",2),

    # ── 22-04-2026 ────────────────────────────────────────────────────────────
    ("2026-04-22","DS-2389","Code Fixes - Code Refactor",2),
    ("2026-04-22","DS-2311","kAInet Feature Improvements",3),
    ("2026-04-22","HSB-7","Ad Hoc Calls + Interview",1),
    ("2026-04-22","DS-2387","Microsoft Ads Account Setup",1),
    ("2026-04-22","DS-2392","Website Update Call",1),
    ("2026-04-22","DS-2386","kAIcrEative Editor",1.25),

    # ── 23-04-2026 ────────────────────────────────────────────────────────────
    ("2026-04-23","HSB-7","Interview + Ad Hoc Call",1.5),
    ("2026-04-23","DS-2387","Microsoft Ads Setup",1),
    ("2026-04-23","DS-2311","kAIcreative Improvements",2),
    ("2026-04-23","DS-2309","Website Update",1),
    ("2026-04-23","DS-2388","kAInet In-Brief",1),
    ("2026-04-23","DS-2309","kAInet Refactor",4),

    # ── 24-04-2026 ────────────────────────────────────────────────────────────
    ("2026-04-24","DS-2389","BindingSlate Gate + Follow Up",1),
    ("2026-04-24","HSB-7","Sprint Call",1),
    ("2026-04-24","DS-2358","kAIcreative Call + Ad Hoc Calls",1),
    ("2026-04-24","DS-2311","Code Fixes",1),
    ("2026-04-24","DS-2309","AmourPrint Campaign Call",2),
    ("2026-04-24","DS-2388","Experimental Features",3),

    # ── 27-04-2026 ────────────────────────────────────────────────────────────
    ("2026-04-27","HSB-7","Sprint Call",1),
    ("2026-04-27","DS-2389","Code Updates - Code Refactor",3),
    ("2026-04-27","DS-2311","kAInet Data Science Review Call",1),
    ("2026-04-27","DS-2389","Code Fixes - Code Refactor",2),
    ("2026-04-27","DS-2309","Code Updates - kAIcreative",1.5),
    ("2026-04-27","DS-2388","Experimental Features",1.5),

    # ── 28-04-2026 ────────────────────────────────────────────────────────────
    ("2026-04-28","HSB-7","Sprint Call",1),
    ("2026-04-28","DS-2389","Code Fixes + Interview",2.5),
    ("2026-04-28","DS-2311","Agentix Meeting Call",0.75),
    ("2026-04-28","DS-2388","Code Updates - kAIcreative",2),
    ("2026-04-28","DS-2309","Experimental Features",2),

    # ── 29-04-2026 ────────────────────────────────────────────────────────────
    ("2026-04-29","DS-2389","Code Fixes - Code Refactor",3),
    ("2026-04-29","DS-2358","kAIcreative Call",1),
    ("2026-04-29","DS-2311","Code Updates",3),
    ("2026-04-29","DS-2388","Experimental Features",2),
]

# ── Dry run output ────────────────────────────────────────────────────────────
print(f"── Entries to insert ({len(RAW)} rows) ─────────────────────────────────────")
cur_date = None
for date, ticket, work_desc, hours in RAW:
    if date != cur_date:
        print(f"\n  {date}")
        cur_date = date
    print(f"    {ticket:10s}  {hours:5.2f}h  {work_desc}")

# per-day totals
from collections import defaultdict
day_totals = defaultdict(float)
for date, _, _, h in RAW:
    day_totals[date] += h
print("\n── Daily totals ────────────────────────────────────────────────────────")
for d in sorted(day_totals):
    t = day_totals[d]
    flag = "  ⚠️ " if t < 8 else ""
    print(f"  {d}  {t:.2f}h{flag}")

print(f"\nTotal rows : {len(RAW)}")

# ── Existing April entries ────────────────────────────────────────────────────
cur.execute(
    "SELECT COUNT(*) FROM timesheet_entries WHERE user_id=%s AND entry_date BETWEEN '2026-04-01' AND '2026-04-30'",
    (AJMAL_ID,)
)
existing = cur.fetchone()[0]
print(f"Existing April entries for Ajmal: {existing}")

if DRY_RUN:
    print("\n[DRY RUN] Nothing written. Run with --execute to apply.")
    cur.close(); conn.close(); sys.exit(0)

# ── Execute ───────────────────────────────────────────────────────────────────
cur.execute(
    "DELETE FROM timesheet_entries WHERE user_id=%s AND entry_date BETWEEN '2026-04-01' AND '2026-04-30'",
    (AJMAL_ID,)
)
print(f"\nDeleted {cur.rowcount} existing April entries.")

inserted = 0
for date, ticket, work_desc, hours in RAW:
    entry_id = str(uuid.uuid4())[:12]
    title    = TITLES.get(ticket, ticket)
    cur.execute("""
        INSERT INTO timesheet_entries
            (id, user_id, task_id, task_title, entry_date, work_description, hours, status, created_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s, 'pending', CURRENT_TIMESTAMP)
    """, (entry_id, AJMAL_ID, ticket, title, date, work_desc, hours))
    inserted += 1

conn.commit()
print(f"Inserted {inserted} entries. Done.")
cur.close()
conn.close()
