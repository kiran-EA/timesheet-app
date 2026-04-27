'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/lib/theme';

const API = process.env.NEXT_PUBLIC_API_URL;

// ── Types ─────────────────────────────────────────────────────────────────────
interface StatData {
  user_hours:       { user_id: string; total_hours: number }[];
  status_breakdown: { status: string; entry_count: number }[];
}
interface Member {
  user_id: string; full_name: string; avatar: string;
  role: string; total_logged: number;
}
interface Epic {
  epic_key: string | null; epic_name: string | null;
  epic_status: string; total_logged_hours: number;
  member_count: number; members: Member[];
}
interface Space {
  space_key: string; space_name: string;
  total_epics: number; member_count: number;
  total_logged_hours: number; epics: Epic[];
}

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
function timeAgo(d: Date) {
  const m = Math.floor((Date.now() - d.getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m === 1) return '1 min ago';
  return `${m} min ago`;
}
function isDone(status: string) {
  return ['done', 'closed', 'resolved', 'complete', 'completed'].includes((status || '').toLowerCase());
}

// ── Colour palettes ───────────────────────────────────────────────────────────
const USER_COLORS = [
  '#3b82f6','#8b5cf6','#10b981','#f59e0b','#ef4444',
  '#06b6d4','#ec4899','#f97316','#84cc16','#6366f1',
  '#14b8a6','#a78bfa','#fb923c','#34d399','#818cf8',
];
const SPACE_COLORS = ['#3b82f6','#8b5cf6','#10b981','#f59e0b','#06b6d4','#ec4899','#f97316'];

// ── Module-level cache ────────────────────────────────────────────────────────
let _statsCache: { data: StatData; key: string } | null = null;
let _epicCache:  { data: { spaces: Space[] }; key: string } | null = null;

// ── UserBar ───────────────────────────────────────────────────────────────────
function UserBar({ member, pct, color }: { member: Member; pct: number; color: string }) {
  const [tip, setTip] = useState(false);
  if (pct <= 0) return null;
  const first = member.full_name.split(' ')[0];

  return (
    <div
      className="relative h-full flex items-center justify-center cursor-default flex-shrink-0"
      style={{ width: `${pct}%`, background: color, minWidth: 4 }}
      onMouseEnter={() => setTip(true)}
      onMouseLeave={() => setTip(false)}
    >
      {/* Hover overlay */}
      <div className="absolute inset-0 pointer-events-none transition-opacity duration-150"
        style={{ background: 'rgba(255,255,255,0.18)', opacity: tip ? 1 : 0 }} />
      {/* Name label — only when bar is wide enough */}
      {pct > 9 && (
        <span className="relative text-white text-xs font-semibold truncate px-2 pointer-events-none select-none"
          style={{ textShadow: '0 1px 3px rgba(0,0,0,0.5)', letterSpacing: '0.01em' }}>
          {first}
        </span>
      )}
      {/* Subtle right separator */}
      <div className="absolute right-0 top-1 bottom-1 w-px pointer-events-none"
        style={{ background: 'rgba(255,255,255,0.22)' }} />
      {/* Tooltip */}
      {tip && (
        <div className="absolute z-30 pointer-events-none"
          style={{ bottom: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)' }}>
          <div className="px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shadow-xl"
            style={{ background: '#0f172a', border: '1px solid #334155', color: '#e2e8f0' }}>
            <span style={{ color }}>{member.full_name}</span>
            <span style={{ color: '#475569' }}> · </span>
            <span className="font-bold" style={{ color: '#f8fafc' }}>{member.total_logged.toFixed(1)}h</span>
          </div>
          <div style={{
            width: 0, height: 0, margin: '0 auto',
            borderLeft: '5px solid transparent',
            borderRight: '5px solid transparent',
            borderTop: '5px solid #334155',
          }} />
        </div>
      )}
    </div>
  );
}

// ── EpicRow ───────────────────────────────────────────────────────────────────
function EpicRow({ epic, userColorMap, borderTop }: {
  epic: Epic; userColorMap: Record<string, string>; borderTop: boolean;
}) {
  const sorted = [...epic.members].filter(m => m.total_logged > 0).sort((a, b) => b.total_logged - a.total_logged);
  const total = epic.total_logged_hours || 0;
  const name  = epic.epic_name || epic.epic_key || '(No Epic)';

  return (
    <div className="flex items-center gap-5 py-3"
      style={borderTop ? { borderTop: `1px solid ${t.borderColor}` } : {}}>
      {/* Epic info */}
      <div className="w-52 flex-shrink-0">
        <div className="text-sm font-semibold leading-snug" style={{ color: t.textBody }} title={name}>
          {name.length > 32 ? name.slice(0, 30) + '…' : name}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          {epic.epic_key && (
            <span className="text-xs font-mono" style={{ color: t.textSubtle }}>{epic.epic_key}</span>
          )}
          {total > 0 && (
            <span className="text-xs font-bold" style={{ color: t.textMuted }}>{total.toFixed(1)}h</span>
          )}
        </div>
      </div>

      {/* Proportional user bars */}
      <div className="flex-1 h-10 rounded-xl overflow-hidden flex"
        style={{
          background: total > 0 ? 'transparent' : t.tableHead,
          border: `1px solid ${t.borderColor}`,
        }}>
        {total > 0 ? (
          sorted.map(m => (
            <UserBar
              key={m.user_id}
              member={m}
              pct={(m.total_logged / total) * 100}
              color={userColorMap[m.user_id] ?? '#64748b'}
            />
          ))
        ) : (
          <div className="flex-1 flex items-center justify-center text-xs font-medium" style={{ color: t.textSubtle }}>
            No hours logged in this period
          </div>
        )}
      </div>
    </div>
  );
}

// ── SpaceSection ──────────────────────────────────────────────────────────────
function SpaceSection({ space, userColorMap, accent }: {
  space: Space; userColorMap: Record<string, string>; accent: string;
}) {
  const totalH = space.epics.reduce((s, e) => s + e.total_logged_hours, 0);

  return (
    <div className="rounded-2xl overflow-hidden shadow-sm"
      style={{ background: t.cardBg, border: `1px solid ${accent}40` }}>
      {/* Space header */}
      <div className="px-6 py-4 flex items-center justify-between"
        style={{
          background: `linear-gradient(90deg, ${accent}18, transparent)`,
          borderBottom: `1px solid ${accent}25`,
        }}>
        <div className="flex items-center gap-3">
          <div className="w-1.5 h-9 rounded-full flex-shrink-0" style={{ background: `linear-gradient(to bottom, ${accent}, ${accent}66)` }} />
          <div>
            <div className="text-base font-bold" style={{ color: accent }}>{space.space_key}</div>
            {space.space_name && space.space_name !== space.space_key && (
              <div className="text-xs mt-0.5" style={{ color: t.textSubtle }}>{space.space_name}</div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-8">
          {[
            { val: space.epics.length,       label: 'epics' },
            { val: space.member_count,        label: 'members' },
            { val: totalH.toFixed(1) + 'h',  label: 'total logged' },
          ].map(s => (
            <div key={s.label} className="text-right">
              <div className="text-sm font-bold" style={{ color: t.text }}>{s.val}</div>
              <div className="text-xs" style={{ color: t.textSubtle }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Column header row */}
      <div className="flex items-center gap-5 px-6 py-2"
        style={{ borderBottom: `1px solid ${t.borderColor}`, background: t.tableHead }}>
        <div className="w-52 flex-shrink-0 text-xs font-semibold uppercase tracking-wider" style={{ color: t.textSubtle }}>
          Epic / Project
        </div>
        <div className="flex-1 text-xs font-semibold uppercase tracking-wider" style={{ color: t.textSubtle }}>
          Team Contribution — hover each bar for hours
        </div>
      </div>

      {/* Epic rows */}
      <div className="px-6">
        {space.epics.length === 0 ? (
          <div className="py-10 text-center text-sm" style={{ color: t.textSubtle }}>
            No epics in this space
          </div>
        ) : (
          space.epics.map((epic, idx) => (
            <EpicRow
              key={epic.epic_key ?? `no-epic-${idx}`}
              epic={epic}
              userColorMap={userColorMap}
              borderTop={idx > 0}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
type Preset = 'week' | 'month' | 'custom';
type Tab = 'active' | 'complete';

export default function InsightsPage() {
  const token  = useAuthStore((s) => s.token) ?? '';
  const user   = useAuthStore((s) => s.user);
  const router = useRouter();

  const [preset,    setPreset]    = useState<Preset>('month');
  const [startDate, setStartDate] = useState(getMonthRange().start);
  const [endDate,   setEndDate]   = useState(getMonthRange().end);
  const [tab,       setTab]       = useState<Tab>('active');

  const [stats,     setStats]     = useState<StatData | null>(null);
  const [epicData,  setEpicData]  = useState<{ spaces: Space[] } | null>(null);
  const [loading,   setLoading]   = useState(false);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);
  const [error,     setError]     = useState<string | null>(null);
  const [mounted,   setMounted]   = useState(false);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    if (user && user.role !== 'admin') router.push('/timesheet');
  }, [user, router]);

  const cacheKey = `${startDate}|${endDate}`;

  const fetchAll = useCallback(async (force = false) => {
    if (!force && _statsCache?.key === cacheKey && _epicCache?.key === cacheKey) {
      setStats(_statsCache.data);
      setEpicData(_epicCache.data);
      return;
    }
    setLoading(true);
    setError(null);

    // Fetch stats first (fast) — renders stat cards immediately
    fetch(`${API}/approvals/insights?start_date=${startDate}&end_date=${endDate}`, { headers: aH(token) })
      .then(r => r.ok ? r.json() : null)
      .then((d: StatData | null) => { if (d) { _statsCache = { data: d, key: cacheKey }; setStats(d); } })
      .catch(() => {});

    // Fetch epic dashboard separately (slow Jira call) — renders when ready
    fetch(`${API}/jira/epic-dashboard?start_date=${startDate}&end_date=${endDate}`, { headers: aH(token) })
      .then(r => r.ok ? r.json() : null)
      .then((d: { spaces: Space[] } | null) => {
        if (d) { _epicCache = { data: d, key: cacheKey }; setEpicData(d); }
        setFetchedAt(new Date());
        setLoading(false);
      })
      .catch(ex => {
        setError(ex instanceof Error ? ex.message : 'Network error');
        setLoading(false);
      });
  }, [token, startDate, endDate, cacheKey]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const applyPreset = (p: Preset) => {
    setPreset(p);
    if (p === 'week')  { const r = getWeekRange();  setStartDate(r.start); setEndDate(r.end); }
    if (p === 'month') { const r = getMonthRange(); setStartDate(r.start); setEndDate(r.end); }
  };

  // Stat values
  const totalHours    = stats?.user_hours.reduce((s, u) => s + Number(u.total_hours), 0) ?? 0;
  const totalMembers  = stats?.user_hours.filter(u => Number(u.total_hours) > 0).length ?? 0;
  const totalApproved = stats?.status_breakdown.find(s => s.status === 'approved')?.entry_count ?? 0;
  const totalPending  = stats?.status_breakdown.find(s => s.status === 'pending')?.entry_count ?? 0;

  // Consistent user → color map (sorted by name for stability)
  const allMembers = epicData?.spaces.flatMap(s => s.epics.flatMap(e => e.members)) ?? [];
  const uniqueUsers = [...new Map(allMembers.map(m => [m.user_id, m])).values()]
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
  const userColorMap: Record<string, string> = {};
  uniqueUsers.forEach((u, i) => { userColorMap[u.user_id] = USER_COLORS[i % USER_COLORS.length]; });

  // Original space index for stable accent colors
  const allSpaceKeys = epicData?.spaces.map(s => s.space_key) ?? [];

  // Filter spaces + epics by active/complete tab
  const filteredSpaces = (epicData?.spaces ?? [])
    .map(space => ({
      ...space,
      epics: space.epics.filter(e =>
        tab === 'active'
          ? !isDone(e.epic_status)
          : isDone(e.epic_status) && e.total_logged_hours > 0
      ),
    }))
    .filter(s => s.epics.length > 0);

  const isDataReady = !loading || (!!stats || !!epicData);

  return (
    <div className="flex flex-col h-full" style={{ background: t.pageBg }}>

      {/* Header */}
      <div className="flex items-center justify-between px-8 h-[70px] flex-shrink-0"
        style={{ background: t.headerBg, borderBottom: t.border }}>
        <div>
          <h2 className="text-xl font-semibold" style={{ color: t.text }}>Project Insights</h2>
          <p className="text-sm" style={{ color: t.textMuted }}>Admin — epics &amp; team contributions by Jira space</p>
        </div>
        <div className="flex items-center gap-3">
          {(['week','month','custom'] as Preset[]).map(p => (
            <button key={p} onClick={() => applyPreset(p)}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-all capitalize"
              style={preset === p
                ? { background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)', color: '#fff' }
                : { border: t.border, color: t.textMuted, background: 'transparent' }}>
              {p === 'week' ? 'This Week' : p === 'month' ? 'This Month' : 'Custom'}
            </button>
          ))}
          <div className="h-6 w-px" style={{ background: t.borderColor }} />
          {fetchedAt && (
            <span className="text-xs" style={{ color: t.textSubtle }}>{timeAgo(fetchedAt)}</span>
          )}
          <button onClick={() => fetchAll(true)} disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold hover:opacity-80 disabled:opacity-40 transition-opacity"
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

      <div className="flex-1 overflow-y-auto p-8 space-y-6">

        {/* Custom date pickers */}
        {preset === 'custom' && (
          <div className="flex items-center gap-3 p-4 rounded-xl" style={{ background: t.cardBg, border: t.border }}>
            <label className="text-sm font-medium" style={{ color: t.textMuted }}>From</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              className="px-3 py-2 rounded-lg text-sm focus:outline-none"
              style={{ background: t.inputBg, border: `1px solid ${t.inputBorder}`, color: t.text, colorScheme: t.colorScheme }} />
            <label className="text-sm font-medium" style={{ color: t.textMuted }}>To</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
              className="px-3 py-2 rounded-lg text-sm focus:outline-none"
              style={{ background: t.inputBg, border: `1px solid ${t.inputBorder}`, color: t.text, colorScheme: t.colorScheme }} />
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div className="px-4 py-3 rounded-lg text-sm flex items-center gap-2"
            style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#dc2626' }}>
            <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            {error}
          </div>
        )}

        {!mounted || (!isDataReady && !error) ? (
          <div className="flex items-center justify-center h-64 rounded-xl" style={{ background: t.cardBg, border: t.border }}>
            <div className="text-center space-y-3">
              <svg className="w-8 h-8 animate-spin mx-auto" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: '#3b82f6' }}>
                <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
              </svg>
              <p className="text-sm" style={{ color: t.textMuted }}>Loading project insights…</p>
            </div>
          </div>
        ) : (
          <>
            {/* Stat cards */}
            <div className="grid grid-cols-4 gap-5">
              {[
                { title: 'Total Hours Logged', value: `${totalHours.toFixed(1)}h`, icon: '🕐', accent: '#3b82f6' },
                { title: 'Active Members',     value: totalMembers,                 icon: '👥', accent: '#8b5cf6' },
                { title: 'Approved Entries',   value: totalApproved,                icon: '✅', accent: '#10b981' },
                { title: 'Pending Entries',    value: totalPending,                 icon: '⏳', accent: '#f59e0b' },
              ].map(s => (
                <div key={s.title} className="rounded-xl p-5 shadow-sm" style={{ background: t.statGrad, border: t.border }}>
                  <div className="flex items-start justify-between mb-3">
                    <span className="text-sm font-medium" style={{ color: t.textMuted }}>{s.title}</span>
                    <span className="w-9 h-9 rounded-lg flex items-center justify-center text-lg"
                      style={{ background: `${s.accent}20` }}>{s.icon}</span>
                  </div>
                  <div className="text-3xl font-bold" style={{ color: t.text }}>{s.value}</div>
                </div>
              ))}
            </div>

            {/* Active / Complete tabs */}
            <div className="flex items-center gap-1 p-1 rounded-xl w-fit"
              style={{ background: t.tableHead, border: t.border }}>
              {([
                { id: 'active',   label: 'Active Epics',    dot: '#10b981' },
                { id: 'complete', label: 'Completed Epics',  dot: '#64748b' },
              ] as { id: Tab; label: string; dot: string }[]).map(tb => (
                <button key={tb.id} onClick={() => setTab(tb.id)}
                  className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all"
                  style={tab === tb.id
                    ? { background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)', color: '#fff', boxShadow: '0 2px 8px rgba(59,130,246,0.3)' }
                    : { color: t.textMuted, background: 'transparent' }}>
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: tab === tb.id ? '#fff' : tb.dot }} />
                  {tb.label}
                </button>
              ))}
            </div>

            {/* Space sections */}
            {loading && (
              <div className="flex items-center gap-2 text-sm" style={{ color: t.textSubtle }}>
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                </svg>
                Refreshing…
              </div>
            )}

            {filteredSpaces.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 rounded-xl gap-3"
                style={{ background: t.cardBg, border: t.border }}>
                <div className="text-3xl">{tab === 'active' ? '📋' : '🏁'}</div>
                <p className="text-sm font-medium" style={{ color: t.textMuted }}>
                  No {tab === 'active' ? 'active' : 'completed'} epics with data in this period
                </p>
              </div>
            ) : (
              <div className="space-y-5">
                {filteredSpaces.map(space => (
                  <SpaceSection
                    key={space.space_key}
                    space={space}
                    userColorMap={userColorMap}
                    accent={SPACE_COLORS[allSpaceKeys.indexOf(space.space_key) % SPACE_COLORS.length]}
                  />
                ))}
              </div>
            )}

            {/* Team member colour legend */}
            {uniqueUsers.length > 0 && (
              <div className="rounded-xl p-4" style={{ background: t.cardBg, border: t.border }}>
                <div className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: t.textSubtle }}>
                  Team Members
                </div>
                <div className="flex flex-wrap gap-x-5 gap-y-2">
                  {uniqueUsers.map(u => (
                    <div key={u.user_id} className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ background: userColorMap[u.user_id] }} />
                      <span className="text-xs font-medium" style={{ color: t.textMuted }}>{u.full_name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
