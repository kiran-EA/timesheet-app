'use client';

const pending = [
  { user: 'Rahul Sharma', email: 'rahul@expressanalytics.net', initials: 'RS', week: 'Apr 7 – 13, 2026', hours: 40, tasks: 5, status: 'Pending' },
  { user: 'Priya Nair', email: 'priya@expressanalytics.net', initials: 'PN', week: 'Apr 7 – 13, 2026', hours: 37.5, tasks: 4, status: 'Pending' },
  { user: 'Amit Patel', email: 'amit@expressanalytics.net', initials: 'AP', week: 'Apr 7 – 13, 2026', hours: 42, tasks: 6, status: 'Pending' },
];

export default function ApprovalsPage() {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className="flex items-center justify-between px-8 h-[70px] flex-shrink-0"
        style={{ background: 'rgba(30,41,59,0.3)', borderBottom: '1px solid #334155' }}
      >
        <div>
          <h2 className="text-xl font-semibold text-white">Approvals</h2>
          <p className="text-sm" style={{ color: '#94a3b8' }}>Review and approve timesheet entries</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-5">
          {[
            { title: 'Pending Review', value: '3', icon: '⏳', color: 'rgba(245,158,11,0.2)', tc: '#fbbf24' },
            { title: 'Approved This Week', value: '8', icon: '✅', color: 'rgba(16,185,129,0.2)', tc: '#34d399' },
            { title: 'Rejected', value: '1', icon: '❌', color: 'rgba(239,68,68,0.2)', tc: '#f87171' },
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

        {/* Pending Timesheets */}
        <div className="rounded-xl p-6" style={{ background: '#1e293b', border: '1px solid #334155' }}>
          <h3 className="text-lg font-semibold text-white mb-5">Pending Timesheets</h3>
          <div className="space-y-3">
            {pending.map((p) => (
              <div
                key={p.email}
                className="flex items-center gap-4 p-4 rounded-xl"
                style={{ background: '#0f172a', border: '1px solid #334155' }}
              >
                <div
                  className="w-11 h-11 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0"
                  style={{ background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)' }}
                >
                  {p.initials}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white">{p.user}</p>
                  <p className="text-xs" style={{ color: '#64748b' }}>{p.email}</p>
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-white">{p.week}</p>
                  <p className="text-xs" style={{ color: '#64748b' }}>{p.hours}h · {p.tasks} tasks</p>
                </div>
                <div className="flex gap-2 ml-4">
                  <button
                    className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90"
                    style={{ background: 'linear-gradient(135deg,#10b981,#14b8a6)' }}
                  >
                    Approve
                  </button>
                  <button
                    className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
                    style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
