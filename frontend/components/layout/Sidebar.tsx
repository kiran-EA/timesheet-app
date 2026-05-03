'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { useTimesheetStore } from '@/store/timesheetStore';

const API = process.env.NEXT_PUBLIC_API_URL;

function JiraModal({ token, onClose }: { token: string; onClose: () => void }) {
  const [hasToken,    setHasToken]    = useState(false);
  const [masked,      setMasked]      = useState('');
  const [expiresAt,   setExpiresAt]   = useState('');
  const [newToken,    setNewToken]    = useState('');
  const [showToken,   setShowToken]   = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [deleting,    setDeleting]    = useState(false);
  const [msg,         setMsg]         = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [loading,     setLoading]     = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`${API}/users/me/jira-token`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (d) { setHasToken(d.has_token); setMasked(d.masked_token); setExpiresAt(d.jira_token_expires_at ?? ''); }
      })
      .finally(() => setLoading(false));
  }, [token]);

  const isExpired = expiresAt && new Date(expiresAt) < new Date();

  const handleSave = async () => {
    if (!newToken.trim()) { setMsg({ type: 'err', text: 'Please enter your JIRA API token.' }); return; }
    setSaving(true); setMsg(null);
    const res = await fetch(`${API}/users/me/jira-token`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ jira_token: newToken.trim(), jira_token_expires_at: expiresAt || null }),
    });
    setSaving(false);
    if (res.ok) {
      setHasToken(true);
      setMasked('••••••••••••' + newToken.trim().slice(-4));
      setNewToken('');
      setMsg({ type: 'ok', text: 'JIRA token saved successfully.' });
    } else {
      setMsg({ type: 'err', text: 'Failed to save token. Please try again.' });
    }
  };

  const handleDelete = async () => {
    setDeleting(true); setMsg(null);
    await fetch(`${API}/users/me/jira-token`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
    });
    setDeleting(false);
    setHasToken(false); setMasked(''); setExpiresAt(''); setNewToken('');
    setMsg({ type: 'ok', text: 'JIRA token removed.' });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md rounded-2xl shadow-2xl flex flex-col"
        style={{ background: '#fff', border: '1px solid #e4e4e7' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg,#0052CC,#0747A6)' }}>
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="white" aria-hidden>
                <path d="M11.53 2.3L6.1 7.74a.72.72 0 0 0 0 1.01l3.07 3.08 2.36-2.37a1.44 1.44 0 0 1 2.04 0l2.36 2.37 3.07-3.08a.72.72 0 0 0 0-1.01L13.47 2.3a1.37 1.37 0 0 0-1.94 0zM12 12.9l-2.36 2.37-3.07 3.07a1.37 1.37 0 0 0 1.94 1.94l5.43-5.43a.72.72 0 0 0 0-1.01L13.07 12.9a.72.72 0 0 0-1.07 0z"/>
              </svg>
            </div>
            <div>
              <h3 className="text-[15px] font-semibold text-zinc-900">JIRA Integration</h3>
              <p className="text-[11px] text-zinc-500">expressanalytics.atlassian.net</p>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {loading ? (
            <div className="flex items-center justify-center py-6 text-zinc-400 text-sm">Loading…</div>
          ) : (<>

            {/* Status pill */}
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${hasToken ? (isExpired ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700') : 'bg-zinc-100 text-zinc-500'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${hasToken ? (isExpired ? 'bg-amber-400' : 'bg-emerald-500') : 'bg-zinc-400'}`} />
                {hasToken ? (isExpired ? 'Token expired' : 'Connected') : 'Not connected'}
              </span>
              {hasToken && masked && (
                <span className="text-xs text-zinc-400 font-mono">{masked}</span>
              )}
            </div>

            {isExpired && (
              <div className="px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-2"
                style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', color: '#b45309' }}>
                <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
                Token expired on {new Date(expiresAt).toLocaleDateString()}. Worklogs will not sync until you update it.
              </div>
            )}

            {/* New token input */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-600 uppercase tracking-wide">
                {hasToken ? 'Update API Token' : 'API Token'}
              </label>
              <div className="relative">
                <input
                  ref={inputRef}
                  type={showToken ? 'text' : 'password'}
                  value={newToken}
                  onChange={(e) => setNewToken(e.target.value)}
                  placeholder={hasToken ? 'Paste new token to replace…' : 'Paste your Atlassian API token…'}
                  className="w-full px-3 py-2.5 pr-10 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                  style={{ background: '#f4f4f5', border: '1px solid #e4e4e7', color: '#18181b' }}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
                />
                <button type="button" onClick={() => setShowToken((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 transition-colors">
                  {showToken
                    ? <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    : <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  }
                </button>
              </div>
              <p className="text-[11px] text-zinc-400">
                Get your token at{' '}
                <a href="https://id.atlassian.com/manage-profile/security/api-tokens" target="_blank" rel="noopener noreferrer"
                  className="text-blue-500 hover:underline">id.atlassian.com → API tokens</a>
              </p>
            </div>

            {/* Expiry date */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-600 uppercase tracking-wide">
                Token Expiry Date <span className="font-normal normal-case tracking-normal text-zinc-400">(reminder only)</span>
              </label>
              <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                style={{ background: '#f4f4f5', border: '1px solid #e4e4e7', color: '#18181b', colorScheme: 'light' }}
              />
            </div>

            {/* Feedback message */}
            {msg && (
              <div className="px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-2"
                style={{
                  background: msg.type === 'ok' ? 'rgba(16,185,129,0.08)' : 'rgba(185,28,28,0.08)',
                  border: `1px solid ${msg.type === 'ok' ? 'rgba(16,185,129,0.3)' : 'rgba(185,28,28,0.3)'}`,
                  color: msg.type === 'ok' ? '#059669' : '#b91c1c',
                }}>
                {msg.text}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-2 pt-1">
              <button onClick={handleSave} disabled={saving || !newToken.trim()}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white transition-opacity disabled:opacity-40 hover:opacity-90"
                style={{ background: 'linear-gradient(135deg,#0052CC,#0747A6)' }}>
                {saving ? 'Saving…' : hasToken ? 'Update Token' : 'Save Token'}
              </button>
              {hasToken && (
                <button onClick={handleDelete} disabled={deleting}
                  className="px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-40"
                  style={{ background: 'rgba(185,28,28,0.07)', color: '#b91c1c', border: '1px solid rgba(185,28,28,0.2)' }}>
                  {deleting ? '…' : 'Remove'}
                </button>
              )}
            </div>
          </>)}
        </div>
      </div>
    </div>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const router   = useRouter();
  const user     = useAuthStore((s) => s.user);
  const token    = useAuthStore((s) => s.token) ?? '';
  const logout   = useAuthStore((s) => s.logout);

  const [pendingCount,   setPendingCount]   = useState(0);
  const [jiraModalOpen,  setJiraModalOpen]  = useState(false);
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
    <>
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

      {/* ── JIRA Integration ───────────────────────────────────────── */}
      <div className="px-3 pb-2">
        <button
          onClick={() => setJiraModalOpen(true)}
          className="group w-full flex items-center gap-3 px-3 h-10 rounded-[10px] text-[13px] font-medium text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100/70 transition-colors duration-200"
        >
          <span className="flex items-center justify-center text-zinc-400 group-hover:text-zinc-700 transition-colors duration-200">
            <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="2" width="9" height="9" rx="1.5"/><rect x="13" y="2" width="9" height="9" rx="1.5"/>
              <rect x="2" y="13" width="9" height="9" rx="1.5"/><rect x="13" y="13" width="9" height="9" rx="1.5"/>
            </svg>
          </span>
          <span className="flex-1 text-left truncate">JIRA Integration</span>
          <svg className="w-3.5 h-3.5 text-zinc-300 group-hover:text-zinc-400 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </button>
      </div>

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

    {jiraModalOpen && (
      <JiraModal token={token} onClose={() => setJiraModalOpen(false)} />
    )}
  </>
  );
}
