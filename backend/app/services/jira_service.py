import requests
import logging
from requests.auth import HTTPBasicAuth
from typing import Optional, Dict, Any
from app.core.config import settings

logger = logging.getLogger(__name__)

class JiraService:
    def __init__(self):
        self.base_url = f"https://{settings.JIRA_DOMAIN}/rest/api/3"
        self.auth = HTTPBasicAuth(settings.JIRA_EMAIL, settings.JIRA_TOKEN)
        self.headers = {"Accept": "application/json"}
        logger.info(f"🔗 JiraService initialized with domain: {settings.JIRA_DOMAIN}")
    
    def verify_user(self, email: str) -> Optional[Dict[str, Any]]:
        try:
            logger.info(f"🔍 Verifying Jira user: {email}")
            
            response = requests.get(
                f"{self.base_url}/myself",
                auth=self.auth,
                headers=self.headers,
                timeout=10
            )
            response.raise_for_status()
            user_data = response.json()
            logger.info(f"✅ Got '/myself' data from Jira: {user_data.get('displayName')}")
            
            if user_data.get('emailAddress', '').lower() == email.lower():
                logger.info(f"✅ User matched from '/myself' endpoint: {email}")
                return {
                    'account_id': user_data['accountId'],
                    'email': user_data['emailAddress'],
                    'display_name': user_data['displayName']
                }
            
            logger.info(f"🔎 Searching Jira for user matching: {email}")
            search_response = requests.get(
                f"{self.base_url}/user/search",
                auth=self.auth,
                headers=self.headers,
                params={'query': email},
                timeout=10
            )
            search_response.raise_for_status()
            users = search_response.json()
            logger.info(f"📋 Found {len(users)} users in Jira search")
            
            for user in users:
                if user.get('emailAddress', '').lower() == email.lower():
                    logger.info(f"✅ User matched from search: {email}")
                    return {
                        'account_id': user['accountId'],
                        'email': user['emailAddress'],
                        'display_name': user['displayName']
                    }
            logger.warning(f"❌ No Jira user found with email: {email}")
            return None
        except Exception as e:
            logger.error(f"❌ Jira verification error: {e}", exc_info=True)
            return None
    
    def get_user_issues(self, account_id: str) -> list:
        """Fetch all issues assigned to a user"""
        try:
            logger.info(f"📌 Fetching issues for account_id: {account_id}")

            # JQL query to get issues assigned to the user
            jql = f"assignee = '{account_id}' AND status != Done ORDER BY updated DESC"

            # /search was removed (HTTP 410); use the new /search/jql POST endpoint
            response = requests.post(
                f"{self.base_url}/search/jql",
                auth=self.auth,
                headers={**self.headers, "Content-Type": "application/json"},
                json={
                    'jql': jql,
                    'maxResults': 50,
                    'fields': ['key', 'summary', 'description', 'status', 'priority', 'assignee', 'created', 'updated', 'duedate', 'timeestimate', 'timespent']
                },
                timeout=10
            )
            response.raise_for_status()
            data = response.json()
            issues = data.get('issues', [])
            logger.info(f"✅ Found {len(issues)} issues assigned to user")
            
            formatted_issues = []
            for issue in issues:
                fields = issue.get('fields', {})
                formatted_issues.append({
                    'key': issue['key'],
                    'id': issue['id'],
                    'summary': fields.get('summary', ''),
                    'description': fields.get('description', ''),
                    'status': fields.get('status', {}).get('name', ''),
                    'priority': fields.get('priority', {}).get('name', ''),
                    'assignee': fields.get('assignee', {}).get('displayName', ''),
                    'created': fields.get('created', ''),
                    'updated': fields.get('updated', ''),
                    'duedate': fields.get('duedate', ''),
                    'timeestimate': fields.get('timeestimate', 0),
                    'timespent': fields.get('timespent', 0)
                })
            
            return formatted_issues
        except Exception as e:
            logger.error(f"❌ Error fetching Jira issues: {e}", exc_info=True)
            return []
    
    def get_issue_details(self, issue_key: str) -> Optional[Dict[str, Any]]:
        """Fetch detailed information for a specific issue"""
        try:
            logger.info(f"📖 Fetching details for issue: {issue_key}")
            
            response = requests.get(
                f"{self.base_url}/issue/{issue_key}",
                auth=self.auth,
                headers=self.headers,
                timeout=10
            )
            response.raise_for_status()
            issue = response.json()
            logger.info(f"✅ Got details for issue: {issue_key}")
            
            fields = issue.get('fields', {})
            return {
                'key': issue['key'],
                'id': issue['id'],
                'summary': fields.get('summary', ''),
                'description': fields.get('description', ''),
                'status': fields.get('status', {}).get('name', ''),
                'priority': fields.get('priority', {}).get('name', ''),
                'assignee': fields.get('assignee', {}).get('displayName', ''),
                'created': fields.get('created', ''),
                'updated': fields.get('updated', ''),
                'duedate': fields.get('duedate', ''),
                'timeestimate': fields.get('timeestimate', 0),
                'timespent': fields.get('timespent', 0),
                'comments': [
                    {
                        'author': comment.get('author', {}).get('displayName', ''),
                        'body': comment.get('body', ''),
                        'created': comment.get('created', '')
                    }
                    for comment in fields.get('comment', {}).get('comments', [])
                ]
            }
        except Exception as e:
            logger.error(f"❌ Error fetching issue details: {e}", exc_info=True)
            return None

jira_service = JiraService()
