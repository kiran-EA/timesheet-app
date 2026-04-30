'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/lib/theme';

const API = process.env.NEXT_PUBLIC_API_URL;

interface CalEvent {
  id: string; title: string; start: string; end: string;
  location: string; duration_hours: number; already_logged: boolean;
  response_status: string;   // personal | organizer | accepted | tentative | declined | needsAction
}
interface JiraTask { key: string; title: string; }
interface EventRow extends CalEvent {
  hours: string; description: string; task_key: string; deleted: boolean;
}
interface AdminUser { user_id: string; full_name: string; email: string; }

const DEFAULT_GENERAL: JiraTask[] = [
  { key: 'HSB-7',  title: 'Team Meetings' },
  { key: 'HSB-19', title: 'Holiday' },
  { key: 'HSB-8',  title: 'Leave' },
  { key: 'HSB-20', title: 'Comp Off' },
  { key: 'HSB-37', title: 'Non Billable' },
  { key: 'HSB-38', title: 'LOP' },
];

function fmt(iso: string) {
  try { return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }); }
  catch { return iso; }
}
function aH(token: string) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

export default function CalendarPage() {
  const token    = useAuthStore((s) => s.token) ?? '';
  const authUser = useAuthStore((s) => s.user);
  const router   = useRouter();
  const isAdmin  = authUser?.role === 'admin';
  const myId     = authUser?.id ?? '';
  const today    = new Date().toISOString().split('T')[0];

  // Calendar allows fetching today + 3 future working days
  const maxCalendarDate = (() => {
    let count = 0;
    const d = new Date();
    while (count < 3) {
      d.setDate(d.getDate() + 1);
      if (d.getDay() !== 0 && d.getDay() !== 6) count++;
    }
    return d.toISOString().split('T')[0];
  })();

  const [date,         setDate]         = useState(today);
  const [rows,         setRows]         = useState<EventRow[]>([]);
  const [loading,      setLoading]      = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [error,        setError]        = useState('');
  const [fetched,      setFetched]      = useState(false);
  const [jiraTasks,    setJiraTasks]    = useState<JiraTask[]>([]);
  const [generalTasks, setGeneralTasks] = useState<JiraTask[]>(DEFAULT_GENERAL);
  const [adminUsers,   setAdminUsers]   = useState<AdminUser[]>([]);
  const [targetId,     setTargetId]     = useState('');

  const effectiveId = isAdmin ? (targetId || myId) : myId;

  useEffect(() => {
    if (!isAdmin || !token) return;
    fetch(`${API}/users/all`, { headers: aH(token) })
      .then(r => r.ok ? r.json() : { users: [] })
      .then(d => {
        setAdminUsers(d.users ?? []);
        if (!targetId) setTargetId(myId);
      })
      .catch(() => {});
  }, [isAdmin, token, myId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!token) return;
    fetch(`${API}/jira/tasks`, { headers: aH(token) })
      .then((r) => r.ok ? r.json() : []).then(setJiraTasks).catch(() => {});
    fetch(`${API}/jira/general-tasks`, { headers: aH(token) })
      .then((r) => r.ok ? r.json() : DEFAULT_GENERAL).then(setGeneralTasks).catch(() => {});
  }, [token]);

  const fetchEvents = useCallback(async () => {
    setLoading(true); setError(''); setFetched(false);
    try {
      const res = await fetch(`${API}/calendar/events-by-date?date=${date}`, { headers: aH(token) });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setRows((data.events as CalEvent[]).map((e) => ({
        ...e, hours: String(e.duration_hours), description: e.title, task_key: 'HSB-7', deleted: false,
      })));
      setFetched(true);
      if (!data.count) setError('No timed events found for this date.');
    } catch (ex: unknown) {
      setError(`Failed: ${ex instanceof Error ? ex.message : String(ex)}`);
    } finally { setLoading(false); }
  }, [date, token]);

  const update = (id: string, field: keyof EventRow, val: string) =>
    setRows((prev) => prev.map((r) => r.id === id ? { ...r, [field]: val } : r));
  const deleteRow = (id: string) =>
    setRows((prev) => prev.map((r) => r.id === id ? { ...r, deleted: true } : r));

  const submitAll = useCallback(async () => {
    const toLog = rows.filter((r) => !r.deleted && !r.already_logged && parseFloat(r.hours) > 0);
    if (!toLog.length) { setError('Nothing to submit.'); return; }
    setSaving(true); setError('');
    const loggingForOther = isAdmin && effectiveId !== myId;
    for (const row of toLog) {
      const all = [...generalTasks, ...jiraTasks];
      const taskTitle = all.find((tk) => tk.key === row.task_key)?.title ?? row.task_key;
      try {
        await fetch(`${API}/timesheet/entries`, {
          method: 'POST', headers: aH(token),
          body: JSON.stringify({
            task_id: row.task_key, task_title: taskTitle,
            entry_date: date, work_description: row.description, hours: parseFloat(row.hours),
            ...(loggingForOther ? { target_user_id: effectiveId } : {}),
          }),
        });
      } catch (ex) { console.error('save error', ex); }
    }
    setSaving(false);
    router.push(`/timesheet?date=${date}`);
  }, [rows, date, token, generalTasks, jiraTasks, router, isAdmin, effectiveId, myId]);

  const visible = rows.filter((r) => !r.deleted);
  const pendingCount = visible.filter((r) => !r.already_logged).length;

  // ── Section definitions (order matters) ────────────────────────────────────
  const SECTIONS = [
    { key: 'accepted',    statuses: ['personal', 'organizer', 'accepted'], label: 'Accepted',    color: '#10b981', bg: 'rgba(16,185,129,0.08)'  },
    { key: 'tentative',   statuses: ['tentative'],                          label: 'Tentative',   color: '#f59e0b', bg: 'rgba(245,158,11,0.08)'  },
    { key: 'needsAction', statuses: ['needsAction'],                        label: 'No Response', color: '#64748b', bg: 'rgba(100,116,139,0.08)' },
    { key: 'declined',    statuses: ['declined'],                           label: 'Declined',    color: '#ef4444', bg: 'rgba(239,68,68,0.08)'   },
  ];

  return (
    <div className="flex flex-col h-full" style={{ background: t.pageBg }}>
      <div className="flex items-center justify-between px-8 h-[70px] flex-shrink-0"
        style={{ background: t.headerBg, borderBottom: t.border }}>
        <div>
          <h2 className="text-xl font-semibold" style={{ color: t.text }}>Calendar Import</h2>
          <p className="text-sm" style={{ color: t.textMuted }}>
            {isAdmin && effectiveId !== myId
              ? `Logging entries for ${adminUsers.find(u => u.user_id === effectiveId)?.full_name ?? 'selected user'}`
              : 'Fetch Google Calendar events and log them as timesheet entries'}
          </p>
        </div>
        {isAdmin && adminUsers.length > 0 && (
          <select value={effectiveId} onChange={e => { setTargetId(e.target.value); setFetched(false); setRows([]); }}
            className="px-3 py-2 rounded-lg text-sm focus:outline-none"
            style={{ background: t.inputBg, border: `1px solid ${t.inputBorder}`, color: t.text, minWidth: 220 }}>
            {adminUsers.map(u => (
              <option key={u.user_id} value={u.user_id}>
                {u.full_name} ({u.email}){u.user_id === myId ? ' — Me' : ''}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-8">
      <div className="max-w-[1440px] mx-auto space-y-6">
        <div className="flex items-end gap-4">
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: t.textMuted }}>Select Date</label>
            <input type="date" value={date} max={maxCalendarDate}
              onChange={(e) => { setDate(e.target.value); setFetched(false); setRows([]); }}
              className="px-4 py-2.5 rounded-lg text-sm focus:outline-none"
              style={{ background: t.inputBg, border: `1px solid ${t.inputBorder}`, color: t.text, colorScheme: t.colorScheme }} />
          </div>
          <button onClick={fetchEvents} disabled={loading}
            className="flex items-center gap-2 px-6 py-2.5 rounded-lg text-white font-semibold text-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
            style={{ background: 'linear-gradient(135deg,#2563eb,#1d4ed8)' }}>
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            {loading ? 'Fetching...' : 'Fetch Events'}
          </button>
        </div>

        {error && (
          <div className="px-4 py-3 rounded-lg text-sm"
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', color: '#dc2626' }}>
            {error}
          </div>
        )}

        {fetched && visible.length > 0 && (
          <div className="space-y-4">
            {/* ── Single Submit All header ── */}
            <div className="flex items-center justify-between px-1">
              <p className="text-sm font-medium" style={{ color: t.textMuted }}>
                {new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                <span className="ml-2" style={{ color: t.textSubtle }}>· {visible.length} events</span>
              </p>
              <button onClick={submitAll} disabled={saving || pendingCount === 0}
                className="px-5 py-2 rounded-lg text-white font-semibold text-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
                style={{ background: 'linear-gradient(135deg,#047857,#065f46)' }}>
                {saving ? 'Saving...' : `Submit All (${pendingCount})`}
              </button>
            </div>

            {/* ── Sections ── */}
            {SECTIONS.map((section) => {
              const sectionRows = visible.filter((r) => section.statuses.includes(r.response_status));
              if (sectionRows.length === 0) return null;
              return (
                <div key={section.key} className="rounded-xl overflow-hidden shadow-sm" style={{ background: t.cardBg, border: t.border }}>
                  {/* Section header */}
                  <div className="px-5 py-3 flex items-center gap-2.5" style={{ background: section.bg, borderBottom: t.border }}>
                    <span className="w-2 h-2 rounded-full" style={{ background: section.color }} />
                    <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: section.color }}>
                      {section.label}
                    </span>
                    <span className="text-xs px-1.5 py-0.5 rounded font-medium"
                      style={{ background: section.color + '22', color: section.color }}>
                      {sectionRows.length}
                    </span>
                  </div>

                  {/* Table */}
                  <div className="overflow-x-auto">
                  <table className="w-full text-sm" style={{ minWidth: 760 }}>
                    <thead style={{ background: t.tableHead }}>
                      <tr>
                        {['Time', 'Event Title', 'Task', 'Work Description', 'Hours', 'Status', ''].map((h) => (
                          <th key={h} className="px-4 py-3 text-left font-semibold"
                            style={{ color: t.textHeader, borderBottom: t.border, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sectionRows.map((row) => (
                        <tr key={row.id} style={{ borderBottom: t.border, opacity: row.already_logged ? 0.55 : 1 }}>
                          <td className="px-4 py-3.5 whitespace-nowrap font-mono text-xs" style={{ color: t.textMuted }}>
                            {fmt(row.start)} - {fmt(row.end)}
                          </td>
                          <td className="px-4 py-3.5 max-w-[140px]">
                            <span className="truncate block text-xs font-medium" title={row.title} style={{ color: t.text }}>{row.title}</span>
                          </td>
                          <td className="px-4 py-3.5">
                            <select value={row.task_key} disabled={row.already_logged}
                              onChange={(e) => update(row.id, 'task_key', e.target.value)}
                              className="px-2 py-1.5 rounded-md text-xs focus:outline-none"
                              style={{ background: t.inputBg, border: `1px solid ${t.inputBorder}`, color: t.text, minWidth: 155 }}>
                              <optgroup label="General Purpose">
                                {generalTasks.map((tk) => (
                                  <option key={tk.key} value={tk.key}>{tk.key} - {tk.title}</option>
                                ))}
                              </optgroup>
                              <optgroup label="Jira Tasks">
                                {jiraTasks.map((tk) => (
                                  <option key={tk.key} value={tk.key}>{tk.key} - {tk.title.slice(0, 35)}</option>
                                ))}
                              </optgroup>
                            </select>
                          </td>
                          <td className="px-4 py-3.5">
                            <input type="text" value={row.description} disabled={row.already_logged}
                              onChange={(e) => update(row.id, 'description', e.target.value)}
                              className="w-full px-2 py-1.5 rounded-md text-xs focus:outline-none"
                              style={{ background: t.inputBg, border: `1px solid ${t.inputBorder}`, color: t.text, minWidth: 160 }} />
                          </td>
                          <td className="px-4 py-3.5">
                            <input type="number" min="0.25" max="24" step="0.25" value={row.hours} disabled={row.already_logged}
                              onChange={(e) => update(row.id, 'hours', e.target.value)}
                              className="w-20 px-2 py-1.5 rounded-md text-xs font-mono focus:outline-none"
                              style={{ background: t.inputBg, border: `1px solid ${t.inputBorder}`, color: t.text }} />
                          </td>
                          <td className="px-4 py-3.5">
                            {row.already_logged
                              ? <span className="px-2.5 py-1 rounded-full text-xs font-semibold" style={{ background: 'rgba(16,185,129,0.12)', color: '#059669' }}>Logged</span>
                              : <span className="px-2.5 py-1 rounded-full text-xs font-semibold" style={{ background: 'rgba(245,158,11,0.12)', color: '#d97706' }}>Pending</span>}
                          </td>
                          <td className="px-4 py-3.5">
                            {!row.already_logged && (
                              <button onClick={() => deleteRow(row.id)}
                                className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-50 transition-colors"
                                style={{ color: t.textSubtle }}>
                                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                                </svg>
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
