export type UserRole = 'admin' | 'teamlead' | 'resource';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  avatar?: string;
  manager_id?: string | null;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: {
    user_id: string;
    email: string;
    full_name: string;
    role: UserRole;
    avatar?: string;
    manager_id?: string | null;
  };
}
