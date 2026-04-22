import time
import requests
from requests.auth import HTTPBasicAuth
from typing import Optional, Dict, Any
from app.core.config import settings

# Cache verify_user results for 30 min — skips 2 Jira calls on every repeat login
_verify_cache: dict = {}
_VERIFY_TTL = 1800

class JiraService:
    def __init__(self):
        self.base_url = f"https://{settings.JIRA_DOMAIN}/rest/api/3"
        self.auth     = HTTPBasicAuth(settings.JIRA_EMAIL, settings.JIRA_TOKEN)
        self.headers  = {"Accept": "application/json"}

    def get_active_sprint_keys(self, email: str) -> set:
        """
        Return set of issue keys that are currently in an active sprint for this user.
        Uses 'sprint in openSprints()' JQL — the only reliable way since tasks
        can be carried over from older sprints (their sprint field shows old sprint name).
        """
        try:
            jql = f'assignee = "{email}" AND sprint in openSprints() AND statusCategory != Done'
            r = requests.post(
                f"{self.base_url}/search/jql",
                auth=self.auth,
                headers={**self.headers, "Content-Type": "application/json"},
                json={"jql": jql, "maxResults": 100, "fields": ["summary"]},
                timeout=15,
            )
            if r.ok:
                return {i["key"] for i in r.json().get("issues", [])}
        except Exception as e:
            print(f"get_active_sprint_keys error: {e}")
        return set()
    
    def _domain_fallback(self, email: str) -> Optional[Dict[str, Any]]:
        """Allow any @expressanalytics.net email when Jira API is unavailable."""
        if email.lower().endswith('@expressanalytics.net'):
            name_part = email.split('@')[0].replace('.', ' ').title()
            account_id = 'local_' + email.split('@')[0].replace('.', '_')
            print(f"Jira API unavailable — using domain fallback for {email}")
            return {
                'account_id': account_id,
                'email': email,
                'display_name': name_part,
            }
        return None

    def verify_user(self, email: str) -> Optional[Dict[str, Any]]:
        # Return cached result if fresh — avoids 2 Jira API calls on every login
        key = email.lower()
        cached = _verify_cache.get(key)
        if cached and time.time() - cached['ts'] < _VERIFY_TTL:
            return cached['val']

        def _cache_and_return(result):
            if result:
                _verify_cache[key] = {'ts': time.time(), 'val': result}
            return result

        try:
            # 1. Check if this is the API credential user
            response = requests.get(
                f"{self.base_url}/myself", auth=self.auth, headers=self.headers, timeout=10
            )
            if response.ok:
                user_data = response.json()
                if user_data.get('emailAddress', '').lower() == email.lower():
                    return _cache_and_return({
                        'account_id': user_data['accountId'],
                        'email': user_data['emailAddress'],
                        'display_name': user_data['displayName'],
                    })

                # 2. Search for the user in Jira
                for query in [email, email.split('@')[0]]:
                    search_resp = requests.get(
                        f"{self.base_url}/user/search",
                        auth=self.auth,
                        headers=self.headers,
                        params={'query': query},
                        timeout=10,
                    )
                    if search_resp.ok:
                        for user in search_resp.json():
                            if user.get('emailAddress', '').lower() == email.lower():
                                return _cache_and_return({
                                    'account_id': user['accountId'],
                                    'email': user['emailAddress'],
                                    'display_name': user['displayName'],
                                })

            # 3. Jira API failed or user not found — fall back to domain check
            print(f"Jira lookup failed (status {response.status_code}) — using domain fallback")
            return _cache_and_return(self._domain_fallback(email))

        except Exception as e:
            print(f"Jira error: {e}")
            return _cache_and_return(self._domain_fallback(email))

    def check_connection(self) -> dict:
        """Return Jira connection status."""
        try:
            r = requests.get(f"{self.base_url}/myself", auth=self.auth, headers=self.headers, timeout=8)
            if r.ok:
                data = r.json()
                return {"connected": True, "user": data.get("emailAddress")}
            return {"connected": False, "error": f"Authentication failed (HTTP {r.status_code}). Regenerate your Jira API token."}
        except Exception as e:
            return {"connected": False, "error": str(e)}

    def get_user_tasks(self, email: str) -> list:
        """Fetch open Jira issues assigned to the user via /search/jql (POST)."""
        try:
            # Use email in JQL — works even when account_id is a fallback value
            jql = f'assignee = "{email}" AND statusCategory != Done ORDER BY updated DESC'
            payload = {
                "jql": jql,
                "maxResults": 50,
                "fields": [
                    "summary", "status", "assignee",
                    "customfield_10016",        # story points
                    "customfield_10014",        # epic link (legacy key)
                    "parent",                   # parent issue = epic in Jira Cloud v3
                    "timeoriginalestimate",
                    "timespent",
                    "customfield_10020",        # sprint
                ],
            }
            post_headers = {**self.headers, "Content-Type": "application/json"}
            response = requests.post(
                f"{self.base_url}/search/jql",
                auth=self.auth,
                headers=post_headers,
                json=payload,
                timeout=15,
            )
            if not response.ok:
                print(f"Jira /search/jql failed: {response.status_code} {response.text[:200]}")
                return []

            tasks = []
            for issue in response.json().get("issues", []):
                fields = issue.get("fields", {})
                summary = fields.get("summary", "")

                # SP from Jira fields only — customfield_10016 (classic) or customfield_10028 (next-gen)
                sp = fields.get("customfield_10016") or fields.get("customfield_10028")

                # Est. hours = SP * 8  (1 story point = 1 day = 8 hours)
                est_hours = round(sp * 8, 2) if sp is not None else None

                sprint_name = None
                sprints = fields.get("customfield_10020") or []
                if isinstance(sprints, list) and sprints:
                    sprint_name = sprints[-1].get("name")

                # Epic: prefer parent field (Jira Cloud v3), fall back to customfield_10014
                parent = fields.get("parent") or {}
                epic_key  = parent.get("key") or fields.get("customfield_10014")
                epic_name = (parent.get("fields") or {}).get("summary")

                assignee_field = fields.get("assignee") or {}
                assignee_name  = assignee_field.get("displayName")

                tasks.append({
                    "id":               issue["id"],
                    "key":              issue["key"],
                    "title":            summary,
                    "epic":             epic_key,
                    "epic_name":        epic_name,  # may be None if parent.fields.summary absent
                    "story_points":     sp,
                    "est_hours":        est_hours,
                    "logged_hours":     0,
                    "status":           fields.get("status", {}).get("name", "Unknown"),
                    "sprint":           sprint_name,
                    "is_active_sprint": False,  # filled in by the API
                    "assignee":         assignee_name,
                })

            # Batch-fetch epic names for any task whose name wasn't in the parent field
            missing_keys = list({t["epic"] for t in tasks if t["epic"] and not t["epic_name"]})
            if missing_keys:
                name_map = self.fetch_epic_names(missing_keys)
                for task in tasks:
                    if task["epic"] and not task["epic_name"]:
                        task["epic_name"] = name_map.get(task["epic"])

            return tasks
        except Exception as e:
            print(f"Jira get_user_tasks error: {e}")
            return []


    def get_all_project_tasks(self) -> list:
        """Fetch ALL open Jira issues in the project (no assignee filter) — for admin view."""
        try:
            jql = 'project = HSB AND statusCategory != Done ORDER BY updated DESC'
            payload = {
                "jql": jql,
                "maxResults": 200,
                "fields": [
                    "summary", "status", "assignee",
                    "customfield_10016",        # story points
                    "customfield_10014",        # epic link (legacy)
                    "parent",                   # parent issue = epic in Jira Cloud v3
                    "timeoriginalestimate",
                    "timespent",
                    "customfield_10020",        # sprint
                ],
            }
            post_headers = {**self.headers, "Content-Type": "application/json"}
            response = requests.post(
                f"{self.base_url}/search/jql",
                auth=self.auth,
                headers=post_headers,
                json=payload,
                timeout=15,
            )
            if not response.ok:
                print(f"Jira /search/jql (all-tasks) failed: {response.status_code} {response.text[:200]}")
                return []

            tasks = []
            for issue in response.json().get("issues", []):
                fields = issue.get("fields", {})
                summary = fields.get("summary", "")

                sp = fields.get("customfield_10016") or fields.get("customfield_10028")

                est_hours = round(sp * 8, 2) if sp is not None else None

                sprint_name = None
                sprints = fields.get("customfield_10020") or []
                if isinstance(sprints, list) and sprints:
                    sprint_name = sprints[-1].get("name")

                parent = fields.get("parent") or {}
                epic_key  = parent.get("key") or fields.get("customfield_10014")
                epic_name = (parent.get("fields") or {}).get("summary")

                assignee_field = fields.get("assignee") or {}
                assignee_name = assignee_field.get("displayName")

                tasks.append({
                    "id":               issue["id"],
                    "key":              issue["key"],
                    "title":            summary,
                    "epic":             epic_key,
                    "epic_name":        epic_name,
                    "story_points":     sp,
                    "est_hours":        est_hours,
                    "logged_hours":     0,
                    "status":           fields.get("status", {}).get("name", "Unknown"),
                    "sprint":           sprint_name,
                    "is_active_sprint": False,
                    "assignee":         assignee_name,
                })

            # Batch-fetch epic names for any task whose name wasn't in the parent field
            missing_keys = list({t["epic"] for t in tasks if t["epic"] and not t["epic_name"]})
            if missing_keys:
                name_map = self.fetch_epic_names(missing_keys)
                for task in tasks:
                    if task["epic"] and not task["epic_name"]:
                        task["epic_name"] = name_map.get(task["epic"])

            return tasks
        except Exception as e:
            print(f"Jira get_all_project_tasks error: {e}")
            return []

    def fetch_epic_names(self, epic_keys: list) -> dict:
        """Batch-fetch summaries for a list of epic keys. Returns {key: title}."""
        if not epic_keys:
            return {}
        try:
            jql = f'issueKey in ({", ".join(epic_keys)})'
            r = requests.post(
                f"{self.base_url}/search/jql",
                auth=self.auth,
                headers={**self.headers, "Content-Type": "application/json"},
                json={"jql": jql, "maxResults": len(epic_keys), "fields": ["summary"]},
                timeout=10,
            )
            if r.ok:
                return {i["key"]: i["fields"].get("summary", "") for i in r.json().get("issues", [])}
        except Exception as e:
            print(f"fetch_epic_names error: {e}")
        return {}

    def get_all_sprint_keys(self) -> set:
        """Return set of issue keys that are currently in an active sprint (project-wide)."""
        try:
            jql = 'project = HSB AND sprint in openSprints() AND statusCategory != Done'
            r = requests.post(
                f"{self.base_url}/search/jql",
                auth=self.auth,
                headers={**self.headers, "Content-Type": "application/json"},
                json={"jql": jql, "maxResults": 200, "fields": ["summary"]},
                timeout=15,
            )
            if r.ok:
                return {i["key"] for i in r.json().get("issues", [])}
        except Exception as e:
            print(f"get_all_sprint_keys error: {e}")
        return set()

    # ── Epic dashboard helpers ──────────────────────────────────────────────────

    def get_active_sprint_keys_for_tasks(self, task_keys: list) -> set:
        """Given a list of task keys, return those currently in an active sprint.
        Works across all projects (not just HSB)."""
        if not task_keys:
            return set()
        try:
            # Batch in 100s to avoid JQL length limits
            active = set()
            for i in range(0, len(task_keys), 100):
                batch = task_keys[i:i+100]
                keys_str = ", ".join(batch)
                jql = f'issueKey in ({keys_str}) AND sprint in openSprints()'
                r = requests.post(
                    f"{self.base_url}/search/jql",
                    auth=self.auth,
                    headers={**self.headers, "Content-Type": "application/json"},
                    json={"jql": jql, "maxResults": 200, "fields": ["summary"]},
                    timeout=15,
                )
                if r.ok:
                    active.update(i["key"] for i in r.json().get("issues", []))
            print(f"get_active_sprint_keys_for_tasks: {len(active)} active sprint tasks out of {len(task_keys)}")
            return active
        except Exception as e:
            print(f"get_active_sprint_keys_for_tasks error: {e}")
        return set()

    def get_all_open_epics(self) -> list:
        """Fetch all open Epic-type issues across all projects.
        Returns list of {key, name, status}."""
        try:
            r = requests.post(
                f"{self.base_url}/search/jql",
                auth=self.auth,
                headers={**self.headers, "Content-Type": "application/json"},
                json={
                    "jql": "issuetype = Epic AND statusCategory != Done ORDER BY updated DESC",
                    "maxResults": 100,
                    "fields": ["summary", "status", "assignee", "customfield_10020"],
                },
                timeout=15,
            )
            if r.ok:
                epics = []
                for issue in r.json().get("issues", []):
                    fields = issue.get("fields", {})
                    sprint_name = None
                    sprints = fields.get("customfield_10020") or []
                    if isinstance(sprints, list) and sprints:
                        sprint_name = sprints[-1].get("name")
                    epics.append({
                        "key":    issue["key"],
                        "name":   fields.get("summary", ""),
                        "status": fields.get("status", {}).get("name", "Unknown"),
                        "sprint": sprint_name,
                    })
                print(f"get_all_open_epics: found {len(epics)} epics")
                return epics
        except Exception as e:
            print(f"get_all_open_epics error: {e}")
        return []

    def get_tasks_for_epics(self, epic_keys: list) -> list:
        """Batch-fetch all child tasks for a list of epic keys.
        Works for both next-gen (parent = EPIC) and classic (Epic Link = EPIC) projects.
        Returns list of task dicts compatible with get_user_tasks output."""
        if not epic_keys:
            return []
        import re
        try:
            keys_str = ", ".join(epic_keys)
            # Use 'parent in (...)' which works for next-gen projects
            # and '"Epic Link" in (...)' for classic projects — combine with OR
            jql = (
                f'(parent in ({keys_str}) OR "Epic Link" in ({keys_str})) '
                f'AND statusCategory != Done ORDER BY updated DESC'
            )
            payload = {
                "jql": jql,
                "maxResults": 500,
                "fields": [
                    "summary", "status", "assignee",
                    "customfield_10016",   # story points
                    "customfield_10014",   # epic link (legacy)
                    "parent",
                    "timeoriginalestimate",
                    "timespent",
                    "customfield_10020",   # sprint
                ],
            }
            r = requests.post(
                f"{self.base_url}/search/jql",
                auth=self.auth,
                headers={**self.headers, "Content-Type": "application/json"},
                json=payload,
                timeout=20,
            )
            if not r.ok:
                print(f"get_tasks_for_epics failed: {r.status_code} {r.text[:200]}")
                return []

            tasks = []
            for issue in r.json().get("issues", []):
                fields  = issue.get("fields", {})
                summary = fields.get("summary", "")

                sp = fields.get("customfield_10016") or fields.get("customfield_10028")
                est_hours = round(sp * 8, 2) if sp is not None else None

                sprint_name = None
                sprints = fields.get("customfield_10020") or []
                if isinstance(sprints, list) and sprints:
                    sprint_name = sprints[-1].get("name")

                # Determine the epic key for this task
                parent = fields.get("parent") or {}
                parent_type = (parent.get("fields") or {}).get("issuetype", {}).get("name", "")
                if parent_type == "Epic":
                    epic_key  = parent.get("key")
                    epic_name = (parent.get("fields") or {}).get("summary")
                else:
                    # Classic: "Epic Link" field
                    epic_key  = fields.get("customfield_10014")
                    epic_name = None

                assignee_field = fields.get("assignee") or {}
                tasks.append({
                    "id":               issue["id"],
                    "key":              issue["key"],
                    "title":            summary,
                    "epic":             epic_key,
                    "epic_name":        epic_name,
                    "story_points":     sp,
                    "est_hours":        est_hours,
                    "logged_hours":     0,
                    "status":           fields.get("status", {}).get("name", "Unknown"),
                    "sprint":           sprint_name,
                    "is_active_sprint": False,
                    "assignee":         assignee_field.get("displayName"),
                })

            print(f"get_tasks_for_epics({len(epic_keys)} epics): found {len(tasks)} tasks")
            return tasks
        except Exception as e:
            print(f"get_tasks_for_epics error: {e}")
        return []

    def get_all_projects(self) -> dict:
        """Return {project_key: project_name} for all visible Jira projects."""
        try:
            r = requests.get(
                f"{self.base_url}/project/search",
                auth=self.auth,
                headers=self.headers,
                params={"maxResults": 100},
                timeout=15,
            )
            if r.ok:
                return {p["key"]: p["name"] for p in r.json().get("values", [])}
        except Exception as e:
            print(f"get_all_projects error: {e}")
        return {}


jira_service = JiraService()
