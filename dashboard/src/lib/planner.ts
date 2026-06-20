// Mock data for the Planner — a daily command center that unifies calendar,
// mail, and JIRA so the user can run their whole day from one place. The agent
// keeps tasks, events, and work items in sync. Mockup only.

// ── Agenda (calendar) ────────────────────────────────────────────────────────
export type EventKind = "meeting" | "focus" | "break" | "task";

export interface AgendaEvent {
  id: string;
  time: string;
  end: string;
  title: string;
  kind: EventKind;
  detail?: string;
  source?: "Google Calendar" | "Agent" | "JIRA";
  live?: boolean;
}

export const EVENT_META: Record<EventKind, { color: string; label: string }> = {
  meeting: { color: "#4f8cff", label: "Meeting" },
  focus: { color: "#a78bfa", label: "Focus" },
  break: { color: "#34d399", label: "Break" },
  task: { color: "#f4c14d", label: "Task block" },
};

export const AGENDA: AgendaEvent[] = [
  { id: "e1", time: "09:00", end: "09:30", title: "Daily standup", kind: "meeting", detail: "Agent OS squad · Google Meet", source: "Google Calendar" },
  { id: "e2", time: "09:30", end: "11:30", title: "Deep work — Memory sphere", kind: "focus", detail: "Auto-scheduled around your peak focus", source: "Agent" },
  { id: "e3", time: "11:30", end: "12:00", title: "Triage inbox", kind: "task", detail: "6 action emails queued", source: "Agent" },
  { id: "e4", time: "12:00", end: "13:00", title: "Lunch", kind: "break" },
  { id: "e5", time: "13:00", end: "13:45", title: "JIRA — AOS-214 review", kind: "meeting", detail: "with Winston", source: "JIRA", live: true },
  { id: "e6", time: "14:00", end: "16:00", title: "Deep work — Planner screen", kind: "focus", detail: "Protected block", source: "Agent" },
  { id: "e7", time: "16:30", end: "17:00", title: "Weekly review prep", kind: "task", source: "Agent" },
];

// ── Unified tasks ────────────────────────────────────────────────────────────
export type TaskSource = "jira" | "mail" | "agent" | "manual";
export type TaskPriority = "high" | "med" | "low";
export type TaskBucket = "overdue" | "today" | "upcoming";

export interface Task {
  id: string;
  title: string;
  source: TaskSource;
  ref?: string; // e.g. AOS-214
  priority: TaskPriority;
  due: string;
  bucket: TaskBucket;
  done: boolean;
}

export const SOURCE_META: Record<TaskSource, { label: string; color: string; slug?: string; icon?: "mail" | "agent" | "pencil" }> = {
  jira: { label: "JIRA", color: "#2684FF", slug: "jira" },
  mail: { label: "Mail", color: "#EA4335", icon: "mail" },
  agent: { label: "Agent", color: "#a78bfa", icon: "agent" },
  manual: { label: "Manual", color: "#8a8fa3", icon: "pencil" },
};

export const PRIORITY_META: Record<TaskPriority, { color: string; label: string }> = {
  high: { color: "#f4694d", label: "High" },
  med: { color: "#f4c14d", label: "Medium" },
  low: { color: "#8a8fa3", label: "Low" },
};

export const TASKS: Task[] = [
  { id: "t1", title: "Fix arc occlusion on memory globe", source: "jira", ref: "AOS-214", priority: "high", due: "Overdue · 1d", bucket: "overdue", done: false },
  { id: "t2", title: "Reply to design review thread", source: "mail", priority: "high", due: "Today", bucket: "today", done: false },
  { id: "t3", title: "Wire Planner to calendar API", source: "jira", ref: "AOS-231", priority: "med", due: "Today", bucket: "today", done: false },
  { id: "t4", title: "Approve Brand Maker tool spec", source: "agent", priority: "med", due: "Today", bucket: "today", done: false },
  { id: "t5", title: "Draft weekly review", source: "manual", priority: "low", due: "Today", bucket: "today", done: true },
  { id: "t6", title: "Spike: on-device embeddings", source: "jira", ref: "AOS-240", priority: "med", due: "Thu", bucket: "upcoming", done: false },
  { id: "t7", title: "Prep standup digest", source: "agent", priority: "low", due: "Tomorrow", bucket: "upcoming", done: false },
];

// ── Mail triage ──────────────────────────────────────────────────────────────
export type MailTier = "action" | "meeting" | "info";

export interface MailItem {
  id: string;
  from: string;
  subject: string;
  preview: string;
  tier: MailTier;
  time: string;
}

export const MAIL_TIER_META: Record<MailTier, { label: string; color: string }> = {
  action: { label: "Action", color: "#f4694d" },
  meeting: { label: "Meeting", color: "#4f8cff" },
  info: { label: "FYI", color: "#8a8fa3" },
};

export const MAILS: MailItem[] = [
  { id: "m1", from: "Priya (Design)", subject: "Sign-off needed: dark-glass tokens", preview: "Can you approve the final palette before we lock it for the rebuild?", tier: "action", time: "08:42" },
  { id: "m2", from: "Jira", subject: "AOS-214 assigned to you", preview: "Winston moved this to In Progress and assigned it to you.", tier: "action", time: "08:10" },
  { id: "m3", from: "Calendar", subject: "Invite: Roadmap sync (Thu 3pm)", preview: "Quarterly roadmap alignment — agenda attached.", tier: "meeting", time: "07:55" },
  { id: "m4", from: "GitHub", subject: "3 PRs awaiting your review", preview: "agent-home: #142, #145, #146 need a look.", tier: "info", time: "Yesterday" },
];

// ── JIRA sync ────────────────────────────────────────────────────────────────
export type JiraStatus = "todo" | "inprogress" | "review" | "done";

export interface JiraItem {
  id: string;
  ref: string;
  title: string;
  status: JiraStatus;
  points: number;
}

export const JIRA_STATUS_META: Record<JiraStatus, { label: string; color: string }> = {
  todo: { label: "To do", color: "#8a8fa3" },
  inprogress: { label: "In progress", color: "#4f8cff" },
  review: { label: "In review", color: "#a78bfa" },
  done: { label: "Done", color: "#34d399" },
};

export const JIRA_ITEMS: JiraItem[] = [
  { id: "j1", ref: "AOS-214", title: "Memory globe arc occlusion", status: "inprogress", points: 3 },
  { id: "j2", ref: "AOS-231", title: "Planner ↔ calendar sync", status: "todo", points: 5 },
  { id: "j3", ref: "AOS-240", title: "On-device embeddings spike", status: "todo", points: 2 },
  { id: "j4", ref: "AOS-209", title: "Dark-glass token pass", status: "review", points: 3 },
  { id: "j5", ref: "AOS-198", title: "Top dock replaces sidebar", status: "done", points: 2 },
];

// ── Day stats ────────────────────────────────────────────────────────────────
export interface PlannerStat {
  label: string;
  value: string;
  icon: "calendar" | "list" | "mail" | "jira";
  accent: string;
}
export const PLANNER_STATS: PlannerStat[] = [
  { label: "Events today", value: "7", icon: "calendar", accent: "#4f8cff" },
  { label: "Tasks due", value: "4", icon: "list", accent: "#a78bfa" },
  { label: "Action mail", value: "2", icon: "mail", accent: "#f4694d" },
  { label: "JIRA assigned", value: "3", icon: "jira", accent: "#2684FF" },
];
