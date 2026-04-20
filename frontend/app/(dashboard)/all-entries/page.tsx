'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useTimesheetStore, timeAgo, EntryCached } from '@/store/timesheetStore';
import { t } from '@/lib/theme';

const API = process.env.NEXT_PUBLIC_API_URL;
type Entry = EntryCached;

function authHeaders(token: string) {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

function ApprovalBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    pending:     { bg: 'rgba(245,158,11,0.12)',  color: '#d97706', label: 'Pending'     },
    approved:    { bg: 'rgba(16,185,129,0.12)',  color: '#059669', label: 'Approved'    },
    rejected:    { bg: 'rgba(239,68,68,0.12)',   color: '#dc2626', label: 'Rejected'    },
    resubmitted: { bg: 'rgba(139,92,246,0.12)',  color: '#7c3aed', label: 'Resubmitted' },
  };
  const s = map[status] ?? map.pending;
  return (
    <span className="px-2.5 py-1 rounded-full text-xs font-semibold"
      style={{ background: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}

function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg className={`w-4 h-4 ${spinning ? 'animate-spin' : ''}`}
      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}

function LastUpdated({ ts }: { ts: number | null }) {
  const [label, setLabel] = useState(timeAgo(ts));
  useEffect(() => {
    setLabel(timeAgo(ts));
    const id = setInterval(() => setLabel(timeAgo(ts)), 30_000);
    return () => clearInterval(id);
  }, [ts]);
  if (!ts) return null;
  return (
    <span className="text-xs px-2 py-1 rounded-md"
      style={{ background: 'rgba(100,116,139,0.12)', color: t.textSubtle }}>
      Updated {label}
    </span>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`}
      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

// ── Entry table inside a section ─────────────────────────────────────────────
function EntryTable({
  entries,
  showResubmit,
  onResubmit,
}: {
  entries: Entry[];
  showResubmit?: boolean;
  onResubmit?: (e: Entry) => void;
}) {
  if (entries.length === 0)
    return <div className="text-center py-8 text-sm" style={{ color: t.textSubtle }}>No entries.</div>;

  return (
    <table className="w-full text-sm">
      <thead style={{ background: t.tableHead }}>
        <tr>
          {['Date', 'Task', 'Title', 'Work Done', 'Hours', 'Status', ...(showResubmit ? ['Action'] : [])].map((h) => (
            <th key={h} className="px-5 py-3 text-left font-semibold"
              style={{ color: t.textHeader, borderBottom: t.border, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {entries.map((entry) => (
          <tr key={entry.id} style={{
            borderBottom: t.border,
            background: entry.status === 'rejected' ? 'rgba(239,68,68,0.025)' : undefined,
          }}>
            <td className="px-5 py-3.5 font-mono text-xs whitespace-nowrap" style={{ color: t.textMuted }}>
              {new Date(entry.entry_date + 'T00:00:00').toLocaleDateString('en-US', {
                month: 'short', day: 'numeric', year: 'numeric',
              })}
            </td>
            <td className="px-5 py-3.5">
              <span className="px-2 py-0.5 rounded text-xs font-semibold"
                style={{ background: 'rgba(59,130,246,0.15)', color: '#3b82f6' }}>
                {entry.task_id}
              </span>
            </td>
            <td className="px-5 py-3.5 max-w-[150px]" style={{ color: t.textBody }}>
              <p className="truncate text-xs" title={entry.task_title}>{entry.task_title}</p>
            </td>
            <td className="px-5 py-3.5 max-w-[220px]" style={{ color: t.textBody }}>
              <p className="truncate text-xs">{entry.work_description}</p>
              {entry.status === 'rejected' && entry.rejection_reason && (
                <div className="mt-1 flex items-start gap-1 text-xs px-2 py-1 rounded"
                  style={{ background: 'rgba(239,68,68,0.08)', color: '#dc2626' }}>
                  <span className="font-bold shrink-0">Reason:</span>
                  <span>{entry.rejection_reason}</span>
                </div>
              )}
            </td>
            <td className="px-5 py-3.5 font-mono font-bold text-sm" style={{ color: t.text }}>
              {entry.hours}h
            </td>
            <td className="px-5 py-3.5">
              <ApprovalBadge status={entry.status ?? 'pending'} />
            </td>
            {showResubmit && (
              <td className="px-5 py-3.5">
                {entry.status === 'rejected' ? (
                  <button onClick={() => onResubmit?.(entry)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white hover:opacity-90 transition-opacity"
                    style={{ background: '#7c3aed' }}>
                    Resubmit
                  </button>
                ) : (
                  <span style={{ color: t.textSubtle }}>—</span>
                )}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Collapsible section card ──────────────────────────────────────────────────
function Section({
  title, icon, count, colorStyle, entries, showResubmit, onResubmit,
}: {
  title: string;
  icon: React.ReactNode;
  count: number;
  colorStyle: { color: string; bg: string; border: string };
  entries: Entry[];
  showResubmit?: boolean;
  onResubmit?: (e: Entry) => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-xl overflow-hidden shadow-sm" style={{ background: t.cardBg, border: t.border }}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-6 py-4 transition-opacity hover:opacity-80"
        style={{ borderBottom: open ? t.border : undefined }}>
        <div className="flex items-center gap-3">
          <span className="w-8 h-8 rounded-lg flex items-center justify-center text-base"
            style={{ background: colorStyle.bg }}>
            {icon}
          </span>
          <span className="font-semibold text-sm" style={{ color: t.text }}>{title}</span>
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold"
            style={{ background: colorStyle.bg, color: colorStyle.color }}>
            {count}
          </span>
        </div>
        <span style={{ color: t.textSubtle }}><ChevronIcon open={open} /></span>
      </button>
      {open && (
        <EntryTable entries={entries} showResubmit={showResubmit} onResubmit={onResubmit} />
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AllEntriesPage() {
  const token = useAuthStore((s) => s.token) ?? '';

  const allEntries          = useTimesheetStore((s) => s.allEntries);
  const allEntriesFetchedAt = useTimesheetStore((s) => s.allEntriesFetchedAt);
  const setAllEntries       = useTimesheetStore((s) => s.setAllEntries);
  const updateAllEntry      = useTimesheetStore((s) => s.updateAllEntry);

  const [loading,   setLoading]   = useState(false);
  const [fromDate,  setFromDate]  = useState('');
  const [toDate,    setToDate]    = useState('');

  // resubmit modal
  const [resubmitEntry,  setResubmitEntry]  = useState<Entry | null>(null);
  const [resubmitHours,  setResubmitHours]  = useState('');
  const [resubmitWork,   setResubmitWork]   = useState('');
  const [resubmitting,   setResubmitting]   = useState(false);
  const [resubmitError,  setResubmitError]  = useState('');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/timesheet/all-entries`, { headers: authHeaders(token) });
      if (res.ok) setAllEntries(await res.json());
    } catch (e) { console.error('all-entries', e); }
    finally { setLoading(false); }
  }, [token, setAllEntries]);

  const mountedRef = useRef(false);
  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    if (!allEntriesFetchedAt) fetchAll();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── date-range filter (client-side) ──────────────────────────────────────
  const filtered = allEntries.filter((e) => {
    if (fromDate && e.entry_date < fromDate) return false;
    if (toDate   && e.entry_date > toDate)   return false;
    return true;
  });

  const pending    = filtered.filter((e) => e.status === 'pending' || e.status === 'resubmitted');
  const approved   = filtered.filter((e) => e.status === 'approved');
  const rejected   = filtered.filter((e) => e.status === 'rejected');

  const hasFilter = fromDate || toDate;

  // ── resubmit handlers ────────────────────────────────────────────────────
  const openResubmit = (entry: Entry) => {
    setResubmitEntry(entry);
    setResubmitHours(String(entry.hours));
    setResubmitWork(entry.work_description);
    setResubmitError('');
  };

  const handleResubmit = async () => {
    if (!resubmitEntry) return;
    setResubmitting(true); setResubmitError('');
    try {
      const res = await fetch(`${API}/timesheet/entries/${resubmitEntry.id}/resubmit`, {
        method: 'PUT', headers: authHeaders(token),
        body: JSON.stringify({ hours: parseFloat(resubmitHours), work_description: resubmitWork }),
      });
      if (!res.ok) { setResubmitError(`Failed (${res.status}): ${await res.text()}`); return; }
      updateAllEntry(resubmitEntry.id, {
        hours: parseFloat(resubmitHours),
        work_description: resubmitWork,
        status: 'resubmitted',
        rejection_reason: null,
      });
      setResubmitEntry(null);
    } catch (e: unknown) {
      setResubmitError(`Network error: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setResubmitting(false); }
  };

  return (
    <div className="flex flex-col h-full" style={{ background: t.pageBg }}>

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-8 h-[70px] flex-shrink-0"
        style={{ background: t.headerBg, borderBottom: t.border }}>
        <div>
          <h2 className="text-xl font-semibold" style={{ color: t.text }}>All My Entries</h2>
          <p className="text-sm" style={{ color: t.textMuted }}>
            All your logged time — pending approvals, approved, and rejections to resubmit
          </p>
        </div>
        <div className="flex items-center gap-2">
          <LastUpdated ts={allEntriesFetchedAt} />
          <button onClick={fetchAll} disabled={loading}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-opacity hover:opacity-80 disabled:opacity-40"
            style={{ border: t.border, color: t.textMuted, background: 'transparent' }}>
            <RefreshIcon spinning={loading} />
            Refresh
          </button>
        </div>
      </div>

      {/* ── Content ───────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-8 space-y-6">

        {/* ── Date range filter ────────────────────────────────────────── */}
        <div className="flex items-center gap-4 px-5 py-4 rounded-xl"
          style={{ background: t.cardBg, border: t.border }}>
          <span className="text-sm font-medium" style={{ color: t.textMuted }}>Date range:</span>
          <div className="flex items-center gap-2">
            <label className="text-xs" style={{ color: t.textSubtle }}>From</label>
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
              className="px-3 py-2 rounded-lg text-sm focus:outline-none"
              style={{ background: t.inputBg, border: `1px solid ${t.inputBorder}`, color: t.text, colorScheme: t.colorScheme }} />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs" style={{ color: t.textSubtle }}>To</label>
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
              className="px-3 py-2 rounded-lg text-sm focus:outline-none"
              style={{ background: t.inputBg, border: `1px solid ${t.inputBorder}`, color: t.text, colorScheme: t.colorScheme }} />
          </div>
          {hasFilter && (
            <button onClick={() => { setFromDate(''); setToDate(''); }}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-opacity hover:opacity-80"
              style={{ border: t.border, color: t.textMuted, background: 'transparent' }}>
              Clear
            </button>
          )}
          {hasFilter && (
            <span className="text-xs ml-auto" style={{ color: t.textSubtle }}>
              Showing {filtered.length} of {allEntries.length} entries
            </span>
          )}
        </div>

        {/* ── Summary stat cards ───────────────────────────────────────── */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: 'Total',       value: filtered.length,  icon: '📋', color: 'rgba(59,130,246,0.15)',  text: '#3b82f6' },
            { label: 'Pending',     value: pending.length,   icon: '⏳', color: 'rgba(245,158,11,0.15)', text: '#d97706' },
            { label: 'Approved',    value: approved.length,  icon: '✓',  color: 'rgba(16,185,129,0.15)', text: '#059669' },
            { label: 'Rejected',    value: rejected.length,  icon: '✕',  color: 'rgba(239,68,68,0.15)',  text: '#dc2626' },
          ].map((s) => (
            <div key={s.label} className="rounded-xl p-5 shadow-sm" style={{ background: t.statGrad, border: t.border }}>
              <div className="flex items-start justify-between mb-3">
                <span className="text-sm font-medium" style={{ color: t.textMuted }}>{s.label}</span>
                <span className="w-9 h-9 rounded-lg flex items-center justify-center text-lg"
                  style={{ background: s.color }}>{s.icon}</span>
              </div>
              <div className="text-3xl font-bold" style={{ color: s.text }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* ── Loading / empty state ────────────────────────────────────── */}
        {loading ? (
          <div className="text-center py-16" style={{ color: t.textSubtle }}>Loading entries…</div>
        ) : !allEntriesFetchedAt ? (
          <div className="text-center py-16 rounded-xl" style={{ background: t.cardBg, border: t.border }}>
            <p className="text-sm mb-4" style={{ color: t.textSubtle }}>No data loaded yet.</p>
            <button onClick={fetchAll}
              className="px-5 py-2.5 rounded-lg text-sm font-semibold text-white hover:opacity-90 transition-opacity"
              style={{ background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)' }}>
              Load All Entries
            </button>
          </div>
        ) : (
          <>
            {/* ── Pending & Resubmitted ──────────────────────────────── */}
            <Section
              title="Pending & Resubmitted"
              icon="⏳"
              count={pending.length}
              colorStyle={{ color: '#d97706', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.3)' }}
              entries={pending}
            />

            {/* ── Approved ──────────────────────────────────────────── */}
            <Section
              title="Approved"
              icon="✓"
              count={approved.length}
              colorStyle={{ color: '#059669', bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.3)' }}
              entries={approved}
            />

            {/* ── Rejected ──────────────────────────────────────────── */}
            <Section
              title="Rejected"
              icon="✕"
              count={rejected.length}
              colorStyle={{ color: '#dc2626', bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.3)' }}
              entries={rejected}
              showResubmit
              onResubmit={openResubmit}
            />
          </>
        )}
      </div>

      {/* ── Resubmit Modal ───────────────────────────────────────────────── */}
      {resubmitEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
          <div className="w-full max-w-md rounded-2xl p-6 space-y-4 shadow-xl"
            style={{ background: t.cardBg, border: t.border }}>
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold" style={{ color: t.text }}>Resubmit Entry</h3>
                <p className="text-xs mt-0.5 font-mono" style={{ color: '#3b82f6' }}>{resubmitEntry.task_id}</p>
                <p className="text-xs mt-0.5" style={{ color: t.textSubtle }}>{resubmitEntry.task_title}</p>
              </div>
              <button onClick={() => setResubmitEntry(null)} style={{ color: t.textSubtle }}>
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {resubmitEntry.rejection_reason && (
              <div className="px-3 py-2.5 rounded-lg text-xs"
                style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#dc2626' }}>
                <span className="font-semibold">Rejection reason: </span>
                {resubmitEntry.rejection_reason}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: t.textMuted }}>Work Description</label>
                <textarea rows={3} value={resubmitWork} onChange={(e) => setResubmitWork(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg text-sm focus:outline-none resize-none"
                  style={{ background: t.inputBg, border: `1px solid ${t.inputBorder}`, color: t.text }} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: t.textMuted }}>Hours</label>
                <input type="number" step="0.5" min="0.5" max="24"
                  value={resubmitHours} onChange={(e) => setResubmitHours(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg text-sm focus:outline-none"
                  style={{ background: t.inputBg, border: `1px solid ${t.inputBorder}`, color: t.text }} />
              </div>
            </div>

            {resubmitError && (
              <p className="text-xs px-3 py-2 rounded"
                style={{ background: 'rgba(239,68,68,0.08)', color: '#dc2626' }}>
                {resubmitError}
              </p>
            )}

            <div className="flex gap-3 pt-1">
              <button onClick={() => setResubmitEntry(null)} disabled={resubmitting}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-80 disabled:opacity-40"
                style={{ border: t.border, color: t.textMuted, background: 'transparent' }}>
                Cancel
              </button>
              <button onClick={handleResubmit}
                disabled={resubmitting || !resubmitWork.trim() || !resubmitHours}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                style={{ background: 'linear-gradient(135deg,#7c3aed,#8b5cf6)' }}>
                {resubmitting ? 'Resubmitting…' : 'Resubmit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
