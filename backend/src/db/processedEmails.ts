/**
 * Data-access layer for ProcessedEmail.
 *
 * Every email that passes through POST /ingest gets a ProcessedEmail record —
 * including skipped and errored emails. This table drives:
 *   - grounded chat answers (Q1-Q10)
 *   - /api/stats aggregation
 *   - spurious-rate calculation
 *   - skipped-email display in /api/tasks
 *   - idempotency check (@@unique candidate_id + source_email_id)
 */

import {
  AssigneeId,
  Category,
  EmailDecision,
  Priority,
  SkipReason,
} from "@prisma/client";
import prisma from "../lib/prisma";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CreateProcessedEmailInput = {
  candidate_id: string;
  source_email_id: string;
  thread_id: string;
  from_name?: string;
  from_email?: string;
  subject?: string;
  received_at?: Date;
  is_reply?: boolean;
  raw_body?: string;
  decision: EmailDecision;
  category?: Category;
  assignee_id?: AssigneeId;
  priority?: Priority;
  due_date?: string | null;
  deal_value_inr?: number | null;
  company_name?: string | null;
  confidence?: number;
  reasoning?: string;
  skip_reason?: SkipReason;
  error_message?: string;
  task_id?: string | null;
  run_id: string;
};

// ─── Reads ────────────────────────────────────────────────────────────────────

/**
 * Check whether this email has already been processed.
 * This is the application-level idempotency check; the DB constraint backs it up.
 */
export async function processedEmailExists(
  candidate_id: string,
  source_email_id: string
): Promise<boolean> {
  const record = await prisma.processedEmail.findUnique({
    where: {
      candidate_id_source_email_id: {
        candidate_id: candidate_id.toLowerCase().trim(),
        source_email_id,
      },
    },
    select: { id: true },
  });
  return record !== null;
}

/**
 * Find an existing processed email record (to get its task_id on idempotent replay).
 */
export async function findProcessedEmail(
  candidate_id: string,
  source_email_id: string
) {
  return prisma.processedEmail.findUnique({
    where: {
      candidate_id_source_email_id: {
        candidate_id: candidate_id.toLowerCase().trim(),
        source_email_id,
      },
    },
  });
}

// ─── Writes ───────────────────────────────────────────────────────────────────

/**
 * Persist the result of processing one email.
 * Called for every outcome: created, updated, skipped, errored.
 */
export async function createProcessedEmail(input: CreateProcessedEmailInput) {
  return prisma.processedEmail.create({
    data: {
      candidate_id: input.candidate_id.toLowerCase().trim(),
      source_email_id: input.source_email_id,
      thread_id: input.thread_id,
      from_name: input.from_name,
      from_email: input.from_email,
      subject: input.subject,
      received_at: input.received_at,
      is_reply: input.is_reply ?? false,
      raw_body: input.raw_body,
      decision: input.decision,
      category: input.category,
      assignee_id: input.assignee_id,
      priority: input.priority,
      due_date: input.due_date ?? null,
      deal_value_inr: input.deal_value_inr ?? null,
      company_name: input.company_name ?? null,
      confidence: input.confidence,
      reasoning: input.reasoning,
      skip_reason: input.skip_reason,
      error_message: input.error_message,
      task_id: input.task_id ?? null,
      run_id: input.run_id,
    },
  });
}

// ─── Aggregates (used by /api/stats and grounded chat) ────────────────────────

/**
 * Count processed emails grouped by decision for a candidate.
 * Used by /api/stats and chat Q4 (spurious rate).
 */
export async function getDecisionCounts(candidate_id: string) {
  return prisma.processedEmail.groupBy({
    by: ["decision"],
    where: { candidate_id: candidate_id.toLowerCase().trim() },
    _count: { decision: true },
  });
}

/**
 * Count processed emails grouped by category for a candidate.
 * Used by chat Q1 and Q2.
 */
export async function getCategoryCounts(candidate_id: string) {
  return prisma.processedEmail.groupBy({
    by: ["category"],
    where: {
      candidate_id: candidate_id.toLowerCase().trim(),
      category: { not: null },
    },
    _count: { category: true },
  });
}

/**
 * Count skipped emails grouped by skip_reason.
 * Used by chat Q2 (marketing vs spam distinction).
 */
export async function getSkipReasonCounts(candidate_id: string) {
  return prisma.processedEmail.groupBy({
    by: ["skip_reason"],
    where: {
      candidate_id: candidate_id.toLowerCase().trim(),
      decision: "skipped",
      skip_reason: { not: null },
    },
    _count: { skip_reason: true },
  });
}

/**
 * List all triage tasks with their reasoning.
 * Used by chat Q3.
 */
export async function getTriageEmailsWithReasoning(candidate_id: string) {
  return prisma.processedEmail.findMany({
    where: {
      candidate_id: candidate_id.toLowerCase().trim(),
      category: "triage",
      decision: "created",
    },
    select: {
      task_id: true,
      source_email_id: true,
      subject: true,
      reasoning: true,
      confidence: true,
    },
    orderBy: { created_at: "asc" },
  });
}

/**
 * Get total deal value for non-null RFP tasks.
 * Used by chat Q9.
 */
export async function getRfpDealValueStats(candidate_id: string) {
  const result = await prisma.processedEmail.aggregate({
    where: {
      candidate_id: candidate_id.toLowerCase().trim(),
      category: "enterprise_rfp",
      deal_value_inr: { not: null },
    },
    _sum: { deal_value_inr: true },
    _count: { deal_value_inr: true },
  });

  const totalCount = await prisma.processedEmail.count({
    where: {
      candidate_id: candidate_id.toLowerCase().trim(),
      category: "enterprise_rfp",
    },
  });

  return {
    total_deal_value_inr: result._sum.deal_value_inr ?? 0,
    rfps_with_value: result._count.deal_value_inr,
    rfps_with_no_stated_value: totalCount - result._count.deal_value_inr,
  };
}
