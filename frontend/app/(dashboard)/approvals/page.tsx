'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/lib/theme';

const API = process.env.NEXT_PUBLIC_API_URL;

interface PendingEntry {
  id: string;
  user_id: string;
  task_id: string;
  task_title: string;
  entry_date: string;
  work_description: string;
  hours: number;
  status: string;
  rejection_reason: string | null;
  full_name: string;
  email: string;
  avatar: string;
  role: string;
  manager_name: string | null;
}

function aH(token: string) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string }> = {
    pending:     { bg: 'rgba(245,158,11,0.12)', color: '#d97706' },
    resubmitted: { bg: 'rgba(139,92,246,0.12)', color: '#7c3aed' },
  };
  const s = map[status] ?? map.pending;
  return (
    <span className="px-2.5 py-1 rounded-full text-xs font-semibold capitalize"
      style={{ background: s.bg, color: s.color }}>{status}</span>
  );
}

export default function ApprovalsPage() {
  const token  = useAuthStore((s) => s.token) ?? '';
  const user   = useAuthStore((s) => s.user);
  const router = useRouter();

  const [entries,     setEntries]     = useState<PendingEntry[]>([]);
  const [teamSize,    setTeamSize]    = useState(0);
  const [loading,     setLoading]     = useState(true);
  const [dateFilter,  setDateFilter]  = useState('');
  const [successMsg,  setSuccessMsg]  = useState('');
  const [warnMsg,     setWarnMsg]     = useState('');
  const [errorMsg,    setErrorMsg]    = useState('');

  // Reject modal
  const [rejectTarget, setRejectTarget] = useState<PendingEntry | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejecting,    setRejecting]    = useState(false);

  // Confirmation dialogs
  const [confirmApproveAll,  setConfirmApproveAll]  = useState(false);
  const [confirmApproveUser, setConfirmApproveUser] = useState<{ userId: string; name: string; items: PendingEntry[] } | null>(null);
  const [approvingUser,      setApprovingUser]      = useState(false);

  // Redirect non-managers
  useEffect(() => {
    if (user && user.role === 'resource') router.push('/timesheet');
  }, [user, router]);

  const fetchPending = useCallback(async () => {
    setLoading(true);
    const url = dateFilter
      ? `${API}/approvals/pending?entry_date=${dateFilter}`
      : `${API}/approvals/pending`;
    const [pendingRes, subsRes] = await Promise.all([
      fetch(url, { headers: aH(token) }),
      fetch(`${API}/users/subordinates`, { headers: aH(token) }),
    ]);
    if (pendingRes.ok) setEntries((await pendingRes.json()).entries);
    if (subsRes.ok)    setTeamSize((await subsRes.json()).subordinates?.length ?? 0);
    setLoading(false);
  }, [token, dateFilter]);

  useEffect(() => { fetchPending(); }, [fetchPending]);

  const flash = (msg: string) => { setSuccessMsg(msg); setTimeout(() => setSuccessMsg(''), 4000); };
  const warn  = (msg: string) => { setWarnMsg(msg);   setTimeout(() => setWarnMsg(''), 8000); };
  const error = (msg: string) => { setErrorMsg(msg);  setTimeout(() => setErrorMsg(''), 8000); };

  const handleApprove = async (id: string) => {
    const res = await fetch(`${API}/approvals/approve/${id}`, { method: 'POST', headers: aH(token) });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      error(data.detail || 'Approval failed.');
      return;  // hard block — entry stays in list
    }
    setEntries((prev) => prev.filter((e) => e.id !== id));
    flash('Entry approved and JIRA worklog synced.');
  };

  const handleApproveAll = async () => {
    const url = dateFilter
      ? `${API}/approvals/approve-all?entry_date=${dateFilter}`
      : `${API}/approvals/approve-all`;
    const res = await fetch(url, { method: 'POST', headers: aH(token) });
    setConfirmApproveAll(false);
    if (!res.ok) { error('Approve All failed. Please try again.'); return; }
    const data = await res.json();
    // Remove only the approved entries from the list
    const skippedUserIds = new Set((data.skipped_users ?? []).map((u: { name: string }) => u.name));
    setEntries((prev) => prev.filter((e) => skippedUserIds.has(e.full_name)));
    if (data.approved > 0) flash(`${data.approved} entr${data.approved === 1 ? 'y' : 'ies'} approved and synced to JIRA.`);
    if (data.skipped > 0) {
      const names = (data.skipped_users ?? []).map((u: { name: string; reason: string }) => u.name).join(', ');
      warn(`${data.skipped} user${data.skipped > 1 ? 's' : ''} skipped — no valid JIRA token: ${names}. Ask them to set up JIRA Integration.`);
    }
  };

  const handleApproveUser = async (userId: string, items: PendingEntry[]) => {
    setApprovingUser(true);
    let allBlocked = true;
    let blockMsg = '';
    const results = await Promise.all(items.map((e) =>
      fetch(`${API}/approvals/approve/${e.id}`, { method: 'POST', headers: aH(token) })
        .then(async (r) => ({ ok: r.ok, data: await r.json().catch(() => ({})) }))
    ));
    const approved = results.filter((r) => r.ok);
    const blocked  = results.find((r) => !r.ok);
    if (approved.length > 0) {
      allBlocked = false;
      setEntries((prev) => prev.filter((e) => e.user_id !== userId));
      flash(`${approved.length} entr${approved.length === 1 ? 'y' : 'ies'} for ${items[0]?.full_name ?? 'user'} approved.`);
    }
    if (blocked) blockMsg = blocked.data?.detail || 'Some entries could not be approved.';
    if (allBlocked && blockMsg) error(blockMsg);
    else if (blocked && !allBlocked) warn(blockMsg);
    setConfirmApproveUser(null);
    setApprovingUser(false);
  };

  const handleReject = async () => {
    if (!rejectTarget || !rejectReason.trim()) return;
    setRejecting(true);
    await fetch(`${API}/approvals/reject/${rejectTarget.id}`, {
      method: 'POST', headers: aH(token),
      body: JSON.stringify({ reason: rejectReason.trim() }),
    });
    setEntries((prev) => prev.filter((e) => e.id !== rejectTarget.id));
    setRejecting(false);
    setRejectTarget(null);
    setRejectReason('');
    flash('Entry rejected.');
  };

  // Group entries by user
  const grouped = entries.reduce<Record<string, { info: PendingEntry; items: PendingEntry[] }>>((acc, e) => {
    if (!acc[e.user_id]) acc[e.user_id] = { info: e, items: [] };
    acc[e.user_id].items.push(e);
    return acc;
  }, {});

  const pendingCount     = entries.length;
  const resubmittedCount = entries.filter((e) => e.status === 'resubmitted').length;
  const peopleCount      = teamSize;   // total subordinates, not just those with pending entries

  return (
    <div className="flex flex-col h-full" style={{ background: t.pageBg }}>

      {/* Header */}
      <div className="flex items-center justify-between px-8 h-[70px] flex-shrink-0"
        style={{ background: t.headerBg, borderBottom: t.border }}>
        <div>
          <h2 className="text-xl font-semibold" style={{ color: t.text }}>Approvals</h2>
          <p className="text-sm" style={{ color: t.textMuted }}>Review and approve timesheet entries from your team</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap justify-end">
          <input type="date" value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="px-4 py-2 rounded-lg text-sm focus:outline-none"
            style={{ background: t.inputBg, border: `1px solid ${t.inputBorder}`, color: t.text, colorScheme: t.colorScheme }}
          />
          {dateFilter && (
            <button onClick={() => setDateFilter('')}
              className="px-3 py-2 rounded-lg text-xs font-medium"
              style={{ border: t.border, color: t.textMuted }}>
              Clear
            </button>
          )}
          {/* Manual refresh — approvals are time-sensitive */}
          <button onClick={fetchPending} disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-opacity hover:opacity-80 disabled:opacity-40"
            style={{ border: t.border, color: t.textMuted, background: 'transparent' }}>
            <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}
              viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
            </svg>
            Refresh
          </button>
          {pendingCount > 0 && (
            <button onClick={() => setConfirmApproveAll(true)}
              className="px-5 py-2 rounded-lg text-white font-semibold text-sm hover:opacity-90 transition-opacity"
              style={{ background: 'linear-gradient(135deg,#047857,#065f46)' }}>
              Approve All ({pendingCount})
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8">
      <div className="max-w-[1440px] mx-auto space-y-6">

        {/* Success */}
        {successMsg && (
          <div className="px-4 py-3 rounded-lg text-sm font-medium flex items-center gap-2"
            style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', color: '#059669' }}>
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
            {successMsg}
          </div>
        )}

        {/* JIRA block modal rendered via portal-style absolute — see below */}

        {/* JIRA sync warning — skipped entries */}
        {warnMsg && (
          <div className="px-4 py-3 rounded-lg text-sm font-medium flex items-start gap-2"
            style={{ background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.35)', color: '#b45309' }}>
            <svg className="w-4 h-4 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <span>{warnMsg}</span>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-5">
          {[
            {
              title: 'Pending Review', value: pendingCount, soft: 'rgba(180,83,9,0.10)', text: '#b45309',
              icon: (<svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v4l2.5 1.5"/></svg>),
            },
            {
              title: 'Resubmitted', value: resubmittedCount, soft: 'rgba(124,58,237,0.10)', text: '#6d28d9',
              icon: (<svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>),
            },
            {
              title: 'Team Members', value: peopleCount, soft: 'rgba(29,78,216,0.10)', text: '#1d4ed8',
              icon: (<svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>),
            },
          ].map((s) => (
            <div key={s.title} className="rounded-xl p-5 transition-shadow duration-300 hover:shadow-md" style={{ background: t.statGrad, border: t.border }}>
              <div className="flex items-start justify-between mb-3">
                <span className="text-[12px] font-medium tracking-tight" style={{ color: t.textMuted }}>{s.title}</span>
                <span className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: s.soft, color: s.text }}>{s.icon}</span>
              </div>
              <div className="text-[28px] font-semibold tracking-tight tabular-nums" style={{ color: t.text }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Entries grouped by user */}
        {loading ? (
          <div className="text-center py-16" style={{ color: t.textSubtle }}>Loading...</div>
        ) : entries.length === 0 ? (
          <div className="rounded-2xl p-16 text-center" style={{ background: t.cardBg, border: t.border }}>
            <div className="inline-flex w-14 h-14 items-center justify-center rounded-2xl mb-4 animate-float"
              style={{ background: 'rgba(5,150,105,0.10)', color: '#059669' }}>
              <svg viewBox="0 0 24 24" className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
            </div>
            <h3 className="text-[18px] font-semibold tracking-tight mb-1" style={{ color: t.text }}>All caught up</h3>
            <p className="text-[13.5px] leading-relaxed max-w-[36ch] mx-auto" style={{ color: t.textMuted }}>
              No pending entries{dateFilter ? ' for this date' : ''}. Approvals will appear here as they come in.
            </p>
          </div>
        ) : (
          Object.values(grouped).map(({ info, items }) => (
            <div key={info.user_id} className="rounded-xl overflow-hidden shadow-sm" style={{ background: t.cardBg, border: t.border }}>

              {/* User header */}
              <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: t.border, background: t.cardBg2 }}>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
                    style={{ background: 'linear-gradient(135deg,#2563eb,#1d4ed8)' }}>
                    {info.avatar || info.full_name[0]}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-sm" style={{ color: t.text }}>{info.full_name}</p>
                      {/* role badge */}
                      {(() => {
                        const roleStyles: Record<string, { bg: string; color: string }> = {
                          admin:    { bg: 'rgba(59,130,246,0.12)',  color: '#3b82f6' },
                          teamlead: { bg: 'rgba(139,92,246,0.12)', color: '#7c3aed' },
                          resource: { bg: 'rgba(16,185,129,0.12)', color: '#059669' },
                        };
                        const rs = roleStyles[info.role] ?? { bg: 'rgba(100,116,139,0.12)', color: '#64748b' };
                        return (
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold capitalize"
                            style={{ background: rs.bg, color: rs.color }}>
                            {info.role === 'teamlead' ? 'Teamlead' : info.role}
                          </span>
                        );
                      })()}
                    </div>
                    <p className="text-xs" style={{ color: t.textMuted }}>{info.email}</p>
                    {info.manager_name && (
                      <p className="text-xs mt-0.5" style={{ color: t.textSubtle }}>
                        Reports to: {info.manager_name}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium px-3 py-1 rounded-full"
                    style={{ background: 'rgba(245,158,11,0.12)', color: '#d97706' }}>
                    {items.length} pending
                  </span>
                  <button
                    onClick={() => setConfirmApproveUser({ userId: info.user_id, name: info.full_name, items })}
                    className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white hover:opacity-90 transition-opacity"
                    style={{ background: 'linear-gradient(135deg,#047857,#065f46)' }}>
                    Approve ({items.length})
                  </button>
                </div>
              </div>

              {/* Entries table */}
              <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ minWidth: 620 }}>
                <thead style={{ background: t.tableHead }}>
                  <tr>
                    {['Date', 'Task', 'Work Done', 'Hours', 'Status', 'Actions'].map((h) => (
                      <th key={h} className="px-5 py-3 text-left font-semibold"
                        style={{ color: t.textHeader, borderBottom: t.border, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((entry) => (
                    <tr key={entry.id} style={{ borderBottom: t.border }}>
                      <td className="px-5 py-3.5 text-xs font-mono" style={{ color: t.textMuted, whiteSpace: 'nowrap' }}>
                        {entry.entry_date}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="px-2 py-0.5 rounded text-xs font-semibold"
                          style={{ background: 'rgba(59,130,246,0.15)', color: '#3b82f6' }}>
                          {entry.task_id}
                        </span>
                        <span className="ml-2 text-xs" style={{ color: t.textMuted }}>{entry.task_title}</span>
                      </td>
                      <td className="px-5 py-3.5 max-w-[200px] text-xs" style={{ color: t.textBody }}>
                        {entry.work_description}
                      </td>
                      <td className="px-5 py-3.5 font-mono font-semibold" style={{ color: t.text }}>
                        {entry.hours}h
                      </td>
                      <td className="px-5 py-3.5"><StatusBadge status={entry.status} /></td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <button onClick={() => handleApprove(entry.id)}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white hover:opacity-90 transition-opacity"
                            style={{ background: 'linear-gradient(135deg,#047857,#065f46)' }}>
                            Approve
                          </button>
                          <button onClick={() => { setRejectTarget(entry); setRejectReason(''); }}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold hover:opacity-90 transition-opacity"
                            style={{ background: 'rgba(239,68,68,0.1)', color: '#dc2626', border: '1px solid rgba(239,68,68,0.3)' }}>
                            Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          ))
        )}
      </div>
      </div>

      {/* Confirm Approve All Modal */}
      {confirmApproveAll && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: t.modalBg, backdropFilter: 'blur(4px)' }}>
          <div className="w-full max-w-sm rounded-2xl p-6 space-y-4 shadow-xl"
            style={{ background: t.cardBg, border: t.border }}>
            <h3 className="text-lg font-semibold" style={{ color: t.text }}>Approve All Entries?</h3>
            <p className="text-sm" style={{ color: t.textMuted }}>
              This will approve <strong>{pendingCount}</strong> pending entr{pendingCount === 1 ? 'y' : 'ies'} across all team members. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button onClick={handleApproveAll}
                className="flex-1 py-2.5 rounded-lg text-white font-semibold text-sm hover:opacity-90 transition-opacity"
                style={{ background: 'linear-gradient(135deg,#047857,#065f46)' }}>
                Confirm Approve All
              </button>
              <button onClick={() => setConfirmApproveAll(false)}
                className="px-5 py-2.5 rounded-lg text-sm font-medium"
                style={{ background: t.inputBg, border: `1px solid ${t.inputBorder}`, color: t.textMuted }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Approve Person Modal */}
      {confirmApproveUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: t.modalBg, backdropFilter: 'blur(4px)' }}>
          <div className="w-full max-w-sm rounded-2xl p-6 space-y-4 shadow-xl"
            style={{ background: t.cardBg, border: t.border }}>
            <h3 className="text-lg font-semibold" style={{ color: t.text }}>Approve All for {confirmApproveUser.name}?</h3>
            <p className="text-sm" style={{ color: t.textMuted }}>
              This will approve <strong>{confirmApproveUser.items.length}</strong> entr{confirmApproveUser.items.length === 1 ? 'y' : 'ies'} for <strong>{confirmApproveUser.name}</strong>. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button onClick={() => handleApproveUser(confirmApproveUser.userId, confirmApproveUser.items)}
                disabled={approvingUser}
                className="flex-1 py-2.5 rounded-lg text-white font-semibold text-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
                style={{ background: 'linear-gradient(135deg,#047857,#065f46)' }}>
                {approvingUser ? 'Approving…' : 'Confirm Approve'}
              </button>
              <button onClick={() => setConfirmApproveUser(null)} disabled={approvingUser}
                className="px-5 py-2.5 rounded-lg text-sm font-medium"
                style={{ background: t.inputBg, border: `1px solid ${t.inputBorder}`, color: t.textMuted }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: t.modalBg, backdropFilter: 'blur(4px)' }}>
          <div className="w-full max-w-md rounded-2xl p-6 space-y-4 shadow-xl"
            style={{ background: t.cardBg, border: t.border }}>
            <div>
              <h3 className="text-lg font-semibold" style={{ color: t.text }}>Reject Entry</h3>
              <p className="text-xs mt-0.5" style={{ color: t.textMuted }}>
                {rejectTarget.full_name} · {rejectTarget.task_id} · {rejectTarget.hours}h
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: t.textMuted }}>
                Reason for rejection <span style={{ color: '#dc2626' }}>*</span>
              </label>
              <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
                rows={3} placeholder="Explain why this entry is being rejected..."
                className="w-full px-3 py-2.5 rounded-lg text-sm focus:outline-none resize-none"
                style={{ background: t.inputBg, border: `1px solid ${t.inputBorder}`, color: t.text }} />
            </div>
            <div className="flex gap-3">
              <button onClick={handleReject} disabled={rejecting || !rejectReason.trim()}
                className="flex-1 py-2.5 rounded-lg text-white font-semibold text-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
                style={{ background: '#dc2626' }}>
                {rejecting ? 'Rejecting...' : 'Reject Entry'}
              </button>
              <button onClick={() => setRejectTarget(null)}
                className="px-5 py-2.5 rounded-lg text-sm font-medium"
                style={{ background: t.inputBg, border: `1px solid ${t.inputBorder}`, color: t.textMuted }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* JIRA Token Block Modal */}
      {errorMsg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}
          onClick={() => setErrorMsg('')}>
          <div className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden"
            style={{ background: '#fff', border: '1px solid #e4e4e7' }}
            onClick={(e) => e.stopPropagation()}>

            {/* Red header bar */}
            <div className="px-6 py-5 flex items-start gap-4"
              style={{ background: 'rgba(185,28,28,0.06)', borderBottom: '1px solid rgba(185,28,28,0.15)' }}>
              <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(185,28,28,0.10)' }}>
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="#b91c1c" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-[15px] font-semibold" style={{ color: '#b91c1c' }}>Approval Blocked</h3>
                <p className="text-sm mt-1 leading-relaxed" style={{ color: '#7f1d1d' }}>{errorMsg}</p>
              </div>
              <button onClick={() => setErrorMsg('')}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors flex-shrink-0">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-4">
              <p className="text-sm" style={{ color: '#52525b' }}>
                The entry cannot be approved until the user sets up their JIRA token. Ask them to open{' '}
                <span className="font-semibold text-zinc-800">JIRA Integration</span> in the sidebar and save their Atlassian API token.
              </p>
            </div>

            {/* Footer */}
            <div className="px-6 pb-5">
              <button onClick={() => setErrorMsg('')}
                className="w-full py-2.5 rounded-lg text-sm font-semibold transition-opacity hover:opacity-90"
                style={{ background: '#b91c1c', color: '#fff' }}>
                OK, Got It
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
