"""
Backfill the `epic` column in timesheet_entries for rows where epic IS NULL.

Approach:
  1. Fetch all distinct task_ids with epic = NULL from the DB.
  2. Batch-query Jira (100 issues per call) via search/jql to resolve epics.
  3. For any still unresolved, fall back to individual issue lookup
     (handles sub-tasks, tasks in closed epics, or LAM tasks with unusual structure).
  4. UPDATE timesheet_entries SET epic = <key> WHERE task_id = <task_id>
     AND (epic IS NULL OR epic = '').

Run:
  python backfill_epic_column.py            # dry run  (no DB writes)
  python backfill_epic_column.py --execute  # live run (updates DB)
"""

import sys
import os
import requests
from requests.auth import HTTPBasicAuth

sys.path.insert(0, os.path.dirname(__file__))
from app.core.config import settings
from app.db.database import execute_query

DRY_RUN = "--execute" not in sys.argv

JIRA_URL     = f"https://{settings.JIRA_DOMAIN}"
JIRA_AUTH    = HTTPBasicAuth(settings.JIRA_EMAIL, settings.JIRA_TOKEN)
JIRA_HEADERS = {"Accept": "application/json"}
BATCH_SIZE   = 50


# ── helpers ───────────────────────────────────────────────────────────────────

def _epic_from_fields(fields: dict) -> str | None:
    """Extract epic key from a Jira issue fields dict.
    Handles next-gen (parent field) and classic (customfield_10014) projects.
    Also walks up one level for sub-tasks whose direct parent is a Story."""
    parent = fields.get("parent") or {}
    parent_type = (parent.get("fields") or {}).get("issuetype", {}).get("name", "")

    # Direct parent is Epic -> use it
    if parent_type == "Epic":
        return parent.get("key")

    # Direct parent is not Epic but has a key (Story/Task level) -> its parent
    # is the epic. We get the grandparent key from customfield_10014 or accept
    # the story's key as a fallback (it IS the parent, even if not labeled Epic).
    epic_link = fields.get("customfield_10014")
    if epic_link:
        return epic_link

    # For next-gen: any non-epic parent still gives us the parent key
    if parent.get("key"):
        return parent["key"]

    return None


def batch_fetch(keys: list[str]) -> dict[str, str]:
    """Bulk-search up to BATCH_SIZE issues and return {key: epic_key}."""
    jql = "issue in (" + ", ".join(keys) + ")"
    resp = requests.get(
        f"{JIRA_URL}/rest/api/3/search/jql",
        auth=JIRA_AUTH,
        headers=JIRA_HEADERS,
        params={
            "jql":        jql,
            "maxResults": len(keys),
            "fields":     "parent,customfield_10014,issuetype",
        },
        timeout=30,
    )
    if not resp.ok:
        print(f"  [warn] Jira search failed ({resp.status_code}): {resp.text[:200]}")
        return {}

    result = {}
    for issue in resp.json().get("issues", []):
        epic_key = _epic_from_fields(issue.get("fields") or {})
        if epic_key:
            result[issue["key"]] = epic_key
    return result


def single_fetch(key: str) -> str | None:
    """Look up a single issue's epic via the individual issue API."""
    resp = requests.get(
        f"{JIRA_URL}/rest/api/3/issue/{key}",
        auth=JIRA_AUTH,
        headers=JIRA_HEADERS,
        params={"fields": "parent,customfield_10014,issuetype"},
        timeout=15,
    )
    if not resp.ok:
        return None
    return _epic_from_fields(resp.json().get("fields") or {})


# ── Step 1: find task_ids with missing epic ───────────────────────────────────

rows = execute_query(
    "SELECT DISTINCT task_id FROM timesheet_entries "
    "WHERE epic IS NULL OR epic = '' ORDER BY task_id",
    fetch_all=True,
) or []

task_ids = [r["task_id"] for r in rows]
print(f"Found {len(task_ids)} distinct task_ids with missing epic.\n")

if not task_ids:
    print("Nothing to do.")
    sys.exit(0)


# ── Step 2: batch Jira lookup ─────────────────────────────────────────────────

task_to_epic: dict[str, str] = {}

for i in range(0, len(task_ids), BATCH_SIZE):
    batch = task_ids[i : i + BATCH_SIZE]
    print(f"  Batch {i+1}-{i+len(batch)}: querying Jira ...", end=" ", flush=True)
    mapping = batch_fetch(batch)
    task_to_epic.update(mapping)
    print(f"{len(mapping)} resolved.")


# ── Step 3: individual fallback for anything still missing ───────────────────

still_missing = [t for t in task_ids if t not in task_to_epic]
if still_missing:
    print(f"\n  Fallback: individually querying {len(still_missing)} unresolved tasks ...")
    for key in still_missing:
        epic = single_fetch(key)
        if epic:
            task_to_epic[key] = epic
            print(f"    {key} -> {epic}")
        else:
            print(f"    {key} -> (no epic found — skipping)")


# ── Summary ───────────────────────────────────────────────────────────────────

resolved   = {k: v for k, v in task_to_epic.items() if v}
unresolved = [t for t in task_ids if t not in resolved]

print(f"\nResolved: {len(resolved)}  |  No epic in Jira: {len(unresolved)}")
if unresolved:
    print(f"  Skipped: {unresolved}")


# ── Step 4: update DB ─────────────────────────────────────────────────────────

if DRY_RUN:
    print("\n[DRY RUN] Would update:")
    total = 0
    for task_id, epic_key in sorted(resolved.items()):
        row = execute_query(
            "SELECT COUNT(*) AS n FROM timesheet_entries "
            "WHERE task_id = %s AND (epic IS NULL OR epic = '')",
            (task_id,), fetch_one=True,
        )
        n = row["n"] if row else 0
        total += n
        print(f"  {task_id} -> {epic_key}  ({n} DB rows)")
    print(f"\nTotal: {total} rows would be updated. Re-run with --execute to apply.")
else:
    total = 0
    for task_id, epic_key in sorted(resolved.items()):
        execute_query(
            "UPDATE timesheet_entries SET epic = %s "
            "WHERE task_id = %s AND (epic IS NULL OR epic = '')",
            (epic_key, task_id),
            fetch_all=False,
        )
        row = execute_query(
            "SELECT COUNT(*) AS n FROM timesheet_entries "
            "WHERE task_id = %s AND epic = %s",
            (task_id, epic_key), fetch_one=True,
        )
        n = row["n"] if row else 0
        total += n
        print(f"  Updated {task_id} -> {epic_key}  ({n} rows)")
    print(f"\nDone. epic column backfilled for {total} rows.")
