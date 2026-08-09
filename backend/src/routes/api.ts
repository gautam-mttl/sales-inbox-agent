/**
 * Application API routes — /api/*
 *
 * These are the backend-internal routes for the frontend (and graded evaluation).
 * They expose richer data than the raw Task API (/tasks) because they join
 * processed_emails metadata — including why something was skipped.
 *
 * Routes:
 *   GET /api/tasks   — enriched task + skipped email list (§7.2)
 *   GET /api/stats   — aggregate + per-category + per-run counts (§7.2)
 *
 * POST /api/chat is Phase 6 — not implemented here.
 */

import { Router, Request, Response, NextFunction } from "express";
import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma";
import {
  ApiTasksQuerySchema,
  ApiStatsQuerySchema,
} from "../validation/ingestSchemas";

import chatRouter from "./chat";

const router = Router();

router.use("/chat", chatRouter);

// ─── GET /api/tasks ───────────────────────────────────────────────────────────

router.get(
  "/tasks",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const parsed = ApiTasksQuerySchema.safeParse(req.query);
    if (!parsed.success) {
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
      res.status(400).json({
        error: "validation_error",
        issues: parsed.error.issues.map((i) => ({
          field: i.path.join("."),
          message: i.message,
        })),
      });
      return;
    }

    const {
      candidate_id: rawId,
      decision,
      category,
      assignee_id,
      thread_id,
      run_id,
      limit,
      offset,
    } = parsed.data;
    const candidate_id = rawId.toLowerCase().trim();

    try {
      // Build the WHERE clause for processed_emails
      const where: Prisma.ProcessedEmailWhereInput = { candidate_id };
      if (decision) where.decision = decision;
      if (category) where.category = category;
      if (assignee_id) where.assignee_id = assignee_id;
      if (thread_id) where.thread_id = thread_id;
      if (run_id) where.run_id = run_id;

      // Fetch processed_emails (includes skipped — the key difference from /tasks)
      const [rows, total] = await Promise.all([
        prisma.processedEmail.findMany({
          where,
          orderBy: { created_at: "asc" },
          take: limit,
          skip: offset,
        }),
        prisma.processedEmail.count({ where }),
      ]);

      // Format response — include the raw classification metadata for the frontend
      const items = rows.map((pe) => ({
        // Processed email identity
        source_email_id: pe.source_email_id,
        thread_id: pe.thread_id,
        from_name: pe.from_name ?? null,
        from_email: pe.from_email ?? null,
        subject: pe.subject ?? null,
        received_at: pe.received_at?.toISOString() ?? null,
        is_reply: pe.is_reply,

        // Pipeline decision
        decision: pe.decision,
        skip_reason: pe.skip_reason ?? null,
        error_message: pe.error_message ?? null,

        // Classification metadata
        category: pe.category ?? null,
        assignee_id: pe.assignee_id ?? null,
        priority: pe.priority ?? null,
        due_date: pe.due_date ?? null,
        deal_value_inr: pe.deal_value_inr ?? null,
        company_name: pe.company_name ?? null,
        confidence: pe.confidence ?? null,
        reasoning: pe.reasoning ?? null,

        // Task reference (null for skipped)
        task_id: pe.task_id ?? null,

        // Run reference
        run_id: pe.run_id,

        // Timestamps
        processed_at: pe.created_at.toISOString(),
      }));

      res.status(200).json({
        total,
        limit,
        offset,
        items,
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /api/stats ───────────────────────────────────────────────────────────

router.get(
  "/stats",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const parsed = ApiStatsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        error: "missing_parameter",
        message: "candidate_id query parameter is required.",
      });
      return;
    }

    const candidate_id = parsed.data.candidate_id.toLowerCase().trim();

    try {
      // ── Aggregate totals ─────────────────────────────────────────────────
      const [decisionGroups, categoryGroups, skipReasonGroups, runs, taskCount] =
        await Promise.all([
          // Decision breakdown (created / updated / skipped / errored)
          prisma.processedEmail.groupBy({
            by: ["decision"],
            where: { candidate_id },
            _count: { decision: true },
          }),

          // Category breakdown (non-null categories only)
          prisma.processedEmail.groupBy({
            by: ["category"],
            where: { candidate_id, category: { not: null } },
            _count: { category: true },
          }),

          // Skip reason breakdown
          prisma.processedEmail.groupBy({
            by: ["skip_reason"],
            where: {
              candidate_id,
              decision: "skipped",
              skip_reason: { not: null },
            },
            _count: { skip_reason: true },
          }),

          // Per-run breakdown (newest first)
          prisma.processingRun.findMany({
            where: { candidate_id },
            orderBy: { started_at: "desc" },
          }),

          // Total task count (scorable tasks only)
          prisma.task.count({ where: { candidate_id } }),
        ]);

      // ── Spurious rate ────────────────────────────────────────────────────
      // Spurious = tasks created for emails that should have been skipped
      // Proxy: triage tasks with confidence < 0.6 (flagged by ops as uncertain)
      // The real spurious rate is set by the grader comparing against ground truth.
      // We compute the best available proxy from our own data.
      const spuriousCount = await prisma.task.count({
        where: {
          candidate_id,
          category: "triage",
          confidence: { lt: 0.6 },
        },
      });

      const totalProcessed = decisionGroups.reduce(
        (sum, g) => sum + g._count.decision,
        0
      );

      // ── Build response ───────────────────────────────────────────────────

      const byDecision: Record<string, number> = {};
      for (const g of decisionGroups) {
        byDecision[g.decision] = g._count.decision;
      }

      const byCategory: Record<string, number> = {};
      for (const g of categoryGroups) {
        if (g.category) byCategory[g.category] = g._count.category;
      }

      const bySkipReason: Record<string, number> = {};
      for (const g of skipReasonGroups) {
        if (g.skip_reason) bySkipReason[g.skip_reason] = g._count.skip_reason;
      }

      const runBreakdown = runs.map((r) => ({
        run_id: r.id,
        started_at: r.started_at.toISOString(),
        finished_at: r.finished_at?.toISOString() ?? null,
        total_input: r.total_input,
        tasks_created: r.tasks_created,
        tasks_updated: r.tasks_updated,
        skipped: r.skipped,
        errored: r.errored,
      }));

      res.status(200).json({
        candidate_id,

        // Totals
        total_processed: totalProcessed,
        total_tasks: taskCount,
        tasks_created: byDecision["created"] ?? 0,
        tasks_updated: byDecision["updated"] ?? 0,
        skipped: byDecision["skipped"] ?? 0,
        errored: byDecision["errored"] ?? 0,

        // Spurious proxy (best available without ground truth)
        spurious_proxy: spuriousCount,
        spurious_rate:
          totalProcessed > 0
            ? Math.round((spuriousCount / totalProcessed) * 1000) / 1000
            : 0,

        // Breakdowns for grounded chat answers
        by_category: byCategory,
        by_skip_reason: bySkipReason,

        // Per-run history
        runs: runBreakdown,
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
