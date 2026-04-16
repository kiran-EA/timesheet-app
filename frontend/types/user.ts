export interface User {
  id: string;
  email: string;
  name: string;
  role: 'user' | 'approver' | 'admin';
  jira_account_id?: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface LoginPayload {
  email: string;
  password: string;
}
