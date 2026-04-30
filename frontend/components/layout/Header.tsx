'use client';

import { useAuthStore } from '@/store/authStore';
import Link from 'next/link';
import Button from '@/components/ui/Button';

export default function Header() {
  const { user, logout } = useAuthStore();

  const handleLogout = () => {
    logout();
    window.location.href = '/login';
  };

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200/70 bg-white/80 backdrop-blur-md">
      <div className="flex items-center justify-between px-6 h-14">
        <Link
          href="/"
          className="group inline-flex items-center gap-2.5 text-zinc-900 font-semibold tracking-tight"
        >
          <span
            className="inline-flex w-7 h-7 items-center justify-center rounded-lg text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]"
            style={{ background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)' }}
            aria-hidden
          >
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="8" />
              <path d="M12 8.5v3.5l2.25 1.5" />
            </svg>
          </span>
          <span className="text-[15px]">TimeSync</span>
        </Link>

        <div className="flex items-center gap-3">
          {user && (
            <>
              <div className="hidden sm:flex items-center gap-2.5 text-[13px] text-zinc-600">
                <span className="relative inline-flex h-1.5 w-1.5">
                  <span className="absolute inset-0 rounded-full bg-emerald-500 opacity-60 animate-pulse-soft" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                </span>
                <span className="font-medium text-zinc-900 tracking-tight">{user.name}</span>
                <span className="text-zinc-300">/</span>
                <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-zinc-500">
                  {user.role}
                </span>
              </div>
              <Button variant="outline" size="sm" onClick={handleLogout}>
                Sign out
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
