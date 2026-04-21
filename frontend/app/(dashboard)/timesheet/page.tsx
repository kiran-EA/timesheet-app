'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useTimesheetStore, timeAgo, JiraTaskCached, EntryCached } from '@/store/timesheetStore';
import { t } from '@/lib/theme';

const API = process.env.NEXT_PUBLIC_API_URL;

// ── type aliases matching store types ────────────────────────────────────────
type JiraTask = JiraTaskCached;
type Entry    = EntryCached;

// ── 3-working-day helpers ─────────────────────────────────────────────────────
function addWorkingDays(from: Date, n: number, direction: 1 | -1): string {
  let count = 0;
  const d = new Date(from);
  while (count < n) {
    d.setDate(d.getDate() + direction);
    const day = d.getDay();
    if (day !== 0 && day !== 6) count++;   // skip Sun(0) & Sat(6)
  }
  return d.toISOString().split('T')[0];
}

// ── helpers ───────────────────────────────────────────────────────────────────
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

function StatusBadge({ status }: { status: string }) {
  const s =
    status === 'In Progress'         ? { bg: 'rgba(59,130,246,0.2)',  color: '#60a5fa' } :
    status === 'Done'                ? { bg: 'rgba(16,185,129,0.2)',  color: '#34d399' } :
    status === 'Needs Documentation' ? { bg: 'rgba(139,92,246,0.2)', color: '#a78bfa' } :
                                       { bg: 'rgba(100,116,139,0.2)', color: '#64748b' };
  return (
    <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold"
      style={{ background: s.bg, color: s.color }}>
      {status}
    </span>
  );
}

function hoursColor(logged: number, est: number | null) {
  if (!est) return '#94a3b8';
  const pct = (logged / est) * 100;
  if (pct >= 90) return '#ef4444';
  if (pct >= 70) return '#f59e0b';
  return '#10b981';
}

// ── "Last updated" pill ───────────────────────────────────────────────────────
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

// ── Task table ────────────────────────────────────────────────────────────────
function TaskTable({ tasks, onLog, simple = false, showAssignee = false, assigneeLabel, loggedKeys }: {
  tasks: JiraTask[]; onLog: (task: JiraTask) => void; simple?: boolean; showAssignee?: boolean; assigneeLabel?: string; loggedKeys?: Set<string>;
}) {
  if (tasks.length === 0)
    return <div className="text-center py-10" style={{ color: t.textSubtle }}>No tasks in this section.</div>;

  const headers = simple
    ? ['Task No', 'Purpose', 'Status', '']
    : [
        'Task No', 'Description', 'Epic',
        ...(showAssignee ? ['Assignee'] : []),
        'SP', 'Est. Hours', 'Logged', 'Remaining', 'Progress', 'Status', '',
      ];

  return (
    <div className="rounded-lg overflow-hidden" style={{ border: t.border }}>
      <table className="w-full text-sm border-collapse">
        <thead style={{ background: t.tableHead }}>
          <tr>
            {headers.map((h) => (
              <th key={h} className="px-4 py-3.5 text-left font-semibold"
                style={{ color: t.textHeader, borderBottom: t.border, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => {
            const remaining = task.est_hours != null ? Math.max(0, task.est_hours - task.logged_hours) : null;
            const pct = task.est_hours && task.est_hours > 0
              ? Math.min(100, Math.round((task.logged_hours / task.est_hours) * 100)) : 0;
            const pctColor = pct >= 100 ? '#ef4444' : pct >= 75 ? '#f59e0b' : '#10b981';

            // Disable Log when logged >= est * 1.2 (no allocation left at all)
            const maxAllowed   = task.est_hours != null ? task.est_hours * 1.2 : null;
            const logExhausted = maxAllowed != null && task.logged_hours >= maxAllowed;

            const alreadyLogged = loggedKeys?.has(task.key) ?? false;

            return (
              <tr key={task.id} style={{ borderBottom: t.border }}>
                <td className="px-4 py-4">
                  <span className="px-2.5 py-1 rounded-md text-xs font-semibold"
                    style={{ background: 'rgba(59,130,246,0.15)', color: '#3b82f6' }}>
                    {task.key}
                  </span>
                </td>
                <td className="px-4 py-4 max-w-[240px] truncate" style={{ color: t.textBody }} title={task.title}>
                  {task.title}
                </td>
                {!simple && (
                  <td className="px-4 py-4">
                    {task.epic ? (
                      <span className="px-2 py-0.5 rounded text-xs font-semibold cursor-help"
                        style={{ background: 'rgba(16,185,129,0.12)', color: '#059669' }}
                        title={task.epic_name ? `${task.epic_name} (${task.epic})` : task.epic}>
                        {task.epic}
                      </span>
                    ) : (
                      <span style={{ color: t.textSubtle }}>—</span>
                    )}
                  </td>
                )}
                {!simple && showAssignee && (
                  <td className="px-4 py-4 text-xs font-medium" style={{ color: t.textBody }}>
                    {task.assignee ?? assigneeLabel ?? <span style={{ color: t.textSubtle }}>—</span>}
                  </td>
                )}
                {!simple && (
                  <>
                    <td className="px-4 py-4 text-center font-bold" style={{ color: '#8b5cf6' }}>
                      {task.story_points ?? '—'}
                    </td>
                    <td className="px-4 py-4 font-mono font-semibold" style={{ color: t.text }}>
                      {task.est_hours != null ? `${task.est_hours}h` : '—'}
                    </td>
                    <td className="px-4 py-4 font-mono font-semibold"
                      style={{ color: hoursColor(task.logged_hours, task.est_hours) }}>
                      {task.logged_hours}h
                    </td>
                    <td className="px-4 py-4 font-mono font-semibold"
                      style={{ color: remaining != null ? (remaining === 0 ? '#ef4444' : '#3b82f6') : t.textSubtle }}>
                      {remaining != null ? `${remaining}h` : '—'}
                    </td>
                    <td className="px-4 py-4">
                      {task.est_hours != null ? (
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-2 min-w-[90px]">
                            <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: t.borderColor }}>
                              <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: pctColor }} />
                            </div>
                            <span className="text-xs font-semibold tabular-nums" style={{ color: pctColor, minWidth: 32 }}>
                              {pct}%
                            </span>
                          </div>
                          {remaining === 0 && (
                            <span className="text-xs" style={{ color: '#f59e0b' }}>
                              +{(task.est_hours * 0.2).toFixed(1)}h extra
                            </span>
                          )}
                        </div>
                      ) : <span style={{ color: t.textSubtle }}>—</span>}
                    </td>
                  </>
                )}
                <td className="px-4 py-4"><StatusBadge status={task.status} /></td>
                <td className="px-4 py-4">
                  {alreadyLogged ? (
                    <button disabled
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:cursor-not-allowed"
                      style={{ background: '#10b981', opacity: 0.75 }}>
                      ✓ Logged
                    </button>
                  ) : (
                    <button onClick={() => onLog(task)}
                      disabled={logExhausted}
                      title={logExhausted ? 'All allocated hours (est + 20% extra) are used up' : undefined}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                      style={{ background: logExhausted ? '#6b7280' : '#3b82f6' }}>
                      {logExhausted ? 'Full' : '+ Log'}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Refresh icon ──────────────────────────────────────────────────────────────
function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg className={`w-4 h-4 ${spinning ? 'animate-spin' : ''}`}
      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function TimesheetPage() {
  const token   = useAuthStore((s) => s.token) ?? '';
  const authUser = useAuthStore((s) => s.user);
  const isAdmin  = authUser?.role === 'admin';
  const myUserId = authUser?.id ?? '';
  const today          = new Date().toISOString().split('T')[0];
  // 3 working days back — undefined for admin (no restriction)
  const minAllowedDate = isAdmin ? undefined : addWorkingDays(new Date(), 3, -1);

  // ── cache store ──────────────────────────────────────────────────────────
  const selectedDate    = useTimesheetStore((s) => s.selectedDate);
  const entries         = useTimesheetStore((s) => s.entries);
  const entriesFetched  = useTimesheetStore((s) => s.entriesFetchedAt);
  const tasks           = useTimesheetStore((s) => s.tasks);
  const generalTasks    = useTimesheetStore((s) => s.generalTasks);
  const tasksFetched    = useTimesheetStore((s) => s.tasksFetchedAt);
  const jiraConnected   = useTimesheetStore((s) => s.jiraConnected);
  const jiraError       = useTimesheetStore((s) => s.jiraError);
  const weekHours       = useTimesheetStore((s) => s.weekHours);

  const setSelectedDate        = useTimesheetStore((s) => s.setSelectedDate);
  const setEntries             = useTimesheetStore((s) => s.setEntries);
  const setTasks               = useTimesheetStore((s) => s.setTasks);
  const setWeekHours           = useTimesheetStore((s) => s.setWeekHours);
  const updateEntry            = useTimesheetStore((s) => s.updateEntry);
  const updateAllEntry         = useTimesheetStore((s) => s.updateAllEntry);
  const removeEntry            = useTimesheetStore((s) => s.removeEntry);
  const addEntry               = useTimesheetStore((s) => s.addEntry);
  const updateTaskLoggedHours  = useTimesheetStore((s) => s.updateTaskLoggedHours);

  // ── local UI state (not cached — cheap to recreate) ─────────────────────
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [loadingTasks,   setLoadingTasks]   = useState(false);
  const [error,          setError]          = useState('');
  const [syncMsg,        setSyncMsg]        = useState('');
  const [activeTab,      setActiveTab]      = useState<'sprint' | 'available' | 'general'>('sprint');

  // ── admin: log on behalf of another user ─────────────────────────────────
  interface AdminUser { user_id: string; email: string; full_name: string; role: string; }
  const [adminUsers,          setAdminUsers]          = useState<AdminUser[]>([]);
  const [targetUserId,        setTargetUserId]         = useState<string>(myUserId);
  const [adminViewEntries,    setAdminViewEntries]     = useState<Entry[]>([]);
  const [adminViewWeekHours,  setAdminViewWeekHours]   = useState(0);
  const [adminViewFetchedAt,  setAdminViewFetchedAt]   = useState<number|null>(null);
  const [adminViewTasks,      setAdminViewTasks]       = useState<JiraTask[]>([]);
  const [adminViewGenTasks,   setAdminViewGenTasks]    = useState<JiraTask[]>([]);
  const isViewingOther = isAdmin && targetUserId !== myUserId && targetUserId !== '';
  const targetUser = adminUsers.find((u) => u.user_id === targetUserId);

  // ── active lists — switch between own and admin-view ────────────────────
  const activeTasks   = isViewingOther ? adminViewTasks   : tasks;
  const activeGeneral = isViewingOther ? adminViewGenTasks : generalTasks;

  const sprintTasks    = useMemo(() => activeTasks.filter((t) => t.is_active_sprint),  [activeTasks]);
  const availableTasks = useMemo(() => activeTasks.filter((t) => !t.is_active_sprint), [activeTasks]);

  // ── track which date's entries are currently cached ──────────────────────
  // So if user changes date, we re-fetch entries even though tasks are cached.
  const cachedEntriesDateRef = useRef<string | null>(
    entriesFetched ? selectedDate : null
  );

  // ── fetchers ──────────────────────────────────────────────────────────────
  const fetchEntries = useCallback(async (date: string, forUserId?: string) => {
    setLoadingEntries(true);
    const uidParam = forUserId ? `&for_user_id=${forUserId}` : '';
    try {
      const [entriesRes, statsRes] = await Promise.all([
        fetch(`${API}/timesheet/entries?entry_date=${date}${uidParam}`, { headers: authHeaders(token) }),
        fetch(`${API}/timesheet/stats${uidParam ? `?for_user_id=${forUserId}` : ''}`, { headers: authHeaders(token) }),
      ]);
      const entriesData = entriesRes.ok ? await entriesRes.json() : [];
      const statsData   = statsRes.ok  ? await statsRes.json()   : {};
      if (forUserId) {
        setAdminViewEntries(entriesData);
        setAdminViewWeekHours(statsData.week_hours ?? 0);
        setAdminViewFetchedAt(Date.now());
      } else {
        setEntries(entriesData, statsData.week_hours ?? 0);
        cachedEntriesDateRef.current = date;
      }
    } catch (e) { console.error('entries fetch', e); }
    finally { setLoadingEntries(false); }
  }, [token, setEntries, setAdminViewEntries, setAdminViewWeekHours, setAdminViewFetchedAt]);

  const fetchTasks = useCallback(async (forUserId?: string, force = false) => {
    setLoadingTasks(true); setError('');
    try {
      const viewingOther = isAdmin && forUserId && forUserId !== myUserId;
      // When viewing another user: fetch their specific tasks via ?for_user_id=
      // On initial load (no user selected): admin fetches all project tasks
      const userParam = viewingOther ? `?for_user_id=${forUserId}` : '';
      const forceParam = force ? (userParam ? '&force=true' : '?force=true') : '';
      // Always fetch own tasks via /jira/tasks; only use for_user_id when viewing another user
      const tasksEndpoint = `${API}/jira/tasks${userParam}${forceParam}`;

      const [statusRes, tasksRes, generalRes] = await Promise.all([
        fetch(`${API}/jira/status`,                     { headers: authHeaders(token) }),
        fetch(tasksEndpoint,                            { headers: authHeaders(token) }),
        fetch(`${API}/jira/general-tasks${userParam}`,  { headers: authHeaders(token) }),
      ]);
      const status  = statusRes.ok  ? await statusRes.json()  : { connected: false, error: 'Request failed' };
      const fetched = tasksRes.ok   ? await tasksRes.json()   : [];
      const general = generalRes.ok ? await generalRes.json() : [];

      if (viewingOther) {
        // Store in local admin-view state — don't pollute the global store
        setAdminViewTasks(fetched);
        setAdminViewGenTasks(general);
      } else {
        setTasks(fetched, general, status.connected, status.error ?? '');
      }
      if (!status.connected) setError(status.error ?? 'Jira connection failed');
    } catch (e: unknown) {
      setError(`Failed to load tasks: ${e instanceof Error ? e.message : e}`);
      if (!forUserId) setTasks([], [], false, String(e));
    } finally { setLoadingTasks(false); }
  }, [token, setTasks, isAdmin, myUserId]);

  // ── on mount: always fetch fresh entries (status changes when manager approves) ──
  const mountedRef = useRef(false);
  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;

    fetchEntries(selectedDate);      // always fresh — approval by another user changes status
    fetchTasks(undefined, true);     // force=true — bypass server cache so epic_name is always present

    // Admin: pre-load full user list for the selector
    if (isAdmin) {
      fetch(`${API}/users/all`, { headers: authHeaders(token) })
        .then((r) => r.ok ? r.json() : { users: [] })
        .then((d) => setAdminUsers(d.users ?? []));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── admin: switch target user — refresh both entries AND tasks ──────────
  const handleTargetUserChange = (uid: string) => {
    setTargetUserId(uid);
    if (uid && uid !== myUserId) {
      fetchEntries(selectedDate, uid);
      fetchTasks(uid);
    } else {
      fetchEntries(selectedDate);
      fetchTasks();   // reset to admin's own / all-tasks view
    }
  };

  // ── when user picks a new date → always re-fetch entries ─────────────────
  const handleDateChange = (date: string) => {
    setSelectedDate(date);
    fetchEntries(date, isViewingOther ? targetUserId : undefined);
  };

  // ── manual refresh handlers ───────────────────────────────────────────────
  const handleRefreshEntries = () => fetchEntries(selectedDate, isViewingOther ? targetUserId : undefined);

  const handleRefreshTasks = async () => {
    await fetchTasks(isViewingOther ? targetUserId : undefined, true); // force=true bypasses server cache
    setSyncMsg(`Synced — ${new Date().toLocaleTimeString()}`);
    setTimeout(() => setSyncMsg(''), 4000);
  };

  // ── row-level progress ────────────────────────────────────────────────────
  const [rowLoading, setRowLoading] = useState<Record<string, 'updating' | 'deleting'>>({});

  // ── entry delete ──────────────────────────────────────────────────────────
  const handleDelete = async (entry: Entry) => {
    setRowLoading((prev) => ({ ...prev, [entry.id]: 'deleting' }));
    const url = isViewingOther
      ? `${API}/timesheet/entries/${entry.id}?for_user_id=${targetUserId}`
      : `${API}/timesheet/entries/${entry.id}`;
    try {
      const res = await fetch(url, { method: 'DELETE', headers: authHeaders(token) });
      if (res.ok || res.status === 204) {
        if (isViewingOther) setAdminViewEntries((prev) => prev.filter((e) => e.id !== entry.id));
        else removeEntry(entry.id);
      }
    } catch (e) { console.error('delete', e); }
    finally { setRowLoading((prev) => { const n = { ...prev }; delete n[entry.id]; return n; }); }
  };

  // ── unified edit / resubmit modal ─────────────────────────────────────────
  const [editModal,        setEditModal]        = useState<{ entry: Entry; task: JiraTask | null } | null>(null);
  const [editModalWork,    setEditModalWork]    = useState('');
  const [editModalHours,   setEditModalHours]   = useState('');
  const [editModalSaving,  setEditModalSaving]  = useState(false);
  const [editModalError,   setEditModalError]   = useState('');

  const openEditModal = (entry: Entry) => {
    const task = [...activeTasks, ...activeGeneral].find((t) => t.key === entry.task_id) ?? null;
    setEditModal({ entry, task });
    setEditModalWork(entry.work_description);
    setEditModalHours(String(entry.hours));
    setEditModalError('');
  };

  const handleEditModalSave = async () => {
    if (!editModal) return;
    const { entry } = editModal;
    setEditModalSaving(true); setEditModalError('');
    const isResubmit = entry.status === 'rejected';
    const url = `${API}/timesheet/entries/${entry.id}/resubmit`;
    const body: Record<string, unknown> = {
      work_description: editModalWork.trim(),
      hours: parseFloat(editModalHours),
      is_resubmit: isResubmit,
    };
    if (isViewingOther) body.for_user_id = targetUserId;
    try {
      const res = await fetch(url, { method: 'PUT', headers: authHeaders(token), body: JSON.stringify(body) });
      if (!res.ok) { setEditModalError(`Failed: ${await res.text()}`); return; }
      const patch = isResubmit
        ? { work_description: editModalWork.trim(), hours: parseFloat(editModalHours), status: 'resubmitted', rejection_reason: null as null }
        : { work_description: editModalWork.trim(), hours: parseFloat(editModalHours) };
      if (isViewingOther) {
        setAdminViewEntries((prev) => prev.map((e) => e.id === entry.id ? { ...e, ...patch } : e));
      } else {
        updateEntry(entry.id, patch);
        updateAllEntry(entry.id, patch);
      }
      setEditModal(null);
    } catch (e) {
      setEditModalError(`Network error: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setEditModalSaving(false); }
  };

  // ── log time modal ────────────────────────────────────────────────────────
  const [addingTask, setAddingTask] = useState<JiraTask | null>(null);
  const [logDate,    setLogDate]    = useState(today);
  const [newWork,    setNewWork]    = useState('');
  const [newHours,   setNewHours]   = useState('');
  const [saving,     setSaving]     = useState(false);
  const [saveError,  setSaveError]  = useState('');

  const openModal = (task: JiraTask) => {
    setAddingTask(task); setLogDate(selectedDate); setNewWork(''); setNewHours(''); setSaveError('');
  };

  const handleSaveEntry = async () => {
    if (!addingTask || !newWork.trim() || !newHours) return;
    setSaving(true); setSaveError('');
    try {
      const body: Record<string, unknown> = {
        task_id: addingTask.key, task_title: addingTask.title,
        entry_date: logDate, work_description: newWork.trim(), hours: parseFloat(newHours),
        epic: addingTask.epic ?? null,
      };
      if (isViewingOther) body.target_user_id = targetUserId;

      const res = await fetch(`${API}/timesheet/entries`, {
        method: 'POST', headers: authHeaders(token),
        body: JSON.stringify(body),
      });
      if (!res.ok) { setSaveError(`Save failed (${res.status}): ${await res.text()}`); return; }
      const saved = await res.json();

      const addH = parseFloat(newHours);
      if (isViewingOther) {
        // Refresh the target user's entries view
        if (logDate !== selectedDate) setSelectedDate(logDate);
        fetchEntries(logDate, targetUserId);
        // Update logged_hours in admin-view task lists
        setAdminViewTasks((prev) => prev.map((t) => t.key === addingTask.key ? { ...t, logged_hours: t.logged_hours + addH } : t));
        setAdminViewGenTasks((prev) => prev.map((t) => t.key === addingTask.key ? { ...t, logged_hours: t.logged_hours + addH } : t));
      } else {
        if (logDate === selectedDate) {
          addEntry(saved);
        } else {
          setSelectedDate(logDate);
          fetchEntries(logDate);
        }
        // Update logged_hours in store (avoids full Jira re-fetch)
        updateTaskLoggedHours(addingTask.key, addH);
        // Refresh own week hours
        fetch(`${API}/timesheet/stats`, { headers: authHeaders(token) })
          .then((r) => r.ok ? r.json() : {})
          .then((d: { week_hours?: number }) => { if (d.week_hours != null) setWeekHours(d.week_hours); });
      }

      setAddingTask(null); setNewWork(''); setNewHours('');
    } catch (e: unknown) {
      setSaveError(`Network error: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setSaving(false); }
  };

  const activeEntries    = isViewingOther ? adminViewEntries  : entries;
  const activeWeekHours  = isViewingOther ? adminViewWeekHours : weekHours;
  const activeEntriesFetched = isViewingOther ? adminViewFetchedAt : entriesFetched;
  const totalDayHours    = activeEntries.reduce((s, e) => s + e.hours, 0);

  // Set of task keys already logged for the selected date — used to disable Log button
  const loggedTaskKeys = useMemo(() => new Set(activeEntries.map((e) => e.task_id)), [activeEntries]);

  const Tab = ({ id, label, count }: { id: 'sprint' | 'available' | 'general'; label: string; count: number }) => (
    <button onClick={() => setActiveTab(id)}
      className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all"
      style={activeTab === id
        ? { background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)', color: '#fff' }
        : { background: 'transparent', color: t.textMuted, border: t.border }}>
      {label}
      <span className="px-2 py-0.5 rounded-full text-xs font-bold"
        style={{ background: activeTab === id ? 'rgba(255,255,255,0.2)' : t.cardBg2, color: activeTab === id ? '#fff' : t.textMuted }}>
        {count}
      </span>
    </button>
  );

  return (
    <div className="flex flex-col h-full" style={{ background: t.pageBg }}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-8 h-[70px] flex-shrink-0"
        style={{ background: t.headerBg, borderBottom: t.border }}>
        <div>
          <h2 className="text-xl font-semibold" style={{ color: t.text }}>
            {isViewingOther ? `Timesheet — ${targetUser?.full_name ?? '…'}` : 'My Timesheet'}
          </h2>
          <p className="text-sm" style={{ color: t.textMuted }}>
            {isViewingOther ? targetUser?.email : 'Track your time and manage your tasks'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Admin: user selector — all users including admin */}
          {isAdmin && (
            <select value={targetUserId} onChange={(e) => handleTargetUserChange(e.target.value)}
              className="px-3 py-2 rounded-lg text-sm focus:outline-none"
              style={{ background: t.inputBg, border: `1px solid ${t.inputBorder}`, color: t.text }}>
              {adminUsers.map((u) => (
                <option key={u.user_id} value={u.user_id}>
                  {u.full_name} ({u.email}){u.user_id === myUserId ? ' — Me' : ''}
                </option>
              ))}
            </select>
          )}
          <input type="date" value={selectedDate}
            min={minAllowedDate}
            max={isAdmin ? undefined : today}
            onChange={(e) => handleDateChange(e.target.value)}
            className="px-4 py-2 rounded-lg text-sm focus:outline-none"
            style={{ background: t.inputBg, border: `1px solid ${t.inputBorder}`, color: t.text, colorScheme: t.colorScheme }} />
        </div>
      </div>

      {/* ── Content ────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-8 space-y-6">

        {syncMsg && (
          <div className="flex items-center gap-3 px-4 py-3.5 rounded-lg text-sm font-medium"
            style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', color: '#059669' }}>
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            {syncMsg}
          </div>
        )}

        {jiraConnected === false && (
          <div className="flex items-start gap-3 px-4 py-4 rounded-xl"
            style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)' }}>
            <svg className="w-5 h-5 mt-0.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <div>
              <p className="text-sm font-semibold" style={{ color: '#d97706' }}>Jira connection failed</p>
              <p className="text-xs mt-1" style={{ color: '#92400e' }}>{jiraError}</p>
            </div>
          </div>
        )}

        {error && (
          <div className="px-4 py-3 rounded-lg text-sm"
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', color: '#dc2626' }}>
            {error}
          </div>
        )}

        {/* ── Stats ────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-4 gap-5">
          {[
            { title: 'This Week',       value: `${activeWeekHours}h`,        icon: '🕐', color: 'rgba(59,130,246,0.15)'  },
            { title: 'Tasks Active',    value: `${activeTasks.length}`,      icon: '📋', color: 'rgba(139,92,246,0.15)' },
            { title: "Today's Hours",   value: `${totalDayHours}h`,          icon: '⏱️',  color: 'rgba(16,185,129,0.15)' },
            { title: "Today's Entries", value: `${activeEntries.length}`,    icon: '📝', color: 'rgba(245,158,11,0.15)' },
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

        {/* ── Timesheet Entries ─────────────────────────────────────────── */}
        <div className="rounded-xl p-6 shadow-sm" style={{ background: t.cardBg, border: t.border }}>
          {/* section header with refresh */}
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-lg font-semibold" style={{ color: t.text }}>
              Timesheet Entries —{' '}
              {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </h3>
            <div className="flex items-center gap-2">
              <LastUpdated ts={activeEntriesFetched} />
              <button onClick={handleRefreshEntries} disabled={loadingEntries}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-opacity hover:opacity-80 disabled:opacity-40"
                style={{ border: t.border, color: t.textMuted, background: 'transparent' }}>
                <RefreshIcon spinning={loadingEntries} />
                Refresh Entries
              </button>
            </div>
          </div>

          {loadingEntries ? (
            <div className="text-center py-10" style={{ color: t.textSubtle }}>Loading entries…</div>
          ) : activeEntries.length === 0 ? (
            <div className="text-center py-10" style={{ color: t.textSubtle }}>
              No entries for this date. Pick a task below and click <strong>+ Log</strong>.
            </div>
          ) : (
            <div className="rounded-lg overflow-hidden" style={{ border: t.border }}>
              <table className="w-full text-sm border-collapse">
                <thead style={{ background: t.tableHead }}>
                  <tr>
                    {['Task No', 'Description', 'Work Done', 'Hours', 'Status', 'Actions'].map((h) => (
                      <th key={h} className="px-4 py-3.5 text-left font-semibold"
                        style={{ color: t.textHeader, borderBottom: t.border, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activeEntries.map((entry) => {
                    const rl      = rowLoading[entry.id];
                    const canEdit = isViewingOther || entry.status === 'pending' || entry.status === 'resubmitted' || entry.status === 'rejected';
                    return (
                    <tr key={entry.id} style={{ borderBottom: t.border,
                      background: entry.status === 'rejected' ? 'rgba(239,68,68,0.03)' : undefined }}>
                      <td className="px-4 py-4">
                        <span className="px-2.5 py-1 rounded-md text-xs font-semibold"
                          style={{ background: 'rgba(59,130,246,0.15)', color: '#3b82f6' }}>
                          {entry.task_id}
                        </span>
                      </td>
                      <td className="px-4 py-4 max-w-[160px] truncate" style={{ color: t.textBody }}>{entry.task_title}</td>
                      <td className="px-4 py-4 max-w-[180px]" style={{ color: t.textBody }}>
                        <div className="truncate">{entry.work_description}</div>
                        {entry.status === 'rejected' && entry.rejection_reason && (
                          <div className="mt-1 text-xs px-2 py-1 rounded"
                            style={{ background: 'rgba(239,68,68,0.08)', color: '#dc2626' }}>
                            ✕ {entry.rejection_reason}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-4 font-mono font-semibold" style={{ color: t.text }}>{entry.hours}h</td>
                      <td className="px-4 py-4"><ApprovalBadge status={entry.status ?? 'pending'} /></td>
                      <td className="px-4 py-4">
                        {rl ? (
                          <span className="text-xs font-medium" style={{ color: t.textSubtle }}>
                            {rl === 'updating' ? `Updating ${entry.task_id}…` : `Deleting ${entry.task_id}…`}
                          </span>
                        ) : (
                          <div className="flex items-center gap-2">
                            {canEdit && (
                              <button onClick={() => openEditModal(entry)}
                                className="w-8 h-8 flex items-center justify-center rounded-lg hover:opacity-80 transition-opacity"
                                style={{ border: t.border, color: t.textMuted, background: 'transparent' }}
                                title={entry.status === 'rejected' ? 'Edit & Resubmit' : 'Edit entry'}>
                                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                </svg>
                              </button>
                            )}
                            {(isViewingOther || entry.status === 'pending' || entry.status === 'resubmitted') && (
                              <button onClick={() => handleDelete(entry)}
                                className="w-8 h-8 flex items-center justify-center rounded-lg hover:opacity-80 transition-opacity"
                                style={{ border: t.border, color: t.textMuted, background: 'transparent' }}>
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <polyline points="3 6 5 6 21 6" />
                                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                </svg>
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Jira Tasks ────────────────────────────────────────────────── */}
        <div className="rounded-xl p-6 shadow-sm" style={{ background: t.cardBg, border: t.border }}>
          {/* section header with refresh */}
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <Tab id="sprint"    label="Current Sprint"        count={sprintTasks.length} />
              <Tab id="available" label="Available Tasks"       count={availableTasks.length} />
              <Tab id="general"   label="General Purpose Tasks" count={activeGeneral.length} />
            </div>
            <div className="flex items-center gap-2">
              <LastUpdated ts={tasksFetched} />
              <button onClick={handleRefreshTasks} disabled={loadingTasks}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-opacity hover:opacity-80 disabled:opacity-40"
                style={{ border: t.border, color: t.textMuted, background: 'transparent' }}>
                <RefreshIcon spinning={loadingTasks} />
                Sync Jira Tasks
              </button>
            </div>
          </div>

          {loadingTasks ? (
            <div className="text-center py-10" style={{ color: t.textSubtle }}>Loading Jira tasks…</div>
          ) : (
            <>
              {activeTab === 'sprint' && (
                sprintTasks.length === 0
                  ? <div className="text-center py-10" style={{ color: t.textSubtle }}>No tasks in an active sprint.</div>
                  : <TaskTable tasks={sprintTasks} onLog={openModal} loggedKeys={loggedTaskKeys} showAssignee={isAdmin} assigneeLabel={isViewingOther ? (targetUser?.full_name ?? undefined) : undefined} />
              )}
              {activeTab === 'available' && <TaskTable tasks={availableTasks} onLog={openModal} loggedKeys={loggedTaskKeys} showAssignee={isAdmin} assigneeLabel={isViewingOther ? (targetUser?.full_name ?? undefined) : undefined} />}
              {activeTab === 'general'   && <TaskTable tasks={activeGeneral}   onLog={openModal} loggedKeys={loggedTaskKeys} simple />}
            </>
          )}
        </div>


      </div>

      {/* ── Log Time Modal ────────────────────────────────────────────────── */}
      {addingTask && (() => {
        // ── hour allocation maths ───────────────────────────────────────────
        const estH        = addingTask.est_hours;
        const loggedH     = addingTask.logged_hours;
        const remainingH  = estH != null ? Math.max(0, estH - loggedH) : null;
        const extraH      = estH != null ? estH * 0.2 : null;
        const maxAdditional = remainingH != null ? remainingH + extraH! : null;
        const enteredH    = parseFloat(newHours) || 0;
        const overLimit   = maxAdditional != null && enteredH > maxAdditional;

        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: t.modalBg, backdropFilter: 'blur(4px)' }}>
          <div className="w-full max-w-md rounded-2xl p-6 space-y-4 shadow-xl"
            style={{ background: t.cardBg, border: t.border }}>
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold" style={{ color: t.text }}>Log Time</h3>
                <p className="text-xs mt-0.5 font-mono" style={{ color: '#3b82f6' }}>{addingTask.key}</p>
                <p className="text-xs mt-0.5" style={{ color: t.textSubtle }}>{addingTask.title}</p>
                {addingTask.epic && (
                  <span className="inline-block mt-1 px-2 py-0.5 rounded text-xs font-semibold"
                    style={{ background: 'rgba(16,185,129,0.12)', color: '#059669' }}>
                    {addingTask.epic}
                  </span>
                )}
              </div>
              <button onClick={() => setAddingTask(null)} style={{ color: t.textSubtle }}>
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Hour allocation indicator */}
            {estH != null && (
              <div className="px-3 py-2 rounded-lg text-xs flex items-center gap-3"
                style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)' }}>
                <span style={{ color: t.textMuted }}>
                  Remaining: <strong style={{ color: remainingH === 0 ? '#ef4444' : '#3b82f6' }}>
                    {remainingH}h
                  </strong>
                </span>
                <span style={{ color: t.textSubtle }}>|</span>
                <span style={{ color: t.textMuted }}>
                  Extra allocated: <strong style={{ color: '#f59e0b' }}>{extraH!.toFixed(1)}h</strong>
                </span>
                <span style={{ color: t.textSubtle }}>|</span>
                <span style={{ color: t.textMuted }}>
                  Max you can log: <strong style={{ color: overLimit ? '#ef4444' : '#10b981' }}>
                    {maxAdditional!.toFixed(1)}h
                  </strong>
                </span>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: t.textMuted }}>Date</label>
                <input type="date" value={logDate}
                  min={minAllowedDate}
                  max={isAdmin ? undefined : today}
                  onChange={(e) => setLogDate(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg text-sm focus:outline-none"
                  style={{ background: t.inputBg, border: `1px solid ${t.inputBorder}`, color: t.text, colorScheme: t.colorScheme }} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: t.textMuted }}>Work done</label>
                <input type="text" value={newWork} onChange={(e) => setNewWork(e.target.value)}
                  placeholder="Describe what you worked on…"
                  className="w-full px-3 py-2.5 rounded-lg text-sm focus:outline-none"
                  style={{ background: t.inputBg, border: `1px solid ${t.inputBorder}`, color: t.text }} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: t.textMuted }}>
                  Hours
                  {maxAdditional != null && (
                    <span className="ml-2 font-normal text-xs" style={{ color: t.textSubtle }}>
                      (max {maxAdditional.toFixed(1)}h)
                    </span>
                  )}
                </label>
                <input type="number" min="0.25" step="0.25" value={newHours}
                  onChange={(e) => setNewHours(e.target.value)} placeholder="e.g. 2.5"
                  className="w-full px-3 py-2.5 rounded-lg text-sm focus:outline-none font-mono"
                  style={{
                    background: t.inputBg,
                    border: `1px solid ${overLimit ? '#ef4444' : t.inputBorder}`,
                    color: t.text,
                  }} />
                {overLimit && (
                  <p className="mt-1 text-xs" style={{ color: '#ef4444' }}>
                    Exceeds max allowed ({maxAdditional!.toFixed(1)}h = {remainingH}h remaining + {extraH!.toFixed(1)}h extra)
                  </p>
                )}
              </div>
            </div>
            {saveError && (
              <div className="px-3 py-2 rounded-lg text-xs"
                style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', color: '#dc2626' }}>
                {saveError}
              </div>
            )}
            <div className="flex gap-3 pt-1">
              <button onClick={handleSaveEntry}
                disabled={saving || !newWork.trim() || !newHours || overLimit}
                className="flex-1 py-2.5 rounded-lg text-white font-semibold text-sm transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)' }}>
                {saving ? 'Saving…' : 'Save Entry'}
              </button>
              <button onClick={() => setAddingTask(null)}
                className="px-5 py-2.5 rounded-lg text-sm font-medium"
                style={{ background: t.inputBg, border: `1px solid ${t.inputBorder}`, color: t.textMuted }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
        );
      })()}

      {/* ── Edit / Resubmit Modal ────────────────────────────────────────── */}
      {editModal && (() => {
        const { entry, task } = editModal;
        const isResubmit = entry.status === 'rejected';
        const estH          = task?.est_hours ?? null;
        const loggedH       = task?.logged_hours ?? 0;
        const otherLoggedH  = loggedH - entry.hours;   // logged hours excluding this entry
        const remainingH    = estH != null ? Math.max(0, estH - otherLoggedH) : null;
        const extraH        = estH != null ? estH * 0.2 : null;
        const maxCanLog     = remainingH != null ? remainingH + extraH! : null;
        const enteredH      = parseFloat(editModalHours) || 0;
        const overLimit     = maxCanLog != null && enteredH > maxCanLog;

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: t.modalBg, backdropFilter: 'blur(4px)' }}>
            <div className="w-full max-w-md rounded-2xl p-6 space-y-4 shadow-xl"
              style={{ background: t.cardBg, border: t.border }}>
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-semibold" style={{ color: t.text }}>
                    {isResubmit ? 'Edit & Resubmit' : 'Edit Entry'}
                  </h3>
                  <p className="text-xs mt-0.5 font-mono" style={{ color: '#3b82f6' }}>{entry.task_id}</p>
                  <p className="text-xs mt-0.5" style={{ color: t.textSubtle }}>{entry.task_title}</p>
                </div>
                <button onClick={() => setEditModal(null)} style={{ color: t.textSubtle }}>
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>

              {/* Rejection reason */}
              {isResubmit && entry.rejection_reason && (
                <div className="px-3 py-2 rounded-lg text-xs"
                  style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', color: '#dc2626' }}>
                  Rejected: {entry.rejection_reason}
                </div>
              )}

              {/* Hour allocation indicator */}
              {estH != null && (
                <div className="px-3 py-2 rounded-lg text-xs flex items-center gap-3 flex-wrap"
                  style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)' }}>
                  <span style={{ color: t.textMuted }}>
                    Remaining: <strong style={{ color: remainingH === 0 ? '#ef4444' : '#3b82f6' }}>{remainingH}h</strong>
                  </span>
                  <span style={{ color: t.textSubtle }}>|</span>
                  <span style={{ color: t.textMuted }}>
                    Extra: <strong style={{ color: '#f59e0b' }}>{extraH!.toFixed(1)}h</strong>
                  </span>
                  <span style={{ color: t.textSubtle }}>|</span>
                  <span style={{ color: t.textMuted }}>
                    Max: <strong style={{ color: overLimit ? '#ef4444' : '#10b981' }}>{maxCanLog!.toFixed(1)}h</strong>
                  </span>
                </div>
              )}

              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: t.textMuted }}>Work done</label>
                  <input type="text" value={editModalWork} onChange={(e) => setEditModalWork(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg text-sm focus:outline-none"
                    style={{ background: t.inputBg, border: `1px solid ${t.inputBorder}`, color: t.text }} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: t.textMuted }}>
                    Hours{maxCanLog != null && <span className="ml-2 font-normal text-xs" style={{ color: t.textSubtle }}>(max {maxCanLog.toFixed(1)}h)</span>}
                  </label>
                  <input type="number" min="0.25" step="0.25" value={editModalHours}
                    onChange={(e) => setEditModalHours(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg text-sm font-mono focus:outline-none"
                    style={{ background: t.inputBg, border: `1px solid ${overLimit ? '#ef4444' : t.inputBorder}`, color: t.text }} />
                  {overLimit && (
                    <p className="mt-1 text-xs" style={{ color: '#ef4444' }}>
                      Exceeds max allowed ({maxCanLog!.toFixed(1)}h = {remainingH}h remaining + {extraH!.toFixed(1)}h extra)
                    </p>
                  )}
                </div>
              </div>

              {editModalError && (
                <div className="px-3 py-2 rounded-lg text-xs"
                  style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', color: '#dc2626' }}>
                  {editModalError}
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button onClick={handleEditModalSave}
                  disabled={editModalSaving || !editModalWork.trim() || !editModalHours || overLimit}
                  className="flex-1 py-2.5 rounded-lg text-white font-semibold text-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
                  style={{ background: isResubmit ? '#7c3aed' : 'linear-gradient(135deg,#3b82f6,#8b5cf6)' }}>
                  {editModalSaving ? 'Saving…' : isResubmit ? 'Save & Resubmit' : 'Save Changes'}
                </button>
                <button onClick={() => setEditModal(null)}
                  className="px-5 py-2.5 rounded-lg text-sm font-medium"
                  style={{ background: t.inputBg, border: `1px solid ${t.inputBorder}`, color: t.textMuted }}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
