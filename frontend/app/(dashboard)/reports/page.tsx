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
function SpaceDrillDown({ userId, startDate, endDate, token }: {
  userId: string; startDate: string; endDate: string; token: string;
}) {
  const [spaces,     setSpaces]     = useState<SpaceData[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [openSpaces, setOpenSpaces] = useState<Set<string>>(new Set());
  const [openEpics,  setOpenEpics]  = useState<Set<string>>(new Set());

  useEffect(() => {
    setLoading(true);
    fetch(
      `${API}/jira/user-spaces?user_id=${userId}&start_date=${startDate}&end_date=${endDate}`,
      { headers: aH(token) },
    )
      .then((r) => r.ok ? r.json() : { spaces: [] })
      .then((d) => setSpaces(d.spaces ?? []))
      .catch(() => setSpaces([]))
      .finally(() => setLoading(false));
  }, [userId, startDate, endDate, token]);

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
                  <SpaceDrillDown
                    userId={r.user_id}
                    startDate={startDate}
                    endDate={endDate}
                    token={token}
                  />
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
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
  tasks: EpicMemberTask[];
}

interface EpicStat {
  epic_key: string;
  epic_name: string | null;
  total_tasks: number;
  active_sprint_tasks: number;
  total_est_hours: number | null;
  total_logged_hours: number;
  pct_complete: number | null;
  member_count: number;
  members: EpicMember[];
}

// ── Epic row (expandable) ──────────────────────────────────────────────────────
function EpicRow({ epic, isOpen, onToggle }: { epic: EpicStat; isOpen: boolean; onToggle: () => void }) {
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
          <div className="flex flex-col gap-0.5">
            {epic.epic_name && (
              <span className="text-xs font-medium" style={{ color: t.textMuted }}>{epic.epic_name}</span>
            )}
            <span className="px-2.5 py-1 rounded-md text-xs font-bold w-fit"
              style={isGeneral
                ? { background: 'rgba(245,158,11,0.12)', color: '#d97706' }
                : { background: 'rgba(59,130,246,0.12)', color: '#3b82f6' }}>
              {epic.epic_key}
            </span>
          </div>
        </td>

        {/* sprint badge */}
        <td className="px-5 py-4">
          {isGeneral ? (
            <span style={{ color: t.textSubtle }}>—</span>
          ) : (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold" style={{ color: t.text }}>{epic.total_tasks} tasks</span>
              {epic.active_sprint_tasks > 0 && (
                <span className="px-2 py-0.5 rounded text-xs font-semibold w-fit"
                  style={{ background: 'rgba(16,185,129,0.12)', color: '#059669' }}>
                  {epic.active_sprint_tasks} in sprint
                </span>
              )}
            </div>
          )}
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
                  <MemberBlock key={member.user_id} member={member} />
                ))
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Member block inside expanded epic ─────────────────────────────────────────
function MemberBlock({ member }: { member: EpicMember }) {
  return (
    <div className="rounded-lg overflow-hidden" style={{ border: t.border }}>
      {/* member header */}
      <div className="flex items-center gap-3 px-4 py-3" style={{ background: t.tableHead, borderBottom: t.border }}>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
          style={{ background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)' }}>
          {member.avatar || member.full_name[0]}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm" style={{ color: t.text }}>{member.full_name}</p>
          <p className="text-xs" style={{ color: t.textSubtle }}>{member.email}</p>
        </div>
        <RoleBadge role={member.role} />
        <span className="ml-2 text-sm font-bold font-mono px-3 py-1 rounded-lg"
          style={{ background: member.total_logged > 0 ? 'rgba(16,185,129,0.12)' : 'rgba(100,116,139,0.1)', color: member.total_logged > 0 ? '#059669' : t.textMuted }}>
          {member.total_logged.toFixed(1)}h logged
        </span>
      </div>

      {/* task table */}
      {member.tasks.length > 0 && (
        <table className="w-full text-xs">
          <thead>
            <tr>
              {['Task', 'Title', 'Sprint', 'Est. Hours', 'Logged', 'Progress', 'Status'].map((h) => (
                <th key={h} className="px-4 py-2 text-left font-semibold"
                  style={{ color: t.textMuted, borderBottom: t.border, textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.4px' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {member.tasks.map((task) => {
              const pct = task.est_hours && task.est_hours > 0
                ? Math.min(100, Math.round((task.logged_hours / task.est_hours) * 100)) : 0;
              const barC = pct >= 100 ? '#ef4444' : pct >= 75 ? '#f59e0b' : '#10b981';
              return (
                <tr key={task.key} style={{ borderBottom: `1px solid ${t.borderColor}22` }}>
                  <td className="px-4 py-2.5">
                    <span className="px-2 py-0.5 rounded text-xs font-semibold"
                      style={{ background: 'rgba(59,130,246,0.12)', color: '#3b82f6' }}>
                      {task.key}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 max-w-[260px]" style={{ color: t.text }}>
                    <span className="line-clamp-1" title={task.title}>{task.title}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    {task.is_active_sprint ? (
                      <span className="px-2 py-0.5 rounded text-xs font-semibold"
                        style={{ background: 'rgba(16,185,129,0.12)', color: '#059669' }}>Active</span>
                    ) : (
                      <span style={{ color: t.textSubtle }}>Backlog</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 font-mono" style={{ color: t.textMuted }}>
                    {task.est_hours != null ? `${task.est_hours}h` : '—'}
                  </td>
                  <td className="px-4 py-2.5 font-mono font-semibold"
                    style={{ color: task.logged_hours > 0 ? t.text : t.textSubtle }}>
                    {task.logged_hours > 0 ? `${task.logged_hours}h` : '—'}
                  </td>
                  <td className="px-4 py-2.5">
                    {task.est_hours != null ? (
                      <div className="flex items-center gap-1.5 min-w-[80px]">
                        <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: t.borderColor }}>
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: barC }} />
                        </div>
                        <span className="text-xs font-semibold" style={{ color: barC }}>{pct}%</span>
                      </div>
                    ) : <span style={{ color: t.textSubtle }}>—</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="px-2 py-0.5 rounded text-xs"
                      style={{
                        background: task.status === 'In Progress' ? 'rgba(59,130,246,0.12)' : task.status === 'Done' ? 'rgba(16,185,129,0.12)' : 'rgba(100,116,139,0.12)',
                        color: task.status === 'In Progress' ? '#3b82f6' : task.status === 'Done' ? '#059669' : t.textMuted,
                      }}>
                      {task.status}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Project / Epic dashboard panel ────────────────────────────────────────────
function ProjectView({ token }: { token: string }) {
  const [epics,      setEpics]      = useState<EpicStat[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [sprintOnly, setSprintOnly] = useState(false);
  const [expanded,   setExpanded]   = useState<Set<string>>(new Set());

  const fetchEpics = useCallback(async () => {
    setLoading(true);
    setExpanded(new Set());
    try {
      // No date params — logged hours are all-time in Project View
      const url = `${API}/jira/epic-dashboard?sprint_only=${sprintOnly}`;
      const res = await fetch(url, { headers: aH(token) });
      if (res.ok) setEpics((await res.json()).epics ?? []);
    } catch (ex) { console.error(ex); }
    finally { setLoading(false); }
  }, [token, sprintOnly]);

  useEffect(() => { fetchEpics(); }, [fetchEpics]);

  const toggleExpand = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const projectEpics = epics.filter((e) => e.epic_key !== 'GENERAL');
  const totalLogged  = projectEpics.reduce((s, e) => s + Number(e.total_logged_hours || 0), 0);
  const totalEst     = projectEpics.filter((e) => e.total_est_hours != null)
                                   .reduce((s, e) => s + Number(e.total_est_hours || 0), 0);
  const overallPct   = totalEst > 0 ? Math.min(100, Math.round((totalLogged / totalEst) * 100)) : 0;

  return (
    <div className="space-y-6">
      {/* controls row */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-xs px-2.5 py-1 rounded-md" style={{ background: 'rgba(59,130,246,0.08)', color: '#3b82f6' }}>
          Logged hours: all time
        </span>
        <span className="text-xs px-2.5 py-1 rounded-md" style={{ background: 'rgba(139,92,246,0.08)', color: '#7c3aed' }}>
          Est = SP × 8h + 20% buffer
        </span>
        <button
          onClick={() => setSprintOnly((v) => !v)}
          className="px-4 py-1.5 rounded-lg text-sm font-medium transition-all"
          style={sprintOnly
            ? { background: 'rgba(16,185,129,0.18)', color: '#059669', border: '1px solid #059669' }
            : { border: t.border, color: t.textMuted, background: 'transparent' }}>
          {sprintOnly ? 'Sprint Only' : 'All Tasks'}
        </button>
        <button onClick={fetchEpics}
          className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
          style={{ border: t.border, color: t.textMuted, background: 'transparent' }}>
          Refresh
        </button>
      </div>

      {/* summary cards */}
      <div className="grid grid-cols-3 gap-5">
        {[
          { title: 'Active Epics / Projects', value: epics.filter((e) => e.epic_key !== 'GENERAL').length, color: 'rgba(59,130,246,0.15)' },
          { title: 'Total Hours Logged',       value: `${totalLogged.toFixed(1)}h`,                        color: 'rgba(139,92,246,0.15)' },
          { title: 'Overall Progress',         value: `${overallPct}%`,                                    color: 'rgba(16,185,129,0.15)' },
        ].map((s) => (
          <div key={s.title} className="rounded-xl p-5 shadow-sm" style={{ background: t.statGrad, border: t.border }}>
            <p className="text-sm font-medium mb-2" style={{ color: t.textMuted }}>{s.title}</p>
            <p className="text-3xl font-bold" style={{ color: t.text }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* epic table */}
      {loading ? (
        <div className="text-center py-16 rounded-xl" style={{ background: t.cardBg, border: t.border, color: t.textSubtle }}>
          Loading project data…
        </div>
      ) : epics.length === 0 ? (
        <div className="text-center py-16 rounded-xl" style={{ background: t.cardBg, border: t.border, color: t.textSubtle }}>
          No epics found.
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden shadow-sm" style={{ background: t.cardBg, border: t.border }}>
          <div className="px-6 py-3 flex items-center gap-2" style={{ borderBottom: t.border, background: t.tableHead }}>
            <h4 className="text-sm font-bold uppercase tracking-wider" style={{ color: t.textHeader }}>
              Project (Epic) Breakdown
            </h4>
            <span className="px-2 py-0.5 rounded-full text-xs font-bold"
              style={{ background: 'rgba(100,116,139,0.15)', color: t.textMuted }}>
              {epics.length}
            </span>
          </div>
          <table className="w-full text-sm">
            <thead style={{ background: t.tableHead }}>
              <tr>
                <th className="w-8 px-4 py-3" />
                {['Project / Epic', 'Tasks', 'Est. Hours', 'Logged Hours', 'Progress', 'Members'].map((h) => (
                  <th key={h} className="px-5 py-3 text-left font-semibold"
                    style={{ color: t.textHeader, borderBottom: t.border, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {epics.map((epic) => (
                <EpicRow
                  key={epic.epic_key}
                  epic={epic}
                  isOpen={expanded.has(epic.epic_key)}
                  onToggle={() => toggleExpand(epic.epic_key)}
                />
              ))}
            </tbody>
          </table>
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
        <div className="flex items-center gap-3">
          {/* tab switcher — admin only */}
          {user?.role === 'admin' && (
            <div className="flex rounded-lg overflow-hidden" style={{ border: t.border }}>
              {([['resource', 'Resource View'], ['project', 'Project View']] as [Tab, string][]).map(([tab, label]) => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  className="px-4 py-2 text-sm font-medium transition-all"
                  style={activeTab === tab
                    ? { background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)', color: '#fff' }
                    : { background: 'transparent', color: t.textMuted }}>
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* preset buttons */}
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

        {/* ── Project View ── */}
        {activeTab === 'project' ? (
          <ProjectView token={token} />
        ) : (
          <>
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
          </>
        )}

      </div>
    </div>
  );
}
