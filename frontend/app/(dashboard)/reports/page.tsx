'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/lib/theme';

const API = process.env.NEXT_PUBLIC_API_URL;

interface ResourceStat {
  user_id: string;
  full_name: string;
  email: string;
  avatar: string;
  role: string;
  manager_id: string | null;
  manager_name: string | null;
  total_hours: number;
  total_entries: number;
  pending_count: number;
  approved_count: number;
}

interface TaskStat {
  task_id: string;
  task_title: string;
  total_hours: number;
  total_entries: number;
  pending_count: number;
  approved_count: number;
  rejected_count: number;
}

function aH(token: string) {
  return { Authorization: `Bearer ${token}` };
}

function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getWeekRange() {
  const today = new Date();
  const mon = new Date(today);
  mon.setDate(today.getDate() - today.getDay() + 1);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  return { start: localDateStr(mon), end: localDateStr(sun) };
}

function getMonthRange() {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  const end   = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  return { start: localDateStr(start), end: localDateStr(end) };
}

/** Count Mon–Fri days between two ISO date strings (inclusive). */
function countWorkingDays(start: string, end: string): number {
  let count = 0;
  const cur = new Date(start + 'T00:00:00');
  const endD = new Date(end + 'T00:00:00');
  while (cur <= endD) {
    const d = cur.getDay();
    if (d !== 0 && d !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return Math.max(count, 1);
}

type Preset = 'week' | 'month' | 'custom';

// ── status pill ────────────────────────────────────────────────────────────────
function StatusPill({ count, color, bg }: { count: number; color: string; bg: string }) {
  if (!count) return <span style={{ color: t.textSubtle }}>—</span>;
  return (
    <span className="px-2.5 py-1 rounded-full text-xs font-bold tabular-nums"
      style={{ background: bg, color }}>
      {count}
    </span>
  );
}

// ── task breakdown sub-table ───────────────────────────────────────────────────
function TaskBreakdown({
  userId, startDate, endDate, token,
}: {
  userId: string; startDate: string; endDate: string; token: string;
}) {
  const [tasks, setTasks] = useState<TaskStat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(
      `${API}/approvals/analytics/tasks?user_id=${userId}&start_date=${startDate}&end_date=${endDate}`,
      { headers: aH(token) },
    )
      .then((r) => r.ok ? r.json() : { tasks: [] })
      .then((d) => setTasks(d.tasks ?? []))
      .catch(() => setTasks([]))
      .finally(() => setLoading(false));
  }, [userId, startDate, endDate, token]);

  if (loading) {
    return (
      <tr>
        <td colSpan={8} className="px-8 py-4 text-xs" style={{ color: t.textSubtle, background: t.cardBg2 }}>
          Loading tasks…
        </td>
      </tr>
    );
  }

  if (!tasks.length) {
    return (
      <tr>
        <td colSpan={8} className="px-8 py-4 text-xs" style={{ color: t.textSubtle, background: t.cardBg2 }}>
          No entries in this period.
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td colSpan={8} style={{ background: t.cardBg2, padding: 0 }}>
        <div className="px-8 py-3">
          <table className="w-full text-xs">
            <thead>
              <tr>
                {['Task', 'Title', 'Hours', 'Entries', 'Pending', 'Approved', 'Rejected'].map((h) => (
                  <th key={h} className="py-2 pr-4 text-left font-semibold"
                    style={{ color: t.textMuted, borderBottom: t.border, textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.4px' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => (
                <tr key={task.task_id} style={{ borderBottom: `1px solid ${t.borderColor}22` }}>
                  <td className="py-2 pr-4 font-mono" style={{ color: '#7c3aed', minWidth: 90 }}>
                    {task.task_id}
                  </td>
                  <td className="py-2 pr-4" style={{ color: t.text, maxWidth: 280 }}>
                    <span className="line-clamp-1">{task.task_title}</span>
                  </td>
                  <td className="py-2 pr-4 font-mono font-bold" style={{ color: t.text }}>
                    {Number(task.total_hours).toFixed(1)}h
                  </td>
                  <td className="py-2 pr-4 font-semibold" style={{ color: t.text }}>
                    {Number(task.total_entries)}
                  </td>
                  <td className="py-2 pr-4">
                    <StatusPill count={Number(task.pending_count)} color="#d97706" bg="rgba(245,158,11,0.12)" />
                  </td>
                  <td className="py-2 pr-4">
                    <StatusPill count={Number(task.approved_count)} color="#059669" bg="rgba(16,185,129,0.12)" />
                  </td>
                  <td className="py-2 pr-4">
                    <StatusPill count={Number(task.rejected_count)} color="#dc2626" bg="rgba(239,68,68,0.12)" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </td>
    </tr>
  );
}

// ── role badge ─────────────────────────────────────────────────────────────────
function RoleBadge({ role }: { role: string }) {
  const styles: Record<string, { bg: string; color: string }> = {
    admin:    { bg: 'rgba(59,130,246,0.12)',  color: '#3b82f6' },
    teamlead: { bg: 'rgba(139,92,246,0.12)', color: '#7c3aed' },
    resource: { bg: 'rgba(16,185,129,0.12)', color: '#059669' },
  };
  const s = styles[role] ?? { bg: 'rgba(100,116,139,0.12)', color: '#64748b' };
  return (
    <span className="px-2.5 py-1 rounded-full text-xs font-semibold capitalize"
      style={{ background: s.bg, color: s.color }}>
      {role === 'teamlead' ? 'Teamlead' : role.charAt(0).toUpperCase() + role.slice(1)}
    </span>
  );
}

// ── resource table section (by role group) ─────────────────────────────────────
function ResourceSection({
  title, rows, expanded, targetHours, startDate, endDate, token, onToggle,
}: {
  title: string;
  rows: ResourceStat[];
  expanded: Set<string>;
  targetHours: number;
  startDate: string;
  endDate: string;
  token: string;
  onToggle: (uid: string) => void;
}) {
  if (rows.length === 0) return null;

  const sectionHours = rows.reduce((s, r) => s + Number(r.total_hours || 0), 0);

  return (
    <div className="rounded-xl overflow-hidden shadow-sm" style={{ background: t.cardBg, border: t.border }}>
      {/* section header */}
      <div className="px-6 py-3 flex items-center gap-2" style={{ borderBottom: t.border, background: t.tableHead }}>
        <h4 className="text-sm font-bold uppercase tracking-wider" style={{ color: t.textHeader }}>{title}</h4>
        <span className="px-2 py-0.5 rounded-full text-xs font-bold"
          style={{ background: 'rgba(100,116,139,0.15)', color: t.textMuted }}>
          {rows.length}
        </span>
        <span className="ml-auto text-xs font-semibold" style={{ color: t.textMuted }}>
          {sectionHours.toFixed(1)}h total
        </span>
      </div>

      <table className="w-full text-sm">
        <thead style={{ background: t.tableHead }}>
          <tr>
            <th className="w-8 px-4 py-3" />
            {['Member', 'Role', 'Hours Logged', 'Progress', 'Entries', 'Pending', 'Approved'].map((h) => (
              <th key={h} className="px-5 py-3 text-left font-semibold"
                style={{ color: t.textHeader, borderBottom: t.border, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const hours    = Number(r.total_hours   || 0);
            const entries  = Number(r.total_entries || 0);
            const pending  = Number(r.pending_count || 0);
            const approved = Number(r.approved_count || 0);
            const pct      = Math.min(100, Math.round((hours / targetHours) * 100));
            const barColor = pct >= 100 ? '#10b981' : pct >= 75 ? '#3b82f6' : pct >= 40 ? '#f59e0b' : '#ef4444';
            const isOpen   = expanded.has(r.user_id);

            return (
              <>
                <tr key={r.user_id}
                  onClick={() => onToggle(r.user_id)}
                  className="cursor-pointer transition-colors"
                  style={{
                    borderBottom: isOpen ? 'none' : t.border,
                    background: isOpen ? `${t.cardBg2}` : 'transparent',
                  }}
                  onMouseEnter={(e) => { if (!isOpen) (e.currentTarget as HTMLElement).style.background = `${t.tableHead}`; }}
                  onMouseLeave={(e) => { if (!isOpen) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>

                  {/* expand chevron */}
                  <td className="px-4 py-4 text-center" style={{ color: t.textMuted }}>
                    <svg className="w-4 h-4 inline transition-transform"
                      style={{ transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}
                      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </td>

                  {/* member + manager */}
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                        style={{ background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)' }}>
                        {r.avatar || r.full_name[0]}
                      </div>
                      <div>
                        <p className="font-semibold text-sm" style={{ color: t.text }}>{r.full_name}</p>
                        <p className="text-xs" style={{ color: t.textSubtle }}>{r.email}</p>
                        {r.manager_name && (
                          <p className="text-xs mt-0.5" style={{ color: t.textMuted }}>
                            → {r.manager_name}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* role */}
                  <td className="px-5 py-4">
                    <RoleBadge role={r.role} />
                  </td>

                  {/* hours */}
                  <td className="px-5 py-4 font-mono font-bold" style={{ color: t.text }}>
                    {hours.toFixed(1)}h
                  </td>

                  {/* progress bar — 100% = targetHours (8h × working days) */}
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2 min-w-[130px]">
                      <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: t.borderColor }}>
                        <div className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, background: barColor }} />
                      </div>
                      <span className="text-xs font-semibold tabular-nums" style={{ color: barColor, minWidth: 36 }}>
                        {pct}%
                      </span>
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: t.textSubtle }}>
                      of {targetHours}h target
                    </p>
                  </td>

                  {/* entries */}
                  <td className="px-5 py-4 text-center font-semibold" style={{ color: t.text }}>
                    {entries}
                  </td>

                  {/* pending */}
                  <td className="px-5 py-4 text-center">
                    <StatusPill count={pending} color="#d97706" bg="rgba(245,158,11,0.12)" />
                  </td>

                  {/* approved */}
                  <td className="px-5 py-4 text-center">
                    <StatusPill count={approved} color="#059669" bg="rgba(16,185,129,0.12)" />
                  </td>
                </tr>

                {isOpen && (
                  <TaskBreakdown
                    userId={r.user_id}
                    startDate={startDate}
                    endDate={endDate}
                    token={token}
                  />
                )}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── main page ──────────────────────────────────────────────────────────────────
export default function ReportsPage() {
  const token  = useAuthStore((s) => s.token) ?? '';
  const user   = useAuthStore((s) => s.user);
  const router = useRouter();

  const [preset,    setPreset]    = useState<Preset>('week');
  const [startDate, setStartDate] = useState(getWeekRange().start);
  const [endDate,   setEndDate]   = useState(getWeekRange().end);
  const [stats,     setStats]     = useState<ResourceStat[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [expanded,  setExpanded]  = useState<Set<string>>(new Set());

  useEffect(() => {
    if (user && user.role === 'resource') router.push('/timesheet');
  }, [user, router]);

  const applyPreset = (p: Preset) => {
    setPreset(p);
    setExpanded(new Set());
    if (p === 'week')  { const r = getWeekRange();  setStartDate(r.start); setEndDate(r.end); }
    if (p === 'month') { const r = getMonthRange(); setStartDate(r.start); setEndDate(r.end); }
  };

  const fetchAnalytics = useCallback(async () => {
    if (!startDate || !endDate) return;
    setLoading(true);
    setExpanded(new Set());
    try {
      const res = await fetch(
        `${API}/approvals/analytics?start_date=${startDate}&end_date=${endDate}`,
        { headers: aH(token) },
      );
      if (res.ok) setStats((await res.json()).analytics ?? []);
    } catch (ex) { console.error(ex); }
    finally { setLoading(false); }
  }, [token, startDate, endDate]);

  useEffect(() => { fetchAnalytics(); }, [fetchAnalytics]);

  const toggleExpand = (userId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(userId) ? next.delete(userId) : next.add(userId);
      return next;
    });
  };

  // 8h × working days in selected range = 100% target
  const workingDays  = countWorkingDays(startDate, endDate);
  const targetHours  = workingDays * 8;

  // group by role
  const admins    = stats.filter((r) => r.role === 'admin');
  const teamleads = stats.filter((r) => r.role === 'teamlead');
  const resources = stats.filter((r) => r.role === 'resource');

  // summary totals
  const totalHours    = stats.reduce((s, r) => s + Number(r.total_hours   || 0), 0);
  const totalEntries  = stats.reduce((s, r) => s + Number(r.total_entries || 0), 0);
  const totalPending  = stats.reduce((s, r) => s + Number(r.pending_count || 0), 0);
  const totalApproved = stats.reduce((s, r) => s + Number(r.approved_count || 0), 0);

  const roleLabel = user?.role === 'admin' ? 'All Users' : 'Your Team';

  const fmtDate = (d: string) =>
    new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div className="flex flex-col h-full" style={{ background: t.pageBg }}>

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-8 h-[70px] flex-shrink-0"
        style={{ background: t.headerBg, borderBottom: t.border }}>
        <div>
          <h2 className="text-xl font-semibold" style={{ color: t.text }}>Analytics</h2>
          <p className="text-sm" style={{ color: t.textMuted }}>{roleLabel} — timesheet insights</p>
        </div>
        <div className="flex items-center gap-2">
          {(['week', 'month', 'custom'] as Preset[]).map((p) => (
            <button key={p} onClick={() => applyPreset(p)}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-all capitalize"
              style={preset === p
                ? { background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)', color: '#fff' }
                : { border: t.border, color: t.textMuted, background: 'transparent' }}>
              {p === 'week' ? 'This Week' : p === 'month' ? 'This Month' : 'Custom'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8 space-y-6">

        {/* ── Custom date range ── */}
        {preset === 'custom' && (
          <div className="flex items-center gap-3 p-4 rounded-xl shadow-sm"
            style={{ background: t.cardBg, border: t.border }}>
            <label className="text-sm font-medium" style={{ color: t.textMuted }}>From</label>
            <input type="date" value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-3 py-2 rounded-lg text-sm focus:outline-none"
              style={{ background: t.inputBg, border: `1px solid ${t.inputBorder}`, color: t.text, colorScheme: t.colorScheme }} />
            <label className="text-sm font-medium" style={{ color: t.textMuted }}>To</label>
            <input type="date" value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-3 py-2 rounded-lg text-sm focus:outline-none"
              style={{ background: t.inputBg, border: `1px solid ${t.inputBorder}`, color: t.text, colorScheme: t.colorScheme }} />
          </div>
        )}

        {/* ── Date range label ── */}
        <p className="text-sm" style={{ color: t.textSubtle }}>
          {fmtDate(startDate)} – {fmtDate(endDate)}
          <span className="ml-2 px-2 py-0.5 rounded text-xs" style={{ background: 'rgba(59,130,246,0.1)', color: '#3b82f6' }}>
            {workingDays} working day{workingDays !== 1 ? 's' : ''} · {targetHours}h target
          </span>
        </p>

        {/* ── Summary stats ── */}
        <div className="grid grid-cols-4 gap-5">
          {[
            { title: 'Total Hours Logged', value: `${Number(totalHours).toFixed(1)}h`, icon: '🕐', color: 'rgba(59,130,246,0.15)' },
            { title: 'Total Entries',      value: totalEntries,                         icon: '📝', color: 'rgba(139,92,246,0.15)' },
            { title: 'Pending Approval',   value: totalPending,                         icon: '⏳', color: 'rgba(245,158,11,0.15)' },
            { title: 'Approved',           value: totalApproved,                        icon: '✅', color: 'rgba(16,185,129,0.15)' },
          ].map((s) => (
            <div key={s.title} className="rounded-xl p-5 shadow-sm"
              style={{ background: t.statGrad, border: t.border }}>
              <div className="flex items-start justify-between mb-3">
                <span className="text-sm font-medium" style={{ color: t.textMuted }}>{s.title}</span>
                <span className="w-9 h-9 rounded-lg flex items-center justify-center text-lg"
                  style={{ background: s.color }}>{s.icon}</span>
              </div>
              <div className="text-3xl font-bold" style={{ color: t.text }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* ── Resource breakdown by role ── */}
        {loading ? (
          <div className="text-center py-16 rounded-xl" style={{ background: t.cardBg, border: t.border, color: t.textSubtle }}>
            Loading analytics…
          </div>
        ) : stats.length === 0 ? (
          <div className="text-center py-16 rounded-xl" style={{ background: t.cardBg, border: t.border, color: t.textSubtle }}>
            No data for this period.
          </div>
        ) : (
          <>
            <ResourceSection
              title="Admins" rows={admins} expanded={expanded}
              targetHours={targetHours} startDate={startDate} endDate={endDate}
              token={token} onToggle={toggleExpand}
            />
            <ResourceSection
              title="Teamleads" rows={teamleads} expanded={expanded}
              targetHours={targetHours} startDate={startDate} endDate={endDate}
              token={token} onToggle={toggleExpand}
            />
            <ResourceSection
              title="Resources" rows={resources} expanded={expanded}
              targetHours={targetHours} startDate={startDate} endDate={endDate}
              token={token} onToggle={toggleExpand}
            />
          </>
        )}

      </div>
    </div>
  );
}
