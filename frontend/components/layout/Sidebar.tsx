'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { useTimesheetStore } from '@/store/timesheetStore';

export default function Sidebar() {
  const pathname = usePathname();
  const router   = useRouter();
  const user     = useAuthStore((s) => s.user);
  const token    = useAuthStore((s) => s.token) ?? '';
  const logout   = useAuthStore((s) => s.logout);

  const [pendingCount, setPendingCount] = useState(0);
  const isManager = user?.role === 'teamlead' || user?.role === 'admin';

  // Fetch pending count for managers
  useEffect(() => {
    if (!isManager || !token) return;
    const API = process.env.NEXT_PUBLIC_API_URL;
    fetch(`${API}/approvals/pending`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.ok ? r.json() : { count: 0 })
      .then((d) => setPendingCount(d.count ?? 0))
      .catch(() => {});
  }, [isManager, token]);

  const clearTimesheetCache = useTimesheetStore((s) => s.clearCache);
  const handleLogout = () => { logout(); clearTimesheetCache(); router.push('/login'); };

  const navItems = [
    {
      label: 'Timesheet',
      href: '/timesheet',
      icon: (
        <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9.5"/><polyline points="12 6.5 12 12 16 14"/>
        </svg>
      ),
    },
    {
      label: 'All My Entries',
      href: '/all-entries',
      icon: (
        <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
          <rect x="9" y="3" width="6" height="4" rx="1"/>
          <line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/>
        </svg>
      ),
    },
    ...(isManager ? [{
      label: 'Approvals',
      href: '/approvals',
      badge: pendingCount > 0 ? pendingCount : null,
      icon: (
        <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
        </svg>
      ),
    }] : []),
    {
      label: 'Calendar',
      href: '/calendar',
      icon: (
        <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2"/>
          <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
          <line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
      ),
    },
    {
      label: 'My Analytics',
      href: '/my-analytics',
      icon: (
        <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" rx="1"/>
          <rect x="14" y="3" width="7" height="7" rx="1"/>
          <rect x="3" y="14" width="7" height="7" rx="1"/>
          <rect x="14" y="14" width="7" height="7" rx="1"/>
        </svg>
      ),
    },
    ...(isManager ? [{
      label: 'Analytics',
      href: '/reports',
      icon: (
        <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="20" x2="12" y2="10"/>
          <line x1="18" y1="20" x2="18" y2="4"/>
          <line x1="6" y1="20" x2="6" y2="16"/>
        </svg>
      ),
    }] : []),
    ...(user?.role === 'admin' ? [{
      label: 'Insights',
      href: '/insights',
      icon: (
        <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/>
        </svg>
      ),
    }] : []),
    ...(user?.role === 'admin' ? [{
      label: 'User Management',
      href: '/user-management',
      icon: (
        <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
      ),
    }] : []),
  ];

  const initials = user?.avatar || user?.name?.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) || '··';

  return (
    <aside
      className="w-64 flex-shrink-0 flex flex-col h-screen sticky top-0 bg-[#fcfcfd] border-r border-zinc-200/80"
    >
      {/* ── Brand mark ─────────────────────────────────────────────── */}
      <div className="px-5 pt-5 pb-4 flex items-center gap-3">
        <div className="relative w-9 h-9 rounded-[10px] flex items-center justify-center text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_1px_2px_rgba(9,9,11,0.10)]"
             style={{ background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)' }}>
          {/* Custom monogram — clock + spark, replaces emoji */}
          <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="12" cy="12" r="8"/>
            <path d="M12 8.25v3.75l2.25 1.5"/>
          </svg>
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-[#fcfcfd] animate-pulse-soft" aria-hidden />
        </div>
        <div className="leading-tight">
          <h1 className="text-[15px] font-semibold text-zinc-900 tracking-tight">TimeSync</h1>
          <p className="text-[11px] font-medium text-zinc-500">Express Analytics</p>
        </div>
      </div>

      {/* ── Section label ──────────────────────────────────────────── */}
      <div className="px-5 pt-2 pb-1.5">
        <p className="text-[10px] font-semibold tracking-[0.12em] text-zinc-400 uppercase">Workspace</p>
      </div>

      {/* ── Nav (Law of Common Region — items breathe in single area) */}
      <nav className="flex-1 px-3 pb-3 overflow-y-auto stagger">
        {navItems.map((item, i) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{ ['--i' as string]: String(i) }}
              className={
                'group relative flex items-center gap-3 px-3 h-10 rounded-[10px] text-[13px] font-medium ' +
                'transition-[color,background-color] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] ' +
                (isActive
                  ? 'text-zinc-900 bg-white shadow-[0_1px_2px_rgba(9,9,11,0.04),0_0_0_1px_rgba(228,228,231,0.9)]'
                  : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100/70')
              }
            >
              {/* Active rail — Von Restorff: visually isolate the chosen */}
              <span
                className={
                  'absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-r-full bg-[var(--accent)] ' +
                  'transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ' +
                  (isActive ? 'h-5 opacity-100' : 'h-0 opacity-0')
                }
                aria-hidden
              />
              <span
                className={
                  'flex items-center justify-center transition-colors duration-200 ' +
                  (isActive ? 'text-[var(--accent)]' : 'text-zinc-400 group-hover:text-zinc-700')
                }
              >
                {item.icon}
              </span>
              <span className="flex-1 truncate">{item.label}</span>
              {'badge' in item && item.badge ? (
                <span className="inline-flex items-center justify-center min-w-[20px] h-[20px] px-1.5 rounded-full text-[10px] font-semibold tabular-nums text-white bg-[#b91c1c]">
                  {item.badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      {/* ── User card (Peak-End Rule — last touch should feel premium) */}
      <div className="p-3 border-t border-zinc-200/70">
        <div className="group flex items-center gap-3 p-2 rounded-[12px] bg-white border border-zinc-200/70 transition-shadow duration-200 hover:shadow-[0_4px_12px_-4px_rgba(9,9,11,0.08)]">
          <div className="relative w-9 h-9 rounded-[9px] flex items-center justify-center text-[12px] font-semibold flex-shrink-0 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]"
               style={{ background: 'linear-gradient(135deg, #18181b 0%, #3f3f46 100%)' }}>
            <span className="tracking-tight">{initials}</span>
            <span className="absolute -bottom-0.5 -right-0.5 w-[10px] h-[10px] rounded-full bg-emerald-500 ring-2 ring-white animate-pulse-soft" aria-hidden />
          </div>
          <div className="flex-1 min-w-0 leading-tight">
            <p className="text-[13px] font-medium text-zinc-900 truncate">{user?.name || 'User'}</p>
            <p className="text-[10.5px] font-semibold tracking-[0.06em] text-zinc-500 uppercase">
              {user?.role || 'resource'}
            </p>
          </div>
          <button
            onClick={handleLogout}
            title="Sign out"
            aria-label="Sign out"
            className="tactile flex-shrink-0 w-8 h-8 rounded-[8px] flex items-center justify-center text-zinc-400 hover:text-[#b91c1c] hover:bg-[rgba(185,28,28,0.06)] transition-colors duration-150"
          >
            <svg className="w-[16px] h-[16px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </div>
      </div>
    </aside>
  );
}
