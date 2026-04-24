'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/lib/theme';

const API = process.env.NEXT_PUBLIC_API_URL;

interface DayData {
  date: string;           // "YYYY-MM-DD"
  total_hours: number;
  spaces: Record<string, number>;
}

interface CalendarData {
  year: number;
  month: number;
  days: DayData[];
}

function aH(token: string) { return { Authorization: `Bearer ${token}` }; }

const MONTH_NAMES = ['January','February','March','April','May','June',
                     'July','August','September','October','November','December'];
const DOW_LABELS  = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

// ── Tooltip component ─────────────────────────────────────────────────────────
function DayTooltip({ day, x, y }: { day: DayData; x: number; y: number }) {
  const spaces = Object.entries(day.spaces).sort((a, b) => b[1] - a[1]);
  return (
    <div className="fixed z-50 pointer-events-none rounded-xl shadow-xl p-3 min-w-[160px]"
      style={{
        left: Math.min(x + 12, window.innerWidth - 200),
        top:  Math.min(y + 12, window.innerHeight - 180),
        background: '#1a1a2e',
        border: '1px solid #2a2a3a',
        fontSize: 12,
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

// ── Calendar grid ─────────────────────────────────────────────────────────────
function CalendarGrid({ year, month, dayMap, today }: {
  year: number; month: number;
  dayMap: Record<string, DayData>;
  today: string;
}) {
  const [tooltip, setTooltip] = useState<{ day: DayData; x: number; y: number } | null>(null);

  // Build grid: 6 rows × 7 cols (Mon=0 … Sun=6)
  const firstDay = new Date(year, month - 1, 1);
  const lastDay  = new Date(year, month, 0);
  const startDow = (firstDay.getDay() + 6) % 7; // Mon=0
  const totalDays = lastDay.getDate();

  const cells: (number | null)[] = [
    ...Array(startDow).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <div>
      {/* Day-of-week header */}
      <div className="grid grid-cols-7 mb-2">
        {DOW_LABELS.map((d) => (
          <div key={d} className="text-center text-xs font-semibold py-2"
            style={{ color: d === 'Sat' || d === 'Sun' ? '#64748b' : t.textMuted }}>
            {d}
          </div>
        ))}
      </div>

      {/* Weeks */}
      <div className="grid grid-cols-7 gap-1.5">
        {cells.map((day, i) => {
          if (!day) return <div key={i} />;

          const dateStr = `${year}-${pad(month)}-${pad(day)}`;
          const data    = dayMap[dateStr];
          const hours   = data?.total_hours ?? 0;
          const isToday = dateStr === today;
          const isFuture = dateStr > today;
          const isWeekend = i % 7 >= 5;

          let bg = 'rgba(100,116,139,0.06)';
          let textColor = t.textMuted;
          let hoursColor = t.textSubtle;
          let borderColor = 'transparent';

          if (!isFuture && !isWeekend && hours > 0) {
            if (hours >= 8) {
              bg = 'rgba(16,185,129,0.12)';
              textColor = '#e2e8f0';
              hoursColor = '#10b981';
              borderColor = 'rgba(16,185,129,0.3)';
            } else {
              bg = 'rgba(239,68,68,0.10)';
              textColor = '#e2e8f0';
              hoursColor = '#ef4444';
              borderColor = 'rgba(239,68,68,0.3)';
            }
          } else if (!isFuture && !isWeekend) {
            // Workday with 0 hours logged
            bg = 'rgba(239,68,68,0.06)';
            borderColor = 'rgba(239,68,68,0.15)';
          }

          if (isToday) borderColor = '#3b82f6';
          if (isWeekend) textColor = '#4a5568';

          return (
            <div
              key={i}
              className="rounded-lg p-2 cursor-default select-none transition-all"
              style={{
                background: bg,
                border: `1px solid ${borderColor}`,
                minHeight: 72,
                outline: isToday ? '2px solid #3b82f6' : 'none',
                outlineOffset: 1,
              }}
              onMouseEnter={data ? (e) => setTooltip({ day: data, x: e.clientX, y: e.clientY }) : undefined}
              onMouseMove={data ? (e) => setTooltip({ day: data, x: e.clientX, y: e.clientY }) : undefined}
              onMouseLeave={() => setTooltip(null)}
            >
              {/* Day number */}
              <p className="text-xs font-bold mb-1" style={{ color: textColor }}>
                {day}
                {isToday && (
                  <span className="ml-1.5 px-1 py-0.5 rounded text-[9px]"
                    style={{ background: '#3b82f6', color: '#fff' }}>TODAY</span>
                )}
              </p>

              {/* Hours badge */}
              {hours > 0 && (
                <p className="text-sm font-bold" style={{ color: hoursColor }}>
                  {hours.toFixed(1)}h
                </p>
              )}

              {/* Space mini-pills */}
              {data && Object.keys(data.spaces).length > 0 && (
                <div className="flex flex-wrap gap-0.5 mt-1">
                  {Object.entries(data.spaces)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 3)
                    .map(([sk]) => (
                      <span key={sk} className="text-[9px] px-1 rounded"
                        style={{ background: 'rgba(59,130,246,0.15)', color: '#93c5fd' }}>
                        {sk}
                      </span>
                    ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-5 mt-4 text-xs" style={{ color: t.textMuted }}>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded" style={{ background: 'rgba(16,185,129,0.2)', border: '1px solid rgba(16,185,129,0.4)' }} />
          8h+ logged
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded" style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.35)' }} />
          Under 8h
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded" style={{ background: 'rgba(100,116,139,0.1)', border: '1px solid transparent' }} />
          Weekend / future
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded" style={{ border: '2px solid #3b82f6' }} />
          Today
        </span>
      </div>

      {tooltip && <DayTooltip day={tooltip.day} x={tooltip.x} y={tooltip.y} />}
    </div>
  );
}

// ── Summary stats strip ───────────────────────────────────────────────────────
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
    const isFuture = dateStr > today;
    if (!isWeekend) workdays++;

    const data = dayMap[dateStr];
    if (!data || isFuture) continue;
    totalHours += data.total_hours;
    if (!isWeekend) {
      if (data.total_hours >= 8) greenDays++;
      else redDays++;
    }
    Object.entries(data.spaces).forEach(([sk, h]) => {
      spaceTotal[sk] = (spaceTotal[sk] ?? 0) + Number(h);
    });
  }

  const topSpaces = Object.entries(spaceTotal).sort((a, b) => b[1] - a[1]).slice(0, 6);

  return (
    <div className="grid grid-cols-4 gap-4 mt-6">
      {[
        { label: 'Total Hours',      value: `${totalHours.toFixed(1)}h`, color: '#3b82f6' },
        { label: 'Full Days (8h+)',  value: greenDays,                   color: '#10b981' },
        { label: 'Short Days (<8h)', value: redDays,                     color: '#ef4444' },
        { label: 'Workdays Left',    value: Math.max(0, workdays - greenDays - redDays), color: '#f59e0b' },
      ].map((s) => (
        <div key={s.label} className="rounded-xl p-4 shadow-sm" style={{ background: t.cardBg, border: t.border }}>
          <p className="text-xs font-medium mb-1" style={{ color: t.textMuted }}>{s.label}</p>
          <p className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</p>
        </div>
      ))}

      {topSpaces.length > 0 && (
        <div className="col-span-4 rounded-xl p-4 shadow-sm" style={{ background: t.cardBg, border: t.border }}>
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
  const token = useAuthStore((s) => s.token) ?? '';

  const now   = new Date();
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [calData, setCalData] = useState<CalendarData | null>(null);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;

  useEffect(() => { setMounted(true); }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/timesheet/my-calendar?year=${year}&month=${month}`, { headers: aH(token) });
      if (res.ok) setCalData(await res.json());
      else setError(`API error ${res.status}: ${await res.text()}`);
    } catch (ex) { setError(String(ex)); }
    finally { setLoading(false); }
  }, [token, year, month]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const prevMonth = () => { if (month === 1) { setYear(y => y-1); setMonth(12); } else setMonth(m => m-1); };
  const nextMonth = () => {
    const nm = month === 12 ? 1 : month + 1;
    const ny = month === 12 ? year + 1 : year;
    if (`${ny}-${String(nm).padStart(2,'0')}-01` <= today.slice(0,7) + '-01') {
      if (month === 12) { setYear(y => y+1); setMonth(1); } else setMonth(m => m+1);
    }
  };

  const dayMap: Record<string, DayData> = {};
  if (calData) calData.days.forEach((d) => { dayMap[d.date] = d; });

  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;

  return (
    <div className="flex flex-col h-full" style={{ background: t.pageBg }}>

      {/* Header */}
      <div className="flex items-center justify-between px-8 h-[70px] flex-shrink-0"
        style={{ background: t.headerBg, borderBottom: t.border }}>
        <div>
          <h2 className="text-xl font-semibold" style={{ color: t.text }}>My Analytics</h2>
          <p className="text-sm" style={{ color: t.textMuted }}>Your personal timesheet calendar — hover a day for details</p>
        </div>
        <div className="flex items-center gap-3">
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
          <button onClick={fetchData} disabled={loading}
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
        {error && (
          <div className="mb-4 px-4 py-3 rounded-lg text-sm" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}>
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
            <CalendarGrid year={year} month={month} dayMap={dayMap} today={today} />
            <MonthSummary year={year} month={month} dayMap={dayMap} today={today} />
          </div>
        )}
      </div>
    </div>
  );
}
