'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';

const API = process.env.NEXT_PUBLIC_API_URL;

const GOOGLE_ERRORS: Record<string, string> = {
  google_cancelled:   'Google sign-in was cancelled.',
  google_failed:      'Google sign-in failed. Please try again.',
  wrong_domain:       'Only @expressanalytics.net Google accounts are allowed.',
  no_account:         'No TimeSync account found for this Google account.',
  google_not_enabled: 'Google sign-in is not enabled for your account. Use email login.',
};

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setUser, setToken } = useAuthStore();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const err = searchParams.get('error');
    if (err) setError(GOOGLE_ERRORS[err] ?? 'Sign-in failed. Please try again.');
  }, [searchParams]);

  const handleSubmit = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    setError('');
    if (!email) { setError('Please enter your email address'); return; }
    if (!email.endsWith('@expressanalytics.net')) {
      setError('Only @expressanalytics.net accounts are allowed');
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch(`${API}/auth/login`, {
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
    <div className="min-h-[100dvh] grid lg:grid-cols-[1.05fr_1fr] bg-[#fafafa] text-zinc-900">

      {/* ── Left — brand canvas (desktop only). Asymmetric, intentional. */}
      <aside className="hidden lg:flex relative flex-col justify-between p-12 overflow-hidden bg-zinc-950 text-zinc-100">
        {/* Ambient mesh — single accent, no purple/blue gradient AI tell */}
        <div
          className="absolute inset-0 opacity-[0.55] animate-breathe pointer-events-none"
          style={{
            background:
              'radial-gradient(60% 50% at 75% 25%, rgba(37,99,235,0.35), transparent 60%),' +
              'radial-gradient(50% 40% at 20% 80%, rgba(29,78,216,0.22), transparent 60%)',
          }}
          aria-hidden
        />
        {/* Subtle grain — pointer-events-none, fixed-ish, performance-safe */}
        <div
          className="absolute inset-0 opacity-[0.04] pointer-events-none mix-blend-overlay"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
          }}
          aria-hidden
        />

        {/* Brand mark */}
        <div className="relative inline-flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.16)]"
            style={{ background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)' }}
            aria-hidden
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="8.5" />
              <path d="M12 8v4l2.5 1.5" />
            </svg>
          </div>
          <div className="leading-tight">
            <p className="text-[15px] font-semibold tracking-tight">TimeSync</p>
            <p className="text-[11px] font-medium text-zinc-400">Express Analytics</p>
          </div>
        </div>

        {/* Hero copy — concrete, anti-cliché */}
        <div className="relative max-w-[440px] space-y-6">
          <p className="text-[10px] font-semibold tracking-[0.18em] text-zinc-400 uppercase">
            Hours, accounted for
          </p>
          <h2 className="text-[44px] leading-[1.04] tracking-tight font-semibold">
            Track time the way<br />your team already works.
          </h2>
          <p className="text-[15px] leading-relaxed text-zinc-400 max-w-[44ch]">
            Tied directly to your Jira sprint. No double entry, no spreadsheet
            export, nothing to remember on Friday afternoon.
          </p>
        </div>

        {/* Footer — Serial Position: last item is what they'll remember */}
        <div className="relative flex items-center gap-3 text-[12px] text-zinc-500">
          <span className="inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse-soft" aria-hidden />
          <span>All systems operational</span>
          <span className="text-zinc-700">·</span>
          <span className="font-mono text-zinc-500">v2.4.1</span>
        </div>
      </aside>

      {/* ── Right — sign-in form */}
      <main className="flex items-center justify-center p-6 sm:p-10 lg:p-12">
        <div className="w-full max-w-[400px] space-y-8">

          {/* Mobile-only brand */}
          <div className="lg:hidden flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]"
              style={{ background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)' }}
              aria-hidden
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="8.5" />
                <path d="M12 8v4l2.5 1.5" />
              </svg>
            </div>
            <div className="leading-tight">
              <p className="text-[15px] font-semibold text-zinc-900 tracking-tight">TimeSync</p>
              <p className="text-[11px] font-medium text-zinc-500">Express Analytics</p>
            </div>
          </div>

          {/* Headline — control hierarchy with weight, not scale */}
          <div className="space-y-2 animate-rise-in">
            <p className="text-[10px] font-semibold tracking-[0.16em] text-zinc-500 uppercase">
              Sign in
            </p>
            <h1 className="text-[28px] leading-[1.15] tracking-tight font-semibold text-zinc-900">
              Welcome back.
            </h1>
            <p className="text-[14px] leading-relaxed text-zinc-500 max-w-[44ch]">
              Use your Express Analytics email to continue.
            </p>
          </div>

          {/* Google sign-in — Hick's Law: primary path, single-action */}
          <a
            href={`${API}/auth/google`}
            className="tactile flex items-center justify-center gap-3 w-full h-12 rounded-xl bg-white border border-zinc-200 text-[14px] font-medium text-zinc-800 hover:border-zinc-400 hover:bg-zinc-50 transition-colors duration-200"
          >
            <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" aria-hidden>
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </a>

          {/* Divider — Law of Common Region without a literal box */}
          <div className="flex items-center gap-3 text-[11px] text-zinc-400">
            <div className="flex-1 h-px bg-zinc-200" />
            <span className="font-medium tracking-wide uppercase">or with email</span>
            <div className="flex-1 h-px bg-zinc-200" />
          </div>

          {/* Form — labels above input (Form Pattern Rule 6) */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <label htmlFor="email" className="block text-[12px] font-medium text-zinc-700">
                Work email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="alex.kothari@expressanalytics.net"
                autoFocus
                autoComplete="email"
                disabled={isLoading}
                className="w-full h-12 px-4 rounded-xl text-[14px] text-zinc-900 placeholder-zinc-400 bg-white border border-zinc-200 transition-[border-color,box-shadow] duration-200 focus:outline-none focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-ring)] disabled:opacity-50"
              />
              <p className="text-[11.5px] text-zinc-500">
                Only <span className="font-mono text-zinc-700">@expressanalytics.net</span> accounts are allowed.
              </p>
            </div>

            {error && (
              <div
                role="alert"
                className="flex items-start gap-2.5 p-3 rounded-xl text-[12.5px] bg-[rgba(185,28,28,0.05)] border border-[rgba(185,28,28,0.18)] text-[#991b1b] animate-rise-in"
              >
                <svg className="w-4 h-4 mt-px shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="tactile w-full h-12 rounded-xl text-white text-[14px] font-semibold transition-[background-color,box-shadow] duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_1px_2px_rgba(9,9,11,0.06),inset_0_1px_0_rgba(255,255,255,0.18)]"
              style={{ background: isLoading ? '#2563eb' : '#1d4ed8' }}
            >
              {isLoading ? (
                <span className="inline-flex items-center justify-center gap-2.5">
                  <svg className="animate-[spin_0.7s_linear_infinite] w-4 h-4" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
                    <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                  </svg>
                  Signing in
                  <span className="inline-flex">
                    <span className="animate-pulse-soft">·</span>
                    <span className="animate-pulse-soft" style={{ animationDelay: '0.2s' }}>·</span>
                    <span className="animate-pulse-soft" style={{ animationDelay: '0.4s' }}>·</span>
                  </span>
                </span>
              ) : (
                'Sign in'
              )}
            </button>
          </form>

          <p className="text-[12.5px] text-zinc-500">
            Trouble signing in? Email{' '}
            <a
              href="mailto:admin@expressanalytics.net"
              className="font-medium text-[var(--accent)] underline-offset-4 hover:underline"
            >
              admin@expressanalytics.net
            </a>
          </p>
        </div>
      </main>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
