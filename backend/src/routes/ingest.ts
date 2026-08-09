/**
 * POST /ingest — batch email ingestion endpoint.
 *
 * Spec §7.1:
 *   - Synchronous — returns 200 only after every task has been written
 *   - Batches up to 100 emails
 *   - Timeout: 15 minutes per batch (enforced by the server in Phase 7 deployment)
 *   - Response: { processed, tasks_created, tasks_updated, skipped, errors: [] }
 *
 * Emails are processed SEQUENTIALLY (not in parallel) to:
 *   1. Avoid race conditions on thread detection (two emails in the same thread)
 *   2. Give predictable order for thread reply detection
 *   3. Stay within Gemini API rate limits (Phase 5)
 */

import { Router, Request, Response, NextFunction } from "express";
import { IngestRequestSchema } from "../validation/ingestSchemas";
import { createProcessingRun, finaliseProcessingRun } from "../db/processingRuns";
import { processEmail } from "../services/ingestionPipeline";

const router = Router();

router.post(
  "/",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const parsed = IngestRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "validation_error",
        issues: parsed.error.issues.map((i) => ({
          field: i.path.join("."),
          message: i.message,
        })),
      });
      return;
    }

    const { candidate_id: rawCandidateId, emails } = parsed.data;
    const candidate_id = rawCandidateId.toLowerCase().trim();

    // Open a processing run record
    const run = await createProcessingRun(candidate_id);

    const counts = {
      tasks_created: 0,
      tasks_updated: 0,
      skipped: 0,
      errored: 0,
    };
    const errors: Array<{ email_id: string; error: string }> = [];

    // Process emails sequentially — must not parallelise (see module JSDoc)
    for (const email of emails) {
      try {
        const result = await processEmail(email, candidate_id, run.id);

        switch (result.decision) {
          case "created":
            counts.tasks_created++;
            break;
          case "updated":
            counts.tasks_updated++;
            break;
          case "skipped":
            counts.skipped++;
            break;
          case "errored":
            counts.errored++;
            errors.push({ email_id: result.email_id, error: result.error });
            break;
        }
      } catch (unexpectedErr) {
        // Should not reach here — processEmail catches internally
        // but safeguard in case of async/runtime errors
        counts.errored++;
        const msg =
          unexpectedErr instanceof Error
            ? unexpectedErr.message
            : String(unexpectedErr);
        errors.push({ email_id: email.email_id, error: msg });
      }
    }

    // Finalise the run record with actual counts
    await finaliseProcessingRun(run.id, {
      total_input: emails.length,
      tasks_created: counts.tasks_created,
      tasks_updated: counts.tasks_updated,
      skipped: counts.skipped,
      errored: counts.errored,
    });

    // Spec §7.1 response shape
    res.status(200).json({
      processed: emails.length,
      tasks_created: counts.tasks_created,
      tasks_updated: counts.tasks_updated,
      skipped: counts.skipped,
      errors,
      run_id: run.id, // bonus field — useful for stats queries by run
    });
  }
);

export default router;
