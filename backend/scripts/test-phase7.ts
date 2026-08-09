/**
 * Phase 7 — Grounded Chat API Tests
 *
 * Verifies the POST /api/chat endpoint with deterministic mocks.
 * Gemini API calls are stubbed to prevent quota usage.
 */

import http from "http";
import app from "../src/app";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ─── Stub Gemini to save quota ────────────────────────────────────────────────

const originalFetch = global.fetch;
global.fetch = async (url, options) => {
  if (typeof url === "string" && url.includes("generativelanguage.googleapis.com")) {
    const bodyStr = options?.body ? String(options.body) : "";
    // console.log("FETCH MOCK BODY:", bodyStr.substring(0, 100)); // uncomment to debug
    
    // Check if this is Pass 1 (Intent) or Pass 2 (Generator)
    if (bodyStr.includes("helpful assistant")) {
      // Pass 2: Generation
      return new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: "Mocked generated answer based on data." }] } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    } else {
      const match = bodyStr.match(/User Query: \\?"(.*?)\\?"/);
      const userQuery = match ? match[1] : "";
      
      let fakeIntent: any = { type: "UNANSWERABLE", unanswerable_reason: "Mock default" };
      
      if (userQuery.includes("proposal or RFP related")) {
        fakeIntent = { type: "CATEGORY_COUNTS" } as any;
      } else if (userQuery.includes("marketing versus actual spam we correctly ignored")) {
        fakeIntent = { type: "CATEGORY_COUNTS" } as any;
      } else if (userQuery.includes("everything sitting in triage and why")) {
        fakeIntent = { type: "TRIAGE_LIST" } as any;
      } else if (userQuery.includes("spurious rate so far")) {
        fakeIntent = { type: "SPURIOUS_RATE" } as any;
      } else if (userQuery.includes("high priority but low confidence")) {
        fakeIntent = { type: "FILTER_TASKS", filter_priority: "high", filter_max_confidence: 0.5 } as any;
      } else if (userQuery.includes("total deal value of all open RFPs")) {
        fakeIntent = { type: "RFP_DEAL_VALUES" } as any;
      } else if (userQuery.includes("updated more than once")) {
        fakeIntent = { type: "THREAD_UPDATES" } as any;
      } else if (userQuery.includes("resellers versus tech integration partners")) {
        fakeIntent = { type: "UNANSWERABLE", unanswerable_reason: "Cannot sub-distinguish alliances." } as any;
      } else if (userQuery.includes("GST refunds")) {
        fakeIntent = { type: "CATEGORY_COUNTS" } as any;
      } else if (userQuery.includes("Send Aarti an email")) {
        fakeIntent = { type: "UNANSWERABLE", unanswerable_reason: "Actions like sending emails are out of scope." } as any;
      }

      return new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: JSON.stringify(fakeIntent) }] } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
  }
  return originalFetch(url, options);
};

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

async function post(path: string, body: unknown) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

const CANDIDATE_ID = "test-phase7@example.com";

async function cleanData() {
  await prisma.taskUpdate.deleteMany({ where: { candidate_id: CANDIDATE_ID } });
  await prisma.threadTaskMap.deleteMany({ where: { candidate_id: CANDIDATE_ID } });
  await prisma.processedEmail.updateMany({ where: { candidate_id: CANDIDATE_ID }, data: { task_id: null } });
  await prisma.task.deleteMany({ where: { candidate_id: CANDIDATE_ID } });
  await prisma.processedEmail.deleteMany({ where: { candidate_id: CANDIDATE_ID } });
  await prisma.processingRun.deleteMany({ where: { candidate_id: CANDIDATE_ID } });
}

async function seedData() {
  const run = await prisma.processingRun.create({
    data: { candidate_id: CANDIDATE_ID, total_input: 3 },
  });
  
  // Create an RFP task
  await prisma.task.create({
    data: {
      task_id: "tsk_rfp1",
      candidate_id: CANDIDATE_ID,
      source_email_id: "em_1",
      thread_id: "th_1",
      title: "RFP",
      assignee_id: "u_aarti",
      category: "enterprise_rfp",
      priority: "high",
      deal_value_inr: 5000000,
      confidence: 0.9,
      processed_emails: {
        create: {
          candidate_id: CANDIDATE_ID,
          source_email_id: "em_1",
          thread_id: "th_1",
          decision: "created",
          run_id: run.id,
        }
      }
    }
  });

  // Create a triage task
  await prisma.task.create({
    data: {
      task_id: "tsk_triage1",
      candidate_id: CANDIDATE_ID,
      source_email_id: "em_2",
      thread_id: "th_2",
      title: "Triage",
      assignee_id: "u_triage",
      category: "triage",
      priority: "low",
      confidence: 0.4,
      processed_emails: {
        create: {
          candidate_id: CANDIDATE_ID,
          source_email_id: "em_2",
          thread_id: "th_2",
          decision: "created",
          reasoning: "Ambiguous request.",
          run_id: run.id,
        }
      }
    }
  });

  // Create a skipped spam email
  await prisma.processedEmail.create({
    data: {
      candidate_id: CANDIDATE_ID,
      source_email_id: "em_3",
      thread_id: "th_3",
      decision: "skipped",
      skip_reason: "spam",
      run_id: run.id,
    }
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

async function runTests() {
  console.log("\n── Phase 7 Grounded Chat API Tests ──────────\n");

  await cleanData();
  await seedData();
  console.log("ℹ️  Seeded Phase 7 test data.");

  let server = http.createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, () => {
      const addr = server.address();
      if (addr && typeof addr === "object") {
        baseUrl = `http://localhost:${addr.port}`;
        resolve();
      }
    });
  });

  // 1. Missing candidate_id
  let res = await post("/api/chat", { query: "hello" });
  if (res.status === 400) ok("Missing candidate_id returns 400.");
  else fail("Failed validation test.", res.body);

  // 2. Category counts
  res = await post("/api/chat", { candidate_id: CANDIDATE_ID, query: "How many emails this batch were proposal or RFP related?" });
  if (res.status === 200 && res.body.supporting_data.enterprise_rfp === 1) {
    ok("Category counts correctly extracted from DB.");
  } else fail("Category counts failed.", res.body);

  // 3. Marketing vs Spam
  res = await post("/api/chat", { candidate_id: CANDIDATE_ID, query: "How many were marketing versus actual spam we correctly ignored?" });
  if (res.status === 200 && res.body.supporting_data.skipped_marketing_lookalike_spam === 1) {
    ok("Spam counts correctly queried.");
  } else fail("Spam counts failed.", res.body);

  // 4. Triage tasks
  res = await post("/api/chat", { candidate_id: CANDIDATE_ID, query: "Show me everything sitting in triage and why." });
  if (res.status === 200 && res.body.supporting_data.triage_count === 1) {
    ok("Triage list correctly queried.");
  } else fail("Triage list failed.", res.body);

  // 5. Spurious rate
  res = await post("/api/chat", { candidate_id: CANDIDATE_ID, query: "What's our spurious rate so far?" });
  if (res.status === 200 && res.body.supporting_data.spurious_rate === 0) {
    ok("Spurious rate accurately reported as 0.");
  } else fail("Spurious rate failed.", res.body);

  // 6. Compound filter
  res = await post("/api/chat", { candidate_id: CANDIDATE_ID, query: "Which tasks are high priority but low confidence?" });
  // In our seed data, triage is low confidence but low priority, rfp is high priority but high confidence.
  if (res.status === 200 && Array.isArray(res.body.supporting_data.matches) && res.body.supporting_data.matches.length === 0) {
    ok("Compound filter returned correct matching tasks (0).");
  } else fail("Compound filter failed.", res.body);

  // 7. Deal values
  res = await post("/api/chat", { candidate_id: CANDIDATE_ID, query: "What's the total deal value of all open RFPs?" });
  if (res.status === 200 && res.body.supporting_data.total_deal_value_inr === 5000000) {
    ok("Deal value summed correctly.");
  } else fail("Deal value failed.", res.body);

  // 8. Zero-match trap
  res = await post("/api/chat", { candidate_id: CANDIDATE_ID, query: "How many emails were about GST refunds?" });
  // The intent matches CATEGORY_COUNTS but the DB returns no data for gst_refunds
  if (res.status === 200 && res.body.supporting_data.enterprise_rfp === 1) { // It returns all category counts
    ok("Zero match trap handles safely (generator sees data).");
  } else fail("Zero match trap failed.", res.body);

  // 9. Out of scope action
  res = await post("/api/chat", { candidate_id: CANDIDATE_ID, query: "Send Aarti an email" });
  if (res.status === 200 && Object.keys(res.body.supporting_data).length === 0) {
    ok("Out of scope action correctly identified as unanswerable (empty data).");
  } else fail("Out of scope failed.", res.body);

  await new Promise<void>((resolve) => server.close(() => resolve()));
  await cleanData();

  console.log(`\n── Result: ${passed} passed, ${failed} failed ──────────────────────────────\n`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
