"""
Bulk import Caleb's April 2026 timesheet entries.
Usage:
  python import_caleb_april.py          # dry run
  python import_caleb_april.py --execute
"""
import sys, uuid, psycopg2, requests
from dotenv import load_dotenv
from collections import defaultdict
import os

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))
DRY_RUN = "--execute" not in sys.argv

conn = psycopg2.connect(
    host=os.getenv("REDSHIFT_HOST"), port=int(os.getenv("REDSHIFT_PORT", 5432)),
    dbname=os.getenv("REDSHIFT_DATABASE"), user=os.getenv("REDSHIFT_USER"),
    password=os.getenv("REDSHIFT_PASSWORD"), sslmode="require",
)
cur = conn.cursor()

cur.execute("SELECT user_id, full_name FROM users WHERE email = 'caleb.stephen@expressanalytics.net'")
row = cur.fetchone()
if not row:
    print("ERROR: Caleb not found."); sys.exit(1)
CALEB_ID, CALEB_NAME = row
print(f"Found user: {CALEB_NAME}  ({CALEB_ID})\n")

auth = (os.getenv("JIRA_EMAIL"), os.getenv("JIRA_TOKEN"))
UNIQUE_TICKETS = ["HSB-7","DS-2313","DS-2343","DS-2370","DS-2371","DS-2376","DS-2379","DS-2381","DS-2400","DS-2417"]
TITLES = {}
for t in UNIQUE_TICKETS:
    r = requests.get(f"https://{os.getenv('JIRA_DOMAIN')}/rest/api/3/issue/{t}", auth=auth)
    TITLES[t] = r.json()["fields"]["summary"][:20] if r.ok else t
    print(f"  {t}: {TITLES[t]}")
print()

# (date, ticket, description, hours)
RAW = [
    # 01-04
    ("2026-04-01","HSB-7","Sprint Call",1),
    ("2026-04-01","DS-2343","kAInet Optimization",7),
    ("2026-04-01","HSB-7","FE Review Call",0.5),
    ("2026-04-01","HSB-7","Daily VCare UAT Call",1),
    ("2026-04-01","HSB-7","Handshake Call",1),
    ("2026-04-01","DS-2379","Website Review Call w Scott",1),
    ("2026-04-01","HSB-7","Amour Prints Demo",2),
    # 02-04
    ("2026-04-02","HSB-7","Sprint Call",1),
    ("2026-04-02","DS-2343","kAInet Optimization",7),
    ("2026-04-02","HSB-7","FE Review Call",0.5),
    ("2026-04-02","DS-2313","Daily VCare UAT Call",1),
    ("2026-04-02","HSB-7","Handshake Call",1),
    # 03-04
    ("2026-04-03","HSB-7","Sprint Call",1),
    ("2026-04-03","DS-2371","kAInet Optimization",7),
    ("2026-04-03","HSB-7","FE Review Call",0.5),
    ("2026-04-03","DS-2313","Daily VCare UAT Call",1),
    ("2026-04-03","HSB-7","Handshake Call",1),
    ("2026-04-03","HSB-7","Amour Prints Demo",0.5),
    # 06-04
    ("2026-04-06","HSB-7","Sprint Call",1),
    ("2026-04-06","DS-2371","kAInet Optimization",7),
    ("2026-04-06","HSB-7","FE Review Call",0.5),
    ("2026-04-06","DS-2313","Daily VCare UAT Call",1),
    ("2026-04-06","HSB-7","Handshake Call",1),
    ("2026-04-06","HSB-7","Call w Hemant, Samir",1),
    # 07-04
    ("2026-04-07","HSB-7","Sprint Call",1),
    ("2026-04-07","DS-2371","kAInet Optimization",7),
    ("2026-04-07","HSB-7","Call w DBL",0.5),
    ("2026-04-07","HSB-7","FE Review Call",0.5),
    ("2026-04-07","DS-2313","Daily VCare UAT Call",1),
    ("2026-04-07","HSB-7","Handshake Call",1),
    # 08-04
    ("2026-04-08","HSB-7","Sprint Call",1),
    ("2026-04-08","DS-2370","kAInet Optimization - Campaign Strategy",7),
    ("2026-04-08","DS-2313","Daily VCare UAT Call",1),
    ("2026-04-08","HSB-7","Baha Mar Sync Up",1),
    ("2026-04-08","HSB-7","Handshake Call",1),
    # 09-04
    ("2026-04-09","HSB-7","Sprint Call",1),
    ("2026-04-09","DS-2370","kAInet Optimization - Campaign Strategy",7),
    ("2026-04-09","HSB-7","FE Review Call",0.5),
    ("2026-04-09","DS-2313","Daily VCare UAT Call",1),
    ("2026-04-09","HSB-7","Handshake Call",1),
    # 10-04
    ("2026-04-10","HSB-7","Sprint Call",1),
    ("2026-04-10","DS-2370","kAInet Optimization - Campaign Strategy",7),
    ("2026-04-10","HSB-7","FE Review Call",0.5),
    ("2026-04-10","DS-2313","Daily VCare UAT Call",1),
    ("2026-04-10","HSB-7","Handshake Call",1),
    # 13-04
    ("2026-04-13","HSB-7","Sprint Call",1),
    ("2026-04-13","DS-2370","kAInet Optimization - Campaign Strategy",7),
    ("2026-04-13","HSB-7","FE Review Call",0.5),
    ("2026-04-13","DS-2313","Daily VCare UAT Call",1),
    ("2026-04-13","HSB-7","Handshake Call",1),
    ("2026-04-13","HSB-7","Brand Creatives, Discussion w Scott, Samir",2.5),
    # 14-04
    ("2026-04-14","HSB-7","Sprint Call",1),
    ("2026-04-14","DS-2376","kAInet Optimization - Creative Assets (Brand Book and Style Guide)",7),
    ("2026-04-14","HSB-7","Handshake Call",1),
    ("2026-04-14","DS-2381","Interviews",1.5),
    ("2026-04-14","HSB-7","Call w Scott",1),
    # 15-04
    ("2026-04-15","HSB-7","Sprint Call",1),
    ("2026-04-15","DS-2376","kAInet Optimization - Creative Assets (Brand Book and Style Guide)",7),
    ("2026-04-15","HSB-7","FE Review Call",0.5),
    ("2026-04-15","DS-2381","Interviews",2),
    ("2026-04-15","HSB-7","Kart Blansh Demo",1),
    ("2026-04-15","HSB-7","Handshake Call",1),
    # 16-04
    ("2026-04-16","HSB-7","Sprint Call",1),
    ("2026-04-16","DS-2376","kAInet Optimization - Creative Assets (Brand Book and Style Guide)",7),
    ("2026-04-16","HSB-7","FE Review Call",0.5),
    ("2026-04-16","HSB-7","Handshake Call",1),
    ("2026-04-16","DS-2381","Demo's - kAInet",1),
    # 17-04
    ("2026-04-17","HSB-7","Sprint Call",1),
    ("2026-04-17","DS-2376","kAInet Optimization - Creative Assets (Brand Book and Style Guide)",7),
    ("2026-04-17","HSB-7","FE Review Call",0.5),
    ("2026-04-17","DS-2381","Demo's - kAInet",0.5),
    ("2026-04-17","DS-2381","Interviews",2),
    ("2026-04-17","HSB-7","Arcedo Demo",1),
    # 20-04
    ("2026-04-20","HSB-7","Sprint Call",1),
    ("2026-04-20","DS-2376","kAInet Optimization - Creative Assets (Brand Book and Style Guide)",7),
    ("2026-04-20","HSB-7","FE Review Call",0.5),
    ("2026-04-20","DS-2381","Demo's - kAInet",1),
    ("2026-04-20","DS-2400","Interview Website Strat",1),
    ("2026-04-20","HSB-7","Brand Consistency Call",1),
    # 21-04
    ("2026-04-21","HSB-7","Sprint Call",1),
    ("2026-04-21","DS-2376","kAInet Optimization - Creative Assets (Brand Book and Style Guide)",4),
    ("2026-04-21","HSB-7","FE Review Call",0.5),
    ("2026-04-21","DS-2381","Demo's - kAInet",1.5),
    ("2026-04-21","DS-2381","Interviews",2),
    ("2026-04-21","HSB-7","Weekly Review",1.25),
    ("2026-04-21","HSB-7","ImagInext Call",1),
    # 22-04
    ("2026-04-22","HSB-7","Sprint Call",1),
    ("2026-04-22","DS-2376","kAInet Optimization - Creative Assets (Brand Book and Style Guide)",4),
    ("2026-04-22","HSB-7","FE Review Call",0.5),
    ("2026-04-22","DS-2381","ImagInext Call",2),
    ("2026-04-22","DS-2379","kAInet Website and EA Website UX design",2.5),
    ("2026-04-22","HSB-7","Call w Hemant, Samir",2.5),
    ("2026-04-22","HSB-7","ImagInext Call",0.75),
    # 23-04
    ("2026-04-23","HSB-7","Sprint Call",1),
    ("2026-04-23","DS-2376","kAInet Optimization - Creative Assets (Brand Book and Style Guide)",5),
    ("2026-04-23","HSB-7","FE Review Call",0.5),
    ("2026-04-23","DS-2381","Interviews",1),
    ("2026-04-23","DS-2379","kAInet Website and EA Website UX design",2.5),
    ("2026-04-23","HSB-7","Handshake Call",1),
    ("2026-04-23","HSB-7","Call w Scott",2),
    # 24-04
    ("2026-04-24","HSB-7","Sprint Call",1),
    ("2026-04-24","DS-2417","kAInet Optimization - Ad Copy, Keywords",8),
    ("2026-04-24","DS-2381","Interviews",1),
    ("2026-04-24","DS-2379","kAInet Website and EA Website UX design",2.5),
    ("2026-04-24","DS-2400","Interview Website Strat",3),
    # 27-04
    ("2026-04-27","HSB-7","Sprint Call",1),
    ("2026-04-27","DS-2381","Interviews",2),
    ("2026-04-27","DS-2417","kAInet Optimization - Ad Copy, Keywords",8),
    ("2026-04-27","DS-2379","kAInet Website and EA Website UX design",2.5),
    ("2026-04-27","HSB-7","Outdoorsy",2),
    ("2026-04-27","HSB-7","Weekly Review",2),
    # 28-04
    ("2026-04-28","HSB-7","Sprint Call",1),
    ("2026-04-28","DS-2417","kAInet Optimization - Ad Copy, Keywords",8),
    ("2026-04-28","DS-2379","kAInet Website and EA Website UX design",2.5),
    ("2026-04-28","HSB-7","FE Review Call",0.5),
    ("2026-04-28","HSB-7","Handshake Call",1.5),
    ("2026-04-28","HSB-7","Call w Hemant, Samir & Scott & ImagInext",3),
    # 29-04
    ("2026-04-29","HSB-7","Sprint Call",1),
    ("2026-04-29","DS-2417","kAInet Optimization - Ad Copy, Keywords",8),
    ("2026-04-29","DS-2381","Interviews",0.5),
    ("2026-04-29","DS-2379","kAInet Website and EA Website UX design",2.5),
    ("2026-04-29","HSB-7","Demo's - kAInet",1),
    ("2026-04-29","HSB-7","Handshake Call",1),
    ("2026-04-29","HSB-7","ImagInext Call",2.5),
    # 30-04
    ("2026-04-30","HSB-7","Sprint Call",1),
    ("2026-04-30","DS-2417","kAInet Optimization - Ad Copy, Keywords",0.75),
    ("2026-04-30","DS-2381","Interviews",0.75),
    ("2026-04-30","DS-2379","kAInet Website and EA Website UX design",2.5),
    ("2026-04-30","HSB-7","FE Review Call",0.5),
    ("2026-04-30","HSB-7","Handshake Call",1),
]

print(f"── Entries to insert: {len(RAW)} ──")
by_day = defaultdict(float)
for d,_,_,h in RAW: by_day[d] += h
for d in sorted(by_day):
    count = sum(1 for r in RAW if r[0]==d)
    print(f"  {d}  {by_day[d]:.2f}h  ({count} entries)")
print(f"\nTotal hours: {sum(r[3] for r in RAW):.2f}")

if DRY_RUN:
    print("\nDRY RUN — pass --execute to apply.")
    conn.close(); sys.exit(0)

cur.execute("DELETE FROM timesheet_entries WHERE user_id=%s AND entry_date BETWEEN '2026-04-01' AND '2026-04-30'", (CALEB_ID,))
print(f"\nDeleted {cur.rowcount} existing entries.")

INSERT_SQL = """INSERT INTO timesheet_entries
  (id,user_id,task_id,task_title,entry_date,work_description,hours,status,created_at)
  VALUES (%s,%s,%s,%s,%s,%s,%s,'pending',NOW())"""

for date_str,key,desc,hrs in RAW:
    cur.execute(INSERT_SQL,(str(uuid.uuid4())[:12],CALEB_ID,key,TITLES.get(key,key),date_str,desc,hrs))

conn.commit()
print(f"Inserted {len(RAW)} entries for {CALEB_NAME}.")
conn.close()
