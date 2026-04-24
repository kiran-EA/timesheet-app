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
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
        </svg>
      ),
    },
    {
      label: 'All My Entries',
      href: '/all-entries',
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
          <rect x="9" y="3" width="6" height="4" rx="1"/>
          <line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/>
        </svg>
      ),
    },
    // Approvals only for teamlead/admin
    ...(isManager ? [{
      label: 'Approvals',
      href: '/approvals',
      badge: pendingCount > 0 ? pendingCount : null,
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
        </svg>
      ),
    }] : []),
    {
      label: 'Calendar',
      href: '/calendar',
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="4" width="18" height="18" rx="2"/>
          <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
          <line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
      ),
    },
    // Analytics only for teamlead/admin
    ...(isManager ? [{
      label: 'Analytics',
      href: '/reports',
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="12" y1="20" x2="12" y2="10"/>
          <line x1="18" y1="20" x2="18" y2="4"/>
          <line x1="6" y1="20" x2="6" y2="16"/>
        </svg>
      ),
    }] : []),
    // Dashboard Insights only for admin
    ...(user?.role === 'admin' ? [{
      label: 'Insights',
      href: '/insights',
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/>
        </svg>
      ),
    }] : []),
    // User Management only for admin
    ...(user?.role === 'admin' ? [{
      label: 'User Management',
      href: '/user-management',
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
      ),
    }] : []),
  ];

  const initials = user?.avatar || user?.name?.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) || '??';

  return (
    <aside className="w-64 flex-shrink-0 flex flex-col h-screen sticky top-0"
      style={{ background: 'linear-gradient(180deg, #12121a 0%, #0a0a0f 100%)', borderRight: '1px solid #2a2a3a' }}>

      {/* Logo */}
      <div className="p-5 flex items-center gap-3" style={{ borderBottom: '1px solid #2a2a3a' }}>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)' }}>
          📊
        </div>
        <div>
          <h1 className="text-xl font-bold leading-none"
            style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            TimeSync
          </h1>
          <p className="text-xs mt-0.5" style={{ color: '#64748b' }}>Express Analytics</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link key={item.href} href={item.href}
              className="flex items-center gap-3 px-4 py-3 rounded-lg font-medium text-sm transition-all"
              style={{
                color: isActive ? '#ffffff' : '#94a3b8',
                background: isActive ? 'linear-gradient(135deg, rgba(59,130,246,0.15), rgba(139,92,246,0.15))' : 'transparent',
              }}>
              {item.icon}
              <span className="flex-1">{item.label}</span>
              {'badge' in item && item.badge ? (
                <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white" style={{ background: '#ef4444' }}>
                  {item.badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      {/* User */}
      <div className="p-4" style={{ borderTop: '1px solid #2a2a3a' }}>
        <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: '#16161f', border: '1px solid #2a2a3a' }}>
          <div className="w-10 h-10 rounded-lg flex items-center justify-center text-sm font-semibold flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #10b981, #14b8a6)' }}>
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{user?.name || 'User'}</p>
            <p className="text-xs font-semibold uppercase" style={{ color: '#64748b' }}>
              {user?.role || 'resource'}
            </p>
          </div>
          <button onClick={handleLogout} title="Logout"
            className="flex-shrink-0 p-1.5 rounded-lg transition-colors"
            style={{ color: '#64748b' }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = '#ef4444')}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = '#64748b')}>
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </div>
      </div>
    </aside>
  );
}
