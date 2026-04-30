'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
    if (token) {
      router.push('/timesheet');
    } else {
      router.push('/login');
    }
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-[100dvh] bg-[#fafafa]">
      <div className="flex items-center gap-3 text-[13px] text-zinc-500">
        <span
          className="inline-flex w-7 h-7 items-center justify-center rounded-lg text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] animate-breathe"
          style={{ background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)' }}
          aria-hidden
        >
          <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="8" />
            <path d="M12 8.5v3.5l2.25 1.5" />
          </svg>
        </span>
        <span className="font-medium tracking-tight text-zinc-900">TimeSync</span>
        <span className="text-zinc-300">·</span>
        <span>Loading workspace</span>
        <span className="inline-flex tabular-nums">
          <span className="animate-pulse-soft">·</span>
          <span className="animate-pulse-soft" style={{ animationDelay: '0.2s' }}>·</span>
          <span className="animate-pulse-soft" style={{ animationDelay: '0.4s' }}>·</span>
        </span>
      </div>
    </div>
  );
}
