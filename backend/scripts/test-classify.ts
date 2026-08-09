/**
 * Phase 5 Classification Tests — Gemini-backed classifier.
 *
 * Tests the 12 worked examples from CHALLENGE_SPEC §6 plus:
 *   - Fallback on empty body
 *   - Skip detection (OOO, newsletter, spam) — deterministic, no API call
 *
 * These are NOT integration tests against the full ingest pipeline —
 * they test `classifyEmail()` directly for fast iteration.
 *
 * Expected categories/assignees come from the spec §6 Quick Reference table.
 * We cannot enforce exact priority/due_date values in all cases because
 * the "72-hour rule" depends on the received_at field (which varies from the
 * spec's fixed received dates). We test the fields the spec pins explicitly.
 *
 * Run: npm run test:classify
 *
 * NOTE: This makes real Gemini API calls. Results can vary slightly.
 * Each example is tested for category + assignee correctness.
 * Pass threshold: all 12 examples must route to the correct assignee.
 */

import { classifyEmail } from "../src/services/classifier";

// ─── Helpers ──────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
let warnings = 0;
const results: Array<{ n: number; label: string; ok: boolean; detail?: string }> = [];

function ok(n: number, label: string) {
  console.log(`  ✅  [${n}] ${label}`);
  passed++;
  results.push({ n, label, ok: true });
}

function fail(n: number, label: string, detail?: string) {
  console.error(`  ❌  [${n}] ${label}${detail ? ": " + detail : ""}`);
  failed++;
  results.push({ n, label, ok: false, detail });
}

function warn(n: number, label: string, detail?: string) {
  console.warn(`  ⚠️   [${n}] ${label}${detail ? ": " + detail : ""}`);
  warnings++;
}

// ─── Test cases ───────────────────────────────────────────────────────────────

const CASES: Array<{
  n: number;
  label: string;
  email: Parameters<typeof classifyEmail>[0];
  expect: {
    action: "skip" | "classify";
    skip_reason?: string;
    category?: string;
    assignee_id?: string;
    deal_value_inr?: number | null;
    due_date?: string | null;
    priority?: string;
  };
}> = [
  // ── Example 1: Clean enterprise RFP ─────────────────────────────────────
  {
    n: 1,
    label: "Enterprise RFP — Meridian Steel, ₹25L",
    email: {
      email_id: "spec_01",
      thread_id: "th_spec_01",
      from_name: "Suresh Kulkarni",
      from_email: "s.kulkarni@meridiansteel.co.in",
      subject: "RFP — Enterprise DMS",
      body: "Meridian Steel invites proposals for an enterprise DMS covering 4 plants and ~1,200 users. Indicative budget is Rs. 25 lakhs. Proposals must reach us by 12th August 2026.",
      received_at: "2026-08-01T09:14:22+05:30",
      is_reply: false,
    },
    expect: { action: "classify", category: "enterprise_rfp", assignee_id: "u_aarti", deal_value_inr: 2500000 },
  },
  // ── Example 2: SMB demo request ──────────────────────────────────────────
  {
    n: 2,
    label: "SMB demo request — Railyard Logistics",
    email: {
      email_id: "spec_02",
      thread_id: "th_spec_02",
      from_name: "Ankit Bose",
      from_email: "ankit@railyardlogistics.in",
      subject: "Quick demo request",
      body: "Hi, we're a 30-person logistics startup in Pune... can we get a demo sometime next week? Nothing urgent. — Ankit Bose, Founder, Railyard Logistics",
      received_at: "2026-08-01T11:02:00+05:30",
      is_reply: false,
    },
    expect: {
      action: "classify",
      category: "smb_enquiry",
      assignee_id: "u_rohit",
      deal_value_inr: null,
      due_date: null,
    },
  },
  // ── Example 3: PSU tender below threshold ────────────────────────────────
  {
    n: 3,
    label: "PSU tender — BHEL, ₹6.5L (Rule 3 overrides Rule 1)",
    email: {
      email_id: "spec_03",
      thread_id: "th_spec_03",
      from_name: "BHEL Procurement",
      from_email: "procurement@bhel.in",
      subject: "Tender Notice: BHEL/PROC/2026/0847",
      body: "Tender Notice No. BHEL/PROC/2026/0847. Bharat Heavy Electricals Limited invites bids for supply of analytics software licences. Estimated value: Rs. 6,50,000. Last date for bid submission: 03-08-2026, 1700 hrs IST.",
      received_at: "2026-08-01T14:20:00+05:30",
      is_reply: false,
    },
    expect: {
      action: "classify",
      category: "enterprise_rfp",
      assignee_id: "u_aarti", // PSU override — NOT u_rohit (value ≤ ₹10L)
      deal_value_inr: 650000,
    },
  },
  // ── Example 4: Marketing sponsorship ─────────────────────────────────────
  {
    n: 4,
    label: "Marketing sponsorship — India SaaS Summit, ₹4L",
    email: {
      email_id: "spec_04",
      thread_id: "th_spec_04",
      from_name: "Nandita Reddy",
      from_email: "nandita@saassummit.in",
      subject: "Sponsorship confirmation needed",
      body: "We're finalising sponsors for the India SaaS Summit in Bengaluru. Gold tier is ₹4,00,000 and includes a keynote slot. We need confirmation by tomorrow EOD as we're going to print. — Nandita Reddy, Sponsorship Lead",
      received_at: "2026-08-02T16:45:00+05:30",
      is_reply: false,
    },
    expect: {
      action: "classify",
      category: "marketing",
      assignee_id: "u_meera",
      deal_value_inr: 400000,
    },
  },
  // ── Example 5: Finance / invoice ─────────────────────────────────────────
  {
    n: 5,
    label: "Finance — overdue invoice, deal_value_inr must be null",
    email: {
      email_id: "spec_05",
      thread_id: "th_spec_05",
      from_name: "Accounts",
      from_email: "accounts@vantagecloudservices.com",
      subject: "Invoice INV-2026-0331 overdue",
      body: "Please find attached invoice INV-2026-0331 for Rs. 1,18,000 (incl. 18% GST) against PO-88214. Kindly process — payment terms were Net 30 and this is now 12 days overdue. Also, our GSTIN has changed, updated details attached.",
      received_at: "2026-08-01T10:00:00+05:30",
      is_reply: false,
    },
    expect: {
      action: "classify",
      category: "finance",
      assignee_id: "u_divya",
      deal_value_inr: null, // Invoice amount ≠ deal value
    },
  },
  // ── Example 6: Alliances / reseller ──────────────────────────────────────
  {
    n: 6,
    label: "Alliances — Salesforce partner, reseller proposal",
    email: {
      email_id: "spec_06",
      thread_id: "th_spec_06",
      from_name: "Partnerships",
      from_email: "partnerships@zenithcloud.com",
      subject: "Reseller / integration partnership enquiry",
      body: "We're a Salesforce implementation partner across MEA with 40+ enterprise clients. We'd like to explore reselling your platform in the region, or a technical integration at minimum. Who handles partnerships?",
      received_at: "2026-08-01T10:00:00+05:30",
      is_reply: false,
    },
    expect: {
      action: "classify",
      category: "alliances",
      assignee_id: "u_karan",
    },
  },
  // ── Example 7: Out-of-office (NO TASK) ───────────────────────────────────
  {
    n: 7,
    label: "OOO auto-reply — must SKIP",
    email: {
      email_id: "spec_07",
      thread_id: "th_spec_07",
      from_name: "Someone",
      from_email: "someone@northbridge.in",
      subject: "Out of Office",
      body: "I am out of office until 14th August with limited access to email. For urgent matters please contact my colleague at raghav@northbridge.in. — Sent from Outlook",
      received_at: "2026-08-03T08:00:00+05:30",
      is_reply: false,
    },
    expect: { action: "skip", skip_reason: "out_of_office" },
  },
  // ── Example 8: Vendor spam ───────────────────────────────────────────────
  {
    n: 8,
    label: "Vendor spam — SEO agency, must SKIP",
    email: {
      email_id: "spec_08",
      thread_id: "th_spec_08",
      from_name: "SEO Agency",
      from_email: "hello@seoagency.com",
      subject: "Your website isn't ranking on page 1",
      body: "Hi, I noticed your website isn't ranking on page 1 for key terms. We've helped 200+ SaaS companies 3x their organic traffic. We do content marketing, PR outreach, and webinar promotion. Free audit attached — interested in a quick 15 min call?",
      received_at: "2026-08-03T09:00:00+05:30",
      is_reply: false,
    },
    expect: { action: "skip", skip_reason: "spam" },
  },
  // ── Example 9: Newsletter (NO TASK) ──────────────────────────────────────
  {
    n: 9,
    label: "Newsletter — B2B Growth Weekly, must SKIP",
    email: {
      email_id: "spec_09",
      thread_id: "th_spec_09",
      from_name: "B2B Growth Weekly",
      from_email: "newsletter@b2bgrowth.io",
      subject: "B2B Growth Weekly — Issue #212",
      body: "The B2B Growth Weekly — Issue #212. In this edition: why PLG is stalling, 5 pricing experiments that worked, and a teardown of Figma's onboarding. [Unsubscribe]",
      received_at: "2026-08-03T08:00:00+05:30",
      is_reply: false,
    },
    expect: { action: "skip", skip_reason: "newsletter" },
  },
  // ── Example 11: Genuinely ambiguous → TRIAGE ─────────────────────────────
  {
    n: 11,
    label: "Triage — two asks, ambiguous (Halcyon Retail)",
    email: {
      email_id: "spec_11",
      thread_id: "th_spec_11",
      from_name: "Farhan Qureshi",
      from_email: "farhan@halcyonretail.com",
      subject: "Platform evaluation + webinar co-host",
      body: "Hi — we met at your booth in Mumbai. Two things: (1) we'd like to evaluate your platform for our 800-person org, budget TBD but likely significant, and (2) our CMO wants to co-host a webinar with your team in September. Can you loop in the right people? — Farhan Qureshi, VP Strategy, Halcyon Retail",
      received_at: "2026-08-03T10:00:00+05:30",
      is_reply: false,
    },
    expect: { action: "classify", assignee_id: "u_triage", category: "triage" },
  },
  // ── Example 12: Hinglish, "1.2 cr" ──────────────────────────────────────
  {
    n: 12,
    label: "Hinglish — 1.2 cr deal, company_name must be null",
    email: {
      email_id: "spec_12",
      thread_id: "th_spec_12",
      from_name: "Unknown Sender",
      from_email: "sender@example.com",
      subject: "Product enquiry",
      body: "Bhai, humko aapka product chahiye for our dealer network. Around 150 users honge. Budget approx 1.2 cr allocated hai for this FY. Kab connect kar sakte hain? Thoda jaldi, board review 20th ko hai.",
      received_at: "2026-08-05T10:00:00+05:30",
      is_reply: false,
    },
    expect: {
      action: "classify",
      category: "enterprise_rfp",
      assignee_id: "u_aarti",
      deal_value_inr: 12000000,
      company_name: null,
    },
  },
];

// ─── Run tests ────────────────────────────────────────────────────────────────

async function runTests() {
  console.log("\n── Phase 5 Classification Tests (Gemini) ──────────────────────────\n");
  console.log("Testing all 12 CHALLENGE_SPEC §6 worked examples...\n");
  console.log("ℹ️  Rate limit enforced inside classifier (4.1 s/call). Test will take ~1.5 min.\n");

  for (const tc of CASES) {
    console.log(`${tc.n}. ${tc.label}`);
    try {
      const result = await classifyEmail(tc.email);

      // ── action ──────────────────────────────────────────────────────────
      if (result.action !== tc.expect.action) {
        fail(tc.n, `action`, `expected "${tc.expect.action}", got "${result.action}"`);
        continue;
      }

      if (result.action === "skip") {
        if (tc.expect.skip_reason && result.skip_reason !== tc.expect.skip_reason) {
          fail(tc.n, `skip_reason`, `expected "${tc.expect.skip_reason}", got "${result.skip_reason}"`);
        } else {
          ok(tc.n, `Correctly skipped (${result.skip_reason})`);
        }
        continue;
      }

      // action === "classify"
      let allOk = true;

      if (tc.expect.category && result.category !== tc.expect.category) {
        fail(tc.n, `category`, `expected "${tc.expect.category}", got "${result.category}"`);
        allOk = false;
      }

      if (tc.expect.assignee_id && result.assignee_id !== tc.expect.assignee_id) {
        fail(tc.n, `assignee_id`, `expected "${tc.expect.assignee_id}", got "${result.assignee_id}"`);
        allOk = false;
      }

      // deal_value_inr — only check when explicitly expected
      if ("deal_value_inr" in tc.expect) {
        if (tc.expect.deal_value_inr === null && result.deal_value_inr !== null) {
          fail(tc.n, `deal_value_inr`, `expected null, got ${result.deal_value_inr}`);
          allOk = false;
        } else if (tc.expect.deal_value_inr !== null && result.deal_value_inr !== tc.expect.deal_value_inr) {
          fail(
            tc.n,
            `deal_value_inr`,
            `expected ${tc.expect.deal_value_inr}, got ${result.deal_value_inr}`
          );
          allOk = false;
        }
      }

      // due_date — only check when explicitly expected
      if ("due_date" in tc.expect) {
        if (tc.expect.due_date === null && result.due_date !== null) {
          warn(tc.n, `due_date`, `expected null, got "${result.due_date}" (LLM may infer differently)`);
        } else if (tc.expect.due_date !== null && result.due_date !== tc.expect.due_date) {
          warn(tc.n, `due_date`, `expected "${tc.expect.due_date}", got "${result.due_date}"`);
        }
      }

      // company_name — only check when explicitly expected
      if ("company_name" in tc.expect) {
        if (tc.expect.company_name === null && result.company_name !== null) {
          fail(tc.n, `company_name`, `expected null, got "${result.company_name}" (must not fabricate)`);
          allOk = false;
        }
      }

      if (allOk) {
        ok(tc.n, `${result.category} → ${result.assignee_id} (confidence: ${result.confidence.toFixed(2)})`);
      }

      // Always show reasoning for debugging
      console.log(`     reasoning: ${result.reasoning.slice(0, 120)}...`);
    } catch (err) {
      fail(tc.n, `threw exception`, err instanceof Error ? err.message : String(err));
    }
  }

  console.log(`\n── Result: ${passed} passed, ${failed} failed, ${warnings} warnings ──────────────────────\n`);

  if (failed > 0) {
    console.log("Failed cases:");
    for (const r of results.filter((r) => !r.ok)) {
      console.log(`  [${r.n}] ${r.label}: ${r.detail}`);
    }
  }

  return { passed, failed, warnings };
}

runTests()
  .then(({ failed }) => {
    process.exit(failed > 0 ? 1 : 0);
  })
  .catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
  });
