/**
 * Email classifier — Gemini-backed implementation (Phase 5).
 *
 * Architecture:
 *   1. Deterministic skip detection (OOO / newsletter / spam) — no LLM needed
 *   2. Email body pre-processing — strip quoted reply blocks
 *   3. Gemini structured-output call with JSON schema enforcement
 *   4. Zod validation of Gemini response
 *   5. Fallback to u_triage on error/malformed output
 *
 * The pipeline code (ingestionPipeline.ts) and rule engine (ruleEngine.ts) are
 * UNCHANGED — they receive the same ClassificationResult type as before.
 *
 * Retry policy: up to 3 attempts with exponential back-off + jitter.
 * If all attempts fail, the email is classified as triage with confidence 0.3.
 */

import { z } from "zod";
import type { EmailObject } from "../validation/ingestSchemas";
import { getGenAI, getGeminiModel } from "../lib/gemini";
// ─── Public types (unchanged from Phase 4) ────────────────────────────────────

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

// ─── Gemini response schema (Zod) ────────────────────────────────────────────

const CATEGORY_VALUES = [
  "enterprise_rfp",
  "smb_enquiry",
  "marketing",
  "alliances",
  "finance",
  "triage",
] as const;

const ASSIGNEE_VALUES = [
  "u_aarti",
  "u_rohit",
  "u_meera",
  "u_karan",
  "u_divya",
  "u_triage",
] as const;

const PRIORITY_VALUES = ["high", "medium", "low"] as const;

const SKIP_REASON_VALUES = ["out_of_office", "newsletter", "spam"] as const;

/**
 * Schema for the JSON object Gemini must return.
 *
 * Two variants:
 *   action = "skip"     → requires skip_reason, no classification fields
 *   action = "classify" → requires all classification fields
 */
const GeminiResponseSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("skip"),
    skip_reason: z.enum(SKIP_REASON_VALUES),
    reasoning: z.string(),
  }),
  z.object({
    action: z.literal("classify"),
    category: z.enum(CATEGORY_VALUES),
    assignee_id: z.enum(ASSIGNEE_VALUES),
    priority: z.enum(PRIORITY_VALUES),
    due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    deal_value_inr: z.number().int().positive().nullable(),
    company_name: z.string().nullable(),
    confidence: z.number().min(0).max(1),
    reasoning: z.string(),
    is_psu_or_govt_tender: z.boolean().optional().default(false),
  }),
]);

type GeminiResponse = z.infer<typeof GeminiResponseSchema>;

// ─── Deterministic skip detection (fast path, no LLM) ────────────────────────

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

function detectDeterministicSkip(email: EmailObject): SkipDecision | null {
  const textToCheck = [email.subject ?? "", email.body ?? ""].join(" ");

  const subjectOoo =
    /\bout[\s-]?of[\s-]?office\b|\bauto[\s-]?reply\b|\bautomatic\s+reply\b/i.test(
      email.subject ?? ""
    );
  if (subjectOoo || OOO_PATTERNS.some((p) => p.test(textToCheck))) {
    return {
      action: "skip",
      skip_reason: "out_of_office",
      reasoning: "Detected as an auto-reply / out-of-office message. No actionable content.",
    };
  }

  if (NEWSLETTER_PATTERNS.some((p) => p.test(textToCheck))) {
    return {
      action: "skip",
      skip_reason: "newsletter",
      reasoning: "Detected as a newsletter or automated digest. Not a customer enquiry.",
    };
  }

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

// ─── Email body pre-processing ────────────────────────────────────────────────

/**
 * Strip quoted reply blocks from the email body.
 *
 * Patterns covered:
 *   - Gmail/Outlook "On DATE, NAME wrote:" headers
 *   - Lines starting with ">" (standard quote markers)
 *   - "-----Original Message-----" Outlook delimiters
 *   - "From: / Sent: / To: / Subject:" forwarded block headers
 *
 * The clean body is passed to Gemini so it classifies only the new content,
 * not the re-quoted history. This prevents double-counting (spec §6, Example 10).
 */
function stripQuotedContent(body: string): string {
  const lines = body.split("\n");
  const cleanLines: string[] = [];
  let inQuotedBlock = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Detect the start of a quoted block
    if (
      /^-{4,}\s*(?:original\s+message|forwarded\s+message)\s*-{4,}/i.test(trimmed) ||
      /^on\s+.{10,100},\s*.{3,50}\s+wrote:/i.test(trimmed) ||
      /^from:\s+.+\s*\n?\s*sent:\s+/i.test(trimmed)
    ) {
      inQuotedBlock = true;
    }

    if (inQuotedBlock) continue;

    // Skip lines that are pure quote markers
    if (/^>{1,}\s/.test(line) || /^>{3,}$/.test(trimmed)) continue;

    cleanLines.push(line);
  }

  return cleanLines.join("\n").trim();
}

// ─── System prompt ────────────────────────────────────────────────────────────
// We embed the exact JSON format in the prompt rather than using responseJsonSchema.
// responseJsonSchema with discriminated unions causes Gemini to emit empty responses
// when it cannot satisfy both variants simultaneously.

const SYSTEM_PROMPT = `You are an email routing assistant for a B2B software company's sales inbox.
Classify each inbound email and extract key information to route it to the correct team member.

TEAM ROUTING RULES (apply in order):
1. Government/PSU tenders ALWAYS go to u_aarti (enterprise_rfp), regardless of deal value.
2. RFPs, RFIs, tenders, inbound deals ABOVE ₹10,00,000 → u_aarti (enterprise_rfp).
3. Product enquiries, demo requests, deals AT OR BELOW ₹10,00,000 → u_rohit (smb_enquiry).
4. Webinars, event/conference sponsorships, content collaborations, PR/media → u_meera (marketing).
5. Reseller, channel partner, technology integration proposals → u_karan (alliances).
6. Invoices, POs, payment reminders, GST, vendor billing → u_divya (finance).
7. Genuinely ambiguous or cross-domain emails → u_triage (triage).

SKIP RULES — return action:"skip" for:
- Out-of-office auto-replies (skip_reason: "out_of_office")
- Newsletters, digests, automated emails (skip_reason: "newsletter")
- Unsolicited vendor spam selling TO us (skip_reason: "spam")
  CRITICAL: Distinguish direction of intent. An email selling SEO services TO us is spam.
  A company asking to BUY from us is NOT spam even if it mentions marketing topics.

EXTRACTION RULES:
- due_date: YYYY-MM-DD format only. Use null if no specific deadline stated. "Next week" = null.
- deal_value_inr: Parse from body (₹/Rs./lakhs/crores). Integer rupees only.
  Examples: "Rs. 25 lakhs" → 2500000, "1.2 cr" → 12000000, "₹4,00,000" → 400000
  Invoice amounts are NOT deal values → null for finance emails.
  Use null if not clearly a deal/contract value.
- company_name: Extract from body/signature. null if not determinable.
  Do NOT infer from email domain unless unambiguous.
- confidence: 0.0–1.0. Triage ≤ 0.6. Clear-cut ≥ 0.8.
- is_psu_or_govt_tender: true only for government/PSU senders.

PRIORITY RULES:
- high: deadline within 72 hours of received_at, OR overdue payment.
- medium: deadline > 72h, OR urgency without a date.
- low: no deadline, no urgency.

IMPORTANT:
- Focus ONLY on the new/current message. Ignore quoted reply blocks.
- Never fabricate company_name, deal_value_inr, or due_date.
- Sponsorship request asking US to sponsor = marketing (not spam).
- Vendor selling services TO us = spam.

OUTPUT FORMAT — respond with ONLY valid JSON, no markdown, no explanation.

For skip:
{"action":"skip","skip_reason":"out_of_office|newsletter|spam","reasoning":"..."}

For classification:
{"action":"classify","category":"enterprise_rfp|smb_enquiry|marketing|alliances|finance|triage","assignee_id":"u_aarti|u_rohit|u_meera|u_karan|u_divya|u_triage","priority":"high|medium|low","due_date":"YYYY-MM-DD or null","deal_value_inr":number_or_null,"company_name":"string or null","confidence":0.0_to_1.0,"is_psu_or_govt_tender":false,"reasoning":"..."}`;

// ─── Prompt builder ───────────────────────────────────────────────────────────

function buildPrompt(email: EmailObject, cleanBody: string): string {
  const meta = [
    email.from_name ? `From: ${email.from_name} <${email.from_email ?? ""}>` : null,
    email.subject ? `Subject: ${email.subject}` : null,
    email.received_at ? `Received: ${email.received_at}` : null,
    email.is_reply ? `Is reply: true (same thread as previous email)` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return `${meta}\n\nEmail body:\n${cleanBody || "[No body content]"}`;
}

// ─── Retry with server-aware backoff ─────────────────────────────────────────

/**
 * Parse the retryDelay from a Gemini 429 error body if present.
 * The error detail contains: { "@type": "type.googleapis.com/google.rpc.RetryInfo", "retryDelay": "42s" }
 */
function parseRetryDelayMs(err: unknown): number | null {
  try {
    const errStr = err instanceof Error ? err.message : String(err);
    const match = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)\s*s"/i.exec(errStr);
    if (match) return Math.ceil(parseFloat(match[1]) * 1000) + 500; // +500ms buffer
  } catch {
    // ignore parse errors
  }
  return null;
}

function is429(err: unknown): boolean {
  const errStr = err instanceof Error ? err.message : String(err);
  return errStr.includes('"code":429') || errStr.includes("RESOURCE_EXHAUSTED");
}

async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseDelayMs = 2000
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts - 1) {
        let delay: number;
        if (is429(err)) {
          // Respect the server's retry window — do not use short backoff on rate limits
          const serverDelay = parseRetryDelayMs(err);
          delay = serverDelay ?? Math.min(baseDelayMs * Math.pow(2, attempt), 60_000);
          console.warn(
            `[classifier] Rate limited (429). Waiting ${Math.round(delay / 1000)}s before retry ${attempt + 2}/${maxAttempts}...`
          );
        } else {
          const jitter = Math.random() * 500;
          delay = baseDelayMs * Math.pow(2, attempt) + jitter;
        }
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

// ─── Fallback decision ────────────────────────────────────────────────────────

function fallbackDecision(reason: string): ClassifyDecision {
  return {
    action: "classify",
    category: "triage",
    assignee_id: "u_triage",
    priority: "medium",
    due_date: null,
    deal_value_inr: null,
    company_name: null,
    confidence: 0.3,
    reasoning: `Classification failed — falling back to triage. Reason: ${reason}`,
  };
}

// ─── Rate limiter ─────────────────────────────────────────────────────────────
// Enforce ≤ 12 RPM (one slot per 5000 ms) to stay conservatively under the 15 RPM
// free-tier limit. The limiter is module-scoped so ALL callers (test scripts,
// ingest batches) share the same queue and never race each other.

const RATE_LIMIT_INTERVAL_MS = 5000; // 5.0 s between calls → 12 RPM
let _lastCallTime = 0;

async function acquireRateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - _lastCallTime;
  if (elapsed < RATE_LIMIT_INTERVAL_MS) {
    const wait = RATE_LIMIT_INTERVAL_MS - elapsed;
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
  _lastCallTime = Date.now();
}

// ─── Main classifier ──────────────────────────────────────────────────────────

/**
 * Classify a single email using Gemini.
 *
 * Steps:
 *   1. Deterministic skip detection (no LLM)
 *   2. Strip quoted content from body
 *   3. Call Gemini with structured output schema
 *   4. Validate response with Zod
 *   5. Return ClassificationResult
 *   6. On error: fallback to triage with confidence 0.3
 *
 * @param email Validated email object from the ingest request
 */
export async function classifyEmail(email: EmailObject): Promise<ClassificationResult> {
  // ── Step 1: Deterministic fast-path ────────────────────────────────────────
  const skipDecision = detectDeterministicSkip(email);
  if (skipDecision) return skipDecision;

  // ── Step 2: Pre-process body ───────────────────────────────────────────────
  const cleanBody = stripQuotedContent(email.body ?? "");
  const prompt = buildPrompt(email, cleanBody);

  // ── Step 3+4: Gemini call with retries ────────────────────────────────────
  try {
    const raw = await withRetry(async () => {
      // Enforce rate limit before every attempt (including retries)
      await acquireRateLimit();

      const genAI = getGenAI();
      const modelName = getGeminiModel();

      // Use the v1 stable SDK pattern:
      //   getGenerativeModel → model.generateContent(fullPrompt)
      // System instructions are prepended to the user message — the most
      // reliable approach that works across all SDK versions and models.
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json",
        },
      });

      const fullPrompt = `${SYSTEM_PROMPT}\n\n---\n\nEmail to classify:\n${prompt}`;
      const result = await model.generateContent(fullPrompt);
      const text = result.response.text();

      if (!text || text.trim() === "") {
        throw new Error("Gemini returned empty response");
      }
      return text;
    });

    // ── Step 4: Parse and validate ──────────────────────────────────────────
    // Strip markdown code fences that some models wrap around JSON
    const jsonText = raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/, "")
      .trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      throw new Error(`Gemini response was not valid JSON: ${jsonText.slice(0, 200)}`);
    }

    const validated = GeminiResponseSchema.safeParse(parsed);
    if (!validated.success) {
      // Log the issues for debugging but don't crash — fall through to fallback
      const issues = validated.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
      throw new Error(`Gemini response failed schema validation: ${issues}`);
    }

    const result = validated.data;

    // ── Step 5: Shape into ClassificationResult ────────────────────────────
    if (result.action === "skip") {
      return {
        action: "skip",
        skip_reason: result.skip_reason,
        reasoning: result.reasoning,
      };
    }

    // Annotate reasoning with PSU flag for rule engine
    const reasoning =
      result.is_psu_or_govt_tender
        ? `[PSU/GOV] ${result.reasoning}`
        : result.reasoning;

    return {
      action: "classify",
      category: result.category,
      assignee_id: result.assignee_id,
      priority: result.priority,
      due_date: result.due_date ?? null,
      deal_value_inr: result.deal_value_inr ?? null,
      company_name: result.company_name ?? null,
      confidence: result.confidence,
      reasoning,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[classifier] Gemini error for ${email.email_id}: ${msg}`);
    return fallbackDecision(msg);
  }
}
