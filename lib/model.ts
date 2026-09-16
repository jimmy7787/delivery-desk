export const statusLabels = { OPEN: "Ανοικτό", IN_PROGRESS: "Σε εξέλιξη", BLOCKED: "Blocked", DONE: "Ολοκληρωμένο" } as const;
export type Status = keyof typeof statusLabels;
export type Project = { id: string; name: string; description: string; created_at: string };
export type Task = { id: string; project_id: string; title: string; notes: string; assignee: string; due_date: string | null; status: Status; version: number; created_at: string; updated_at: string };
export type TaskDraft = { title: string; notes: string; assignee: string; due_date: string | null; status: Status };
