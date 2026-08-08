/**
 * Task API routes — exactly implements the spec (§5).
 *
 * Routes mounted at /tasks:
 *   POST   /tasks                          — create a task (§5.1)
 *   GET    /tasks?candidate_id=…           — list tasks (§5.4)
 *   GET    /tasks/:task_id                 — get one task (not in spec; useful for frontend)
 *   GET    /tasks/:task_id/history         — task update history (for frontend + chat)
 *   PATCH  /tasks/:task_id                 — update task fields (§5.3)
 *   DELETE /tasks/:task_id                 — delete one task (§5.5)
 *
 * IMPORTANT: POST /task creates AND records a ThreadTaskMap entry so thread
 * reconciliation works correctly. Route handlers call the DAL exclusively —
 * they never use prisma directly.
 */

import { Router, Request, Response, NextFunction } from "express";
import { Prisma } from "@prisma/client";
import {
  createTask,
  updateTask,
  getTaskByTaskId,
  listTasks,
  deleteTask,
  taskExistsForEmail,
} from "../db/tasks";
import { createThreadMapping, threadMappingExists } from "../db/threads";
import { getTaskUpdateHistory } from "../db/taskUpdates";
import {
  CreateTaskSchema,
  PatchTaskSchema,
  ListTasksQuerySchema,
  buildEnumErrorBody,
  buildValidationErrorBody,
  ASSIGNEE_IDS,
} from "../validation/taskSchemas";

const router = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Format a Prisma Task row into the public API shape.
 * All nullable Prisma fields are preserved as null (never undefined).
 */
function formatTask(task: Awaited<ReturnType<typeof getTaskByTaskId>>) {
  if (!task) return null;
  return {
    task_id: task.task_id,
    candidate_id: task.candidate_id,
    source_email_id: task.source_email_id,
    thread_id: task.thread_id,
    title: task.title,
    description: task.description ?? null,
    assignee_id: task.assignee_id,
    category: task.category,
    priority: task.priority,
    due_date: task.due_date ?? null,
    deal_value_inr: task.deal_value_inr ?? null,
    company_name: task.company_name ?? null,
    confidence: task.confidence,
    created_at: task.created_at.toISOString(),
    updated_at: task.updated_at.toISOString(),
  };
}

// ─── POST /tasks ──────────────────────────────────────────────────────────────

router.post(
  "/",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const body = req.body as Record<string, unknown>;

    const parsed = CreateTaskSchema.safeParse(body);
    if (!parsed.success) {
      // Check for enum validation failure first — must use spec's exact shape
      const enumError = buildEnumErrorBody(parsed.error, body);
      if (enumError) {
        res.status(400).json(enumError);
        return;
      }
      res.status(400).json(buildValidationErrorBody(parsed.error));
      return;
    }

    const data = parsed.data;

    try {
      // Guard: prevent duplicate tasks for the same email (idempotency)
      const alreadyExists = await taskExistsForEmail(
        data.candidate_id,
        data.source_email_id
      );
      if (alreadyExists) {
        res.status(409).json({
          error: "duplicate_task",
          message: `A task already exists for source_email_id '${data.source_email_id}' under candidate '${data.candidate_id}'.`,
        });
        return;
      }

      const task = await createTask(data);

      // Register thread mapping if this thread doesn't already have one.
      // A new thread → new task by definition, so this should always succeed.
      const hasMapping = await threadMappingExists(
        task.candidate_id,
        task.thread_id
      );
      if (!hasMapping) {
        await createThreadMapping(
          task.candidate_id,
          task.thread_id,
          task.task_id
        );
      }

      // Spec §5.1 — 201 response has exactly 4 fields
      res.status(201).json({
        task_id: task.task_id,
        candidate_id: task.candidate_id,
        source_email_id: task.source_email_id,
        created_at: task.created_at.toISOString(),
      });
    } catch (err) {
      // P2002 = unique constraint violation — race condition on concurrent inserts
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        res.status(409).json({
          error: "duplicate_task",
          message: "A task already exists for this (candidate_id, source_email_id) combination.",
        });
        return;
      }
      next(err);
    }
  }
);

// ─── GET /tasks?candidate_id=… ────────────────────────────────────────────────

router.get(
  "/",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const parsed = ListTasksQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      // Missing candidate_id is the most common case
      const missingId = parsed.error.issues.find((i) =>
        i.path.includes("candidate_id")
      );
      if (missingId) {
        res.status(400).json({
          error: "missing_parameter",
          message: "candidate_id query parameter is required.",
        });
        return;
      }

      // Invalid assignee_id filter
      const enumError = buildEnumErrorBody(
        parsed.error,
        req.query as Record<string, unknown>
      );
      if (enumError) {
        res.status(400).json(enumError);
        return;
      }

      res.status(400).json(buildValidationErrorBody(parsed.error));
      return;
    }

    try {
      const filters = parsed.data;
      const tasks = await listTasks({
        candidate_id: filters.candidate_id,
        thread_id: filters.thread_id,
        source_email_id: filters.source_email_id,
        assignee_id: filters.assignee_id,
      });

      res.status(200).json({ tasks: tasks.map(formatTask) });
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /tasks/:task_id/history ─────────────────────────────────────────────
// Must be defined BEFORE GET /tasks/:task_id to avoid Express treating
// "history" as a task_id value.

router.get(
  "/:task_id/history",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const { task_id } = req.params;

    try {
      const task = await getTaskByTaskId(task_id);
      if (!task) {
        res.status(404).json({
          error: "not_found",
          message: `Task '${task_id}' does not exist.`,
        });
        return;
      }

      const history = await getTaskUpdateHistory(task_id);

      res.status(200).json({
        task_id,
        updates: history.map((u) => ({
          id: u.id,
          source_email_id: u.source_email_id,
          thread_id: u.thread_id,
          changes: {
            priority:
              u.prev_priority !== u.new_priority
                ? { from: u.prev_priority, to: u.new_priority }
                : undefined,
            due_date:
              u.prev_due_date !== u.new_due_date
                ? { from: u.prev_due_date, to: u.new_due_date }
                : undefined,
            deal_value_inr:
              u.prev_deal_value_inr !== u.new_deal_value_inr
                ? { from: u.prev_deal_value_inr, to: u.new_deal_value_inr }
                : undefined,
            assignee_id:
              u.prev_assignee_id !== u.new_assignee_id
                ? { from: u.prev_assignee_id, to: u.new_assignee_id }
                : undefined,
            confidence:
              u.prev_confidence !== u.new_confidence
                ? { from: u.prev_confidence, to: u.new_confidence }
                : undefined,
            company_name:
              u.prev_company_name !== u.new_company_name
                ? { from: u.prev_company_name, to: u.new_company_name }
                : undefined,
          },
          created_at: u.created_at.toISOString(),
        })),
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /tasks/:task_id ──────────────────────────────────────────────────────

router.get(
  "/:task_id",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const { task_id } = req.params;

    try {
      const task = await getTaskByTaskId(task_id);
      if (!task) {
        res.status(404).json({
          error: "not_found",
          message: `Task '${task_id}' does not exist.`,
        });
        return;
      }
      res.status(200).json(formatTask(task));
    } catch (err) {
      next(err);
    }
  }
);

// ─── PATCH /tasks/:task_id ────────────────────────────────────────────────────

router.patch(
  "/:task_id",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const { task_id } = req.params;
    const body = req.body as Record<string, unknown>;

    const parsed = PatchTaskSchema.safeParse(body);
    if (!parsed.success) {
      const enumError = buildEnumErrorBody(parsed.error, body);
      if (enumError) {
        res.status(400).json(enumError);
        return;
      }
      res.status(400).json(buildValidationErrorBody(parsed.error));
      return;
    }

    // Reject empty patch body — nothing would change
    if (Object.keys(parsed.data).length === 0) {
      res.status(400).json({
        error: "validation_error",
        message: "PATCH body must include at least one field to update.",
      });
      return;
    }

    try {
      const updated = await updateTask(task_id, parsed.data);
      // Spec §5.3 — returns 200 with the full updated task
      res.status(200).json(formatTask(updated));
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2025"
      ) {
        res.status(404).json({
          error: "not_found",
          message: `Task '${task_id}' does not exist.`,
        });
        return;
      }
      next(err);
    }
  }
);

// ─── DELETE /tasks/:task_id ───────────────────────────────────────────────────

router.delete(
  "/:task_id",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const { task_id } = req.params;

    try {
      await deleteTask(task_id);
      res.status(204).send();
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === "P2025") {
          res.status(404).json({
            error: "not_found",
            message: `Task '${task_id}' does not exist.`,
          });
          return;
        }
        if (err.code === "P2003") {
          res.status(409).json({
            error: "constraint_violation",
            message: "Task has dependent records that could not be removed.",
          });
          return;
        }
      }
      next(err);
    }
  }
);

export default router;
