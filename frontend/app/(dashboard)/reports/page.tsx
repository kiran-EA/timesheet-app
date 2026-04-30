'use client';

import React, { useState, useEffect, useCallback } from 'react';
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

// ── Resource View drill-down types ────────────────────────────────────────────
interface SpaceEntry {
  id: string;
  entry_date: string;
  task_id: string;
  task_title: string;
  work_description: string;
  hours: number;
  status: string;
}

interface SpaceEpic {
  epic_key: string | null;
  epic_name: string | null;
  total_tasks: number;
  sprint_tasks: number;
  logged_tasks: number;
  total_hours: number;
  entries: SpaceEntry[];
}

interface SpaceData {
  space_key: string;
  space_name: string;
  total_tasks: number;
  sprint_tasks: number;
  logged_tasks: number;
  total_hours: number;
  epics: SpaceEpic[];
}

// ── Resource View drill-down: Space → Epic → Entries ──────────────────────────
function SpaceDrillDown({ userId, startDate, endDate, token, sprintOnly }: {
  userId: string; startDate: string; endDate: string; token: string; sprintOnly: boolean;
}) {
  const [spaces,     setSpaces]     = useState<SpaceData[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [openSpaces, setOpenSpaces] = useState<Set<string>>(new Set());
  const [openEpics,  setOpenEpics]  = useState<Set<string>>(new Set());

  useEffect(() => {
    setLoading(true);
    fetch(
      `${API}/jira/user-spaces?user_id=${userId}&start_date=${startDate}&end_date=${endDate}&sprint_only=${sprintOnly}`,
      { headers: aH(token) },
    )
      .then((r) => r.ok ? r.json() : { spaces: [] })
      .then((d) => setSpaces(d.spaces ?? []))
      .catch(() => setSpaces([]))
      .finally(() => setLoading(false));
  }, [userId, startDate, endDate, token, sprintOnly]);

  const toggleSpace = (key: string) => setOpenSpaces((prev) => {
    const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next;
  });
  const toggleEpic = (key: string) => setOpenEpics((prev) => {
    const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next;
  });

  if (loading) {
    return (
      <tr>
        <td colSpan={8} className="px-8 py-4 text-xs" style={{ color: t.textSubtle, background: t.cardBg2 }}>
          Loading spaces…
        </td>
      </tr>
    );
  }

  if (!spaces.length) {
    return (
      <tr>
        <td colSpan={8} className="px-8 py-4 text-xs" style={{ color: t.textSubtle, background: t.cardBg2 }}>
          No entries in this period.
        </td>
      </tr>
    );
  }

  const statusStyle = (status: string) => {
    switch (status) {
      case 'approved':    return { bg: 'rgba(16,185,129,0.12)',  color: '#059669' };
      case 'pending':     return { bg: 'rgba(245,158,11,0.12)',  color: '#d97706' };
      case 'resubmitted': return { bg: 'rgba(59,130,246,0.12)',  color: '#3b82f6' };
      case 'rejected':    return { bg: 'rgba(239,68,68,0.12)',   color: '#dc2626' };
      default:            return { bg: 'rgba(100,116,139,0.12)', color: '#64748b' };
    }
  };

  return (
    <tr>
      <td colSpan={8} style={{ background: t.cardBg2, padding: 0 }}>
        <div className="px-8 py-4 space-y-2">
          {spaces.map((space) => {
            const isSpaceOpen = openSpaces.has(space.space_key);
            return (
              <div key={space.space_key} className="rounded-lg overflow-hidden" style={{ border: t.border }}>

                {/* ── Space header ── */}
                <div
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none"
                  style={{ background: t.tableHead, borderBottom: isSpaceOpen ? t.border : 'none' }}
                  onClick={() => toggleSpace(space.space_key)}
                >
                  <svg className="w-3.5 h-3.5 flex-shrink-0 transition-transform"
                    style={{ color: t.textMuted, transform: isSpaceOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}
                    viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                  <span className="px-2 py-0.5 rounded text-xs font-bold"
                    style={{ background: 'rgba(59,130,246,0.12)', color: '#3b82f6' }}>
                    {space.space_key}
                  </span>
                  <span className="text-sm font-semibold" style={{ color: t.text }}>
                    {space.space_name !== space.space_key ? space.space_name : ''}
                  </span>
                  <div className="ml-auto flex items-center gap-3 text-xs">
                    <span style={{ color: t.textMuted }}>
                      <span className="font-semibold" style={{ color: t.text }}>{space.total_tasks}</span> tasks
                    </span>
                    <span className="px-1.5 py-0.5 rounded" style={{ background: 'rgba(16,185,129,0.1)', color: '#059669' }}>
                      {space.sprint_tasks} in sprint
                    </span>
                    <span style={{ color: t.textMuted }}>
                      <span className="font-semibold" style={{ color: t.text }}>{space.logged_tasks}</span> logged
                    </span>
                    <span className="font-bold font-mono" style={{ color: t.text }}>{space.total_hours.toFixed(1)}h</span>
                  </div>
                </div>

                {/* ── Epic list (shown when space is open) ── */}
                {isSpaceOpen && (
                  <div className="px-4 py-3 space-y-2">
                    {space.epics.map((epic) => {
                      const epicId = `${space.space_key}::${epic.epic_key ?? '__none__'}`;
                      const isEpicOpen = openEpics.has(epicId);
                      return (
                        <div key={epicId} className="rounded-md overflow-hidden"
                          style={{ border: `1px solid ${t.borderColor}55` }}>

                          {/* ── Epic header ── */}
                          <div
                            className="flex items-center gap-3 px-4 py-2.5 cursor-pointer select-none"
                            style={{ background: 'transparent', borderBottom: isEpicOpen ? `1px solid ${t.borderColor}55` : 'none' }}
                            onClick={() => toggleEpic(epicId)}
                          >
                            <svg className="w-3 h-3 flex-shrink-0 transition-transform"
                              style={{ color: t.textMuted, transform: isEpicOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}
                              viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="9 18 15 12 9 6" />
                            </svg>

                            {epic.epic_key ? (
                              <div className="flex flex-col gap-0.5">
                                {epic.epic_name && (
                                  <span className="text-xs" style={{ color: t.textMuted }}>{epic.epic_name}</span>
                                )}
                                <span className="px-2 py-0.5 rounded text-xs font-semibold w-fit"
                                  style={{ background: 'rgba(16,185,129,0.12)', color: '#059669' }}>
                                  {epic.epic_key}
                                </span>
                              </div>
                            ) : (
                              <span className="text-xs italic" style={{ color: t.textSubtle }}>No Epic</span>
                            )}

                            <div className="ml-auto flex items-center gap-3 text-xs">
                              <span style={{ color: t.textMuted }}>
                                <span className="font-semibold" style={{ color: t.text }}>{epic.total_tasks}</span> tasks
                              </span>
                              {epic.sprint_tasks > 0 && (
                                <span className="px-1.5 py-0.5 rounded" style={{ background: 'rgba(16,185,129,0.1)', color: '#059669' }}>
                                  {epic.sprint_tasks} in sprint
                                </span>
                              )}
                              <span style={{ color: t.textMuted }}>
                                <span className="font-semibold" style={{ color: t.text }}>{epic.logged_tasks}</span> logged
                              </span>
                              <span className="font-bold font-mono" style={{ color: epic.total_hours > 0 ? t.text : t.textSubtle }}>
                                {epic.total_hours.toFixed(1)}h
                              </span>
                            </div>
                          </div>

                          {/* ── Entries table ── */}
                          {isEpicOpen && (
                            <div className="px-4 py-3">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr>
                                    {['Date', 'Task', 'Title', 'Hours', 'Description', 'Status'].map((h) => (
                                      <th key={h} className="py-1.5 pr-4 text-left font-semibold"
                                        style={{ color: t.textMuted, borderBottom: t.border, textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.4px' }}>
                                        {h}
                                      </th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {epic.entries.map((entry) => {
                                    const ss = statusStyle(entry.status);
                                    return (
                                      <tr key={entry.id} style={{ borderBottom: `1px solid ${t.borderColor}22` }}>
                                        <td className="py-2 pr-4 font-mono tabular-nums whitespace-nowrap"
                                          style={{ color: t.textMuted, minWidth: 90 }}>
                                          {entry.entry_date}
                                        </td>
                                        <td className="py-2 pr-4">
                                          <span className="px-2 py-0.5 rounded font-semibold font-mono"
                                            style={{ background: 'rgba(124,58,237,0.1)', color: '#7c3aed', whiteSpace: 'nowrap' }}>
                                            {entry.task_id}
                                          </span>
                                        </td>
                                        <td className="py-2 pr-4 max-w-[200px]" style={{ color: t.text }}>
                                          <span className="line-clamp-1" title={entry.task_title}>{entry.task_title}</span>
                                        </td>
                                        <td className="py-2 pr-4 font-mono font-bold tabular-nums whitespace-nowrap"
                                          style={{ color: t.text }}>
                                          {entry.hours.toFixed(1)}h
                                        </td>
                                        <td className="py-2 pr-4 max-w-[240px]" style={{ color: t.textMuted }}>
                                          <span className="line-clamp-2" title={entry.work_description}>
                                            {entry.work_description || '—'}
                                          </span>
                                        </td>
                                        <td className="py-2 pr-4">
                                          <span className="px-2 py-0.5 rounded capitalize"
                                            style={{ background: ss.bg, color: ss.color }}>
                                            {entry.status}
                                          </span>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
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
  title, rows, expanded, targetHours, startDate, endDate, token, sprintOnly, onToggle,
}: {
  title: string;
  rows: ResourceStat[];
  expanded: Set<string>;
  targetHours: number;
  startDate: string;
  endDate: string;
  token: string;
  sprintOnly: boolean;
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

      <div className="overflow-x-auto">
      <table className="w-full text-sm" style={{ minWidth: 820 }}>
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
              <React.Fragment key={r.user_id}>
                <tr
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
                        style={{ background: 'linear-gradient(135deg,#2563eb,#1d4ed8)' }}>
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
                  <SpaceDrillDown
                    userId={r.user_id}
                    startDate={startDate}
                    endDate={endDate}
                    token={token}
                    sprintOnly={sprintOnly}
                  />
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
}

// ── Epic / Project dashboard types ────────────────────────────────────────────
interface EpicMemberTask {
  key: string;
  title: string;
  story_points: number | null;
  est_hours: number | null;   // SP × 8 × 1.2
  logged_hours: number;
  status: string;
  is_active_sprint: boolean;
}

interface EpicMember {
  user_id: string;
  full_name: string;
  email: string;
  avatar: string;
  role: string;
  total_logged: number;
  total_tasks: number;
  sprint_tasks: number;
  tasks: EpicMemberTask[];
}

interface EpicStat {
  epic_key: string | null;
  epic_name: string | null;
  total_tasks: number;
  active_sprint_tasks: number;
  total_est_hours: number | null;
  total_logged_hours: number;
  pct_complete: number | null;
  member_count: number;
  members: EpicMember[];
}

interface ProjectSpace {
  space_key: string;
  space_name: string;
  total_epics: number;
  member_count: number;
  total_tasks: number;
  sprint_tasks: number;
  total_logged_hours: number;
  epics: EpicStat[];
}

interface GeneralStat {
  total_logged_hours: number;
  member_count: number;
  members: EpicMember[];
}

// ── Epic row (expandable) ──────────────────────────────────────────────────────
function EpicRow({ epic, isOpen, onToggle, openMembers, onToggleMember, openTasks, onToggleTask, token, startDate, endDate }: {
  epic: EpicStat; isOpen: boolean; onToggle: () => void;
  openMembers: Set<string>; onToggleMember: (id: string) => void;
  openTasks: Set<string>; onToggleTask: (id: string) => void;
  token: string; startDate: string; endDate: string;
}) {
  const logged  = Number(epic.total_logged_hours || 0);
  const est     = epic.total_est_hours != null ? Number(epic.total_est_hours) : null;
  const pct     = epic.pct_complete ?? (est && est > 0 ? Math.min(100, Math.round((logged / est) * 100)) : 0);
  const barColor = pct >= 100 ? '#10b981' : pct >= 75 ? '#3b82f6' : pct >= 40 ? '#f59e0b' : '#ef4444';
  const isGeneral = epic.epic_key === 'GENERAL';

  return (
    <>
      {/* ── Summary row ── */}
      <tr
        onClick={onToggle}
        className="cursor-pointer transition-colors"
        style={{ borderBottom: isOpen ? 'none' : t.border, background: isOpen ? t.cardBg2 : 'transparent' }}
        onMouseEnter={(e) => { if (!isOpen) (e.currentTarget as HTMLElement).style.background = t.tableHead; }}
        onMouseLeave={(e) => { if (!isOpen) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
      >
        {/* chevron */}
        <td className="px-4 py-4 text-center" style={{ color: t.textMuted }}>
          <svg className="w-4 h-4 inline transition-transform"
            style={{ transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </td>

        {/* epic key + name */}
        <td className="px-5 py-4">
          {epic.epic_key ? (
            <div className="flex flex-col gap-0.5">
              {epic.epic_name && (
                <span className="text-xs font-medium" style={{ color: t.textMuted }}>{epic.epic_name}</span>
              )}
              <span className="px-2.5 py-1 rounded-md text-xs font-bold w-fit"
                style={{ background: 'rgba(59,130,246,0.12)', color: '#3b82f6' }}>
                {epic.epic_key}
              </span>
            </div>
          ) : (
            <span className="text-sm italic" style={{ color: t.textSubtle }}>No Epic</span>
          )}
        </td>

        {/* sprint badge */}
        <td className="px-5 py-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold" style={{ color: t.text }}>{epic.total_tasks} tasks</span>
            {epic.active_sprint_tasks > 0 && (
              <span className="px-2 py-0.5 rounded text-xs font-semibold w-fit"
                style={{ background: 'rgba(16,185,129,0.12)', color: '#059669' }}>
                {epic.active_sprint_tasks} in sprint
              </span>
            )}
          </div>
        </td>

        {/* est hours */}
        <td className="px-5 py-4 font-mono font-semibold" style={{ color: t.textMuted }}>
          {est != null ? `${est}h` : '—'}
        </td>

        {/* logged hours */}
        <td className="px-5 py-4 font-mono font-bold" style={{ color: t.text }}>
          {logged.toFixed(1)}h
        </td>

        {/* % complete */}
        <td className="px-5 py-4">
          {est != null ? (
            <div className="flex items-center gap-2 min-w-[120px]">
              <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: t.borderColor }}>
                <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: barColor }} />
              </div>
              <span className="text-xs font-bold tabular-nums" style={{ color: barColor, minWidth: 36 }}>{pct}%</span>
            </div>
          ) : (
            <span style={{ color: t.textSubtle }}>—</span>
          )}
        </td>

        {/* member count */}
        <td className="px-5 py-4 text-center font-semibold" style={{ color: t.text }}>
          {epic.member_count}
        </td>
      </tr>

      {/* ── Expanded member rows ── */}
      {isOpen && (
        <tr>
          <td colSpan={7} style={{ background: t.cardBg2, padding: 0 }}>
            <div className="px-8 py-4 space-y-4">
              {epic.members.length === 0 ? (
                <p className="text-sm" style={{ color: t.textSubtle }}>No members assigned.</p>
              ) : (
                epic.members.map((member) => (
                  <MemberRow
                    key={member.user_id}
                    member={member}
                    isOpen={openMembers.has(member.user_id)}
                    onToggle={() => onToggleMember(member.user_id)}
                    openTasks={openTasks}
                    onToggleTask={onToggleTask}
                    token={token}
                    startDate={startDate}
                    endDate={endDate}
                  />
                ))
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Level 5: Individual Task Entries (fetches its own data) ────────────────
interface TaskEntry {
  id: string;
  entry_date: string;
  work_description: string;
  hours: number;
  status: string;
}

function TaskEntries({ taskId, memberId, token, startDate, endDate }: {
  taskId: string; memberId: string; token: string; startDate: string; endDate: string;
}) {
  const [entries, setEntries] = useState<TaskEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const url = `${API}/jira/task-entries?task_id=${taskId}&user_id=${memberId}&start_date=${startDate}&end_date=${endDate}`;
    fetch(url, { headers: aH(token) })
      .then(res => res.ok ? res.json() : [])
      .then(data => setEntries(data))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, [taskId, memberId, token, startDate, endDate]);

  if (loading) {
    return <div className="px-6 py-3 text-xs" style={{ color: t.textSubtle }}>Loading entries...</div>;
  }
  if (entries.length === 0) {
    return <div className="px-6 py-3 text-xs text-center" style={{ color: t.textSubtle }}>No individual entries found for this task in the selected period.</div>;
  }

  const statusStyle = (status: string) => {
    switch (status) {
      case 'approved':    return { bg: 'rgba(16,185,129,0.12)',  color: '#059669' };
      case 'pending':     return { bg: 'rgba(245,158,11,0.12)',  color: '#d97706' };
      case 'resubmitted': return { bg: 'rgba(59,130,246,0.12)',  color: '#3b82f6' };
      case 'rejected':    return { bg: 'rgba(239,68,68,0.12)',   color: '#dc2626' };
      default:            return { bg: 'rgba(100,116,139,0.12)', color: '#64748b' };
    }
  };

  return (
    <div className="px-6 pb-3">
      <table className="w-full text-xs">
        <thead>
          <tr>
            {['Date', 'Description', 'Hours', 'Status'].map((h) => (
              <th key={h} className="py-1.5 pr-4 text-left font-semibold"
                style={{ color: t.textMuted, borderBottom: `1px solid ${t.borderColor}55`, textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.4px' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => {
            const ss = statusStyle(entry.status);
            return (
              <tr key={entry.id} style={{ borderBottom: `1px solid ${t.borderColor}22` }}>
                <td className="py-2 pr-4 font-mono tabular-nums whitespace-nowrap" style={{ color: t.textMuted }}>
                  {entry.entry_date}
                </td>
                <td className="py-2 pr-4 max-w-[240px]" style={{ color: t.textMuted }}>
                  <span className="line-clamp-2" title={entry.work_description}>
                    {entry.work_description || '—'}
                  </span>
                </td>
                <td className="py-2 pr-4 font-mono font-bold tabular-nums whitespace-nowrap" style={{ color: t.text }}>
                  {entry.hours.toFixed(1)}h
                </td>
                <td className="py-2 pr-4">
                  <span className="px-2 py-0.5 rounded capitalize text-xs" style={{ background: ss.bg, color: ss.color }}>
                    {entry.status}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Level 4: Task Row (expandable to show entries) ─────────────────────────
function TaskRow({ task, memberId, isOpen, onToggle, token, startDate, endDate }: {
  task: EpicMemberTask;
  memberId: string;
  isOpen: boolean;
  onToggle: () => void;
  token: string;
  startDate: string;
  endDate: string;
}) {
  return (
    <div className="rounded-md overflow-hidden" style={{ border: `1px solid ${t.borderColor}44`, background: `${t.cardBg}88` }}>
      <div
        onClick={onToggle}
        className="flex items-center gap-3 px-3 py-2 cursor-pointer select-none"
        style={{ borderBottom: isOpen ? `1px solid ${t.borderColor}44` : 'none' }}
      >
        <svg className="w-3 h-3 flex-shrink-0 transition-transform"
          style={{ color: t.textMuted, transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="9 18 15 12 9 6" />
        </svg>
        <span className="px-2 py-0.5 rounded text-xs font-semibold" style={{ background: 'rgba(124,58,237,0.1)', color: '#7c3aed' }}>
          {task.key}
        </span>
        <span className="text-xs flex-1" style={{ color: t.text }} title={task.title}>
          {task.title}
        </span>
        <span className="px-2 py-0.5 rounded text-xs" style={{
          background: task.status === 'In Progress' ? 'rgba(59,130,246,0.12)' : task.status === 'Done' ? 'rgba(16,185,129,0.12)' : 'rgba(100,116,139,0.12)',
          color: task.status === 'In Progress' ? '#3b82f6' : task.status === 'Done' ? '#059669' : t.textMuted,
        }}>
          {task.status}
        </span>
        <span className="ml-2 text-xs font-bold font-mono px-2 py-1 rounded-md"
          style={{ background: task.logged_hours > 0 ? 'rgba(16,185,129,0.1)' : 'rgba(100,116,139,0.1)', color: task.logged_hours > 0 ? '#059669' : t.textMuted }}>
          {task.logged_hours.toFixed(1)}h logged
        </span>
      </div>

      {isOpen && (
        <TaskEntries
          taskId={task.key}
          memberId={memberId}
          token={token}
          startDate={startDate}
          endDate={endDate}
        />
      )}
    </div>
  );
}

// ── Member row inside expanded epic (now also expandable) ───────────────────
function MemberRow({ member, isOpen, onToggle, openTasks, onToggleTask, token, startDate, endDate }: {
  member: EpicMember; isOpen: boolean; onToggle: () => void;
  openTasks: Set<string>; onToggleTask: (id: string) => void;
  token: string; startDate: string; endDate: string;
}) {
  return (
    <div className="rounded-lg overflow-hidden" style={{ border: t.border }}>
      {/* member header (clickable) */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none"
        style={{ background: t.tableHead, borderBottom: isOpen ? t.border : 'none' }}
        onClick={onToggle}
      >
        <svg className="w-3.5 h-3.5 flex-shrink-0 transition-transform"
          style={{ color: t.textMuted, transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="9 18 15 12 9 6" />
        </svg>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
          style={{ background: 'linear-gradient(135deg,#2563eb,#1d4ed8)' }}>
          {member.avatar || member.full_name[0]}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm" style={{ color: t.text }}>{member.full_name}</p>
          <p className="text-xs" style={{ color: t.textSubtle }}>{member.email}</p>
        </div>
        <RoleBadge role={member.role} />
        <span className="ml-2 text-xs" style={{ color: t.textMuted }}>
          <strong style={{ color: t.text }}>{member.tasks?.length ?? 0}</strong> tasks
        </span>
        <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(16,185,129,0.1)', color: '#059669' }}>
          <strong>{member.tasks?.filter(t => t.is_active_sprint).length ?? 0}</strong> in sprint
        </span>
        <span className="ml-2 text-sm font-bold font-mono px-3 py-1 rounded-lg"
          style={{ background: member.total_logged > 0 ? 'rgba(16,185,129,0.12)' : 'rgba(100,116,139,0.1)', color: member.total_logged > 0 ? '#059669' : t.textMuted }}>
          {member.total_logged.toFixed(1)}h logged
        </span>
      </div>

      {/* expanded view: list of expandable tasks */}
      {isOpen && (
        <div className="p-4 space-y-2" style={{ background: 'rgba(0,0,0,0.1)' }}>
          {member.tasks.length > 0 ? (
            member.tasks.map((task) => {
              const taskId = `${member.user_id}::${task.key}`;
              return (
                <TaskRow
                  key={taskId}
                  task={task}
                  memberId={member.user_id}
                  isOpen={openTasks.has(taskId)}
                  onToggle={() => onToggleTask(taskId)}
                  token={token}
                  startDate={startDate}
                  endDate={endDate}
                />
              );
            })
          ) : (
            <p className="text-xs text-center py-2" style={{ color: t.textSubtle }}>No tasks for this member in this epic.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Project View — Space section ──────────────────────────────────────────────
function SpaceSection({
  space, openEpics, onToggleEpic, openMembers, onToggleMember, openTasks, onToggleTask, token, startDate, endDate
}: {
  space: ProjectSpace;
  openEpics: Set<string>;
  onToggleEpic: (id: string) => void;
  openMembers: Set<string>;
  onToggleMember: (id: string) => void;
  openTasks: Set<string>;
  onToggleTask: (id: string) => void;
  token: string;
  startDate: string;
  endDate: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl overflow-hidden shadow-sm" style={{ background: t.cardBg, border: t.border }}>
      {/* ── Space header ── */}
      <div
        className="flex items-center gap-3 px-6 py-4 cursor-pointer select-none"
        style={{ background: t.tableHead, borderBottom: open ? t.border : 'none' }}
        onClick={() => setOpen((v) => !v)}
      >
        <svg className="w-4 h-4 flex-shrink-0 transition-transform"
          style={{ color: t.textMuted, transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="9 18 15 12 9 6" />
        </svg>
        <span className="px-2.5 py-1 rounded-md text-sm font-bold"
          style={{ background: 'rgba(59,130,246,0.12)', color: '#3b82f6' }}>
          {space.space_key}
        </span>
        <span className="text-sm font-semibold" style={{ color: t.text }}>
          {space.space_name !== space.space_key ? space.space_name : ''}
        </span>
        <div className="ml-auto flex items-center gap-4 text-xs">
          <span style={{ color: t.textMuted }}>
            <span className="font-semibold" style={{ color: t.text }}>{space.total_epics}</span> epics
          </span>
          <span style={{ color: t.textMuted }}>
            <span className="font-semibold" style={{ color: t.text }}>{space.member_count}</span> members
          </span>
          <span style={{ color: t.textMuted }}>
            <span className="font-semibold" style={{ color: t.text }}>{space.total_tasks}</span> tasks total
          </span>
          {space.sprint_tasks > 0 && (
            <span className="px-2 py-0.5 rounded" style={{ background: 'rgba(16,185,129,0.1)', color: '#059669' }}>
              {space.sprint_tasks} in sprint
            </span>
          )}
          <span className="font-bold font-mono text-sm" style={{ color: t.text }}>
            {space.total_logged_hours.toFixed(1)}h
          </span>
        </div>
      </div>

      {/* ── Epic table (shown when space expanded) ── */}
      {open && (
        <table className="w-full text-sm">
          <thead style={{ background: t.tableHead }}>
            <tr>
              <th className="w-8 px-4 py-3" />
              {['Epic', 'Tasks', 'Est. Hours', 'Logged Hours', 'Progress', 'Members'].map((h) => (
                <th key={h} className="px-5 py-3 text-left font-semibold"
                  style={{ color: t.textHeader, borderBottom: t.border, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {space.epics.map((epic) => {
              const epicId = `${space.space_key}::${epic.epic_key ?? '__none__'}`;
              return (
                <EpicRow
                  key={epicId}
                  epic={epic}
                  isOpen={openEpics.has(epicId)}
                  onToggle={() => onToggleEpic(epicId)}
                  openMembers={openMembers}
                  onToggleMember={onToggleMember}
                  openTasks={openTasks}
                  onToggleTask={onToggleTask}
                  token={token}
                  startDate={startDate}
                  endDate={endDate}
                />
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── General section (Holiday / Leave / Meetings) ───────────────────────────────
function GeneralSection({ general, openMembers, onToggleMember, openTasks, onToggleTask, token, startDate, endDate }: {
  general: GeneralStat;
  openMembers: Set<string>;
  onToggleMember: (id: string) => void;
  openTasks: Set<string>;
  onToggleTask: (id: string) => void;
  token: string;
  startDate: string;
  endDate: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl overflow-hidden shadow-sm" style={{ background: t.cardBg, border: t.border }}>
      <div
        className="flex items-center gap-3 px-6 py-4 cursor-pointer select-none"
        style={{ background: t.tableHead, borderBottom: open ? t.border : 'none' }}
        onClick={() => setOpen((v) => !v)}
      >
        <svg className="w-4 h-4 flex-shrink-0 transition-transform"
          style={{ color: t.textMuted, transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="9 18 15 12 9 6" />
        </svg>
        <span className="text-sm font-bold" style={{ color: '#d97706' }}>General Purpose</span>
        <span className="text-xs" style={{ color: t.textMuted }}>Holiday · Leave · Meetings · Comp Off</span>
        <div className="ml-auto flex items-center gap-4 text-xs">
          <span style={{ color: t.textMuted }}>
            <span className="font-semibold" style={{ color: t.text }}>{general.member_count}</span> members
          </span>
          <span className="font-bold font-mono text-sm" style={{ color: t.text }}>
            {general.total_logged_hours.toFixed(1)}h
          </span>
        </div>
      </div>
      {open && (
        <div className="px-8 py-4 space-y-4">
          {general.members.map((member) => (
            <MemberRow
              key={member.user_id}
              member={member}
              isOpen={openMembers.has(member.user_id)}
              onToggle={() => onToggleMember(member.user_id)}
              openTasks={openTasks}
              onToggleTask={onToggleTask}
              token={token}
              startDate={startDate}
              endDate={endDate}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Project / Epic dashboard panel ────────────────────────────────────────────
function ProjectView({ token, startDate, endDate, sprintOnly, refreshKey, onFetched }: {
  token: string; startDate: string; endDate: string;
  sprintOnly: boolean; refreshKey: number; onFetched: (d: Date) => void;
}) {
  const [spaces,     setSpaces]     = useState<ProjectSpace[]>([]);
  const [general,    setGeneral]    = useState<GeneralStat | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [openEpics,  setOpenEpics]  = useState<Set<string>>(new Set());

  const [openMembers, setOpenMembers] = useState<Set<string>>(new Set());
  const [openTasks,   setOpenTasks]   = useState<Set<string>>(new Set());

  const fetchData = useCallback(async () => {
    setLoading(true);
    setOpenEpics(new Set());
    setOpenMembers(new Set());
    setOpenTasks(new Set());
    try {
      const url = `${API}/jira/epic-dashboard?sprint_only=${sprintOnly}&start_date=${startDate}&end_date=${endDate}`;
      const res = await fetch(url, { headers: aH(token) });
      if (res.ok) {
        const d = await res.json();
        setSpaces(d.spaces ?? []);
        setGeneral(d.general ?? null);
        onFetched(new Date());
      }
    } catch (ex) { console.error(ex); }
    finally { setLoading(false); }
  }, [token, sprintOnly, startDate, endDate, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchData(); }, [fetchData]);

  const toggleEpic = (id: string) => setOpenEpics((prev) => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next;
  });

  const toggleMember = (id: string) => setOpenMembers((prev) => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next;
  });

  const toggleTask = (id: string) => setOpenTasks((prev) => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next;
  });


  const totalLogged = spaces.reduce((s, sp) => s + sp.total_logged_hours, 0)
                    + (general?.total_logged_hours ?? 0);
  const totalEpics  = spaces.reduce((s, sp) => s + sp.total_epics, 0);
  const totalEst    = spaces.reduce((s, sp) =>
    s + sp.epics.reduce((es, e) => es + (e.total_est_hours ?? 0), 0), 0);
  const overallPct  = totalEst > 0 ? Math.min(100, Math.round((totalLogged / totalEst) * 100)) : 0;

  return (
    <div className="space-y-6">
      {/* controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-xs px-2.5 py-1 rounded-md" style={{ background: 'rgba(139,92,246,0.08)', color: '#7c3aed' }}>
          Est = SP × 8h + 20% buffer
        </span>
      </div>

      {/* summary cards */}
      <div className="grid grid-cols-3 gap-5">
        {[
          { title: 'Active Spaces',      value: spaces.length,            color: 'rgba(59,130,246,0.15)'  },
          { title: 'Total Epics',        value: totalEpics,               color: 'rgba(139,92,246,0.15)'  },
          { title: 'Hours Logged',       value: `${totalLogged.toFixed(1)}h`, color: 'rgba(16,185,129,0.15)' },
        ].map((s) => (
          <div key={s.title} className="rounded-xl p-5 shadow-sm" style={{ background: t.statGrad, border: t.border }}>
            <p className="text-sm font-medium mb-2" style={{ color: t.textMuted }}>{s.title}</p>
            <p className="text-3xl font-bold" style={{ color: t.text }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* space sections */}
      {loading ? (
        <div className="text-center py-16 rounded-xl" style={{ background: t.cardBg, border: t.border, color: t.textSubtle }}>
          Loading project data…
        </div>
      ) : spaces.length === 0 && !general ? (
        <div className="text-center py-16 rounded-xl" style={{ background: t.cardBg, border: t.border, color: t.textSubtle }}>
          No data for this period.
        </div>
      ) : (
        <div className="space-y-4">
          {spaces.map((space) => (
            <SpaceSection
              key={space.space_key}
              space={space}
              openEpics={openEpics}
              onToggleEpic={toggleEpic}
              openMembers={openMembers}
              onToggleMember={toggleMember}
              openTasks={openTasks}
              onToggleTask={toggleTask}
              token={token}
              startDate={startDate}
              endDate={endDate}
            />
          ))}
          {general && <GeneralSection
            general={general}
            openMembers={openMembers}
            onToggleMember={toggleMember}
            openTasks={openTasks}
            onToggleTask={toggleTask}
            token={token}
            startDate={startDate}
            endDate={endDate}
          />}
        </div>
      )}
    </div>
  );
}

// ── main page ──────────────────────────────────────────────────────────────────
type Tab = 'resource' | 'project';

export default function ReportsPage() {
  const token  = useAuthStore((s) => s.token) ?? '';
  const user   = useAuthStore((s) => s.user);
  const router = useRouter();

  const [activeTab,  setActiveTab]  = useState<Tab>('resource');
  const [preset,    setPreset]    = useState<Preset>('week');
  const [startDate, setStartDate] = useState(getWeekRange().start);
  const [endDate,   setEndDate]   = useState(getWeekRange().end);
  const [stats,     setStats]     = useState<ResourceStat[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [expanded,  setExpanded]  = useState<Set<string>>(new Set());

  // Sprint filter tabs (for both views)
  const [resourceSprintOnly, setResourceSprintOnly] = useState(false);
  const [projectSprintOnly,  setProjectSprintOnly]  = useState(false);

  // Caching: refresh keys (increment to force re-fetch) + last-fetched timestamps
  const [resourceRefreshKey, setResourceRefreshKey] = useState(0);
  const [projectRefreshKey,  setProjectRefreshKey]  = useState(0);
  const [resourceFetchedAt,  setResourceFetchedAt]  = useState<Date | null>(null);
  const [projectFetchedAt,   setProjectFetchedAt]   = useState<Date | null>(null);

  // ProjectView is mounted lazily on first visit and kept alive thereafter
  const [projectMounted, setProjectMounted] = useState(false);

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
      if (res.ok) {
        setStats((await res.json()).analytics ?? []);
        setResourceFetchedAt(new Date());
      }
    } catch (ex) { console.error(ex); }
    finally { setLoading(false); }
  }, [token, startDate, endDate, resourceRefreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchAnalytics(); }, [fetchAnalytics]);

  const toggleExpand = (userId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(userId) ? next.delete(userId) : next.add(userId);
      return next;
    });
  };

  const handleTabSwitch = (tab: Tab) => {
    setActiveTab(tab);
    if (tab === 'project' && !projectMounted) setProjectMounted(true);
  };

  const handleRefresh = () => {
    if (activeTab === 'resource') setResourceRefreshKey((k) => k + 1);
    else setProjectRefreshKey((k) => k + 1);
  };

  const timeAgo = (d: Date | null): string => {
    if (!d) return '';
    const mins = Math.floor((Date.now() - d.getTime()) / 60000);
    if (mins < 1) return 'just now';
    if (mins === 1) return '1 min ago';
    return `${mins} min ago`;
  };

  const fetchedAt = activeTab === 'resource' ? resourceFetchedAt : projectFetchedAt;

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
        <div className="flex items-center gap-3 flex-wrap justify-end">
          {/* tab switcher — admin only */}
          {user?.role === 'admin' && (
            <div className="flex rounded-lg overflow-hidden" style={{ border: t.border }}>
              {([['resource', 'Resource View'], ['project', 'Project View']] as [Tab, string][]).map(([tab, label]) => (
                <button key={tab} onClick={() => handleTabSwitch(tab as Tab)}
                  className="px-4 py-2 text-sm font-medium transition-all"
                  style={activeTab === tab
                    ? { background: 'linear-gradient(135deg,#2563eb,#1d4ed8)', color: '#fff' }
                    : { background: 'transparent', color: t.textMuted }}>
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* Sprint filter tabs */}
          <div className="flex rounded-lg overflow-hidden" style={{ border: t.border }}>
            {[false, true].map((val) => (
              <button key={String(val)}
                onClick={() => activeTab === 'resource' ? setResourceSprintOnly(val) : setProjectSprintOnly(val)}
                className="px-3 py-2 text-xs font-medium transition-all"
                style={(activeTab === 'resource' ? resourceSprintOnly : projectSprintOnly) === val
                  ? { background: 'rgba(16,185,129,0.18)', color: '#059669' }
                  : { background: 'transparent', color: t.textMuted }}>
                {val ? 'Sprint Tasks' : 'All Tasks'}
              </button>
            ))}
          </div>

          {/* Refresh + timestamp */}
          <div className="flex items-center gap-2">
            {fetchedAt && (
              <span className="text-xs" style={{ color: t.textSubtle }}>{timeAgo(fetchedAt)}</span>
            )}
            <button onClick={handleRefresh} disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-opacity hover:opacity-80 disabled:opacity-40"
              style={{ border: t.border, color: t.textMuted, background: 'transparent' }}>
              <svg className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`}
                viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
              </svg>
              Refresh
            </button>
          </div>

          {/* preset buttons */}
          <div className="flex items-center gap-2">
            {(['week', 'month', 'custom'] as Preset[]).map((p) => (
              <button key={p} onClick={() => applyPreset(p)}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-all capitalize"
                style={preset === p
                  ? { background: 'linear-gradient(135deg,#2563eb,#1d4ed8)', color: '#fff' }
                  : { border: t.border, color: t.textMuted, background: 'transparent' }}>
                {p === 'week' ? 'This Week' : p === 'month' ? 'This Month' : 'Custom'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8">
      <div className="max-w-[1440px] mx-auto space-y-6">

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

        {/* ── Project View (lazy-mount: stays alive once visited) ── */}
        {projectMounted && (
          <div style={{ display: activeTab === 'project' ? 'block' : 'none' }}>
            <ProjectView
              token={token} startDate={startDate} endDate={endDate}
              sprintOnly={projectSprintOnly}
              refreshKey={projectRefreshKey}
              onFetched={setProjectFetchedAt}
            />
          </div>
        )}

        {/* ── Resource View ── */}
        {activeTab === 'resource' && (
          <>
            {/* ── Date range label ── */}
            <p className="text-sm" style={{ color: t.textSubtle }}>
              {fmtDate(startDate)} – {fmtDate(endDate)}
              <span className="ml-2 px-2 py-0.5 rounded text-xs" style={{ background: 'rgba(59,130,246,0.1)', color: '#3b82f6' }}>
                {workingDays} working day{workingDays !== 1 ? 's' : ''} · {targetHours}h target
              </span>
            </p>

            {/* ── Summary stats ── */}
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-5">
              {[
                {
                  title: 'Total Hours Logged', value: `${Number(totalHours).toFixed(1)}h`, soft: 'rgba(29,78,216,0.10)', text: '#1d4ed8',
                  icon: (<svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v4.5l3 1.75"/></svg>),
                },
                {
                  title: 'Total Entries', value: totalEntries, soft: 'rgba(82,82,91,0.10)', text: '#52525b',
                  icon: (<svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/></svg>),
                },
                {
                  title: 'Pending Approval', value: totalPending, soft: 'rgba(180,83,9,0.10)', text: '#b45309',
                  icon: (<svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v4l2.5 1.5"/></svg>),
                },
                {
                  title: 'Approved', value: totalApproved, soft: 'rgba(5,150,105,0.10)', text: '#059669',
                  icon: (<svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>),
                },
              ].map((s) => (
                <div key={s.title} className="rounded-xl p-5 transition-shadow duration-300 hover:shadow-md"
                  style={{ background: t.statGrad, border: t.border }}>
                  <div className="flex items-start justify-between mb-3">
                    <span className="text-[12px] font-medium tracking-tight" style={{ color: t.textMuted }}>{s.title}</span>
                    <span className="w-9 h-9 rounded-lg flex items-center justify-center"
                      style={{ background: s.soft, color: s.text }}>{s.icon}</span>
                  </div>
                  <div className="text-[28px] font-semibold tracking-tight tabular-nums" style={{ color: t.text }}>{s.value}</div>
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
                  token={token} sprintOnly={resourceSprintOnly} onToggle={toggleExpand}
                />
                <ResourceSection
                  title="Teamleads" rows={teamleads} expanded={expanded}
                  targetHours={targetHours} startDate={startDate} endDate={endDate}
                  token={token} sprintOnly={resourceSprintOnly} onToggle={toggleExpand}
                />
                <ResourceSection
                  title="Resources" rows={resources} expanded={expanded}
                  targetHours={targetHours} startDate={startDate} endDate={endDate}
                  token={token} sprintOnly={resourceSprintOnly} onToggle={toggleExpand}
                />
              </>
            )}
          </>
        )}

      </div>
      </div>
    </div>
  );
}
