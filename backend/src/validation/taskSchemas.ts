/**
 * Zod validation schemas for the Task API.
 *
 * Enum constants are exported so they can be included in validation error
 * responses with the exact `allowed` array the spec requires (§5.1).
 */

import { z } from "zod";

// ─── Enum constants (must match Prisma schema exactly) ────────────────────────

export const ASSIGNEE_IDS = [
  "u_aarti",
  "u_rohit",
  "u_meera",
  "u_karan",
  "u_divya",
  "u_triage",
] as const;

export const CATEGORIES = [
  "enterprise_rfp",
  "smb_enquiry",
  "marketing",
  "alliances",
  "finance",
  "triage",
] as const;

export const PRIORITIES = ["high", "medium", "low"] as const;

// ─── Reusable field schemas ───────────────────────────────────────────────────

const assigneeIdField = z.enum(ASSIGNEE_IDS);
const categoryField = z.enum(CATEGORIES);
const priorityField = z.enum(PRIORITIES);

// ─── POST /tasks ──────────────────────────────────────────────────────────────

export const CreateTaskSchema = z.object({
  candidate_id: z.string().min(1, "candidate_id is required"),
  source_email_id: z.string().min(1, "source_email_id is required"),
  thread_id: z.string().min(1, "thread_id is required"),
  title: z.string().min(1, "title is required"),
  description: z.string().optional(),
  assignee_id: assigneeIdField,
  category: categoryField,
  priority: priorityField,
  due_date: z.string().nullable().optional(),
  deal_value_inr: z.number().int("deal_value_inr must be an integer").nullable().optional(),
  company_name: z.string().nullable().optional(),
  confidence: z
    .number()
    .min(0, "confidence must be ≥ 0.0")
    .max(1, "confidence must be ≤ 1.0"),
});

export type CreateTaskBody = z.infer<typeof CreateTaskSchema>;

// ─── PATCH /tasks/:task_id ────────────────────────────────────────────────────

export const PatchTaskSchema = z
  .object({
    title: z.string().min(1).optional(),
    description: z.string().optional(),
    assignee_id: assigneeIdField.optional(),
    category: categoryField.optional(),
    priority: priorityField.optional(),
    due_date: z.string().nullable().optional(),
    deal_value_inr: z.number().int().nullable().optional(),
    company_name: z.string().nullable().optional(),
    confidence: z.number().min(0).max(1).optional(),
  })
  .strict(); // reject unknown fields to prevent silent no-ops

export type PatchTaskBody = z.infer<typeof PatchTaskSchema>;

// ─── GET /tasks query params ──────────────────────────────────────────────────

export const ListTasksQuerySchema = z.object({
  candidate_id: z.string().min(1, "candidate_id query parameter is required"),
  thread_id: z.string().optional(),
  source_email_id: z.string().optional(),
  assignee_id: assigneeIdField.optional(),
});

export type ListTasksQuery = z.infer<typeof ListTasksQuerySchema>;

// ─── Validation error utilities ───────────────────────────────────────────────

/** Enum field → allowed values map — used to produce the spec's `allowed` array. */
const ENUM_ALLOWED: Record<string, readonly string[]> = {
  assignee_id: ASSIGNEE_IDS,
  category: CATEGORIES,
  priority: PRIORITIES,
};

/**
 * Attempt to convert a ZodError into the spec-required 400 body.
 * Returns the body object, or null if the error is not an enum error.
 *
 * Spec §5.1 exact shape:
 * { "error": "invalid_enum_value", "field": "...", "received": "...", "allowed": [...] }
 */
export function buildEnumErrorBody(
  error: z.ZodError,
  rawBody: Record<string, unknown>
): Record<string, unknown> | null {
  // Find the first invalid_enum_value issue
  const issue = error.issues.find((i) => i.code === "invalid_enum_value");
  if (!issue) return null;

  const field = String(issue.path[0] ?? "");
  const received = rawBody[field];
  const allowed = ENUM_ALLOWED[field] ?? [];

  return {
    error: "invalid_enum_value",
    field,
    received: received ?? null,
    allowed: [...allowed],
  };
}

/**
 * Convert a ZodError into a generic 400 body for non-enum validation failures.
 */
export function buildValidationErrorBody(error: z.ZodError): Record<string, unknown> {
  return {
    error: "validation_error",
    issues: error.issues.map((i) => ({
      field: i.path.join("."),
      message: i.message,
    })),
  };
}
