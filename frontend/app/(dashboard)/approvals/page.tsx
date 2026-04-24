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

  const flash = (msg: string) => { setSuccessMsg(msg); setTimeout(() => setSuccessMsg(''), 3000); };

  const handleApprove = async (id: string) => {
    await fetch(`${API}/approvals/approve/${id}`, { method: 'POST', headers: aH(token) });
    setEntries((prev) => prev.filter((e) => e.id !== id));
    flash('Entry approved.');
  };

  const handleApproveAll = async () => {
    const url = dateFilter
      ? `${API}/approvals/approve-all?entry_date=${dateFilter}`
      : `${API}/approvals/approve-all`;
    await fetch(url, { method: 'POST', headers: aH(token) });
    setEntries([]);
    setConfirmApproveAll(false);
    flash('All entries approved.');
  };

  const handleApproveUser = async (userId: string, items: PendingEntry[]) => {
    setApprovingUser(true);
    await Promise.all(items.map((e) =>
      fetch(`${API}/approvals/approve/${e.id}`, { method: 'POST', headers: aH(token) })
    ));
    setEntries((prev) => prev.filter((e) => e.user_id !== userId));
    setConfirmApproveUser(null);
    setApprovingUser(false);
    flash(`All entries for ${items[0]?.full_name ?? 'user'} approved.`);
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
        <div className="flex items-center gap-3">
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
              style={{ background: 'linear-gradient(135deg,#10b981,#059669)' }}>
              Approve All ({pendingCount})
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8 space-y-6">

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

        {/* Stats */}
        <div className="grid grid-cols-3 gap-5">
          {[
            { title: 'Pending Review',  value: pendingCount,     icon: '⏳', color: 'rgba(245,158,11,0.15)' },
            { title: 'Resubmitted',     value: resubmittedCount, icon: '🔄', color: 'rgba(139,92,246,0.15)' },
            { title: 'Team Members',    value: peopleCount,      icon: '👥', color: 'rgba(59,130,246,0.15)'  },
          ].map((s) => (
            <div key={s.title} className="rounded-xl p-5 shadow-sm" style={{ background: t.statGrad, border: t.border }}>
              <div className="flex items-start justify-between mb-3">
                <span className="text-sm font-medium" style={{ color: t.textMuted }}>{s.title}</span>
                <span className="w-9 h-9 rounded-lg flex items-center justify-center text-lg" style={{ background: s.color }}>{s.icon}</span>
              </div>
              <div className="text-3xl font-bold" style={{ color: t.text }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Entries grouped by user */}
        {loading ? (
          <div className="text-center py-16" style={{ color: t.textSubtle }}>Loading...</div>
        ) : entries.length === 0 ? (
          <div className="rounded-xl p-16 text-center shadow-sm" style={{ background: t.cardBg, border: t.border }}>
            <div className="text-5xl mb-3">✅</div>
            <h3 className="text-lg font-semibold mb-1" style={{ color: t.text }}>All caught up!</h3>
            <p className="text-sm" style={{ color: t.textMuted }}>No pending entries{dateFilter ? ' for this date' : ''}.</p>
          </div>
        ) : (
          Object.values(grouped).map(({ info, items }) => (
            <div key={info.user_id} className="rounded-xl overflow-hidden shadow-sm" style={{ background: t.cardBg, border: t.border }}>

              {/* User header */}
              <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: t.border, background: t.cardBg2 }}>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
                    style={{ background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)' }}>
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
                    style={{ background: 'linear-gradient(135deg,#10b981,#059669)' }}>
                    Approve ({items.length})
                  </button>
                </div>
              </div>

              {/* Entries table */}
              <table className="w-full text-sm">
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
                            style={{ background: 'linear-gradient(135deg,#10b981,#059669)' }}>
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
          ))
        )}
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
                style={{ background: 'linear-gradient(135deg,#10b981,#059669)' }}>
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
                style={{ background: 'linear-gradient(135deg,#10b981,#059669)' }}>
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
    </div>
  );
}
