/**
 * Data-access layer for TaskUpdate.
 *
 * TaskUpdate records are written every time a thread reply causes a PATCH.
 * They are immutable — we never delete or modify them.
 *
 * Used for:
 *   - Chat Q10: "did any thread get updated more than once?"
 *   - Audit trail for grading (Run 3 thread reconciliation)
 */

import { AssigneeId, Priority } from "@prisma/client";
import prisma from "../lib/prisma";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CreateTaskUpdateInput = {
  task_id: string;
  candidate_id: string;
  source_email_id: string;
  thread_id: string;
  prev_priority?: Priority;
  new_priority?: Priority;
  prev_due_date?: string | null;
  new_due_date?: string | null;
  prev_deal_value_inr?: number | null;
  new_deal_value_inr?: number | null;
  prev_assignee_id?: AssigneeId;
  new_assignee_id?: AssigneeId;
  prev_confidence?: number;
  new_confidence?: number;
  prev_company_name?: string | null;
  new_company_name?: string | null;
};

// ─── Writes ───────────────────────────────────────────────────────────────────

/** Record a task update event. Called after every successful PATCH. */
export async function createTaskUpdate(input: CreateTaskUpdateInput) {
  return prisma.taskUpdate.create({
    data: {
      task_id: input.task_id,
      candidate_id: input.candidate_id.toLowerCase().trim(),
      source_email_id: input.source_email_id,
      thread_id: input.thread_id,
      prev_priority: input.prev_priority,
      new_priority: input.new_priority,
      prev_due_date: input.prev_due_date ?? null,
      new_due_date: input.new_due_date ?? null,
      prev_deal_value_inr: input.prev_deal_value_inr ?? null,
      new_deal_value_inr: input.new_deal_value_inr ?? null,
      prev_assignee_id: input.prev_assignee_id,
      new_assignee_id: input.new_assignee_id,
      prev_confidence: input.prev_confidence,
      new_confidence: input.new_confidence,
      prev_company_name: input.prev_company_name ?? null,
      new_company_name: input.new_company_name ?? null,
    },
  });
}

// ─── Reads ────────────────────────────────────────────────────────────────────

/**
 * Find threads updated more than once for a candidate.
 * Used by chat Q10.
 */
export async function getMultiplyUpdatedThreads(
  candidate_id: string
): Promise<string[]> {
  const results = await prisma.taskUpdate.groupBy({
    by: ["thread_id"],
    where: { candidate_id: candidate_id.toLowerCase().trim() },
    _count: { thread_id: true },
    having: { thread_id: { _count: { gt: 1 } } },
  });
  return results.map((r) => r.thread_id);
}

/**
 * Get the full update history for a specific task.
 */
export async function getTaskUpdateHistory(task_id: string) {
  return prisma.taskUpdate.findMany({
    where: { task_id },
    orderBy: { created_at: "asc" },
  });
}
