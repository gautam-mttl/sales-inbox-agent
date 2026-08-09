/**
 * Ingestion pipeline — processes one email at a time.
 *
 * Pipeline steps (per ARCHITECTURE.md §3):
 *   1. Idempotency check  → skip if already processed
 *   2. Thread lookup      → is this a reply or a new thread?
 *   3. Classify           → classifier.ts (stub in Phase 4, Gemini in Phase 5)
 *   4. Rules              → ruleEngine.ts applies deterministic corrections
 *   5. Create / Update / Skip
 *   6. Persist            → processedEmail record (always), task/thread records (if needed)
 *
 * Returns a PerEmailResult for every input email — never silently drops one.
 */

import {
  processedEmailExists,
  createProcessedEmail,
} from "../db/processedEmails";
import { getTaskIdForThread, createThreadMapping } from "../db/threads";
import { createTask, updateTask, getTaskByTaskId } from "../db/tasks";
import { createTaskUpdate } from "../db/taskUpdates";
import { classifyEmail, ClassificationResult } from "./classifier";
import { applyRules } from "./ruleEngine";
import type { EmailObject } from "../validation/ingestSchemas";

// ─── Result types ─────────────────────────────────────────────────────────────

export type PerEmailResult =
  | { email_id: string; decision: "created"; task_id: string }
  | { email_id: string; decision: "updated"; task_id: string }
  | { email_id: string; decision: "skipped"; skip_reason: string }
  | { email_id: string; decision: "errored"; error: string };

// ─── Pipeline ─────────────────────────────────────────────────────────────────

/**
 * Process a single email through the full ingestion pipeline.
 *
 * @param email        Validated email object from the ingest request
 * @param candidate_id Candidate identity (lowercased + trimmed by caller)
 * @param run_id       ProcessingRun.id — FK for the audit trail
 */
export async function processEmail(
  email: EmailObject,
  candidate_id: string,
  run_id: string
): Promise<PerEmailResult> {
  const emailId = email.email_id;

  try {
    // ── Step 1: Idempotency ────────────────────────────────────────────────
    const alreadyProcessed = await processedEmailExists(
      candidate_id,
      emailId
    );
    if (alreadyProcessed) {
      // Return the existing decision without re-processing.
      // The processedEmail record holds the original decision.
      return { email_id: emailId, decision: "skipped", skip_reason: "already_processed" };
    }

    // ── Step 2: Thread lookup ─────────────────────────────────────────────
    const existingTaskId = await getTaskIdForThread(
      candidate_id,
      email.thread_id
    );
    const isReply = existingTaskId !== null || (email.is_reply ?? false);

    // ── Step 3: Classify ──────────────────────────────────────────────────
    const classification: ClassificationResult = await classifyEmail(email);

    // ── Step 4: Apply deterministic rules ────────────────────────────────
    let finalClassification =
      classification.action === "skip"
        ? classification
        : applyRules({
            classification,
            received_at: email.received_at ?? null,
          });

    // ── Step 5: Create / Update / Skip ────────────────────────────────────

    if (finalClassification.action === "skip") {
      // ── SKIP ──────────────────────────────────────────────────────────
      await createProcessedEmail({
        candidate_id,
        source_email_id: emailId,
        thread_id: email.thread_id,
        from_name: email.from_name ?? undefined,
        from_email: email.from_email ?? undefined,
        subject: email.subject ?? undefined,
        received_at: email.received_at ? new Date(email.received_at) : undefined,
        is_reply: isReply,
        raw_body: email.body ?? undefined,
        decision: "skipped",
        skip_reason: finalClassification.skip_reason,
        reasoning: finalClassification.reasoning,
        run_id,
      });

      return {
        email_id: emailId,
        decision: "skipped",
        skip_reason: finalClassification.skip_reason,
      };
    }

    // Classification result for create/update path
    const cls = finalClassification;

    if (isReply && existingTaskId) {
      // ── UPDATE ────────────────────────────────────────────────────────
      // Get the current task state so we can record what changed
      const existingTask = await getTaskByTaskId(existingTaskId);

      // Build patch — only send fields that have changed
      const patch: Parameters<typeof updateTask>[1] = {};
      let hasChanges = false;

      if (existingTask) {
        if (cls.priority !== existingTask.priority) {
          patch.priority = cls.priority;
          hasChanges = true;
        }
        if (cls.due_date !== existingTask.due_date) {
          patch.due_date = cls.due_date;
          hasChanges = true;
        }
        if (cls.deal_value_inr !== existingTask.deal_value_inr) {
          patch.deal_value_inr = cls.deal_value_inr;
          hasChanges = true;
        }
        if (cls.assignee_id !== existingTask.assignee_id) {
          patch.assignee_id = cls.assignee_id;
          hasChanges = true;
        }
        if (cls.company_name !== existingTask.company_name) {
          patch.company_name = cls.company_name;
          hasChanges = true;
        }
        if (Math.abs(cls.confidence - existingTask.confidence) > 0.01) {
          patch.confidence = cls.confidence;
          hasChanges = true;
        }
      }

      if (hasChanges) {
        await updateTask(existingTaskId, patch);
      }

      // Always record the update attempt (even if nothing changed — the email was still processed)
      if (existingTask && hasChanges) {
        await createTaskUpdate({
          task_id: existingTaskId,
          candidate_id,
          source_email_id: emailId,
          thread_id: email.thread_id,
          prev_priority: existingTask.priority,
          new_priority: patch.priority ?? existingTask.priority,
          prev_due_date: existingTask.due_date,
          new_due_date: "due_date" in patch ? patch.due_date : existingTask.due_date,
          prev_deal_value_inr: existingTask.deal_value_inr,
          new_deal_value_inr:
            "deal_value_inr" in patch
              ? patch.deal_value_inr ?? null
              : existingTask.deal_value_inr,
          prev_assignee_id: existingTask.assignee_id,
          new_assignee_id: patch.assignee_id ?? existingTask.assignee_id,
          prev_confidence: existingTask.confidence,
          new_confidence: patch.confidence ?? existingTask.confidence,
          prev_company_name: existingTask.company_name,
          new_company_name:
            "company_name" in patch
              ? patch.company_name ?? null
              : existingTask.company_name,
        });
      }

      await createProcessedEmail({
        candidate_id,
        source_email_id: emailId,
        thread_id: email.thread_id,
        from_name: email.from_name ?? undefined,
        from_email: email.from_email ?? undefined,
        subject: email.subject ?? undefined,
        received_at: email.received_at ? new Date(email.received_at) : undefined,
        is_reply: isReply,
        raw_body: email.body ?? undefined,
        decision: "updated",
        category: cls.category,
        assignee_id: cls.assignee_id,
        priority: cls.priority,
        due_date: cls.due_date,
        deal_value_inr: cls.deal_value_inr,
        company_name: cls.company_name,
        confidence: cls.confidence,
        reasoning: cls.reasoning,
        task_id: existingTaskId,
        run_id,
      });

      return { email_id: emailId, decision: "updated", task_id: existingTaskId };
    } else {
      // ── CREATE ────────────────────────────────────────────────────────
      // Build a title from available fields
      const title = buildTitle(email, cls);

      const newTask = await createTask({
        candidate_id,
        source_email_id: emailId,
        thread_id: email.thread_id,
        title,
        description: cls.reasoning,
        assignee_id: cls.assignee_id,
        category: cls.category,
        priority: cls.priority,
        due_date: cls.due_date,
        deal_value_inr: cls.deal_value_inr,
        company_name: cls.company_name,
        confidence: cls.confidence,
      });

      // Register thread mapping (unless a mapping already exists from a prior run)
      const existingMapping = await getTaskIdForThread(candidate_id, email.thread_id);
      if (!existingMapping) {
        await createThreadMapping(candidate_id, email.thread_id, newTask.task_id);
      }

      await createProcessedEmail({
        candidate_id,
        source_email_id: emailId,
        thread_id: email.thread_id,
        from_name: email.from_name ?? undefined,
        from_email: email.from_email ?? undefined,
        subject: email.subject ?? undefined,
        received_at: email.received_at ? new Date(email.received_at) : undefined,
        is_reply: isReply,
        raw_body: email.body ?? undefined,
        decision: "created",
        category: cls.category,
        assignee_id: cls.assignee_id,
        priority: cls.priority,
        due_date: cls.due_date,
        deal_value_inr: cls.deal_value_inr,
        company_name: cls.company_name,
        confidence: cls.confidence,
        reasoning: cls.reasoning,
        task_id: newTask.task_id,
        run_id,
      });

      return { email_id: emailId, decision: "created", task_id: newTask.task_id };
    }
  } catch (err: unknown) {
    // Never silently drop — record the error and continue
    const errorMessage =
      err instanceof Error ? err.message : String(err);

    // Best-effort persist of the error record
    try {
      await createProcessedEmail({
        candidate_id,
        source_email_id: emailId,
        thread_id: email.thread_id,
        from_name: email.from_name ?? undefined,
        from_email: email.from_email ?? undefined,
        subject: email.subject ?? undefined,
        received_at: email.received_at ? new Date(email.received_at) : undefined,
        decision: "errored",
        error_message: errorMessage,
        run_id,
      });
    } catch {
      // Ignore secondary errors — the primary error is what matters
    }

    return { email_id: emailId, decision: "errored", error: errorMessage };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a task title from email metadata and classification result.
 * Falls back to subject → company+category → generic.
 */
function buildTitle(
  email: EmailObject,
  cls: { category: string; company_name: string | null }
): string {
  if (email.subject && email.subject.trim()) {
    return email.subject.trim().slice(0, 200);
  }
  if (cls.company_name) {
    return `${categoryLabel(cls.category)} — ${cls.company_name}`.slice(0, 200);
  }
  const senderName = email.from_name ?? email.from_email ?? "Unknown";
  return `${categoryLabel(cls.category)} from ${senderName}`.slice(0, 200);
}

function categoryLabel(cat: string): string {
  const labels: Record<string, string> = {
    enterprise_rfp: "Enterprise RFP",
    smb_enquiry: "SMB Enquiry",
    marketing: "Marketing",
    alliances: "Alliances",
    finance: "Finance",
    triage: "Triage",
  };
  return labels[cat] ?? cat;
}
