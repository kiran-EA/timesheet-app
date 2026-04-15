export interface User {
  user_id: string;
  email: string;
  full_name: string;
  role: string;
  avatar?: string;
}

export interface LoginRequest {
  email: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  user: User;
}
