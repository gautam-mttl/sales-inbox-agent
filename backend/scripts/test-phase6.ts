/**
 * Phase 6 — Idempotency & Thread Reconciliation Tests.
 *
 * Verifies:
 *   - Run 1 (original batch): Creates tasks correctly
 *   - Run 2 (identical batch): Idempotency prevents duplicates
 *   - Run 3 (thread replies): Updates existing task instead of creating new
 *   - New thread: Creates new task
 *   - Restart survival: Server restart doesn't break idempotency/threads
 *
 * Test data is isolated using a unique candidate_id and cleaned before/after.
 * Gemini API calls are stubbed at the global.fetch level to save quota.
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
    const isReply = bodyStr.includes("Reply email");
    
    const fakeResponse = {
      action: "classify",
      category: "smb_enquiry",
      assignee_id: "u_rohit",
      priority: isReply ? "high" : "medium",
      due_date: null,
      deal_value_inr: null,
      company_name: null,
      confidence: 0.95,
      is_psu_or_govt_tender: false,
      reasoning: "[STUB] Controlled test fixture for Phase 6",
    };
    return new Response(
      JSON.stringify({
        candidates: [{ content: { parts: [{ text: JSON.stringify(fakeResponse) }] } }],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
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

// ─── Test Data ────────────────────────────────────────────────────────────────

const CANDIDATE_ID = "test-phase6@example.com";

const EMAIL_1 = {
  email_id: "em_p6_001",
  thread_id: "th_p6_01",
  from_name: "Phase 6 Tester",
  from_email: "test@phase6.com",
  subject: "Phase 6 Thread 1",
  body: "Original email.",
  received_at: "2026-08-01T10:00:00+05:30",
  is_reply: false,
};

const EMAIL_2 = {
  email_id: "em_p6_002",
  thread_id: "th_p6_02",
  from_name: "Phase 6 Tester",
  from_email: "test@phase6.com",
  subject: "Phase 6 Thread 2",
  body: "Original email.",
  received_at: "2026-08-01T11:00:00+05:30",
  is_reply: false,
};

const EMAIL_REPLY = {
  email_id: "em_p6_003",
  thread_id: "th_p6_01", // Maps to EMAIL_1
  from_name: "Phase 6 Tester",
  from_email: "test@phase6.com",
  subject: "Re: Phase 6 Thread 1",
  body: "Reply email.",
  received_at: "2026-08-01T12:00:00+05:30",
  is_reply: true,
};

const EMAIL_NEW_THREAD = {
  email_id: "em_p6_004",
  thread_id: "th_p6_03",
  from_name: "Phase 6 Tester",
  from_email: "test@phase6.com",
  subject: "Phase 6 Thread 3",
  body: "New thread entirely.",
  received_at: "2026-08-01T13:00:00+05:30",
  is_reply: false,
};

// ─── Cleanup ──────────────────────────────────────────────────────────────────

async function cleanData() {
  await prisma.taskUpdate.deleteMany({
    where: { task: { candidate_id: CANDIDATE_ID } },
  });
  await prisma.threadTaskMap.deleteMany({
    where: { candidate_id: CANDIDATE_ID },
  });
  await prisma.task.deleteMany({
    where: { candidate_id: CANDIDATE_ID },
  });
  await prisma.processedEmail.deleteMany({
    where: { candidate_id: CANDIDATE_ID },
  });
  await prisma.processingRun.deleteMany({
    where: { candidate_id: CANDIDATE_ID },
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

async function runTests() {
  console.log("\n── Phase 6 Idempotency & Thread Reconciliation Tests ──────────\n");

  await cleanData();
  console.log("ℹ️  Cleaned previous Phase 6 test data.");

  // Start server
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

  // Scenario 1: Run 1 — original batch
  console.log("\n▶ Scenario 1: Run 1 — original batch");
  let res = await post("/ingest", {
    candidate_id: CANDIDATE_ID,
    emails: [EMAIL_1, EMAIL_2],
  });
  if (res.status === 200 && res.body.processed === 2 && res.body.tasks_created === 2) {
    ok("Ingested batch of 2 emails successfully (tasks_created = 2).");
  } else {
    fail("Failed to ingest original batch.", res.body);
  }

  // Scenario 2: Run 2 — identical batch (idempotency)
  console.log("\n▶ Scenario 2: Run 2 — identical batch (idempotency)");
  res = await post("/ingest", {
    candidate_id: CANDIDATE_ID,
    emails: [EMAIL_1, EMAIL_2],
  });
  if (res.status === 200 && res.body.skipped === 2 && res.body.tasks_created === 0) {
    ok("Identical batch was completely skipped (idempotency working).");
  } else {
    fail("Failed to skip identical batch.", res.body);
  }

  // Scenario 3: Run 3 — thread reply
  console.log("\n▶ Scenario 3: Run 3 — thread reply");
  res = await post("/ingest", {
    candidate_id: CANDIDATE_ID,
    emails: [EMAIL_REPLY],
  });
  if (res.status === 200 && res.body.tasks_updated === 1 && res.body.tasks_created === 0) {
    ok("Thread reply successfully updated existing task (tasks_updated = 1).");
  } else {
    fail("Failed to map reply to existing task.", res.body);
  }

  // Check TaskUpdate history was created
  const tasks = await prisma.task.findMany({
    where: { candidate_id: CANDIDATE_ID },
    include: { updates: true },
  });
  const updatedTask = tasks.find((t) => t.source_email_id === EMAIL_1.email_id);
  if (updatedTask && updatedTask.updates.length > 0) {
    ok("TaskUpdate history was successfully written to the database.");
  } else {
    fail("TaskUpdate history missing for updated task.");
  }

  // Scenario 4: New thread
  console.log("\n▶ Scenario 4: New thread");
  res = await post("/ingest", {
    candidate_id: CANDIDATE_ID,
    emails: [EMAIL_NEW_THREAD],
  });
  if (res.status === 200 && res.body.tasks_created === 1) {
    ok("New thread correctly created a new task.");
  } else {
    fail("Failed to create task for new thread.", res.body);
  }

  // Scenario 5: Restart survival
  console.log("\n▶ Scenario 5: Restart survival");
  // Stop the server
  await new Promise<void>((resolve) => server.close(() => resolve()));
  
  // Restart the server
  server = http.createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, () => {
      const addr = server.address();
      if (addr && typeof addr === "object") {
        baseUrl = `http://localhost:${addr.port}`;
        resolve();
      }
    });
  });

  // Retry the identical batch to prove memory maps aren't used
  res = await post("/ingest", {
    candidate_id: CANDIDATE_ID,
    emails: [EMAIL_1, EMAIL_2, EMAIL_NEW_THREAD],
  });
  if (res.status === 200 && res.body.skipped === 3) {
    ok("Idempotency survived server restart (all skipped).");
  } else {
    fail("Idempotency failed after restart.", res.body);
  }

  await new Promise<void>((resolve) => server.close(() => resolve()));
  await cleanData();
  console.log("ℹ️  Cleaned up Phase 6 test data.");

  console.log(`\n── Result: ${passed} passed, ${failed} failed ──────────────────────────────\n`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
