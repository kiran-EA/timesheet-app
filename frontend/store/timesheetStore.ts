/**
 * Timesheet session cache — lives in memory (Zustand) for the duration of the
 * browser tab. Cleared on logout. Never written to localStorage.
 *
 * This means:
 *  - Navigating away and coming back → instant restore (no re-fetch)
 *  - New tab / page refresh         → fresh fetch (no stale data)
 */

import { create } from 'zustand';

export interface JiraTaskCached {
  id: string;
  key: string;
  title: string;
  epic: string | null;       // epic key, e.g. "HSB-5"
  epic_name: string | null;  // epic title, e.g. "Phase 1 Development"
  story_points: number | null;
  est_hours: number | null;
  logged_hours: number;
  status: string;
  sprint: string | null;
  is_active_sprint: boolean;
  assignee?: string | null;
}

export interface EntryCached {
  id: string;
  task_id: string;
  task_title: string;
  entry_date: string;
  work_description: string;
  hours: number;
  status: string;
  rejection_reason: string | null;
}

interface TimesheetCache {
  // date the user was last viewing
  selectedDate: string;

  // timesheet entries (per selected date)
  entries: EntryCached[];
  entriesFetchedAt: number | null;   // Date.now() ms

  // all entries across all dates (for "All My Entries" tab)
  allEntries: EntryCached[];
  allEntriesFetchedAt: number | null;

  // jira tasks
  tasks: JiraTaskCached[];
  generalTasks: JiraTaskCached[];
  tasksFetchedAt: number | null;     // Date.now() ms
  jiraConnected: boolean | null;
  jiraError: string;

  // week hours stat (cheap — always fetched with entries)
  weekHours: number;
}

interface TimesheetStore extends TimesheetCache {
  setSelectedDate:        (date: string) => void;
  setEntries:             (entries: EntryCached[], weekHours?: number) => void;
  setAllEntries:          (entries: EntryCached[]) => void;
  setTasks:               (tasks: JiraTaskCached[], generalTasks: JiraTaskCached[], connected: boolean | null, error: string) => void;
  setWeekHours:           (hours: number) => void;
  updateEntry:            (id: string, patch: Partial<EntryCached>) => void;
  updateAllEntry:         (id: string, patch: Partial<EntryCached>) => void;
  removeEntry:            (id: string) => void;
  addEntry:               (entry: EntryCached) => void;
  updateTaskLoggedHours:  (key: string, addHours: number) => void;
  clearCache:             () => void;
}

const today = () => new Date().toISOString().split('T')[0];

const INITIAL: TimesheetCache = {
  selectedDate:        today(),
  entries:             [],
  entriesFetchedAt:    null,
  allEntries:          [],
  allEntriesFetchedAt: null,
  tasks:               [],
  generalTasks:        [],
  tasksFetchedAt:      null,
  jiraConnected:       null,
  jiraError:           '',
  weekHours:           0,
};

export const useTimesheetStore = create<TimesheetStore>((set) => ({
  ...INITIAL,

  setSelectedDate: (date) => set({ selectedDate: date }),

  setEntries: (entries, weekHours) =>
    set((s) => ({
      entries,
      entriesFetchedAt: Date.now(),
      weekHours: weekHours ?? s.weekHours,
    })),

  setAllEntries: (allEntries) =>
    set({ allEntries, allEntriesFetchedAt: Date.now() }),

  setTasks: (tasks, generalTasks, jiraConnected, jiraError) =>
    set({ tasks, generalTasks, jiraConnected, jiraError, tasksFetchedAt: Date.now() }),

  setWeekHours: (hours) => set({ weekHours: hours }),

  updateEntry: (id, patch) =>
    set((s) => ({
      entries: s.entries.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    })),

  updateAllEntry: (id, patch) =>
    set((s) => ({
      allEntries: s.allEntries.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    })),

  updateTaskLoggedHours: (key, addHours) =>
    set((s) => ({
      tasks:        s.tasks.map((t)        => t.key === key ? { ...t, logged_hours: t.logged_hours + addHours } : t),
      generalTasks: s.generalTasks.map((t) => t.key === key ? { ...t, logged_hours: t.logged_hours + addHours } : t),
    })),

  removeEntry: (id) =>
    set((s) => ({
      entries:    s.entries.filter((e) => e.id !== id),
      allEntries: s.allEntries.filter((e) => e.id !== id),
    })),

  addEntry: (entry) =>
    set((s) => ({
      entries:    [...s.entries, entry],
      allEntries: [entry, ...s.allEntries],   // newest first
    })),

  clearCache: () => set(INITIAL),
}));

/** "just now" / "3m ago" / "1h ago" label for a timestamp */
export function timeAgo(ts: number | null): string {
  if (!ts) return '';
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 10)   return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}
