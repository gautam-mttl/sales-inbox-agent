import { z } from "zod";

// ─── API Request / Response ───────────────────────────────────────────────────

export const ChatRequestSchema = z.object({
  candidate_id: z.string().email().toLowerCase().trim(),
  query: z.string().min(1),
});
export type ChatRequest = z.infer<typeof ChatRequestSchema>;

export const ChatResponseSchema = z.object({
  answer: z.string(),
  supporting_data: z.record(z.any()),
});
export type ChatResponse = z.infer<typeof ChatResponseSchema>;

// ─── Intent Types ─────────────────────────────────────────────────────────────

export const IntentTypeSchema = z.enum([
  "CATEGORY_COUNTS",
  "TRIAGE_LIST",
  "SPURIOUS_RATE",
  "FILTER_TASKS",
  "RFP_DEAL_VALUES",
  "THREAD_UPDATES",
  "UNANSWERABLE",
]);

export const IntentSchema = z.object({
  type: IntentTypeSchema,
  // Only present for UNANSWERABLE to capture why we cannot answer (e.g., action not allowed, missing data)
  unanswerable_reason: z.string().optional(),
  // For FILTER_TASKS
  filter_priority: z.enum(["low", "medium", "high"]).optional(),
  filter_max_confidence: z.number().optional(),
});
export type Intent = z.infer<typeof IntentSchema>;
