/**
 * Email classifier — interface and stub implementation.
 *
 * This module defines the contract between the ingestion pipeline and the
 * classification layer. Phase 4 ships a deterministic stub that always routes
 * to u_triage. Phase 5 replaces `classifyEmail()` with a real Gemini call
 * that returns the same ClassificationResult shape — the pipeline code does
 * not change.
 *
 * The stub is intentionally conservative:
 *   - Decision: "create" (not skip) so the pipeline exercises the full path
 *   - Category/assignee: "triage" / "u_triage" (safe fallback)
 *   - Confidence: 0.5 (indicates stub)
 *   - Phase 5 will provide real semantic understanding
 *
 * Skip detection for obvious signals (OOO, newsletters, spam) is implemented
 * here deterministically so Phase 4 ingest tests work correctly without Gemini.
 */

import type { EmailObject } from "../validation/ingestSchemas";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SkipDecision = {
  action: "skip";
  skip_reason: "out_of_office" | "newsletter" | "spam";
  reasoning: string;
};

export type ClassifyDecision = {
  action: "classify";
  category:
    | "enterprise_rfp"
    | "smb_enquiry"
    | "marketing"
    | "alliances"
    | "finance"
    | "triage";
  assignee_id:
    | "u_aarti"
    | "u_rohit"
    | "u_meera"
    | "u_karan"
    | "u_divya"
    | "u_triage";
  priority: "high" | "medium" | "low";
  due_date: string | null;
  deal_value_inr: number | null;
  company_name: string | null;
  confidence: number;
  reasoning: string;
};

export type ClassificationResult = SkipDecision | ClassifyDecision;

// ─── Deterministic skip detection ────────────────────────────────────────────
// These patterns are clear enough to detect without LLM and act as a fast-path
// before the (expensive) Gemini call in Phase 5.

const OOO_PATTERNS = [
  /\bout\s+of\s+(the\s+)?office\b/i,
  /\baway\s+from\s+the\s+office\b/i,
  /\bauto[\s-]?reply\b/i,
  /\bautomatic\s+reply\b/i,
  /\bi\s+am\s+(currently\s+)?(?:out|away|on\s+(?:leave|vacation|holiday))\b/i,
  /\bwill\s+be\s+(?:out|away|back)\b.{0,60}\b(?:office|return|email)\b/i,
  /\blimited\s+access\s+to\s+(my\s+)?email\b/i,
  /\bif\s+(?:this\s+is\s+)?urgent[,.]?\s*(?:please\s+)?contact\b/i,
];

const NEWSLETTER_PATTERNS = [
  /\bunsubscribe\b/i,
  /\bview\s+in\s+(?:your\s+)?browser\b/i,
  /\bweekly\s+(?:newsletter|digest|roundup|edition|issue)\b/i,
  /\bmonthly\s+(?:newsletter|digest|roundup|edition|update)\b/i,
  /\bthis\s+(?:week|month)\s+in\b/i,
  /\bemail\s+preferences\b/i,
  /\byou'?re?\s+receiving\s+this\s+(?:email|newsletter|because)\b/i,
  /\bissue\s+#\d+\b/i,
];

// Vendor spam: email is selling TO us (outbound solicitation)
const SPAM_PATTERNS = [
  /\bwe\s+(?:noticed|found|saw)\s+(?:your\s+)?(?:website|company|linkedin|profile)\b/i,
  /\b(?:we\s+)?help(?:ed)?\s+\d+\+?\s+(?:companies|clients|businesses|startups|brands)\b/i,
  /\b(?:free\s+)?(?:audit|consultation|demo|trial)\s+(?:attached|available|offer)\b/i,
  /\b(?:quick|15[\s-]?min(?:ute)?)[\s-]?call\b/i,
  /\brank(?:ing)?\s+(?:on\s+)?(?:page\s+1|google|search)\b/i,
  /\b(?:organic\s+traffic|seo|lead\s+gen(?:eration)?)\b.{0,80}\b(?:3x|10x|double|triple|increase)\b/i,
  /\bi\s+(?:noticed|came\s+across|saw)\s+(?:your|that\s+you)\b/i,
  /\bwe\s+(?:specialize|specialise)\s+in\b.{0,80}\bfor\s+(?:companies|businesses|you)\b/i,
];

function detectDeterministicSkip(
  email: EmailObject
): SkipDecision | null {
  const textToCheck = [
    email.subject ?? "",
    email.body ?? "",
  ].join(" ");

  // 1. Out of office — check subject first (auto-reply signatures often in subject)
  const subjectOoo = /\bout[\s-]?of[\s-]?office\b|\bauto[\s-]?reply\b|\bautomatic\s+reply\b/i.test(
    email.subject ?? ""
  );
  if (subjectOoo || OOO_PATTERNS.some((p) => p.test(textToCheck))) {
    return {
      action: "skip",
      skip_reason: "out_of_office",
      reasoning:
        "Detected as an auto-reply / out-of-office message. No actionable content.",
    };
  }

  // 2. Newsletter
  if (NEWSLETTER_PATTERNS.some((p) => p.test(textToCheck))) {
    return {
      action: "skip",
      skip_reason: "newsletter",
      reasoning:
        "Detected as a newsletter or automated digest. Not a customer enquiry.",
    };
  }

  // 3. Vendor spam
  if (SPAM_PATTERNS.some((p) => p.test(textToCheck))) {
    return {
      action: "skip",
      skip_reason: "spam",
      reasoning:
        "Detected as unsolicited vendor outreach. Direction of intent is outbound-to-us, not a customer enquiry.",
    };
  }

  return null;
}

// ─── Stub classifier (Phase 4) ────────────────────────────────────────────────

/**
 * Classify a single email.
 *
 * Phase 4: deterministic skip detection + conservative triage stub.
 * Phase 5: replace the triage stub with a Gemini structured-output call.
 *
 * @param email  Parsed and validated email object from the ingest request
 * @returns ClassificationResult — either a skip decision or a full classification
 */
export async function classifyEmail(
  email: EmailObject
): Promise<ClassificationResult> {
  // Fast-path: deterministic skip detection (no LLM needed)
  const skipDecision = detectDeterministicSkip(email);
  if (skipDecision) return skipDecision;

  // STUB — Phase 5 will replace this block with a Gemini call.
  // Conservative default: route to triage with low-medium confidence.
  return {
    action: "classify",
    category: "triage",
    assignee_id: "u_triage",
    priority: "medium",
    due_date: null,
    deal_value_inr: null,
    company_name: null,
    confidence: 0.5,
    reasoning:
      "[STUB] Phase 4 classifier stub — routes all non-skip emails to triage. " +
      "Replace with Gemini call in Phase 5.",
  };
}
