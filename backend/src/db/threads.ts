/**
 * Data-access layer for ThreadTaskMap.
 *
 * The thread map is the idempotency mechanism for thread reconciliation.
 * One entry per (candidate_id, thread_id). Checked before every ingest step
 * to decide whether to CREATE a new task or PATCH the existing one.
 */

import prisma from "../lib/prisma";

/**
 * Look up the task_id for an existing thread.
 * Returns the public task_id (tsk_…) or null if this is a new thread.
 */
export async function getTaskIdForThread(
  candidate_id: string,
  thread_id: string
): Promise<string | null> {
  const entry = await prisma.threadTaskMap.findUnique({
    where: {
      candidate_id_thread_id: {
        candidate_id: candidate_id.toLowerCase().trim(),
        thread_id,
      },
    },
    select: { task_id: true },
  });
  return entry?.task_id ?? null;
}

/**
 * Register a new thread → task mapping.
 * Called immediately after a task is created for a new thread.
 */
export async function createThreadMapping(
  candidate_id: string,
  thread_id: string,
  task_id: string
) {
  return prisma.threadTaskMap.create({
    data: {
      candidate_id: candidate_id.toLowerCase().trim(),
      thread_id,
      task_id,
    },
  });
}

/**
 * Check whether a thread mapping exists.
 */
export async function threadMappingExists(
  candidate_id: string,
  thread_id: string
): Promise<boolean> {
  const entry = await prisma.threadTaskMap.findUnique({
    where: {
      candidate_id_thread_id: {
        candidate_id: candidate_id.toLowerCase().trim(),
        thread_id,
      },
    },
    select: { id: true },
  });
  return entry !== null;
}
