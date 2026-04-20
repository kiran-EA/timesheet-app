'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';

export default function LoginPage() {
  const router = useRouter();
  const { setUser, setToken } = useAuthStore();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    setError('');

    if (!email) {
      setError('Please enter your email address');
      return;
    }

    if (!email.endsWith('@expressanalytics.net')) {
      setError('Only @expressanalytics.net accounts are allowed');
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.detail || 'Sign in failed. Make sure your email is registered in Jira.');
        setIsLoading(false);
        return;
      }

      const data = await res.json();
      setToken(data.access_token);
      setUser({
        id:         data.user.user_id,
        email:      data.user.email,
        name:       data.user.full_name,
        role:       data.user.role,
        avatar:     data.user.avatar,
        manager_id: data.user.manager_id ?? null,
      });
      router.push('/timesheet');
    } catch {
      setError('Unable to connect to server. Make sure the backend is running.');
      setIsLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)' }}
    >
      <div className="w-full max-w-[420px]">
        {/* Logo */}
        <div className="text-center mb-10">
          <div
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4 text-3xl"
            style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)' }}
          >
            📊
          </div>
          <h1 className="text-3xl font-bold text-white mb-1">TimeSync</h1>
          <p style={{ color: '#94a3b8' }} className="text-sm">Express Analytics</p>
        </div>

        {/* Card */}
        <div
          className="rounded-2xl p-10"
          style={{
            background: 'rgba(30, 41, 59, 0.5)',
            backdropFilter: 'blur(10px)',
            border: '1px solid #334155',
          }}
        >
          <h2 className="text-2xl font-semibold text-white mb-6">Sign in with Jira</h2>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: '#cbd5e1' }}>
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your.name@expressanalytics.net"
                autoFocus
                autoComplete="email"
                disabled={isLoading}
                className="w-full px-4 py-3 rounded-lg text-white placeholder-slate-500 text-sm focus:outline-none transition"
                style={{
                  background: 'rgba(15, 23, 42, 0.5)',
                  border: '1px solid #475569',
                  color: '#ffffff',
                }}
                onFocus={(e) => (e.target.style.borderColor = '#3b82f6')}
                onBlur={(e) => (e.target.style.borderColor = '#475569')}
              />
            </div>

            {error && (
              <div
                className="flex items-start gap-3 p-3 rounded-lg text-sm"
                style={{
                  background: 'rgba(239,68,68,0.1)',
                  border: '1px solid rgba(239,68,68,0.3)',
                  color: '#fca5a5',
                }}
              >
                <svg className="w-4 h-4 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3.5 rounded-lg text-white font-semibold text-base transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)' }}
              onMouseEnter={(e) => !isLoading && ((e.target as HTMLElement).style.opacity = '0.9')}
              onMouseLeave={(e) => ((e.target as HTMLElement).style.opacity = '1')}
            >
              {isLoading ? (
                <span className="inline-flex items-center justify-center gap-2">
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Signing in…
                </span>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-sm" style={{ color: '#94a3b8' }}>
            Having trouble? Contact{' '}
            <a href="mailto:admin@expressanalytics.net" style={{ color: '#60a5fa' }}>
              admin
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
