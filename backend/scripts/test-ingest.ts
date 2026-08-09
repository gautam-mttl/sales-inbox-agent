/**
 * Phase 4 Application API integration test.
 *
 * Starts the Express server on an ephemeral port.
 * Uses native fetch (Node 22).
 *
 * Test scenarios:
 *   1.  POST /ingest — validation: missing candidate_id → 400
 *   2.  POST /ingest — validation: batch > 100 → 400
 *   3.  POST /ingest — 3 new emails → tasks_created: 3 (stub classifier → triage)
 *   4.  POST /ingest — same batch again → idempotency (all skipped)
 *   5.  POST /ingest — skip signals (OOO, newsletter, spam) → skipped: 3
 *   6.  POST /ingest — thread reply (same thread_id) → tasks_updated: 1
 *   7.  GET  /api/tasks — requires candidate_id
 *   8.  GET  /api/tasks — returns all items (created + skipped)
 *   9.  GET  /api/tasks — filter by decision=skipped
 *   10. GET  /api/tasks — filter by decision=created
 *   11. GET  /api/stats — overall totals correct
 *   12. GET  /api/stats — by_category breakdown present
 *   13. GET  /api/stats — by_skip_reason breakdown present
 *   14. GET  /api/stats — runs array has at least 3 entries (3 ingest calls)
 *   15. GET  /tasks (raw Task API) — tasks visible via raw API too
 *   16. Cleanup: delete all test tasks via DELETE /tasks/:task_id
 *
 * Run: npm run test:ingest
 */

import http from "http";
import app from "../src/app";

// ─── Helpers ──────────────────────────────────────────────────────────────────

let baseUrl = "";
let passed = 0;
let failed = 0;

function ok(label: string) {
  console.log(`  ✅  ${label}`);
  passed++;
}

function fail(label: string, detail?: unknown) {
  console.error(`  ❌  ${label}`);
  if (detail !== undefined) console.error("      ", JSON.stringify(detail, null, 2));
  failed++;
}

async function get(path: string) {
  const res = await fetch(`${baseUrl}${path}`);
  return { status: res.status, body: await res.json() };
}

async function post(path: string, body: unknown) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

async function del(path: string) {
  const res = await fetch(`${baseUrl}${path}`, { method: "DELETE" });
  return res.status;
}

// ─── Test data ────────────────────────────────────────────────────────────────

const CANDIDATE_ID = "test-phase4@example.com";

const EMAIL_1 = {
  email_id: "em_p4_001",
  thread_id: "th_p4_01",
  from_name: "Suresh Kulkarni",
  from_email: "s.kulkarni@meridiansteel.co.in",
  subject: "RFP — Enterprise DMS for Meridian Steel",
  body: "Dear Team, Meridian Steel invites proposals for an enterprise DMS. Budget: Rs. 25 lakhs.",
  received_at: "2026-08-01T09:14:22+05:30",
  is_reply: false,
};

const EMAIL_2 = {
  email_id: "em_p4_002",
  thread_id: "th_p4_02",
  from_name: "Ankit Bose",
  from_email: "ankit@railyard.in",
  subject: "Quick demo request",
  body: "Hi, can we get a demo sometime next week? Nothing urgent.",
  received_at: "2026-08-01T11:02:00+05:30",
  is_reply: false,
};

const EMAIL_3 = {
  email_id: "em_p4_003",
  thread_id: "th_p4_03",
  from_name: "Nandita Reddy",
  from_email: "nandita@saassummit.in",
  subject: "Sponsorship confirmation needed",
  body: "We are finalising sponsors for the India SaaS Summit. Gold tier is ₹4,00,000.",
  received_at: "2026-08-02T16:45:00+05:30",
  is_reply: false,
};

const EMAIL_OOO = {
  email_id: "em_p4_004",
  thread_id: "th_p4_04",
  from_name: "Someone",
  from_email: "away@example.com",
  subject: "Out of Office: Re: Demo",
  body: "I am out of office until 14th August with limited access to email. For urgent matters contact raghav@northbridge.in.",
  received_at: "2026-08-03T08:00:00+05:30",
  is_reply: false,
};

const EMAIL_NEWSLETTER = {
  email_id: "em_p4_005",
  thread_id: "th_p4_05",
  from_name: "B2B Growth Weekly",
  from_email: "newsletter@b2bgrowth.io",
  subject: "B2B Growth Weekly — Issue #212",
  body: "The B2B Growth Weekly — Issue #212. In this edition: PLG stalling, 5 pricing experiments. [Unsubscribe]",
  received_at: "2026-08-03T08:00:00+05:30",
  is_reply: false,
};

const EMAIL_SPAM = {
  email_id: "em_p4_006",
  thread_id: "th_p4_06",
  from_name: "SEO Agency",
  from_email: "hello@seoagency.com",
  subject: "Quick question about your website",
  body: "Hi, I noticed your website isn't ranking on page 1. We've helped 200+ SaaS companies 3x their organic traffic. Free audit attached — interested in a quick 15 min call?",
  received_at: "2026-08-03T09:00:00+05:30",
  is_reply: false,
};

const EMAIL_REPLY = {
  email_id: "em_p4_007",
  thread_id: "th_p4_01", // same thread as EMAIL_1 → should UPDATE not create
  from_name: "Suresh Kulkarni",
  from_email: "s.kulkarni@meridiansteel.co.in",
  subject: "Re: RFP — Enterprise DMS for Meridian Steel",
  body: "Correction: the board has approved an increased budget of Rs. 32 lakhs, and the submission deadline is now 11th August 2026. Apologies for the change.\n\n> Original: Meridian Steel invites proposals...",
  received_at: "2026-08-09T09:00:00+05:30",
  is_reply: true,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

async function runTests() {
  // 1. Missing candidate_id
  console.log("\n1. POST /ingest — missing candidate_id");
  {
    const r = await post("/ingest", { emails: [EMAIL_1] });
    if (r.status === 400) ok("Returns 400 when candidate_id missing");
    else fail("Expected 400", r.body);
  }

  // 2. Batch > 100
  console.log("\n2. POST /ingest — batch exceeds 100");
  {
    const bigBatch = Array.from({ length: 101 }, (_, i) => ({
      email_id: `em_big_${i}`,
      thread_id: `th_big_${i}`,
    }));
    const r = await post("/ingest", { candidate_id: CANDIDATE_ID, emails: bigBatch });
    if (r.status === 400) ok("Returns 400 for >100 emails");
    else fail("Expected 400", r.body);
  }

  // 3. First batch — 3 new emails
  console.log("\n3. POST /ingest — 3 new emails");
  {
    const r = await post("/ingest", {
      candidate_id: CANDIDATE_ID,
      emails: [EMAIL_1, EMAIL_2, EMAIL_3],
    });
    if (r.status === 200) ok("Returns 200");
    else fail("Expected 200", r.body);

    if (r.body.processed === 3) ok("processed === 3");
    else fail("Expected processed: 3", r.body);

    if (r.body.tasks_created === 3) ok("tasks_created === 3 (stub routes all to triage)");
    else fail("Expected tasks_created: 3", r.body);

    if (r.body.tasks_updated === 0) ok("tasks_updated === 0");
    else fail("Expected tasks_updated: 0", r.body);

    if (r.body.skipped === 0) ok("skipped === 0");
    else fail("Expected skipped: 0", r.body);

    if (Array.isArray(r.body.errors) && r.body.errors.length === 0) ok("errors array is empty");
    else fail("Expected empty errors array", r.body);

    if (r.body.run_id) ok(`run_id present: ${r.body.run_id}`);
    else fail("Expected run_id in response", r.body);
  }

  // 4. Same batch again — idempotency
  console.log("\n4. POST /ingest — same batch (idempotency)");
  {
    const r = await post("/ingest", {
      candidate_id: CANDIDATE_ID,
      emails: [EMAIL_1, EMAIL_2, EMAIL_3],
    });
    if (r.status === 200) ok("Returns 200");
    else fail("Expected 200", r.body);

    if (r.body.processed === 3 && r.body.tasks_created === 0 && r.body.skipped === 3) {
      ok("Idempotent: all 3 emails skipped (already_processed)");
    } else {
      fail("Idempotency failed", {
        tasks_created: r.body.tasks_created,
        skipped: r.body.skipped,
      });
    }
  }

  // 5. Skip signals batch
  console.log("\n5. POST /ingest — 3 skip signals (OOO, newsletter, spam)");
  {
    const r = await post("/ingest", {
      candidate_id: CANDIDATE_ID,
      emails: [EMAIL_OOO, EMAIL_NEWSLETTER, EMAIL_SPAM],
    });
    if (r.status === 200) ok("Returns 200");
    else fail("Expected 200", r.body);

    if (r.body.processed === 3) ok("processed === 3");
    else fail("Expected processed: 3", r.body);

    if (r.body.tasks_created === 0) ok("tasks_created === 0 (all skipped)");
    else fail("Expected tasks_created: 0", r.body);

    if (r.body.skipped === 3) ok("skipped === 3");
    else fail("Expected skipped: 3", r.body);
  }

  // 6. Thread reply → update
  console.log("\n6. POST /ingest — thread reply → tasks_updated");
  {
    const r = await post("/ingest", {
      candidate_id: CANDIDATE_ID,
      emails: [EMAIL_REPLY],
    });
    if (r.status === 200) ok("Returns 200");
    else fail("Expected 200", r.body);

    if (r.body.tasks_updated === 1) ok("tasks_updated === 1");
    else fail("Expected tasks_updated: 1", r.body);

    if (r.body.tasks_created === 0) ok("tasks_created === 0 (reply, not new task)");
    else fail("Expected tasks_created: 0", r.body);
  }

  // 7. GET /api/tasks — missing candidate_id
  console.log("\n7. GET /api/tasks — missing candidate_id");
  {
    const r = await get("/api/tasks");
    if (r.status === 400) ok("Returns 400 when candidate_id missing");
    else fail("Expected 400", r.body);
  }

  // 8. GET /api/tasks — all items
  console.log("\n8. GET /api/tasks — all items");
  {
    const r = await get(`/api/tasks?candidate_id=${encodeURIComponent(CANDIDATE_ID)}`);
    if (r.status === 200) ok("Returns 200");
    else fail("Expected 200", r.body);

    if (typeof r.body.total === "number" && r.body.total > 0) {
      ok(`total: ${r.body.total} items (includes skipped)`);
    } else {
      fail("Expected total > 0", r.body);
    }

    if (Array.isArray(r.body.items)) ok("items is an array");
    else fail("items missing", r.body);

    // Should include skipped items — key difference from /tasks
    const skippedItems = r.body.items?.filter((i: { decision: string }) => i.decision === "skipped") ?? [];
    if (skippedItems.length > 0) ok(`Includes ${skippedItems.length} skipped items`);
    else fail("Expected skipped items in /api/tasks", r.body.items?.map((i: { decision: string }) => i.decision));
  }

  // 9. GET /api/tasks — filter by decision=skipped
  console.log("\n9. GET /api/tasks?decision=skipped");
  {
    const r = await get(`/api/tasks?candidate_id=${encodeURIComponent(CANDIDATE_ID)}&decision=skipped`);
    if (r.status === 200) ok("Returns 200");
    else fail("Expected 200", r.body);

    const allSkipped = r.body.items?.every((i: { decision: string }) => i.decision === "skipped");
    if (allSkipped) ok("All items have decision=skipped");
    else fail("Non-skipped items returned", r.body.items?.map((i: { decision: string }) => i.decision));
  }

  // 10. GET /api/tasks — filter by decision=created
  console.log("\n10. GET /api/tasks?decision=created");
  {
    const r = await get(`/api/tasks?candidate_id=${encodeURIComponent(CANDIDATE_ID)}&decision=created`);
    if (r.status === 200) ok("Returns 200");
    else fail("Expected 200", r.body);

    if (r.body.items?.length > 0) ok(`${r.body.items.length} created items returned`);
    else fail("Expected created items", r.body);

    // All should have task_id (not null)
    const allHaveTaskId = r.body.items?.every((i: { task_id: string | null }) => i.task_id !== null);
    if (allHaveTaskId) ok("All created items have task_id");
    else fail("Some created items missing task_id", r.body.items);
  }

  // 11. GET /api/stats — overall totals
  console.log("\n11. GET /api/stats — overall totals");
  {
    const r = await get(`/api/stats?candidate_id=${encodeURIComponent(CANDIDATE_ID)}`);
    if (r.status === 200) ok("Returns 200");
    else fail("Expected 200", r.body);

    if (r.body.total_processed >= 7) ok(`total_processed: ${r.body.total_processed}`);
    else fail("Expected total_processed ≥ 7", r.body);

    if (r.body.tasks_created >= 3) ok(`tasks_created: ${r.body.tasks_created}`);
    else fail("Expected tasks_created ≥ 3", r.body);

    if (r.body.tasks_updated >= 1) ok(`tasks_updated: ${r.body.tasks_updated}`);
    else fail("Expected tasks_updated ≥ 1", r.body);

    if (r.body.skipped >= 3) ok(`skipped: ${r.body.skipped} (3 OOO/newsletter/spam signals)`);
    else fail("Expected skipped ≥ 3", r.body);
  }

  // 12. GET /api/stats — by_category
  console.log("\n12. GET /api/stats — by_category");
  {
    const r = await get(`/api/stats?candidate_id=${encodeURIComponent(CANDIDATE_ID)}`);
    if (r.body.by_category && typeof r.body.by_category === "object") {
      ok("by_category is present");
      if (r.body.by_category["triage"] >= 3) {
        ok(`by_category.triage: ${r.body.by_category["triage"]} (stub routes to triage)`);
      } else {
        fail("Expected triage ≥ 3 in by_category", r.body.by_category);
      }
    } else {
      fail("by_category missing", r.body);
    }
  }

  // 13. GET /api/stats — by_skip_reason
  console.log("\n13. GET /api/stats — by_skip_reason");
  {
    const r = await get(`/api/stats?candidate_id=${encodeURIComponent(CANDIDATE_ID)}`);
    if (r.body.by_skip_reason && typeof r.body.by_skip_reason === "object") {
      ok("by_skip_reason is present");
      const reasons = r.body.by_skip_reason;
      if (reasons["out_of_office"] >= 1) ok(`out_of_office: ${reasons["out_of_office"]}`);
      else fail("Expected out_of_office ≥ 1", reasons);

      if (reasons["newsletter"] >= 1) ok(`newsletter: ${reasons["newsletter"]}`);
      else fail("Expected newsletter ≥ 1", reasons);

      if (reasons["spam"] >= 1) ok(`spam: ${reasons["spam"]}`);
      else fail("Expected spam ≥ 1", reasons);
    } else {
      fail("by_skip_reason missing", r.body);
    }
  }

  // 14. GET /api/stats — runs breakdown
  console.log("\n14. GET /api/stats — runs array");
  {
    const r = await get(`/api/stats?candidate_id=${encodeURIComponent(CANDIDATE_ID)}`);
    if (Array.isArray(r.body.runs) && r.body.runs.length >= 4) {
      ok(`runs has ${r.body.runs.length} entries`);
    } else {
      fail(`Expected runs.length ≥ 4 (4 ingest calls)`, { actual: r.body.runs?.length });
    }
    const allHaveId = r.body.runs?.every((run: { run_id: string }) => run.run_id);
    if (allHaveId) ok("All runs have run_id");
    else fail("Some runs missing run_id", r.body.runs);
  }

  // 15. Raw /tasks API also has the tasks
  console.log("\n15. GET /tasks — tasks visible in raw Task API");
  {
    const r = await get(`/tasks?candidate_id=${encodeURIComponent(CANDIDATE_ID)}`);
    if (r.status === 200 && r.body.tasks?.length >= 3) {
      ok(`Raw Task API returns ${r.body.tasks.length} tasks`);
    } else {
      fail("Expected ≥ 3 tasks in raw /tasks", r.body);
    }
    // All stub-created tasks should be triage
    const allTriage = r.body.tasks?.every((t: { category: string }) => t.category === "triage");
    if (allTriage) ok("All tasks are category=triage (stub classifier working)");
    else fail("Non-triage tasks from stub", r.body.tasks?.map((t: { task_id: string; category: string }) => ({ id: t.task_id, cat: t.category })));
  }

  // 16. Cleanup
  console.log("\n16. Cleanup");
  {
    const tasksRes = await get(`/tasks?candidate_id=${encodeURIComponent(CANDIDATE_ID)}`);
    const taskIds: string[] = tasksRes.body.tasks?.map((t: { task_id: string }) => t.task_id) ?? [];
    for (const task_id of taskIds) {
      await del(`/tasks/${task_id}`);
    }
    // Also clean up processed_emails and runs for this test candidate
    // (done via DB script if needed; tasks delete cascades the rest)
    ok(`Cleaned up ${taskIds.length} tasks`);
  }

  return { passed, failed };
}

// ─── Server bootstrap ─────────────────────────────────────────────────────────

const server = http.createServer(app);
server.listen(0, async () => {
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  baseUrl = `http://localhost:${port}`;

  console.log(`\n── Phase 4 Application API Tests — server on ${baseUrl} ──────────\n`);

  try {
    const { passed, failed } = await runTests();
    console.log(
      `\n── Result: ${passed} passed, ${failed} failed ──────────────────────────────\n`
    );
    server.close(() => process.exit(failed > 0 ? 1 : 0));
  } catch (err) {
    console.error("Fatal:", err);
    server.close(() => process.exit(1));
  }
});
