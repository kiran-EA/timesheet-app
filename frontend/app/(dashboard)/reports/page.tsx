'use client';

const teamStats = [
  { name: 'Kiran Mangalvedhe', initials: 'KM', hours: 40, tasks: 7, sp: 18, status: 'On Track' },
  { name: 'Rahul Sharma',      initials: 'RS', hours: 38, tasks: 5, sp: 14, status: 'On Track' },
  { name: 'Priya Nair',        initials: 'PN', hours: 37.5, tasks: 4, sp: 11, status: 'On Track' },
  { name: 'Amit Patel',        initials: 'AP', hours: 42, tasks: 6, sp: 16, status: 'Overtime' },
];

export default function ReportsPage() {
  const totalHours = teamStats.reduce((s, t) => s + t.hours, 0);
  const totalSP = teamStats.reduce((s, t) => s + t.sp, 0);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className="flex items-center justify-between px-8 h-[70px] flex-shrink-0"
        style={{ background: 'rgba(30,41,59,0.3)', borderBottom: '1px solid #334155' }}
      >
        <div>
          <h2 className="text-xl font-semibold text-white">Reports</h2>
          <p className="text-sm" style={{ color: '#94a3b8' }}>Team analytics and insights</p>
        </div>
        <button
          className="flex items-center gap-2 px-5 py-2 rounded-lg text-white font-semibold text-sm transition-opacity hover:opacity-90"
          style={{ background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)' }}
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Export CSV
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-8 space-y-6">
        {/* Summary stats */}
        <div className="grid grid-cols-4 gap-5">
          {[
            { title: 'Total Team Hours', value: `${totalHours}h`, icon: '🕐', color: 'rgba(59,130,246,0.2)', tc: '#60a5fa' },
            { title: 'Team Members', value: `${teamStats.length}`, icon: '👥', color: 'rgba(139,92,246,0.2)', tc: '#a78bfa' },
            { title: 'Story Points', value: `${totalSP}`, icon: '⭐', color: 'rgba(16,185,129,0.2)', tc: '#34d399' },
            { title: 'Avg Hours/Person', value: `${(totalHours / teamStats.length).toFixed(1)}h`, icon: '📊', color: 'rgba(245,158,11,0.2)', tc: '#fbbf24' },
          ].map((s) => (
            <div key={s.title} className="rounded-xl p-5" style={{ background: 'linear-gradient(135deg,#1e293b 0%,#0f172a 100%)', border: '1px solid #334155' }}>
              <div className="flex items-start justify-between mb-3">
                <span className="text-sm font-medium" style={{ color: '#94a3b8' }}>{s.title}</span>
                <span className="w-9 h-9 rounded-lg flex items-center justify-center text-lg" style={{ background: s.color, color: s.tc }}>{s.icon}</span>
              </div>
              <div className="text-3xl font-bold text-white">{s.value}</div>
            </div>
          ))}
        </div>

        {/* Team breakdown table */}
        <div className="rounded-xl p-6" style={{ background: '#1e293b', border: '1px solid #334155' }}>
          <h3 className="text-lg font-semibold text-white mb-5">Team Breakdown — Sprint 12</h3>
          <div className="rounded-lg overflow-hidden" style={{ border: '1px solid #334155' }}>
            <table className="w-full text-sm border-collapse">
              <thead style={{ background: '#0f172a' }}>
                <tr>
                  {['Team Member', 'Hours Logged', 'Tasks', 'Story Points', 'Status'].map((h) => (
                    <th key={h} className="px-4 py-3.5 text-left font-semibold" style={{ color: '#f1f5f9', borderBottom: '1px solid #334155', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {teamStats.map((t) => (
                  <tr key={t.name} style={{ borderBottom: '1px solid #334155' }}>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold" style={{ background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)' }}>
                          {t.initials}
                        </div>
                        <span className="text-sm font-medium text-white">{t.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4 font-mono font-semibold text-white">{t.hours}h</td>
                    <td className="px-4 py-4 text-center font-semibold text-white">{t.tasks}</td>
                    <td className="px-4 py-4 text-center font-semibold text-white">{t.sp}</td>
                    <td className="px-4 py-4">
                      <span
                        className="px-3 py-1 rounded-full text-xs font-semibold"
                        style={
                          t.status === 'On Track'
                            ? { background: 'rgba(16,185,129,0.2)', color: '#34d399' }
                            : { background: 'rgba(245,158,11,0.2)', color: '#fbbf24' }
                        }
                      >
                        {t.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
