/**
 * Data-access layer for ProcessingRun.
 *
 * One ProcessingRun is created at the start of each POST /ingest call.
 * Its counters are updated when the run completes.
 *
 * Used by:
 *   - GET /api/stats (per-run breakdown)
 *   - Grounded chat Q4 (spurious rate — computed from run totals)
 */

import prisma from "../lib/prisma";

// ─── Writes ───────────────────────────────────────────────────────────────────

/** Open a new processing run. Returns the run record (id used as FK). */
export async function createProcessingRun(candidate_id: string) {
  return prisma.processingRun.create({
    data: {
      candidate_id: candidate_id.toLowerCase().trim(),
    },
  });
}

/** Finalise a run — set counters and finished_at timestamp. */
export async function finaliseProcessingRun(
  id: string,
  counts: {
    total_input: number;
    tasks_created: number;
    tasks_updated: number;
    skipped: number;
    errored: number;
  }
) {
  return prisma.processingRun.update({
    where: { id },
    data: {
      finished_at: new Date(),
      total_input: counts.total_input,
      tasks_created: counts.tasks_created,
      tasks_updated: counts.tasks_updated,
      skipped: counts.skipped,
      errored: counts.errored,
    },
  });
}

// ─── Reads ────────────────────────────────────────────────────────────────────

/** List all runs for a candidate, newest first. Used by GET /api/stats. */
export async function listProcessingRuns(candidate_id: string) {
  return prisma.processingRun.findMany({
    where: { candidate_id: candidate_id.toLowerCase().trim() },
    orderBy: { started_at: "desc" },
  });
}

/** Get a single run by id. */
export async function getProcessingRun(id: string) {
  return prisma.processingRun.findUnique({ where: { id } });
}

/**
 * Aggregate totals across all runs for a candidate.
 * Used to compute overall spurious rate for grounded chat.
 */
export async function getAggregateCounts(candidate_id: string) {
  return prisma.processingRun.aggregate({
    where: {
      candidate_id: candidate_id.toLowerCase().trim(),
      finished_at: { not: null },
    },
    _sum: {
      total_input: true,
      tasks_created: true,
      tasks_updated: true,
      skipped: true,
      errored: true,
    },
  });
}
