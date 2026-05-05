'use client';

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/lib/theme';

const API = process.env.NEXT_PUBLIC_API_URL;

// ── Types ─────────────────────────────────────────────────────────────────────
interface DayData {
  date: string;
  total_hours: number;
  spaces: Record<string, number>;
}
interface CalendarData { year: number; month: number; days: DayData[]; }

interface TeamUser { user_id: string; full_name: string; hours: number; }
interface TeamDayData {
  date: string;
  is_weekend: boolean;
  users: TeamUser[];
  filled_count: number;
  total_users: number;
  all_filled: boolean;
}
interface TeamCalendarData { year: number; month: number; days: TeamDayData[]; }

interface AdminUser { user_id: string; full_name: string; email: string; }

function aH(token: string) { return { Authorization: `Bearer ${token}` }; }

const MONTH_NAMES = ['January','February','March','April','May','June',
                     'July','August','September','October','November','December'];
const DOW_LABELS  = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

// ── Individual day tooltip ────────────────────────────────────────────────────
function DayTooltip({ day, x, y }: { day: DayData; x: number; y: number }) {
  const spaces = Object.entries(day.spaces).sort((a, b) => b[1] - a[1]);
  return (
    <div className="fixed z-50 pointer-events-none rounded-xl shadow-xl p-3 min-w-[160px]"
      style={{
        left: Math.min(x + 12, window.innerWidth - 200),
        top:  Math.min(y + 12, window.innerHeight - 180),
        background: '#1a1a2e', border: '1px solid #2a2a3a', fontSize: 12,
      }}>
      <p className="font-bold mb-2" style={{ color: '#e2e8f0' }}>
        {new Date(day.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
      </p>
      <p className="font-semibold mb-1.5" style={{ color: day.total_hours >= 8 ? '#10b981' : '#f59e0b' }}>
        Total: {day.total_hours.toFixed(1)}h
      </p>
      {spaces.length > 0 && (
        <div className="space-y-0.5 border-t pt-1.5 mt-1" style={{ borderColor: '#2a2a3a' }}>
          {spaces.map(([sk, h]) => (
            <div key={sk} className="flex justify-between gap-4">
              <span style={{ color: '#94a3b8' }}>{sk}</span>
              <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{Number(h).toFixed(1)}h</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Team day tooltip ──────────────────────────────────────────────────────────
function TeamDayTooltip({ day, x, y }: { day: TeamDayData; x: number; y: number }) {
  return (
    <div className="fixed z-50 pointer-events-none rounded-xl shadow-xl p-3 min-w-[200px]"
      style={{
        left: Math.min(x + 12, window.innerWidth - 240),
        top:  Math.min(y + 12, window.innerHeight - 300),
        background: '#1a1a2e', border: '1px solid #2a2a3a', fontSize: 12,
      }}>
      <p className="font-bold mb-2" style={{ color: '#e2e8f0' }}>
        {new Date(day.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
      </p>
      <p className="text-xs mb-2" style={{ color: '#94a3b8' }}>
        {day.filled_count} / {day.total_users} filled (≥ 8h)
      </p>
      <div className="space-y-1 border-t pt-2 mt-1" style={{ borderColor: '#2a2a3a' }}>
        {day.users.map(u => (
          <div key={u.user_id} className="flex justify-between gap-4 items-center">
            <span style={{ color: u.hours >= 8 ? '#10b981' : u.hours > 0 ? '#f59e0b' : '#64748b' }}>
              {u.full_name}
            </span>
            <span style={{ color: '#e2e8f0', fontWeight: 600 }}>
              {u.hours > 0 ? `${u.hours.toFixed(1)}h` : '—'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Individual calendar grid ──────────────────────────────────────────────────
function CalendarGrid({ year, month, dayMap, today }: {
  year: number; month: number;
  dayMap: Record<string, DayData>;
  today: string;
}) {
  const [tooltip, setTooltip] = useState<{ day: DayData; x: number; y: number } | null>(null);
  const firstDay = new Date(year, month - 1, 1);
  const lastDay  = new Date(year, month, 0);
  const startDow = (firstDay.getDay() + 6) % 7;
  const cells: (number | null)[] = [
    ...Array(startDow).fill(null),
    ...Array.from({ length: lastDay.getDate() }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <div>
      <div className="grid grid-cols-7 mb-2">
        {DOW_LABELS.map(d => (
          <div key={d} className="text-center text-xs font-semibold py-2"
            style={{ color: d === 'Sat' || d === 'Sun' ? '#64748b' : t.textMuted }}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {cells.map((day, i) => {
          if (!day) return <div key={i} />;
          const dateStr = `${year}-${pad(month)}-${pad(day)}`;
          const data    = dayMap[dateStr];
          const hours   = data?.total_hours ?? 0;
          const isToday = dateStr === today;
          const isFuture  = dateStr > today;
          const isWeekend = i % 7 >= 5;
          let bg = 'rgba(100,116,139,0.06)', textColor = t.textMuted, hoursColor = t.textSubtle, borderColor = 'transparent';
          let tagBg = 'rgba(59,130,246,0.15)', tagColor = '#93c5fd';
          if (!isFuture && !isWeekend && hours > 0) {
            if (hours >= 8) { bg = 'rgba(16,185,129,0.12)'; textColor = '#1e293b'; hoursColor = '#1e293b'; borderColor = 'rgba(16,185,129,0.3)'; tagBg = 'rgba(255,255,255,0.55)'; tagColor = '#1e293b'; }
            else            { bg = 'rgba(239,68,68,0.10)';  textColor = '#e2e8f0'; hoursColor = '#ef4444'; borderColor = 'rgba(239,68,68,0.3)'; }
          } else if (!isFuture && !isWeekend) {
            bg = 'rgba(239,68,68,0.06)'; borderColor = 'rgba(239,68,68,0.15)';
          }
          if (isToday) borderColor = '#3b82f6';
          if (isWeekend) textColor = '#4a5568';
          return (
            <div key={i} className="rounded-lg p-2 cursor-default select-none transition-all"
              style={{ background: bg, border: `1px solid ${borderColor}`, minHeight: 72,
                       outline: isToday ? '2px solid #3b82f6' : 'none', outlineOffset: 1 }}
              onMouseEnter={data ? e => setTooltip({ day: data, x: e.clientX, y: e.clientY }) : undefined}
              onMouseMove={data  ? e => setTooltip({ day: data, x: e.clientX, y: e.clientY }) : undefined}
              onMouseLeave={() => setTooltip(null)}>
              <p className="text-xs font-bold mb-1" style={{ color: textColor }}>
                {day}{isToday && <span className="ml-1.5 px-1 py-0.5 rounded text-[9px]" style={{ background: '#3b82f6', color: '#fff' }}>TODAY</span>}
              </p>
              {hours > 0 && <p className="text-sm font-bold" style={{ color: hoursColor }}>{hours.toFixed(1)}h</p>}
              {data && Object.keys(data.spaces).length > 0 && (
                <div className="flex flex-wrap gap-0.5 mt-1">
                  {Object.entries(data.spaces).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([sk])=>(
                    <span key={sk} className="text-[9px] font-bold px-1 rounded"
                      style={{ background: tagBg, color: tagColor }}>{sk}</span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-5 mt-4 text-xs" style={{ color: t.textMuted }}>
        {[
          { bg: 'rgba(16,185,129,0.2)', border: 'rgba(16,185,129,0.4)', label: '8h+ logged' },
          { bg: 'rgba(239,68,68,0.15)', border: 'rgba(239,68,68,0.35)',  label: 'Under 8h' },
          { bg: 'rgba(100,116,139,0.1)',border: 'transparent',           label: 'Weekend / future' },
        ].map(s => (
          <span key={s.label} className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded" style={{ background: s.bg, border: `1px solid ${s.border}` }} />
            {s.label}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded" style={{ border: '2px solid #3b82f6' }} />Today
        </span>
      </div>
      {tooltip && <DayTooltip day={tooltip.day} x={tooltip.x} y={tooltip.y} />}
    </div>
  );
}

// ── Team calendar grid ────────────────────────────────────────────────────────
function TeamCalendarGrid({ year, month, dayMap, today }: {
  year: number; month: number;
  dayMap: Record<string, TeamDayData>;
  today: string;
}) {
  const [tooltip, setTooltip] = useState<{ day: TeamDayData; x: number; y: number } | null>(null);
  const firstDay = new Date(year, month - 1, 1);
  const lastDay  = new Date(year, month, 0);
  const startDow = (firstDay.getDay() + 6) % 7;
  const cells: (number | null)[] = [
    ...Array(startDow).fill(null),
    ...Array.from({ length: lastDay.getDate() }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <div>
      <div className="grid grid-cols-7 mb-2">
        {DOW_LABELS.map(d => (
          <div key={d} className="text-center text-xs font-semibold py-2"
            style={{ color: d === 'Sat' || d === 'Sun' ? '#64748b' : t.textMuted }}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {cells.map((day, i) => {
          if (!day) return <div key={i} />;
          const dateStr   = `${year}-${pad(month)}-${pad(day)}`;
          const data      = dayMap[dateStr];
          const isToday   = dateStr === today;
          const isFuture  = dateStr > today;
          const isWeekend = i % 7 >= 5;

          let bg = 'rgba(100,116,139,0.06)', borderColor = 'transparent';
          let countColor = t.textSubtle;
          let showCount  = false;

          if (!isFuture && !isWeekend && data) {
            showCount = true;
            if (data.all_filled) {
              bg = 'rgba(16,185,129,0.15)'; borderColor = 'rgba(16,185,129,0.35)';
              countColor = '#000000';
            } else {
              bg = 'rgba(239,68,68,0.12)'; borderColor = 'rgba(239,68,68,0.3)';
              countColor = '#c0392b';
            }
          } else if (!isFuture && !isWeekend) {
            bg = 'rgba(239,68,68,0.06)'; borderColor = 'rgba(239,68,68,0.15)';
            showCount = true; countColor = '#c0392b';
          }
          if (isToday) borderColor = '#3b82f6';

          const filled = data?.filled_count ?? 0;
          const total  = data?.total_users  ?? 0;

          return (
            <div key={i} className="rounded-lg p-2 cursor-default select-none"
              style={{ background: bg, border: `1px solid ${borderColor}`, minHeight: 72,
                       outline: isToday ? '2px solid #3b82f6' : 'none', outlineOffset: 1 }}
              onMouseEnter={(!isFuture && !isWeekend && data) ? e => setTooltip({ day: data, x: e.clientX, y: e.clientY }) : undefined}
              onMouseMove={(!isFuture && !isWeekend && data)  ? e => setTooltip({ day: data, x: e.clientX, y: e.clientY }) : undefined}
              onMouseLeave={() => setTooltip(null)}>
              <p className="text-xs font-bold mb-1" style={{ color: isWeekend ? '#94a3b8' : '#1e293b' }}>
                {day}{isToday && <span className="ml-1.5 px-1 py-0.5 rounded text-[9px]" style={{ background: '#3b82f6', color: '#fff' }}>TODAY</span>}
              </p>
              {showCount && total > 0 && (
                <p className="text-sm font-bold" style={{ color: countColor }}>
                  {filled}/{total}
                </p>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-5 mt-4 text-xs" style={{ color: t.textMuted }}>
        {[
          { bg: 'rgba(16,185,129,0.2)', border: 'rgba(16,185,129,0.4)', label: 'All filled (8h+)' },
          { bg: 'rgba(239,68,68,0.15)', border: 'rgba(239,68,68,0.35)',  label: 'Someone missing' },
          { bg: 'rgba(100,116,139,0.1)',border: 'transparent',           label: 'Weekend / future' },
        ].map(s => (
          <span key={s.label} className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded" style={{ background: s.bg, border: `1px solid ${s.border}` }} />
            {s.label}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded" style={{ border: '2px solid #3b82f6' }} />Today
        </span>
        <span style={{ color: t.textSubtle }}>· numbers = filled / total users</span>
      </div>
      {tooltip && <TeamDayTooltip day={tooltip.day} x={tooltip.x} y={tooltip.y} />}
    </div>
  );
}

// ── Month summary (individual view only) ─────────────────────────────────────
function MonthSummary({ year, month, dayMap, today }: {
  year: number; month: number;
  dayMap: Record<string, DayData>;
  today: string;
}) {
  const pad = (n: number) => String(n).padStart(2, '0');
  const daysInMonth = new Date(year, month, 0).getDate();
  let totalHours = 0, greenDays = 0, redDays = 0, workdays = 0;
  const spaceTotal: Record<string, number> = {};
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${pad(month)}-${pad(d)}`;
    const dow = new Date(dateStr + 'T00:00:00').getDay();
    const isWeekend = dow === 0 || dow === 6;
    const isFuture  = dateStr > today;
    if (!isWeekend) workdays++;
    const data = dayMap[dateStr];
    if (!data || isFuture) continue;
    totalHours += data.total_hours;
    if (!isWeekend) { if (data.total_hours >= 8) greenDays++; else redDays++; }
    Object.entries(data.spaces).forEach(([sk, h]) => { spaceTotal[sk] = (spaceTotal[sk] ?? 0) + Number(h); });
  }
  const topSpaces = Object.entries(spaceTotal).sort((a,b)=>b[1]-a[1]).slice(0,6);
  return (
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mt-6">
      {[
        { label: 'Total Hours',       value: `${totalHours.toFixed(1)}h`, color: '#1d4ed8' },
        { label: 'Full Days (8h+)',   value: greenDays,                   color: '#059669' },
        { label: 'Short Days (<8h)',  value: redDays,                     color: '#b91c1c' },
        { label: 'Workdays Left',     value: Math.max(0, workdays - greenDays - redDays), color: '#b45309' },
      ].map(s => (
        <div key={s.label} className="rounded-xl p-4 transition-shadow duration-300 hover:shadow-md" style={{ background: t.cardBg, border: t.border }}>
          <p className="text-[11px] font-medium mb-1.5 tracking-tight" style={{ color: t.textMuted }}>{s.label}</p>
          <p className="text-[24px] font-semibold tracking-tight tabular-nums" style={{ color: s.color }}>{s.value}</p>
        </div>
      ))}
      {topSpaces.length > 0 && (
        <div className="col-span-2 xl:col-span-4 rounded-xl p-4 shadow-sm" style={{ background: t.cardBg, border: t.border }}>
          <p className="text-xs font-semibold mb-3" style={{ color: t.textMuted }}>Hours by Project Space</p>
          <div className="flex flex-wrap gap-3">
            {topSpaces.map(([sk, h]) => (
              <div key={sk} className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
                style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)' }}>
                <span className="text-xs font-bold" style={{ color: '#3b82f6' }}>{sk}</span>
                <span className="text-xs font-semibold" style={{ color: t.text }}>{Number(h).toFixed(1)}h</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function MyAnalyticsPage() {
  const token    = useAuthStore((s) => s.token) ?? '';
  const authUser = useAuthStore((s) => s.user);
  const isAdmin  = authUser?.role === 'admin';
  const myId     = authUser?.id ?? '';

  const now = new Date();
  const [year,       setYear]       = useState(now.getFullYear());
  const [month,      setMonth]      = useState(now.getMonth() + 1);
  const [calData,    setCalData]    = useState<CalendarData | null>(null);
  const [teamData,   setTeamData]   = useState<TeamCalendarData | null>(null);
  const [loading,    setLoading]    = useState(false);
  const [mounted,    setMounted]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [targetId,   setTargetId]   = useState('');   // '' = team view (admin) or own (non-admin)
  const [refreshKey, setRefreshKey] = useState(0);

  const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;

  // Admin with no specific user selected → team overview; otherwise individual
  const isTeamView = isAdmin && targetId === '';

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!isAdmin || !token) return;
    fetch(`${API}/users/all`, { headers: aH(token) })
      .then(r => r.ok ? r.json() : { users: [] })
      .then(d => { setAdminUsers(d.users ?? []); })
      .catch(() => {});
  }, [isAdmin, token]);

  // Team calendar fetch (admin default view)
  useEffect(() => {
    if (!isTeamView || !token) return;
    let cancelled = false;
    setLoading(true); setError(null);
    fetch(`${API}/timesheet/team-calendar?year=${year}&month=${month}`, { headers: aH(token) })
      .then(r => r.ok ? r.json() : r.text().then(tx => { throw new Error(`${r.status}: ${tx}`); }))
      .then(d => { if (!cancelled) setTeamData(d); })
      .catch(ex => { if (!cancelled) setError(String(ex)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [isTeamView, token, year, month, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Individual calendar fetch
  useEffect(() => {
    if (isTeamView || !token) return;
    const uid = isAdmin ? targetId : myId;
    if (!uid) return;
    let cancelled = false;
    setLoading(true); setError(null);
    const param = isAdmin ? `&for_user_id=${uid}` : '';
    fetch(`${API}/timesheet/my-calendar?year=${year}&month=${month}${param}`, { headers: aH(token) })
      .then(r => r.ok ? r.json() : r.text().then(tx => { throw new Error(`${r.status}: ${tx}`); }))
      .then(d => { if (!cancelled) setCalData(d); })
      .catch(ex => { if (!cancelled) setError(String(ex)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [isTeamView, isAdmin, targetId, myId, token, year, month, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const prevMonth = () => { if (month === 1) { setYear(y => y-1); setMonth(12); } else setMonth(m => m-1); };
  const nextMonth = () => {
    const nm = month === 12 ? 1 : month + 1;
    const ny = month === 12 ? year + 1 : year;
    if (`${ny}-${String(nm).padStart(2,'0')}-01` <= today.slice(0,7) + '-01') {
      if (month === 12) { setYear(y => y+1); setMonth(1); } else setMonth(m => m+1);
    }
  };

  const individualDayMap: Record<string, DayData> = {};
  if (calData) calData.days.forEach(d => { individualDayMap[d.date] = d; });

  const teamDayMap: Record<string, TeamDayData> = {};
  if (teamData) teamData.days.forEach(d => { teamDayMap[d.date] = d; });

  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;
  const viewingUser = adminUsers.find(u => u.user_id === targetId);
  const pageTitle = isTeamView
    ? 'Team Overview'
    : (isAdmin && targetId && targetId !== myId)
      ? (viewingUser?.full_name ?? 'Analytics')
      : 'My Analytics';

  return (
    <div className="flex flex-col h-full" style={{ background: t.pageBg }}>

      {/* Header */}
      <div className="flex items-center justify-between px-8 h-[70px] flex-shrink-0"
        style={{ background: t.headerBg, borderBottom: t.border }}>
        <div>
          <h2 className="text-xl font-semibold" style={{ color: t.text }}>{pageTitle}</h2>
          <p className="text-sm" style={{ color: t.textMuted }}>
            {isTeamView ? 'Green = all filled ≥ 8h · Red = someone missing · hover for details' : 'Timesheet calendar — hover a day for details'}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap justify-end">
          {/* Admin selector */}
          {isAdmin && adminUsers.length > 0 && (
            <select
              value={targetId}
              onChange={e => { setTargetId(e.target.value); setCalData(null); setTeamData(null); }}
              className="px-3 py-2 rounded-lg text-sm focus:outline-none"
              style={{ background: t.inputBg, border: `1px solid ${t.inputBorder}`, color: t.text, minWidth: 240 }}>
              <option value="">— All Users (Team View) —</option>
              {adminUsers.map(u => (
                <option key={u.user_id} value={u.user_id}>
                  {u.full_name} ({u.email}){u.user_id === myId ? ' — Me' : ''}
                </option>
              ))}
            </select>
          )}
          <button onClick={prevMonth}
            className="px-3 py-2 rounded-lg text-sm font-medium transition-all hover:opacity-80"
            style={{ border: t.border, color: t.textMuted, background: 'transparent' }}>
            ← Prev
          </button>
          <span className="text-sm font-semibold px-3" style={{ color: t.text, minWidth: 140, textAlign: 'center' }}>
            {MONTH_NAMES[month-1]} {year}
          </span>
          <button onClick={nextMonth} disabled={isCurrentMonth}
            className="px-3 py-2 rounded-lg text-sm font-medium transition-all hover:opacity-80 disabled:opacity-30"
            style={{ border: t.border, color: t.textMuted, background: 'transparent' }}>
            Next →
          </button>
          <button onClick={() => setRefreshKey(k => k + 1)} disabled={loading}
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
      </div>

      <div className="flex-1 overflow-y-auto p-8">
      <div className="max-w-[1440px] mx-auto">
        {error && (
          <div className="mb-4 px-4 py-3 rounded-lg text-sm"
            style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}>
            {error}
          </div>
        )}
        {!mounted || loading ? (
          <div className="flex items-center justify-center h-64 rounded-xl"
            style={{ background: t.cardBg, border: t.border, color: t.textSubtle }}>
            <div className="text-center space-y-3">
              <svg className="w-8 h-8 animate-spin mx-auto" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
              </svg>
              <p className="text-sm">Loading calendar…</p>
            </div>
          </div>
        ) : (
          <div className="rounded-xl p-6 shadow-sm" style={{ background: t.cardBg, border: t.border }}>
            {isTeamView ? (
              <TeamCalendarGrid year={year} month={month} dayMap={teamDayMap} today={today} />
            ) : (
              <>
                <CalendarGrid year={year} month={month} dayMap={individualDayMap} today={today} />
                <MonthSummary year={year} month={month} dayMap={individualDayMap} today={today} />
              </>
            )}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
