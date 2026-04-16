'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/lib/theme';   // ← swap 'light'/'dark' in theme.ts to toggle

const API = process.env.NEXT_PUBLIC_API_URL;

interface JiraTask {
  id: string;
  key: string;
  title: string;
  epic: string | null;
  story_points: number | null;
  est_hours: number | null;
  logged_hours: number;
  status: string;
  sprint: string | null;
  is_active_sprint: boolean;
}

interface Entry {
  id: string;
  task_id: string;
  task_title: string;
  entry_date: string;
  work_description: string;
  hours: number;
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

function authHeaders(token: string) {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

// ── Task table shared component ───────────────────────────────────────────────
function TaskTable({
  tasks,
  onLog,
  simple = false,   // true → hides SP / Est. Hours / Logged / Remaining / Progress
}: {
  tasks: JiraTask[];
  onLog: (task: JiraTask) => void;
  simple?: boolean;
}) {
  if (tasks.length === 0) {
    return (
      <div className="text-center py-10" style={{ color: t.textSubtle }}>
        No tasks in this section.
      </div>
    );
  }

  const headers = simple
    ? ['Task No', 'Purpose', 'Status', '']
    : ['Task No', 'Description', 'SP', 'Est. Hours', 'Logged', 'Remaining', 'Progress', 'Status', ''];

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

            return (
              <tr key={task.id} style={{ borderBottom: t.border }}>
                {/* Task key */}
                <td className="px-4 py-4">
                  <span className="px-2.5 py-1 rounded-md text-xs font-semibold"
                    style={{ background: 'rgba(59,130,246,0.15)', color: '#3b82f6' }}>
                    {task.key}
                  </span>
                </td>

                {/* Title / Purpose */}
                <td className="px-4 py-4 max-w-[240px] truncate" style={{ color: t.textBody }} title={task.title}>
                  {task.title}
                </td>

                {/* Extra columns — hidden in simple mode */}
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
                        <div className="flex items-center gap-2 min-w-[90px]">
                          <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: t.borderColor }}>
                            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: pctColor }} />
                          </div>
                          <span className="text-xs font-semibold tabular-nums" style={{ color: pctColor, minWidth: 32 }}>
                            {pct}%
                          </span>
                        </div>
                      ) : (
                        <span style={{ color: t.textSubtle }}>—</span>
                      )}
                    </td>
                  </>
                )}

                {/* Status */}
                <td className="px-4 py-4"><StatusBadge status={task.status} /></td>

                {/* Log button */}
                <td className="px-4 py-4">
                  <button
                    onClick={() => onLog(task)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-opacity hover:opacity-90"
                    style={{ background: '#3b82f6' }}
                  >
                    + Log
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function TimesheetPage() {
  const token = useAuthStore((s) => s.token) ?? '';
  const today = new Date().toISOString().split('T')[0];

  const [selectedDate, setSelectedDate] = useState(today);
  const [tasks,   setTasks]   = useState<JiraTask[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [weekHours, setWeekHours] = useState<number>(0);

  const [loadingTasks,   setLoadingTasks]   = useState(false);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [syncing,  setSyncing]  = useState(false);
  const [syncMsg,  setSyncMsg]  = useState('');
  const [error,    setError]    = useState('');
  const [jiraConnected, setJiraConnected] = useState<boolean | null>(null);
  const [jiraError,     setJiraError]     = useState('');
  const [activeTab, setActiveTab] = useState<'sprint' | 'available' | 'general'>('sprint');
  const [generalTasks, setGeneralTasks] = useState<JiraTask[]>([]);

  // Use officially active sprint from JIRA Agile API (is_active_sprint flag set by backend)
  const sprintTasks    = useMemo(() => tasks.filter((t) => t.is_active_sprint), [tasks]);
  const availableTasks = useMemo(() => tasks.filter((t) => !t.is_active_sprint), [tasks]);

  // ── fetchers ─────────────────────────────────────────────────────────────────
  const fetchTasks = useCallback(async () => {
    setLoadingTasks(true); setError('');
    try {
      const statusRes = await fetch(`${API}/jira/status`, { headers: authHeaders(token) });
      if (statusRes.ok) {
        const status = await statusRes.json();
        setJiraConnected(status.connected);
        if (!status.connected) { setJiraError(status.error || 'Jira API token expired.'); setLoadingTasks(false); return; }
      }
      const [tasksRes, generalRes] = await Promise.all([
        fetch(`${API}/jira/tasks`,         { headers: authHeaders(token) }),
        fetch(`${API}/jira/general-tasks`, { headers: authHeaders(token) }),
      ]);
      if (!tasksRes.ok) throw new Error(await tasksRes.text());
      setTasks(await tasksRes.json());
      if (generalRes.ok) setGeneralTasks(await generalRes.json());
    } catch (e: unknown) {
      setError(`Failed to load Jira tasks: ${e instanceof Error ? e.message : e}`);
    } finally { setLoadingTasks(false); }
  }, [token]);

  const fetchEntries = useCallback(async (date: string) => {
    setLoadingEntries(true);
    try {
      const res = await fetch(`${API}/timesheet/entries?entry_date=${date}`, { headers: authHeaders(token) });
      if (!res.ok) throw new Error(await res.text());
      setEntries(await res.json());
    } catch (e: unknown) { console.error('entries fetch error', e); }
    finally { setLoadingEntries(false); }
  }, [token]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${API}/timesheet/stats`, { headers: authHeaders(token) });
      if (res.ok) { const data = await res.json(); setWeekHours(data.week_hours ?? 0); }
    } catch {/* non-critical */}
  }, [token]);

  useEffect(() => { fetchTasks(); fetchStats(); }, [fetchTasks, fetchStats]);
  useEffect(() => { fetchEntries(selectedDate); }, [fetchEntries, selectedDate]);

  const handleSync = async () => {
    setSyncing(true); setSyncMsg('');
    await fetchTasks();
    setSyncing(false);
    setSyncMsg(`Sync completed — ${new Date().toLocaleTimeString()}`);
    setTimeout(() => setSyncMsg(''), 4000);
  };

  const handleDelete = async (id: string) => {
    const res = await fetch(`${API}/timesheet/entries/${id}`, { method: 'DELETE', headers: authHeaders(token) });
    if (res.ok || res.status === 204) { setEntries((prev) => prev.filter((e) => e.id !== id)); fetchStats(); }
  };

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
      const res = await fetch(`${API}/timesheet/entries`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          task_id: addingTask.key, task_title: addingTask.title,
          entry_date: logDate, work_description: newWork.trim(), hours: parseFloat(newHours),
        }),
      });
      if (!res.ok) { setSaveError(`Save failed (${res.status}): ${await res.text()}`); return; }
      setSelectedDate(logDate);
      await fetchEntries(logDate);
      await fetchStats();
      setAddingTask(null); setNewWork(''); setNewHours('');
    } catch (e: unknown) {
      setSaveError(`Network error: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setSaving(false); }
  };

  const totalDayHours = entries.reduce((s, e) => s + e.hours, 0);

  const Tab = ({ id, label, count }: { id: 'sprint' | 'available' | 'general'; label: string; count: number }) => (
    <button
      onClick={() => setActiveTab(id)}
      className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all"
      style={activeTab === id
        ? { background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)', color: '#fff' }
        : { background: 'transparent', color: t.textMuted, border: t.border }}
    >
      {label}
      <span className="px-2 py-0.5 rounded-full text-xs font-bold"
        style={{ background: activeTab === id ? 'rgba(255,255,255,0.2)' : t.cardBg2, color: activeTab === id ? '#fff' : t.textMuted }}>
        {count}
      </span>
    </button>
  );

  return (
    <div className="flex flex-col h-full" style={{ background: t.pageBg }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-8 h-[70px] flex-shrink-0"
        style={{ background: t.headerBg, borderBottom: t.border }}>
        <div>
          <h2 className="text-xl font-semibold" style={{ color: t.text }}>My Timesheet</h2>
          <p className="text-sm" style={{ color: t.textMuted }}>Track your time and manage your tasks</p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="date" value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-4 py-2 rounded-lg text-sm focus:outline-none"
            style={{ background: t.inputBg, border: `1px solid ${t.inputBorder}`, color: t.text, colorScheme: t.colorScheme }}
          />
          <button
            onClick={handleSync} disabled={syncing || loadingTasks}
            className="flex items-center gap-2 px-5 py-2 rounded-lg text-white font-semibold text-sm transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)' }}
          >
            <svg className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            {syncing ? 'Syncing…' : 'Sync Jira Tasks'}
          </button>
        </div>
      </div>

      {/* ── Content ────────────────────────────────────────────────────────── */}
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
              <p className="text-sm font-semibold" style={{ color: '#d97706' }}>Jira connection failed — tasks cannot be loaded</p>
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

        {/* ── Stats ──────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-4 gap-5">
          {[
            { title: 'This Week',       value: `${weekHours}h`,    icon: '🕐', color: 'rgba(59,130,246,0.15)'  },
            { title: 'Tasks Active',    value: `${tasks.length}`,   icon: '📋', color: 'rgba(139,92,246,0.15)' },
            { title: "Today's Hours",   value: `${totalDayHours}h`, icon: '⏱️',  color: 'rgba(16,185,129,0.15)' },
            { title: "Today's Entries", value: `${entries.length}`, icon: '📝', color: 'rgba(245,158,11,0.15)' },
          ].map((s) => (
            <div key={s.title} className="rounded-xl p-5 shadow-sm"
              style={{ background: t.statGrad, border: t.border }}>
              <div className="flex items-start justify-between mb-3">
                <span className="text-sm font-medium" style={{ color: t.textMuted }}>{s.title}</span>
                <span className="w-9 h-9 rounded-lg flex items-center justify-center text-lg" style={{ background: s.color }}>{s.icon}</span>
              </div>
              <div className="text-3xl font-bold" style={{ color: t.text }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* ── Timesheet Entries ──────────────────────────────────────────── */}
        <div className="rounded-xl p-6 shadow-sm" style={{ background: t.cardBg, border: t.border }}>
          <h3 className="text-lg font-semibold mb-5" style={{ color: t.text }}>
            Timesheet Entries —{' '}
            {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </h3>

          {loadingEntries ? (
            <div className="text-center py-10" style={{ color: t.textSubtle }}>Loading entries…</div>
          ) : entries.length === 0 ? (
            <div className="text-center py-10" style={{ color: t.textSubtle }}>
              No entries for this date. Pick a task below and click <strong>+ Log</strong>.
            </div>
          ) : (
            <div className="rounded-lg overflow-hidden" style={{ border: t.border }}>
              <table className="w-full text-sm border-collapse">
                <thead style={{ background: t.tableHead }}>
                  <tr>
                    {['Task No', 'Description', 'Work Done', 'Hours', 'Actions'].map((h) => (
                      <th key={h} className="px-4 py-3.5 text-left font-semibold"
                        style={{ color: t.textHeader, borderBottom: t.border, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr key={entry.id} style={{ borderBottom: t.border }}>
                      <td className="px-4 py-4">
                        <span className="px-2.5 py-1 rounded-md text-xs font-semibold"
                          style={{ background: 'rgba(59,130,246,0.15)', color: '#3b82f6' }}>
                          {entry.task_id}
                        </span>
                      </td>
                      <td className="px-4 py-4 max-w-[200px] truncate" style={{ color: t.textBody }}>{entry.task_title}</td>
                      <td className="px-4 py-4" style={{ color: t.textBody }}>{entry.work_description}</td>
                      <td className="px-4 py-4 font-mono font-semibold" style={{ color: t.text }}>{entry.hours}h</td>
                      <td className="px-4 py-4">
                        <button onClick={() => handleDelete(entry.id)}
                          className="w-8 h-8 flex items-center justify-center rounded-lg"
                          style={{ border: t.border, color: t.textMuted, background: 'transparent' }}>
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Task Tabs ───────────────────────────────────────────────────── */}
        <div className="rounded-xl p-6 shadow-sm" style={{ background: t.cardBg, border: t.border }}>
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <Tab id="sprint"    label="Current Sprint"        count={sprintTasks.length} />
              <Tab id="available" label="Available Tasks"       count={availableTasks.length} />
              <Tab id="general"   label="General Purpose Tasks" count={generalTasks.length} />
            </div>
            <span className="text-xs" style={{ color: t.textSubtle }}>
              Click <strong>+ Log</strong> on a row to log time
            </span>
          </div>

          {loadingTasks ? (
            <div className="text-center py-10" style={{ color: t.textSubtle }}>Loading Jira tasks…</div>
          ) : (
            <>
              {activeTab === 'sprint' && (
                sprintTasks.length === 0
                  ? <div className="text-center py-10" style={{ color: t.textSubtle }}>No tasks found in an active sprint.</div>
                  : <TaskTable tasks={sprintTasks} onLog={openModal} />
              )}
              {activeTab === 'available' && <TaskTable tasks={availableTasks} onLog={openModal} />}
              {activeTab === 'general'   && <TaskTable tasks={generalTasks}   onLog={openModal} simple />}
            </>
          )}
        </div>

      </div>

      {/* ── Log Time Modal ──────────────────────────────────────────────────── */}
      {addingTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: t.modalBg, backdropFilter: 'blur(4px)' }}>
          <div className="w-full max-w-md rounded-2xl p-6 space-y-4 shadow-xl"
            style={{ background: t.cardBg, border: t.border }}>

            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold" style={{ color: t.text }}>Log Time</h3>
                <p className="text-xs mt-0.5 font-mono" style={{ color: '#3b82f6' }}>{addingTask.key}</p>
                <p className="text-xs mt-0.5" style={{ color: t.textSubtle }}>{addingTask.title}</p>
              </div>
              <button onClick={() => setAddingTask(null)} style={{ color: t.textSubtle }}>
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: t.textMuted }}>Date</label>
                <input type="date" value={logDate} max={today} onChange={(e) => setLogDate(e.target.value)}
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
                <label className="block text-sm font-medium mb-1.5" style={{ color: t.textMuted }}>Hours</label>
                <input type="number" min="0.25" max="24" step="0.25" value={newHours}
                  onChange={(e) => setNewHours(e.target.value)} placeholder="e.g. 2.5"
                  className="w-full px-3 py-2.5 rounded-lg text-sm focus:outline-none font-mono"
                  style={{ background: t.inputBg, border: `1px solid ${t.inputBorder}`, color: t.text }} />
              </div>
            </div>

            {saveError && (
              <div className="px-3 py-2 rounded-lg text-xs"
                style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', color: '#dc2626' }}>
                {saveError}
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button onClick={handleSaveEntry} disabled={saving || !newWork.trim() || !newHours}
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
      )}
    </div>
  );
}
