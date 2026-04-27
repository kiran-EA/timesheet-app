'use client';

import { useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';

function AuthCallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setUser, setToken } = useAuthStore();

  useEffect(() => {
    const token      = searchParams.get('token');
    const user_id    = searchParams.get('user_id');
    const email      = searchParams.get('email');
    const name       = searchParams.get('name');
    const role       = searchParams.get('role');
    const avatar     = searchParams.get('avatar') ?? '';
    const manager_id = searchParams.get('manager_id') ?? null;

    if (!token || !user_id || !email || !name || !role) {
      router.replace('/login?error=google_failed');
      return;
    }

    setToken(token);
    setUser({
      id:         user_id,
      email,
      name,
      role:       role as 'admin' | 'teamlead' | 'resource',
      avatar,
      manager_id: manager_id || null,
    });

    router.replace('/timesheet');
  }, [searchParams, setToken, setUser, router]);

  return (
    <div className="min-h-screen flex items-center justify-center"
      style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)' }}>
      <div className="text-center space-y-4">
        <svg className="w-10 h-10 animate-spin mx-auto" style={{ color: '#3b82f6' }}
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
        </svg>
        <p className="text-sm font-medium" style={{ color: '#94a3b8' }}>Signing you in…</p>
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense>
      <AuthCallbackInner />
    </Suspense>
  );
}
