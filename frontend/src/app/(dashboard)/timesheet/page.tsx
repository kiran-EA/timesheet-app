'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Header } from '@/components/layout/Header';
import { CheckCircle, AlertCircle, Loader2, Clock, ListTodo, Star, Hourglass } from 'lucide-react';
import { api } from '@/lib/api';

interface JiraIssue {
  key: string;
  id: string;
  summary: string;
  description: string;
  status: string;
  priority: string;
  assignee: string;
  created: string;
  updated: string;
  duedate: string;
  timeestimate: number;
  timespent: number;
}

interface JiraResponse {
  success: boolean;
  count: number;
  issues: JiraIssue[];
}

function secondsToHours(seconds: number): number {
  return Math.round((seconds / 3600) * 10) / 10;
}

function priorityColor(priority: string) {
  switch (priority?.toLowerCase()) {
    case 'highest':
    case 'critical': return 'text-red-400 bg-red-500/10';
    case 'high':     return 'text-orange-400 bg-orange-500/10';
    case 'medium':   return 'text-yellow-400 bg-yellow-500/10';
    case 'low':      return 'text-blue-400 bg-blue-500/10';
    default:         return 'text-slate-400 bg-slate-500/10';
  }
}

function statusColor(status: string) {
  switch (status?.toLowerCase()) {
    case 'in progress': return 'text-blue-400 bg-blue-500/10 border-blue-500/30';
    case 'done':
    case 'closed':      return 'text-green-400 bg-green-500/10 border-green-500/30';
    case 'to do':
    case 'open':        return 'text-slate-400 bg-slate-500/10 border-slate-500/30';
    case 'in review':   return 'text-purple-400 bg-purple-500/10 border-purple-500/30';
    default:            return 'text-slate-400 bg-slate-500/10 border-slate-500/30';
  }
}

export default function TimesheetPage() {
  const [issues, setIssues] = useState<JiraIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSynced, setLastSynced] = useState<string | null>(null);

  const fetchIssues = useCallback(async () => {
    try {
      setError(null);
      const response = await api.get<JiraResponse>('/jira/issues');
      setIssues(response.data.issues);
      setLastSynced(new Date().toLocaleTimeString());
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        'Failed to fetch Jira issues';
      setError(message);
    }
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await fetchIssues();
      setLoading(false);
    };
    load();
  }, [fetchIssues]);

  const handleSync = async () => {
    setSyncing(true);
    await fetchIssues();
    setSyncing(false);
  };

  // Derive stats from real data
  const totalHoursLogged = secondsToHours(issues.reduce((sum, i) => sum + (i.timespent || 0), 0));
  const activeIssues = issues.filter(i => i.status?.toLowerCase() !== 'done' && i.status?.toLowerCase() !== 'closed').length;
  const inReviewIssues = issues.filter(i => i.status?.toLowerCase() === 'in review').length;
  const totalEstimatedHours = secondsToHours(issues.reduce((sum, i) => sum + (i.timeestimate || 0), 0));

  return (
    <div className="flex-1 flex flex-col">
      <Header
        title="My Timesheet"
        subtitle="Track your time and manage your tasks"
        onSync={syncing ? undefined : handleSync}
      />

      <div className="flex-1 p-8 overflow-y-auto">

        {/* Sync status banner */}
        {!loading && !error && lastSynced && (
          <div className="bg-green-500/10 border border-green-500/30 text-green-400 px-4 py-3.5 rounded-lg mb-8 flex items-center gap-3">
            <CheckCircle className="w-5 h-5 shrink-0" />
            <div>
              <div className="font-semibold mb-0.5">Jira data loaded successfully</div>
              <div className="text-xs opacity-80">Last synced: {lastSynced}</div>
            </div>
          </div>
        )}

        {!loading && error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3.5 rounded-lg mb-8 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <div>
              <div className="font-semibold mb-0.5">Failed to load Jira data</div>
              <div className="text-xs opacity-80">{error}</div>
            </div>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-4 gap-5 mb-8">
          <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-xl p-5">
            <div className="flex justify-between items-start mb-3">
              <div className="text-sm text-slate-400 font-medium">Hours Logged</div>
              <div className="w-9 h-9 bg-blue-500/20 text-blue-400 rounded-lg flex items-center justify-center">
                <Clock className="w-5 h-5" />
              </div>
            </div>
            <div className="text-3xl font-bold mb-1">
              {loading ? <Loader2 className="w-6 h-6 animate-spin text-slate-500" /> : `${totalHoursLogged}h`}
            </div>
            <div className="text-xs text-slate-500">Total time spent</div>
          </div>

          <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-xl p-5">
            <div className="flex justify-between items-start mb-3">
              <div className="text-sm text-slate-400 font-medium">Active Tasks</div>
              <div className="w-9 h-9 bg-purple-500/20 text-purple-400 rounded-lg flex items-center justify-center">
                <ListTodo className="w-5 h-5" />
              </div>
            </div>
            <div className="text-3xl font-bold mb-1">
              {loading ? <Loader2 className="w-6 h-6 animate-spin text-slate-500" /> : activeIssues}
            </div>
            <div className="text-xs text-slate-500">Assigned &amp; open</div>
          </div>

          <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-xl p-5">
            <div className="flex justify-between items-start mb-3">
              <div className="text-sm text-slate-400 font-medium">Estimated Hours</div>
              <div className="w-9 h-9 bg-green-500/20 text-green-400 rounded-lg flex items-center justify-center">
                <Star className="w-5 h-5" />
              </div>
            </div>
            <div className="text-3xl font-bold mb-1">
              {loading ? <Loader2 className="w-6 h-6 animate-spin text-slate-500" /> : `${totalEstimatedHours}h`}
            </div>
            <div className="text-xs text-slate-500">Across all tasks</div>
          </div>

          <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-xl p-5">
            <div className="flex justify-between items-start mb-3">
              <div className="text-sm text-slate-400 font-medium">In Review</div>
              <div className="w-9 h-9 bg-yellow-500/20 text-yellow-400 rounded-lg flex items-center justify-center">
                <Hourglass className="w-5 h-5" />
              </div>
            </div>
            <div className="text-3xl font-bold mb-1">
              {loading ? <Loader2 className="w-6 h-6 animate-spin text-slate-500" /> : inReviewIssues}
            </div>
            <div className="text-xs text-slate-500">Awaiting review</div>
          </div>
        </div>

        {/* Issues Table */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
          <div className="flex justify-between items-center mb-5">
            <h3 className="text-lg font-semibold">
              Jira Issues
              {!loading && (
                <span className="ml-2 text-sm font-normal text-slate-400">({issues.length})</span>
              )}
            </h3>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
              <Loader2 className="w-8 h-8 animate-spin" />
              <p className="text-sm">Loading Jira issues…</p>
            </div>
          ) : error ? (
            <div className="text-center py-16 text-slate-400">
              <div className="text-5xl mb-4">⚠️</div>
              <h3 className="text-lg font-semibold mb-2">Could not load issues</h3>
              <p className="text-sm">{error}</p>
              <button
                onClick={handleSync}
                className="mt-4 px-4 py-2 bg-blue-500 hover:bg-blue-600 rounded-lg text-sm font-medium transition-colors"
              >
                Retry
              </button>
            </div>
          ) : issues.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <div className="text-5xl mb-4">📋</div>
              <h3 className="text-lg font-semibold mb-2">No issues assigned</h3>
              <p className="text-sm">No open Jira issues are assigned to you.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700 text-slate-400 text-left">
                    <th className="pb-3 pr-4 font-medium">Key</th>
                    <th className="pb-3 pr-4 font-medium">Summary</th>
                    <th className="pb-3 pr-4 font-medium">Status</th>
                    <th className="pb-3 pr-4 font-medium">Priority</th>
                    <th className="pb-3 pr-4 font-medium text-right">Estimated</th>
                    <th className="pb-3 font-medium text-right">Logged</th>
                  </tr>
                </thead>
                <tbody>
                  {issues.map((issue) => (
                    <tr key={issue.id} className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors">
                      <td className="py-3.5 pr-4">
                        <span className="font-mono text-blue-400 font-medium">{issue.key}</span>
                      </td>
                      <td className="py-3.5 pr-4 max-w-xs">
                        <span className="text-white line-clamp-1" title={issue.summary}>
                          {issue.summary}
                        </span>
                      </td>
                      <td className="py-3.5 pr-4">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${statusColor(issue.status)}`}>
                          {issue.status || '—'}
                        </span>
                      </td>
                      <td className="py-3.5 pr-4">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${priorityColor(issue.priority)}`}>
                          {issue.priority || '—'}
                        </span>
                      </td>
                      <td className="py-3.5 pr-4 text-right text-slate-400">
                        {issue.timeestimate ? `${secondsToHours(issue.timeestimate)}h` : '—'}
                      </td>
                      <td className="py-3.5 text-right text-slate-400">
                        {issue.timespent ? `${secondsToHours(issue.timespent)}h` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
