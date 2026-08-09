/**
 * Deterministic rule engine — applied to LLM classification results.
 *
 * Architecture §6 / §7: Gemini does semantic understanding; the backend applies
 * corrections that can be computed deterministically. Rules run in priority order.
 *
 * Rules (from CHALLENGE_SPEC §4 + MASTER_SPEC):
 *   R1. Deadline ≤ 72 hours of received_at → priority = "high"
 *   R2. Thread reply → update, never create (handled in pipeline, not here)
 *   R3. Government / PSU tender → assignee = u_aarti, category = enterprise_rfp
 *   R4. Skip OOO, newsletters, spam (handled in classifier, not here)
 *
 * Value-based routing (applied when category is NOT already enterprise_rfp/alliances/etc.):
 *   R5. Deal value > ₹10,00,000 → u_aarti (enterprise)
 *   R6. Deal value ≤ ₹10,00,000 → u_rohit (SMB) [only if category is smb_enquiry]
 *
 * NOTE: Rule R3 (PSU/government override) takes precedence over R5/R6.
 * NOTE: Value-based routing only applies when category is enterprise_rfp or smb_enquiry.
 *       It does NOT reassign finance/marketing/alliances tasks even if deal value is stated.
 */

import type { ClassifyDecision } from "./classifier";

// ─── Types ────────────────────────────────────────────────────────────────────

type RuleInput = {
  classification: ClassifyDecision;
  received_at: string | null;
};

type RuleOutput = ClassifyDecision;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Parse a YYYY-MM-DD due_date and return a Date at midnight UTC. */
function parseDueDate(due_date: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(due_date);
  if (!match) return null;
  return new Date(`${due_date}T00:00:00Z`);
}

/** Return true if the due_date is within 72 hours of received_at. */
function isWithin72Hours(
  due_date: string,
  received_at: string | null
): boolean {
  const dueMs = parseDueDate(due_date)?.getTime();
  if (!dueMs) return false;

  const receivedMs = received_at ? Date.parse(received_at) : Date.now();
  if (isNaN(receivedMs)) return false;

  const diffHours = (dueMs - receivedMs) / (1000 * 60 * 60);
  // Due date is a calendar day; treat as end of day (+24h) to avoid edge cases
  return diffHours <= 72;
}

/** Return true if the email looks like a government/PSU tender. */
function isPsuOrGovTender(classification: ClassifyDecision): boolean {
  return (
    classification.category === "enterprise_rfp" &&
    classification.reasoning !== undefined &&
    // Phase 5 Gemini will flag PSU tenders explicitly; in Phase 4 stub this
    // will always be false. The pattern is here for when Phase 5 sets reasoning.
    /\b(?:PSU|government|govt|public\s+sector|bharat|bhel|ntpc|ongc|bpcl|hpcl|iocl|sail|gail|ril|nhai|nhmfc|tender\s+notice)\b/i.test(
      classification.reasoning
    )
  );
}

// ─── Rule engine ──────────────────────────────────────────────────────────────

/**
 * Apply deterministic business rules to a raw classification result.
 *
 * Returns a corrected ClassifyDecision. Input is not mutated.
 */
export function applyRules(input: RuleInput): RuleOutput {
  const c = { ...input.classification };

  // ── R3: PSU / government tender override ──────────────────────────────────
  // Must check before value-based routing (R3 beats R5/R6).
  if (isPsuOrGovTender(c)) {
    c.assignee_id = "u_aarti";
    c.category = "enterprise_rfp";
  }

  // ── R5/R6: Value-based routing for sales categories ───────────────────────
  // Only applies to enterprise_rfp and smb_enquiry — not finance/marketing/etc.
  if (
    (c.category === "enterprise_rfp" || c.category === "smb_enquiry") &&
    c.deal_value_inr !== null
  ) {
    if (c.deal_value_inr > 1_000_000) {
      // > ₹10 lakh → Aarti (enterprise)
      c.assignee_id = "u_aarti";
      c.category = "enterprise_rfp";
    } else {
      // ≤ ₹10 lakh → Rohit (SMB)
      // Only switch if not already overridden by R3
      if (c.assignee_id !== "u_aarti") {
        c.assignee_id = "u_rohit";
        c.category = "smb_enquiry";
      }
    }
  }

  // ── R1: 72-hour deadline → priority = high ────────────────────────────────
  if (c.due_date && isWithin72Hours(c.due_date, input.received_at)) {
    c.priority = "high";
  }

  return c;
}
