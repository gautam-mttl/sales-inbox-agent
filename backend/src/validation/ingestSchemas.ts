/**
 * Zod validation schemas for POST /ingest.
 *
 * The email object schema matches inbox.json §3.1 exactly.
 * Spec limit: batches up to 100 emails.
 */

import { z } from "zod";

// ─── Single email object (§3.1) ───────────────────────────────────────────────

export const EmailObjectSchema = z.object({
  email_id: z.string().min(1, "email_id is required"),
  thread_id: z.string().min(1, "thread_id is required"),
  message_index: z.number().int().min(0).optional().default(0),
  from_name: z.string().optional().nullable(),
  from_email: z.string().optional().nullable(),
  to: z.string().optional().nullable(),
  cc: z.array(z.string()).optional().nullable(),
  subject: z.string().optional().nullable(),
  body: z.string().optional().nullable(),
  received_at: z.string().optional().nullable(), // ISO 8601 string
  attachments: z.array(z.string()).optional().nullable(),
  is_reply: z.boolean().optional().default(false),
});

export type EmailObject = z.infer<typeof EmailObjectSchema>;

// ─── POST /ingest request body ────────────────────────────────────────────────

export const IngestRequestSchema = z.object({
  candidate_id: z.string().min(1, "candidate_id is required"),
  emails: z
    .array(EmailObjectSchema)
    .min(1, "emails array must not be empty")
    .max(100, "batches are limited to 100 emails per request"),
});

export type IngestRequest = z.infer<typeof IngestRequestSchema>;

// ─── GET /api/tasks query params ──────────────────────────────────────────────

export const ApiTasksQuerySchema = z.object({
  candidate_id: z.string().min(1, "candidate_id is required"),
  decision: z.enum(["created", "updated", "skipped", "errored"]).optional(),
  category: z
    .enum([
      "enterprise_rfp",
      "smb_enquiry",
      "marketing",
      "alliances",
      "finance",
      "triage",
    ])
    .optional(),
  assignee_id: z
    .enum(["u_aarti", "u_rohit", "u_meera", "u_karan", "u_divya", "u_triage"])
    .optional(),
  thread_id: z.string().optional(),
  run_id: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional().default(200),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

export type ApiTasksQuery = z.infer<typeof ApiTasksQuerySchema>;

// ─── GET /api/stats query params ─────────────────────────────────────────────

export const ApiStatsQuerySchema = z.object({
  candidate_id: z.string().min(1, "candidate_id is required"),
});

export type ApiStatsQuery = z.infer<typeof ApiStatsQuerySchema>;
