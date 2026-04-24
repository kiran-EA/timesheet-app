'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/lib/theme';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar,
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ReferenceLine,
} from 'recharts';

const API = process.env.NEXT_PUBLIC_API_URL;

// ── Module-level cache (survives tab switches within the session) ──────────────
interface InsightsData {
  user_hours:       UserHour[];
  daily_hours:      DailyHour[];
  status_breakdown: StatusRow[];
  space_hours:      SpaceHour[];
  dow_pattern:      DowRow[];
}
let _cache: { data: InsightsData; fetchedAt: Date; key: string } | null = null;

// ── Types ─────────────────────────────────────────────────────────────────────
interface UserHour {
  user_id: string; full_name: string; avatar: string; role: string;
  total_hours: number; approved_hours: number;
  pending_count: number; rejected_count: number; resubmitted_count: number;
}
interface DailyHour   { date: string; total_hours: number; active_members: number; }
interface StatusRow   { status: string; entry_count: number; total_hours: number; }
interface SpaceHour   { space_key: string; total_hours: number; member_count: number; entry_count: number; }
interface DowRow      { dow: number; total_hours: number; entry_count: number; }

// ── Helpers ───────────────────────────────────────────────────────────────────
function aH(token: string) { return { Authorization: `Bearer ${token}` }; }

function localDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function getMonthRange() {
  const now = new Date();
  return {
    start: localDateStr(new Date(now.getFullYear(), now.getMonth(), 1)),
    end:   localDateStr(new Date(now.getFullYear(), now.getMonth()+1, 0)),
  };
}
function getWeekRange() {
  const now = new Date();
  const mon = new Date(now); mon.setDate(now.getDate() - now.getDay() + 1);
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  return { start: localDateStr(mon), end: localDateStr(sun) };
}
function countWorkingDays(start: string, end: string) {
  let n = 0;
  const cur = new Date(start + 'T00:00:00'), endD = new Date(end + 'T00:00:00');
  while (cur <= endD) { const d = cur.getDay(); if (d !== 0 && d !== 6) n++; cur.setDate(cur.getDate()+1); }
  return Math.max(n, 1);
}
function timeAgo(d: Date) {
  const m = Math.floor((Date.now() - d.getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m === 1) return '1 min ago';
  return `${m} min ago`;
}

// ── Chart colour palette ───────────────────────────────────────────────────────
const COLORS = ['#3b82f6','#8b5cf6','#10b981','#f59e0b','#ef4444','#06b6d4','#ec4899','#84cc16','#f97316','#6366f1','#14b8a6','#a78bfa'];
const STATUS_COLOR: Record<string,string> = {
  approved: '#10b981', pending: '#f59e0b', rejected: '#ef4444', resubmitted: '#8b5cf6',
};
const DOW_LABELS = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ── Shared tooltip style ──────────────────────────────────────────────────────
const tooltipStyle = {
  contentStyle: { background: '#1a1a2e', border: '1px solid #2a2a3a', borderRadius: 8, fontSize: 12, color: '#e2e8f0' },
  itemStyle:    { color: '#e2e8f0' },
  labelStyle:   { color: '#94a3b8', fontWeight: 600 },
};

// ── Card wrapper ──────────────────────────────────────────────────────────────
function Card({ title, subtitle, children, fullWidth }: {
  title: string; subtitle?: string; children: React.ReactNode; fullWidth?: boolean;
}) {
  return (
    <div className={`rounded-xl p-5 shadow-sm flex flex-col gap-4 ${fullWidth ? 'col-span-2' : ''}`}
      style={{ background: t.cardBg, border: t.border }}>
      <div>
        <h3 className="text-sm font-semibold" style={{ color: t.text }}>{title}</h3>
        {subtitle && <p className="text-xs mt-0.5" style={{ color: t.textMuted }}>{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

// ── 1. Hours Over Time (Area) ─────────────────────────────────────────────────
function HoursOverTime({ data }: { data: DailyHour[] }) {
  const fmt = (d: string) => {
    const dt = new Date(d + 'T00:00:00');
    return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };
  return (
    <Card title="Hours Logged Over Time" subtitle="Daily team hours across the selected period" fullWidth>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
          <defs>
            <linearGradient id="gradHours" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.3}/>
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3a" />
          <XAxis dataKey="date" tickFormatter={fmt} tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}h`} />
          <Tooltip {...tooltipStyle} formatter={(v: number) => [`${v.toFixed(1)}h`, 'Team Hours']} labelFormatter={fmt} />
          <Area type="monotone" dataKey="total_hours" stroke="#3b82f6" strokeWidth={2} fill="url(#gradHours)" dot={false} activeDot={{ r: 4, fill: '#3b82f6' }} />
        </AreaChart>
      </ResponsiveContainer>
    </Card>
  );
}

// ── 2. Approval Status Donut ──────────────────────────────────────────────────
function ApprovalDonut({ data }: { data: StatusRow[] }) {
  const total = data.reduce((s, r) => s + r.entry_count, 0);
  const RADIAN = Math.PI / 180;
  const renderLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: {
    cx: number; cy: number; midAngle: number; innerRadius: number; outerRadius: number; percent: number;
  }) => {
    if (percent < 0.05) return null;
    const r = innerRadius + (outerRadius - innerRadius) * 0.5;
    return (
      <text x={cx + r * Math.cos(-midAngle * RADIAN)} y={cy + r * Math.sin(-midAngle * RADIAN)}
        fill="#fff" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={700}>
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  return (
    <Card title="Approval Status Breakdown" subtitle={`${total} total entries`}>
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie data={data} cx="50%" cy="50%" innerRadius={55} outerRadius={90}
            dataKey="entry_count" nameKey="status" labelLine={false} label={renderLabel}>
            {data.map((row) => (
              <Cell key={row.status} fill={STATUS_COLOR[row.status] ?? '#64748b'} />
            ))}
          </Pie>
          <Tooltip {...tooltipStyle} formatter={(v: number, _: string, props: { payload?: StatusRow }) => [
            `${v} entries · ${Number(props.payload?.total_hours ?? 0).toFixed(1)}h`, props.payload?.status ?? '',
          ]} />
          <Legend iconType="circle" iconSize={8} formatter={(v) => <span style={{ color: '#94a3b8', fontSize: 12 }}>{v}</span>} />
        </PieChart>
      </ResponsiveContainer>
    </Card>
  );
}

// ── 3. Hours by Jira Space ────────────────────────────────────────────────────
function SpaceDistribution({ data }: { data: SpaceHour[] }) {
  return (
    <Card title="Hours by Project Space" subtitle="Where team effort is concentrated">
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 30, left: 10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3a" horizontal={false} />
          <XAxis type="number" tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}h`} />
          <YAxis type="category" dataKey="space_key" tick={{ fill: '#94a3b8', fontSize: 12, fontWeight: 600 }} tickLine={false} axisLine={false} width={50} />
          <Tooltip {...tooltipStyle} formatter={(v: number) => [`${v.toFixed(1)}h`, 'Logged Hours']} />
          <Bar dataKey="total_hours" radius={[0, 4, 4, 0]} maxBarSize={20}>
            {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}

// ── 4. Team Utilization ───────────────────────────────────────────────────────
function TeamUtilization({ data, targetHours }: { data: UserHour[]; targetHours: number }) {
  const chartData = data
    .filter((u) => u.role !== 'admin' || Number(u.total_hours) > 0)
    .map((u) => ({
      name: u.full_name.split(' ')[0],
      full: u.full_name,
      hours: Number(u.total_hours),
      pct: Math.min(200, Math.round((Number(u.total_hours) / targetHours) * 100)),
    }));

  const barColor = (pct: number) =>
    pct >= 100 ? '#10b981' : pct >= 75 ? '#3b82f6' : pct >= 40 ? '#f59e0b' : '#ef4444';

  return (
    <Card title="Team Utilization" subtitle={`Target: ${targetHours}h per person (8h × working days)`} fullWidth>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3a" />
          <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}h`} />
          <Tooltip {...tooltipStyle}
            formatter={(v: number, _: string, props: { payload?: typeof chartData[number] }) => [
              `${v.toFixed(1)}h (${props.payload?.pct ?? 0}%)`, props.payload?.full ?? '',
            ]} />
          <ReferenceLine y={targetHours} stroke="#8b5cf6" strokeDasharray="4 2" strokeWidth={1.5}
            label={{ value: 'Target', position: 'right', fill: '#8b5cf6', fontSize: 11 }} />
          <Bar dataKey="hours" radius={[4, 4, 0, 0]} maxBarSize={40}>
            {chartData.map((d, i) => <Cell key={i} fill={barColor(d.pct)} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}

// ── 5. Top Contributors ───────────────────────────────────────────────────────
function TopContributors({ data }: { data: UserHour[] }) {
  const top = data.slice(0, 8).map((u) => ({
    name: u.full_name.split(' ')[0],
    full: u.full_name,
    hours: Number(u.total_hours),
  }));
  return (
    <Card title="Top Contributors" subtitle="Ranked by total hours logged">
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={top} layout="vertical" margin={{ top: 0, right: 30, left: 10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3a" horizontal={false} />
          <XAxis type="number" tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}h`} />
          <YAxis type="category" dataKey="name" tick={{ fill: '#94a3b8', fontSize: 12 }} tickLine={false} axisLine={false} width={55} />
          <Tooltip {...tooltipStyle} formatter={(v: number, _: string, props: { payload?: typeof top[number] }) => [
            `${v.toFixed(1)}h`, props.payload?.full ?? '',
          ]} />
          <Bar dataKey="hours" radius={[0, 4, 4, 0]} maxBarSize={20}>
            {top.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}

// ── 6. Daily Logging Pattern ──────────────────────────────────────────────────
function DowPattern({ data }: { data: DowRow[] }) {
  const allDows = [1,2,3,4,5].map((dow) => {
    const found = data.find((r) => r.dow === dow);
    return { dow, label: DOW_LABELS[dow], total_hours: found ? Number(found.total_hours) : 0 };
  });
  const maxH = Math.max(...allDows.map((d) => d.total_hours), 1);

  return (
    <Card title="Daily Logging Pattern" subtitle="Which days the team logs the most hours">
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={allDows} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3a" />
          <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 12 }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}h`} />
          <Tooltip {...tooltipStyle} formatter={(v: number) => [`${v.toFixed(1)}h`, 'Hours']} />
          <Bar dataKey="total_hours" radius={[4, 4, 0, 0]} maxBarSize={48}>
            {allDows.map((d, i) => (
              <Cell key={i} fill={
                d.total_hours === maxH ? '#10b981' :
                d.total_hours > maxH * 0.7 ? '#3b82f6' : '#4a4a6a'
              } />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
type Preset = 'week' | 'month' | 'custom';

export default function InsightsPage() {
  const token  = useAuthStore((s) => s.token) ?? '';
  const user   = useAuthStore((s) => s.user);
  const router = useRouter();

  const [preset,    setPreset]    = useState<Preset>('month');
  const [startDate, setStartDate] = useState(getMonthRange().start);
  const [endDate,   setEndDate]   = useState(getMonthRange().end);
  const [data,      setData]      = useState<InsightsData | null>(null);
  const [loading,   setLoading]   = useState(false);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);

  useEffect(() => {
    if (user && user.role !== 'admin') router.push('/timesheet');
  }, [user, router]);

  const cacheKey = `${startDate}|${endDate}`;

  const fetchData = useCallback(async (force = false) => {
    if (!force && _cache && _cache.key === cacheKey) {
      setData(_cache.data);
      setFetchedAt(_cache.fetchedAt);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `${API}/approvals/insights?start_date=${startDate}&end_date=${endDate}`,
        { headers: aH(token) },
      );
      if (res.ok) {
        const d: InsightsData = await res.json();
        const now = new Date();
        _cache = { data: d, fetchedAt: now, key: cacheKey };
        setData(d);
        setFetchedAt(now);
      }
    } catch (ex) { console.error(ex); }
    finally { setLoading(false); }
  }, [token, startDate, endDate, cacheKey]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const applyPreset = (p: Preset) => {
    setPreset(p);
    if (p === 'week')  { const r = getWeekRange();  setStartDate(r.start); setEndDate(r.end); }
    if (p === 'month') { const r = getMonthRange(); setStartDate(r.start); setEndDate(r.end); }
  };

  const workingDays = countWorkingDays(startDate, endDate);
  const targetHours = workingDays * 8;

  // Summary stats
  const totalHours   = data?.user_hours.reduce((s, u) => s + Number(u.total_hours), 0) ?? 0;
  const totalMembers = data?.user_hours.filter((u) => Number(u.total_hours) > 0).length ?? 0;
  const totalApproved = data?.status_breakdown.find((s) => s.status === 'approved')?.entry_count ?? 0;
  const totalPending  = data?.status_breakdown.find((s) => s.status === 'pending')?.entry_count ?? 0;

  return (
    <div className="flex flex-col h-full" style={{ background: t.pageBg }}>

      {/* Header */}
      <div className="flex items-center justify-between px-8 h-[70px] flex-shrink-0"
        style={{ background: t.headerBg, borderBottom: t.border }}>
        <div>
          <h2 className="text-xl font-semibold" style={{ color: t.text }}>Dashboard Insights</h2>
          <p className="text-sm" style={{ color: t.textMuted }}>Admin — visual analytics across the whole team</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Preset buttons */}
          <div className="flex items-center gap-2">
            {(['week','month','custom'] as Preset[]).map((p) => (
              <button key={p} onClick={() => applyPreset(p)}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-all capitalize"
                style={preset === p
                  ? { background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)', color: '#fff' }
                  : { border: t.border, color: t.textMuted, background: 'transparent' }}>
                {p === 'week' ? 'This Week' : p === 'month' ? 'This Month' : 'Custom'}
              </button>
            ))}
          </div>
          {/* Refresh */}
          <div className="flex items-center gap-2">
            {fetchedAt && (
              <span className="text-xs" style={{ color: t.textSubtle }}>{timeAgo(fetchedAt)}</span>
            )}
            <button onClick={() => fetchData(true)} disabled={loading}
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
      </div>

      <div className="flex-1 overflow-y-auto p-8 space-y-6">

        {/* Custom date inputs */}
        {preset === 'custom' && (
          <div className="flex items-center gap-3 p-4 rounded-xl shadow-sm"
            style={{ background: t.cardBg, border: t.border }}>
            <label className="text-sm font-medium" style={{ color: t.textMuted }}>From</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
              className="px-3 py-2 rounded-lg text-sm focus:outline-none"
              style={{ background: t.inputBg, border: `1px solid ${t.inputBorder}`, color: t.text, colorScheme: t.colorScheme }} />
            <label className="text-sm font-medium" style={{ color: t.textMuted }}>To</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
              className="px-3 py-2 rounded-lg text-sm focus:outline-none"
              style={{ background: t.inputBg, border: `1px solid ${t.inputBorder}`, color: t.text, colorScheme: t.colorScheme }} />
          </div>
        )}

        {loading && !data ? (
          <div className="flex items-center justify-center h-64 rounded-xl"
            style={{ background: t.cardBg, border: t.border, color: t.textSubtle }}>
            <div className="text-center space-y-3">
              <svg className="w-8 h-8 animate-spin mx-auto" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
              </svg>
              <p className="text-sm">Loading analytics…</p>
            </div>
          </div>
        ) : data ? (
          <>
            {/* Summary stat cards */}
            <div className="grid grid-cols-4 gap-5">
              {[
                { title: 'Total Hours Logged', value: `${totalHours.toFixed(1)}h`,  icon: '🕐', color: 'rgba(59,130,246,0.15)' },
                { title: 'Active Members',     value: totalMembers,                  icon: '👥', color: 'rgba(139,92,246,0.15)' },
                { title: 'Approved Entries',   value: totalApproved,                 icon: '✅', color: 'rgba(16,185,129,0.15)' },
                { title: 'Pending Entries',    value: totalPending,                  icon: '⏳', color: 'rgba(245,158,11,0.15)' },
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

            {/* Row 1: Hours over time (full width) */}
            <div className="grid grid-cols-2 gap-5">
              <HoursOverTime data={data.daily_hours} />
            </div>

            {/* Row 2: Team utilization (full width) */}
            <div className="grid grid-cols-2 gap-5">
              <TeamUtilization data={data.user_hours} targetHours={targetHours} />
            </div>

            {/* Row 3: Approval donut + Space distribution */}
            <div className="grid grid-cols-2 gap-5">
              <ApprovalDonut data={data.status_breakdown} />
              <SpaceDistribution data={data.space_hours} />
            </div>

            {/* Row 4: Top contributors + Daily pattern */}
            <div className="grid grid-cols-2 gap-5">
              <TopContributors data={data.user_hours} />
              <DowPattern data={data.dow_pattern} />
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
