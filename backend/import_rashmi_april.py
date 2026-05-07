"""
Bulk import Rashmi's April–May 2026 timesheet entries.
Usage:
  python import_rashmi_april.py          # dry run
  python import_rashmi_april.py --execute
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

cur.execute("SELECT user_id, full_name FROM users WHERE email = 'rashmi@expressanalytics.net'")
row = cur.fetchone()
if not row:
    print("ERROR: Rashmi not found."); sys.exit(1)
RASHMI_ID, RASHMI_NAME = row
print(f"Found user: {RASHMI_NAME}  ({RASHMI_ID})\n")

auth = (os.getenv("JIRA_EMAIL"), os.getenv("JIRA_TOKEN"))
UNIQUE_TICKETS = ["HSB-7","DS-2344","LAM-3848","LAM-3881","LAM-3884","DS-2401","HSB-19","HSB-20"]
TITLES = {}
for t in UNIQUE_TICKETS:
    r = requests.get(f"https://{os.getenv('JIRA_DOMAIN')}/rest/api/3/issue/{t}", auth=auth)
    TITLES[t] = r.json()["fields"]["summary"] if r.ok else t
    print(f"  {t}: {TITLES[t]}")
print()

RAW = [
    # 01-04
    ("2026-04-01","HSB-7","Sprint call",0.75),
    ("2026-04-01","DS-2344","Check timesheet + Email to Ashwini + Call with Harish",2),
    ("2026-04-01","DS-2344","Call and schedule intern interview + Call all candidates who have not responded or answered test",4.5),
    ("2026-04-01","HSB-7","Handshake call",0.75),
    # 02-04
    ("2026-04-02","HSB-7","Sprint call",0.5),
    ("2026-04-02","LAM-3848","Update query, add address_id and count based on address_id + test on rashmi.temp table",3.5),
    ("2026-04-02","DS-2344","Call and schedule intern interview + Call all candidates who have not responded or answered test",2.25),
    ("2026-04-02","DS-2344","Sending test emails to interns + update on sheet new candidates",1),
    ("2026-04-02","HSB-7","Handshake call",0.75),
    # 03-04 (Good Friday holiday)
    ("2026-04-03","HSB-19","Holiday - Good Friday",8),
    # 06-04
    ("2026-04-06","HSB-7","Sprint call",0.75),
    ("2026-04-06","DS-2344","Call and schedule intern interview + Call all candidates who have not responded or answered test",2),
    ("2026-04-06","DS-2344","Sending test emails to interns + update on sheet new candidates",3),
    ("2026-04-06","DS-2344","Call with Tarun",1.5),
    ("2026-04-06","HSB-7","Handshake call",1),
    # 07-04
    ("2026-04-07","HSB-7","Sprint call",0.5),
    ("2026-04-07","DS-2344","Call and schedule intern interview + Call all candidates who have not responded or answered test",3),
    ("2026-04-07","DS-2344","Sending test emails to interns + update on sheet new candidates",1.5),
    ("2026-04-07","LAM-3848","Update query, add address_id and count based on address_id + test on lpdatamart.tbl_d_customer",2),
    ("2026-04-07","HSB-7","Handshake call",1),
    # 08-04
    ("2026-04-08","HSB-7","Sprint call",0.5),
    ("2026-04-08","DS-2344","Sending test emails to interns + update on sheet new candidates",1.5),
    ("2026-04-08","LAM-3848","Update query, add address_id and count based on address_id + test on lpdatamart.tbl_d_customer",4.75),
    ("2026-04-08","DS-2344","Call with Tarun",0.5),
    ("2026-04-08","HSB-7","Handshake call",0.75),
    # 09-04
    ("2026-04-09","HSB-7","Sprint call",0.75),
    ("2026-04-09","LAM-3848","test on lpdatamart.tbl_d_customer - Call with Kiran",1),
    ("2026-04-09","DS-2344","Sending test emails to interns + update on sheet new candidates",0.75),
    ("2026-04-09","LAM-3848","Working on new query - address + QC",5),
    ("2026-04-09","HSB-7","Handshake call",0.75),
    # 10-04
    ("2026-04-10","HSB-7","Sprint call",0.75),
    ("2026-04-10","DS-2344","Sending test emails to interns + update on sheet new candidates",1),
    ("2026-04-10","LAM-3848","Working on new query - address + QC",4.25),
    ("2026-04-10","LAM-3884","List of wfs using TBL_D_KEYCODE as lookup + Call with Kiran",1.5),
    ("2026-04-10","HSB-7","Handshake call",0.75),
    # 13-04
    ("2026-04-13","HSB-7","Sprint call",0.75),
    ("2026-04-13","DS-2344","Sending test emails to interns + update on sheet new candidates",1),
    ("2026-04-13","LAM-3848","Merging queries for step 2 + QC + incremental query",6.5),
    ("2026-04-13","HSB-7","Handshake call",0.75),
    # 14-04
    ("2026-04-14","HSB-7","Sprint call",0.75),
    ("2026-04-14","DS-2344","Sending test emails to interns + update on sheet new candidates",0.5),
    ("2026-04-14","DS-2344","Scheduling interview round 2",0.75),
    ("2026-04-14","LAM-3848","Incremental query changes based on max(load_date) in customer_profile table",2),
    ("2026-04-14","LAM-3881","Update tbl_f_mailing - lookup keycode table - via workflow + Call with Harish + Call with Kiran",4),
    ("2026-04-14","HSB-7","Handshake call",0.75),
    # 15-04
    ("2026-04-15","HSB-7","Sprint call",0.75),
    ("2026-04-15","LAM-3881","Update tbl_f_mailing - lookup keycode table - via workflow + Call with Harish",6),
    ("2026-04-15","DS-2344","Sending test emails to interns + update on sheet new candidates",1),
    ("2026-04-15","HSB-7","Handshake call",0.75),
    # 16-04
    ("2026-04-16","HSB-7","Sprint call",0.5),
    ("2026-04-16","LAM-3884","Go through keycode QC video and queries + Call with Kiran",4.5),
    ("2026-04-16","LAM-3881","Check in and submit to Harish",0.75),
    ("2026-04-16","DS-2344","Sending test emails to interns + update on sheet new candidates",1.5),
    ("2026-04-16","HSB-7","Handshake call",0.75),
    # 17-04
    ("2026-04-17","HSB-7","Sprint call",0.75),
    ("2026-04-17","LAM-3884","Keycode QC python script",5),
    ("2026-04-17","DS-2344","Update interns list based on test score",1.5),
    ("2026-04-17","HSB-7","Handshake call",0.75),
    # 20-04
    ("2026-04-20","HSB-7","Sprint call",0.5),
    ("2026-04-20","DS-2344","Update interns list based on test score + schedule all round 1 interviews",4.5),
    ("2026-04-20","HSB-7","GNR Call - Laptop and charger issue",2.5),
    ("2026-04-20","HSB-7","Handshake call",0.75),
    # 21-04
    ("2026-04-21","HSB-7","Sprint call",0.75),
    ("2026-04-21","DS-2344","Reschedule interview",0.5),
    ("2026-04-21","LAM-3884","Keycode QC python script + Call with Kiran + Call with Prateek + STG table QC python script",6.5),
    ("2026-04-21","HSB-7","Handshake call",0.75),
    # 22-04
    ("2026-04-22","HSB-7","Sprint call",0.75),
    ("2026-04-22","LAM-3884","STG table QC python script + testing + update Keycode QC query in script",6),
    ("2026-04-22","DS-2344","Call with Prateek + Call with Kiran",0.75),
    ("2026-04-22","DS-2344","Schedule round 2 interviews",0.75),
    ("2026-04-22","HSB-7","Handshake call",0.75),
    # 23-04 (Comp Off)
    ("2026-04-23","HSB-20","On Leave - Comp Off",8),
    # 24-04
    ("2026-04-24","HSB-7","Sprint call",0.75),
    ("2026-04-24","DS-2344","Schedule round 2 interviews + reschedule interview",0.5),
    ("2026-04-24","DS-2344","Sending test emails to interns + update on sheet new candidates",1.25),
    ("2026-04-24","DS-2401","Call with Harish + Call with Prateek - Fivetran onboarding",1),
    ("2026-04-24","DS-2401","Fivetran training",3.75),
    ("2026-04-24","HSB-7","Handshake call",0.75),
    # 27-04
    ("2026-04-27","HSB-7","Sprint call",0.75),
    ("2026-04-27","DS-2401","Fivetran setup",4.25),
    ("2026-04-27","DS-2344","Sending assignments to interns + update sheet",2),
    ("2026-04-27","DS-2344","Call with Tarun",0.25),
    ("2026-04-27","HSB-7","Handshake call",0.75),
    # 28-04, 29-04, 30-04 (Comp Off)
    ("2026-04-28","HSB-20","On Leave - Comp Off",8),
    ("2026-04-29","HSB-20","On Leave - Comp Off",8),
    ("2026-04-30","HSB-20","On Leave - Comp Off",8),
    # 01-05 (Holiday)
    ("2026-05-01","HSB-19","Holiday - International Worker's Day",8),
    # 04-05
    ("2026-05-04","HSB-7","Sprint call (25 April)",0.5),
    ("2026-05-04","DS-2344","Schedule round 2 interview + updates in sheet",0.75),
    ("2026-05-04","DS-2401","Fivetran training - youtube videos + understanding concepts and process",6.25),
    ("2026-05-04","DS-2344","VPN Connection issue - Inform Athish",0.75),
    ("2026-05-04","HSB-7","Handshake call",0.5),
    # 05-05
    ("2026-05-05","HSB-7","Sprint call (26 April)",0.75),
    ("2026-05-05","DS-2401","Fivetran training - hands on practice",5.5),
    ("2026-05-05","HSB-7","Check API expired - timesheet",0.75),
    ("2026-05-05","HSB-7","Handshake call",0.5),
]

print(f"-- Entries to insert: {len(RAW)} --")
by_day = defaultdict(float)
for d,_,_,h in RAW: by_day[d] += h
for d in sorted(by_day):
    count = sum(1 for r in RAW if r[0]==d)
    print(f"  {d}  {by_day[d]:.2f}h  ({count} entries)")
print(f"\nTotal hours: {sum(r[3] for r in RAW):.2f}")

if DRY_RUN:
    print("\nDRY RUN — pass --execute to apply.")
    conn.close(); sys.exit(0)

cur.execute("DELETE FROM timesheet_entries WHERE user_id=%s AND entry_date BETWEEN '2026-04-01' AND '2026-05-05'", (RASHMI_ID,))
print(f"\nDeleted {cur.rowcount} existing entries.")

INSERT_SQL = """INSERT INTO timesheet_entries
  (id,user_id,task_id,task_title,entry_date,work_description,hours,status,created_at)
  VALUES (%s,%s,%s,%s,%s,%s,%s,'pending',NOW())"""

for date_str,key,desc,hrs in RAW:
    cur.execute(INSERT_SQL,(str(uuid.uuid4())[:12],RASHMI_ID,key,TITLES.get(key,key),date_str,desc,hrs))

conn.commit()
print(f"Inserted {len(RAW)} entries for {RASHMI_NAME}.")
conn.close()
