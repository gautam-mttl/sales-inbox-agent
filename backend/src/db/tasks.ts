/**
 * Data-access layer for Tasks.
 *
 * All functions in this file are the ONLY place that touches the `tasks` table
 * directly. Route handlers call these functions — they never import prisma directly.
 *
 * task_id format: "tsk_" + cuid fragment (set here, not by Prisma default).
 */

import { Prisma, AssigneeId, Category, Priority } from "@prisma/client";
import { createId } from "@paralleldrive/cuid2";
import prisma from "../lib/prisma";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CreateTaskInput = {
  candidate_id: string;
  source_email_id: string;
  thread_id: string;
  title: string;
  description?: string;
  assignee_id: AssigneeId;
  category: Category;
  priority: Priority;
  due_date?: string | null;
  deal_value_inr?: number | null;
  company_name?: string | null;
  confidence: number;
};

export type UpdateTaskInput = {
  title?: string;
  description?: string;
  assignee_id?: AssigneeId;
  category?: Category;
  priority?: Priority;
  due_date?: string | null;
  deal_value_inr?: number | null;
  company_name?: string | null;
  confidence?: number;
};

export type TaskFilters = {
  candidate_id: string;
  thread_id?: string;
  source_email_id?: string;
  assignee_id?: AssigneeId;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Generate a public task ID: tsk_<7-char cuid fragment> */
function generateTaskId(): string {
  return "tsk_" + createId().slice(0, 7);
}

// ─── Task CRUD ────────────────────────────────────────────────────────────────

/**
 * Create a new task. Generates a tsk_… public ID.
 * The caller is responsible for preventing duplicates (idempotency check
 * via ProcessedEmail @@unique([candidate_id, source_email_id])).
 */
export async function createTask(input: CreateTaskInput) {
  const task_id = generateTaskId();

  return prisma.task.create({
    data: {
      task_id,
      candidate_id: input.candidate_id.toLowerCase().trim(),
      source_email_id: input.source_email_id,
      thread_id: input.thread_id,
      title: input.title,
      description: input.description,
      assignee_id: input.assignee_id,
      category: input.category,
      priority: input.priority,
      due_date: input.due_date ?? null,
      deal_value_inr: input.deal_value_inr ?? null,
      company_name: input.company_name ?? null,
      confidence: input.confidence,
    },
  });
}

/**
 * Update an existing task by its public task_id.
 * Only provided (non-undefined) fields are updated.
 */
export async function updateTask(task_id: string, input: UpdateTaskInput) {
  const data: Prisma.TaskUpdateInput = {};

  if (input.title !== undefined) data.title = input.title;
  if (input.description !== undefined) data.description = input.description;
  if (input.assignee_id !== undefined) data.assignee_id = input.assignee_id;
  if (input.category !== undefined) data.category = input.category;
  if (input.priority !== undefined) data.priority = input.priority;
  if ("due_date" in input) data.due_date = input.due_date;
  if ("deal_value_inr" in input) data.deal_value_inr = input.deal_value_inr;
  if ("company_name" in input) data.company_name = input.company_name;
  if (input.confidence !== undefined) data.confidence = input.confidence;

  return prisma.task.update({
    where: { task_id },
    data,
  });
}

/** Get a single task by its public task_id. Returns null if not found. */
export async function getTaskByTaskId(task_id: string) {
  return prisma.task.findUnique({ where: { task_id } });
}

/** List tasks for a candidate with optional filters (grader-facing GET /tasks). */
export async function listTasks(filters: TaskFilters) {
  const where: Prisma.TaskWhereInput = {
    candidate_id: filters.candidate_id.toLowerCase().trim(),
  };
  if (filters.thread_id) where.thread_id = filters.thread_id;
  if (filters.source_email_id) where.source_email_id = filters.source_email_id;
  if (filters.assignee_id) where.assignee_id = filters.assignee_id;

  return prisma.task.findMany({
    where,
    orderBy: { created_at: "asc" },
  });
}

/** Delete a single task by its public task_id. */
export async function deleteTask(task_id: string) {
  return prisma.task.delete({ where: { task_id } });
}

/** Check whether a task already exists for a given (candidate_id, source_email_id). */
export async function taskExistsForEmail(
  candidate_id: string,
  source_email_id: string
): Promise<boolean> {
  const task = await prisma.task.findUnique({
    where: {
      candidate_id_source_email_id: {
        candidate_id: candidate_id.toLowerCase().trim(),
        source_email_id,
      },
    },
    select: { id: true },
  });
  return task !== null;
}
