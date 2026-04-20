'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/lib/theme';

const API = process.env.NEXT_PUBLIC_API_URL;

function authHeaders(token: string) {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

interface User {
  user_id: string;
  email: string;
  full_name: string;
  role: string;
  avatar: string;
  manager_id: string | null;
  manager_name: string | null;
  resource_count: number;
}

function RoleBadge({ role }: { role: string }) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    admin:    { bg: 'rgba(59,130,246,0.12)',  color: '#3b82f6', label: 'Admin'    },
    teamlead: { bg: 'rgba(139,92,246,0.12)', color: '#8b5cf6', label: 'Teamlead' },
    resource: { bg: 'rgba(16,185,129,0.12)', color: '#059669', label: 'Resource' },
  };
  const s = map[role] ?? { bg: 'rgba(100,116,139,0.12)', color: '#64748b', label: role };
  return (
    <span className="px-2.5 py-1 rounded-full text-xs font-semibold"
      style={{ background: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}

// ── Configure modal ───────────────────────────────────────────────────────────
function ConfigureModal({
  user, allUsers, token, onClose, onSaved,
}: {
  user: User; allUsers: User[]; token: string;
  onClose: () => void; onSaved: () => void;
}) {
  const [role,      setRole]      = useState(user.role);
  const [managerId, setManagerId] = useState(user.manager_id ?? '');
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState('');

  // Resources currently under this user
  const currentlyAssigned = allUsers.filter((u) => u.manager_id === user.user_id);

  // Unassigned users (no manager, not admin, not self)
  const unassigned = allUsers.filter(
    (u) => !u.manager_id && u.role !== 'admin' && u.user_id !== user.user_id,
  );

  const [toAdd, setToAdd] = useState<string[]>([]);   // from unassigned list
  const [toRemove, setToRemove] = useState<string[]>([]); // from assigned list

  const toggleAdd    = (uid: string) => setToAdd((p) => p.includes(uid) ? p.filter((x) => x !== uid) : [...p, uid]);
  const toggleRemove = (uid: string) => setToRemove((p) => p.includes(uid) ? p.filter((x) => x !== uid) : [...p, uid]);

  // All managers except self
  const potentialManagers = allUsers.filter(
    (u) => (u.role === 'teamlead' || u.role === 'admin') && u.user_id !== user.user_id,
  );

  const showResources = role === 'teamlead' || role === 'admin';

  const handleSave = async () => {
    setSaving(true); setError('');
    try {
      // Final resource list = current - toRemove + toAdd
      const currentIds = currentlyAssigned.map((u) => u.user_id);
      const finalIds = [...currentIds.filter((id) => !toRemove.includes(id)), ...toAdd];

      const res = await fetch(`${API}/users/${user.user_id}/configure`, {
        method: 'PUT', headers: authHeaders(token),
        body: JSON.stringify({
          role,
          manager_id: managerId || null,
          resource_ids: showResources ? finalIds : [],
        }),
      });
      if (!res.ok) { setError(`Failed (${res.status}): ${await res.text()}`); return; }
      onSaved();
    } catch (e: unknown) {
      setError(`Network error: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
      <div className="w-full max-w-lg rounded-2xl shadow-xl flex flex-col max-h-[90vh]"
        style={{ background: t.cardBg, border: t.border }}>

        {/* header */}
        <div className="flex items-start justify-between p-6" style={{ borderBottom: t.border }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold"
              style={{ background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)', color: '#fff' }}>
              {user.avatar || user.full_name.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <h3 className="font-semibold" style={{ color: t.text }}>{user.full_name}</h3>
              <p className="text-xs mt-0.5" style={{ color: t.textSubtle }}>{user.email}</p>
            </div>
          </div>
          <button onClick={onClose} style={{ color: t.textSubtle }}>
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">

          {/* Role selector */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: t.textMuted }}>Role</label>
            <div className="flex gap-2">
              {(['resource', 'teamlead', 'admin'] as const).map((r) => (
                <button key={r} onClick={() => setRole(r)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold capitalize transition-all"
                  style={role === r
                    ? { background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)', color: '#fff' }
                    : { border: t.border, color: t.textMuted, background: 'transparent' }}>
                  {r === 'teamlead' ? 'Teamlead' : r.charAt(0).toUpperCase() + r.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Manager dropdown (not for admin) */}
          {role !== 'admin' && (
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: t.textMuted }}>Reports to</label>
              <select value={managerId} onChange={(e) => setManagerId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg text-sm focus:outline-none"
                style={{ background: t.inputBg, border: `1px solid ${t.inputBorder}`, color: t.text }}>
                <option value="">— No manager —</option>
                {potentialManagers.map((m) => (
                  <option key={m.user_id} value={m.user_id}>{m.full_name} ({m.role})</option>
                ))}
              </select>
            </div>
          )}

          {/* Resource assignment — for teamlead and admin */}
          {showResources && (
            <div className="space-y-3">

              {/* Currently assigned — with Remove toggle */}
              {currentlyAssigned.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide mb-2"
                    style={{ color: t.textSubtle }}>Currently assigned</p>
                  <div className="rounded-lg overflow-hidden" style={{ border: t.border }}>
                    {currentlyAssigned.map((u) => {
                      const removing = toRemove.includes(u.user_id);
                      return (
                        <div key={u.user_id}
                          className="flex items-center justify-between px-4 py-2.5"
                          style={{ borderBottom: t.border, background: removing ? 'rgba(239,68,68,0.05)' : undefined }}>
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold"
                              style={{ background: 'linear-gradient(135deg,#10b981,#14b8a6)', color: '#fff' }}>
                              {u.avatar || u.full_name.slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <p className="text-sm font-medium" style={{ color: removing ? '#dc2626' : t.text,
                                textDecoration: removing ? 'line-through' : undefined }}>
                                {u.full_name}
                              </p>
                              <p className="text-xs" style={{ color: t.textSubtle }}>{u.role}</p>
                            </div>
                          </div>
                          <button onClick={() => toggleRemove(u.user_id)}
                            className="text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors"
                            style={removing
                              ? { background: 'rgba(16,185,129,0.12)', color: '#059669' }
                              : { background: 'rgba(239,68,68,0.1)', color: '#dc2626' }}>
                            {removing ? 'Undo' : 'Remove'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Unassigned — available to add */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide mb-2"
                  style={{ color: t.textSubtle }}>
                  Add from unassigned {unassigned.length > 0 ? `(${unassigned.length} available)` : ''}
                </p>
                {unassigned.length === 0 ? (
                  <p className="text-sm text-center py-4 rounded-lg"
                    style={{ color: t.textSubtle, border: t.border }}>
                    No unassigned users available.
                  </p>
                ) : (
                  <div className="rounded-lg overflow-hidden" style={{ border: t.border }}>
                    {unassigned.map((u) => {
                      const adding = toAdd.includes(u.user_id);
                      return (
                        <label key={u.user_id}
                          className="flex items-center gap-3 px-4 py-2.5 cursor-pointer"
                          style={{ borderBottom: t.border,
                            background: adding ? 'rgba(59,130,246,0.05)' : undefined }}>
                          <input type="checkbox" checked={adding}
                            onChange={() => toggleAdd(u.user_id)}
                            className="w-4 h-4 rounded accent-blue-500" />
                          <div className="w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold"
                            style={{ background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)', color: '#fff' }}>
                            {u.avatar || u.full_name.slice(0, 2).toUpperCase()}
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-medium" style={{ color: t.text }}>{u.full_name}</p>
                            <p className="text-xs" style={{ color: t.textSubtle }}>{u.email}</p>
                          </div>
                          <RoleBadge role={u.role} />
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {error && (
            <p className="text-xs px-3 py-2 rounded"
              style={{ background: 'rgba(239,68,68,0.08)', color: '#dc2626' }}>{error}</p>
          )}
        </div>

        <div className="flex gap-3 p-6" style={{ borderTop: t.border }}>
          <button onClick={onClose} disabled={saving}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-80 disabled:opacity-40"
            style={{ border: t.border, color: t.textMuted, background: 'transparent' }}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)' }}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Member chips row (inline under teamlead/admin) ────────────────────────────
function MemberChips({
  manager, allUsers, token, onUnassigned,
}: {
  manager: User; allUsers: User[]; token: string; onUnassigned: (uid: string) => void;
}) {
  const members = allUsers.filter((u) => u.manager_id === manager.user_id);
  const [expanded, setExpanded] = useState(false);

  if (members.length === 0)
    return <span className="text-xs" style={{ color: t.textSubtle }}>No members</span>;

  const visible = expanded ? members : members.slice(0, 3);
  const hidden  = members.length - 3;

  const handleUnassign = async (uid: string) => {
    await fetch(`${API}/users/${uid}/unassign`, { method: 'PUT', headers: authHeaders(token) });
    onUnassigned(uid);
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {visible.map((m) => (
        <span key={m.user_id}
          className="flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full text-xs font-medium"
          style={{ background: 'rgba(139,92,246,0.1)', color: '#8b5cf6', border: '1px solid rgba(139,92,246,0.2)' }}>
          {m.full_name.split(' ')[0]}
          <button
            onClick={() => handleUnassign(m.user_id)}
            className="ml-0.5 w-4 h-4 flex items-center justify-center rounded-full hover:bg-red-500 hover:text-white transition-colors"
            title={`Unassign ${m.full_name}`}>
            ×
          </button>
        </span>
      ))}
      {!expanded && hidden > 0 && (
        <button onClick={() => setExpanded(true)}
          className="text-xs px-2 py-0.5 rounded-full"
          style={{ background: 'rgba(100,116,139,0.12)', color: t.textMuted }}>
          +{hidden} more
        </button>
      )}
      {expanded && hidden > 0 && (
        <button onClick={() => setExpanded(false)}
          className="text-xs px-2 py-0.5 rounded-full"
          style={{ background: 'rgba(100,116,139,0.12)', color: t.textMuted }}>
          Show less
        </button>
      )}
    </div>
  );
}

// ── User table section (by role) ──────────────────────────────────────────────
function UserSection({
  title, users, allUsers, token, onEdit, onUnassigned, showMembers,
}: {
  title: string; users: User[]; allUsers: User[]; token: string;
  onEdit: (u: User) => void; onUnassigned: (uid: string) => void; showMembers: boolean;
}) {
  if (users.length === 0) return null;
  return (
    <div className="rounded-xl overflow-hidden shadow-sm" style={{ background: t.cardBg, border: t.border }}>
      <div className="px-6 py-3 flex items-center gap-2" style={{ borderBottom: t.border, background: t.tableHead }}>
        <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: t.textHeader }}>{title}</h3>
        <span className="px-2 py-0.5 rounded-full text-xs font-bold"
          style={{ background: 'rgba(100,116,139,0.15)', color: t.textMuted }}>
          {users.length}
        </span>
      </div>
      <table className="w-full text-sm">
        <thead style={{ background: t.tableHead }}>
          <tr>
            {['User', 'Email', 'Role', showMembers ? 'Members' : 'Manager', 'Configure'].map((h) => (
              <th key={h} className="px-5 py-3 text-left font-semibold"
                style={{ color: t.textHeader, borderBottom: t.border, fontSize: 11,
                  textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.user_id} style={{ borderBottom: t.border }}>
              <td className="px-5 py-3.5">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0"
                    style={{ background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)', color: '#fff' }}>
                    {user.avatar || user.full_name.slice(0, 2).toUpperCase()}
                  </div>
                  <span className="font-medium text-sm" style={{ color: t.text }}>{user.full_name}</span>
                </div>
              </td>
              <td className="px-5 py-3.5">
                <span className="text-xs" style={{ color: t.textSubtle }}>{user.email}</span>
              </td>
              <td className="px-5 py-3.5"><RoleBadge role={user.role} /></td>
              <td className="px-5 py-3.5">
                {showMembers ? (
                  <MemberChips manager={user} allUsers={allUsers} token={token} onUnassigned={onUnassigned} />
                ) : user.manager_name ? (
                  <span className="text-sm" style={{ color: t.textBody }}>{user.manager_name}</span>
                ) : (
                  <span style={{ color: t.textSubtle }}>—</span>
                )}
              </td>
              <td className="px-5 py-3.5">
                <button onClick={() => onEdit(user)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-opacity hover:opacity-80"
                  style={{ border: t.border, color: t.textMuted, background: 'transparent' }}>
                  Configure
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function UserManagementPage() {
  const token = useAuthStore((s) => s.token) ?? '';
  const me    = useAuthStore((s) => s.user);

  const [users,   setUsers]   = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState('');
  const [editing, setEditing] = useState<User | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/users/all`, { headers: authHeaders(token) });
      if (res.ok) setUsers((await res.json()).users ?? []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  // Optimistic unassign: set manager_id = null for that resource in local state
  const handleUnassigned = (uid: string) => {
    setUsers((prev) => prev.map((u) =>
      u.user_id === uid ? { ...u, manager_id: null, manager_name: null } : u,
    ));
  };

  if (me?.role !== 'admin') {
    return (
      <div className="flex items-center justify-center h-full" style={{ background: t.pageBg }}>
        <p style={{ color: t.textSubtle }}>Access restricted to Admins.</p>
      </div>
    );
  }

  const searchLower  = search.toLowerCase();
  const filtered = search
    ? users.filter((u) =>
        u.full_name.toLowerCase().includes(searchLower) ||
        u.email.toLowerCase().includes(searchLower),
      )
    : users;

  const admins    = filtered.filter((u) => u.role === 'admin');
  const teamleads = filtered.filter((u) => u.role === 'teamlead');
  const resources = filtered.filter((u) => u.role === 'resource');

  return (
    <div className="flex flex-col h-full" style={{ background: t.pageBg }}>

      {/* Header */}
      <div className="flex items-center justify-between px-8 h-[70px] flex-shrink-0"
        style={{ background: t.headerBg, borderBottom: t.border }}>
        <div>
          <h2 className="text-xl font-semibold" style={{ color: t.text }}>User Management</h2>
          <p className="text-sm" style={{ color: t.textMuted }}>Configure roles, managers and team assignments</p>
        </div>
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: t.textSubtle }}
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input type="text" placeholder="Search name or email…"
            value={search} onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-4 py-2 rounded-lg text-sm focus:outline-none w-64"
            style={{ background: t.inputBg, border: `1px solid ${t.inputBorder}`, color: t.text }} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8 space-y-6">

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Admins',    value: users.filter((u) => u.role === 'admin').length,    color: '#3b82f6', bg: 'rgba(59,130,246,0.12)'  },
            { label: 'Teamleads', value: users.filter((u) => u.role === 'teamlead').length, color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)' },
            { label: 'Resources', value: users.filter((u) => u.role === 'resource').length, color: '#059669', bg: 'rgba(16,185,129,0.12)' },
          ].map((s) => (
            <div key={s.label} className="rounded-xl p-5" style={{ background: t.cardBg, border: t.border }}>
              <p className="text-sm font-medium mb-1" style={{ color: t.textMuted }}>{s.label}</p>
              <p className="text-3xl font-bold" style={{ color: s.color }}>{s.value}</p>
            </div>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-16" style={{ color: t.textSubtle }}>Loading users…</div>
        ) : (
          <>
            <UserSection
              title="Admins" users={admins} allUsers={users} token={token}
              onEdit={setEditing} onUnassigned={handleUnassigned} showMembers
            />
            <UserSection
              title="Teamleads" users={teamleads} allUsers={users} token={token}
              onEdit={setEditing} onUnassigned={handleUnassigned} showMembers
            />
            <UserSection
              title="Resources" users={resources} allUsers={users} token={token}
              onEdit={setEditing} onUnassigned={handleUnassigned} showMembers={false}
            />
          </>
        )}
      </div>

      {editing && (
        <ConfigureModal
          user={editing} allUsers={users} token={token}
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await fetchUsers(); }}
        />
      )}
    </div>
  );
}
