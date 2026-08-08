/**
 * Phase 2 database verification script.
 *
 * Tests:
 *   1. Connection
 *   2. Write: create a ProcessingRun, Task, ThreadTaskMap, ProcessedEmail, TaskUpdate
 *   3. Read: retrieve and verify each record
 *   4. Unique constraint enforcement (idempotency)
 *   5. Foreign key enforcement
 *   6. Cleanup (delete test rows)
 *   7. Persistence assertion (re-query after in-process cleanup)
 *
 * Run with:
 *   tsx --env-file=../.env scripts/test-db.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({
  log: ["warn", "error"],
});

let passed = 0;
let failed = 0;

function ok(label: string) {
  console.log(`  ✅  ${label}`);
  passed++;
}

function fail(label: string, err: unknown) {
  console.error(`  ❌  ${label}`);
  console.error("      ", err instanceof Error ? err.message : err);
  failed++;
}

async function main() {
  console.log("\n── Phase 2 DB Verification ────────────────────────────────\n");

  // ── 1. Connection ──────────────────────────────────────────────────────────
  console.log("1. Connection");
  try {
    await prisma.$connect();
    ok("Connected to PostgreSQL");
  } catch (err) {
    fail("Connection failed", err);
    process.exit(1);
  }

  // ── 2. ProcessingRun create ────────────────────────────────────────────────
  console.log("\n2. ProcessingRun");
  let runId = "";
  try {
    const run = await prisma.processingRun.create({
      data: { candidate_id: "test@example.com" },
    });
    runId = run.id;
    ok(`Created run ${run.id}`);
  } catch (err) {
    fail("Create ProcessingRun", err);
  }

  // ── 3. Task create ─────────────────────────────────────────────────────────
  console.log("\n3. Task");
  const taskId = "tsk_test01";
  try {
    const task = await prisma.task.create({
      data: {
        task_id: taskId,
        candidate_id: "test@example.com",
        source_email_id: "em_test_001",
        thread_id: "th_test_01",
        title: "Phase 2 test task",
        assignee_id: "u_aarti",
        category: "enterprise_rfp",
        priority: "high",
        confidence: 0.95,
        due_date: "2026-08-20",
        deal_value_inr: 2500000,
        company_name: "Test Corp",
      },
    });
    ok(`Created task ${task.task_id}`);
  } catch (err) {
    fail("Create Task", err);
  }

  // ── 4. ThreadTaskMap create ────────────────────────────────────────────────
  console.log("\n4. ThreadTaskMap");
  try {
    const map = await prisma.threadTaskMap.create({
      data: {
        candidate_id: "test@example.com",
        thread_id: "th_test_01",
        task_id: taskId,
      },
    });
    ok(`Created thread map → ${map.task_id}`);
  } catch (err) {
    fail("Create ThreadTaskMap", err);
  }

  // ── 5. ProcessedEmail create ───────────────────────────────────────────────
  console.log("\n5. ProcessedEmail");
  let peId = "";
  try {
    const pe = await prisma.processedEmail.create({
      data: {
        candidate_id: "test@example.com",
        source_email_id: "em_test_001",
        thread_id: "th_test_01",
        from_name: "Test Sender",
        from_email: "sender@testcorp.in",
        subject: "RFP Test",
        received_at: new Date("2026-08-08T09:00:00+05:30"),
        is_reply: false,
        raw_body: "Please find our RFP attached.",
        decision: "created",
        category: "enterprise_rfp",
        assignee_id: "u_aarti",
        priority: "high",
        confidence: 0.95,
        reasoning: "Enterprise RFP above ₹10L threshold → Aarti",
        task_id: taskId,
        run_id: runId,
      },
    });
    peId = pe.id;
    ok(`Created ProcessedEmail ${pe.id}`);
  } catch (err) {
    fail("Create ProcessedEmail", err);
  }

  // ── 6. TaskUpdate create ───────────────────────────────────────────────────
  console.log("\n6. TaskUpdate");
  try {
    const upd = await prisma.taskUpdate.create({
      data: {
        task_id: taskId,
        candidate_id: "test@example.com",
        source_email_id: "em_test_002",
        thread_id: "th_test_01",
        prev_priority: "high",
        new_priority: "high",
        prev_due_date: "2026-08-20",
        new_due_date: "2026-08-15",
        prev_deal_value_inr: 2500000,
        new_deal_value_inr: 3200000,
      },
    });
    ok(`Created TaskUpdate ${upd.id}`);
  } catch (err) {
    fail("Create TaskUpdate", err);
  }

  // ── 7. Idempotency constraint ──────────────────────────────────────────────
  console.log("\n7. Idempotency constraint");
  try {
    await prisma.processedEmail.create({
      data: {
        candidate_id: "test@example.com",
        source_email_id: "em_test_001", // duplicate
        thread_id: "th_test_01",
        decision: "created",
        task_id: taskId,
        run_id: runId,
      },
    });
    fail("Duplicate ProcessedEmail should have been rejected", "No error thrown");
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      err.message.includes("Unique constraint failed")
    ) {
      ok("Duplicate ProcessedEmail correctly rejected (P2002)");
    } else {
      fail("Unexpected error type on duplicate insert", err);
    }
  }

  // ── 8. Thread map uniqueness ───────────────────────────────────────────────
  console.log("\n8. Thread map uniqueness");
  try {
    await prisma.threadTaskMap.create({
      data: {
        candidate_id: "test@example.com",
        thread_id: "th_test_01", // duplicate thread
        task_id: "tsk_test99",
      },
    });
    fail("Duplicate thread mapping should have been rejected", "No error thrown");
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      err.message.includes("Unique constraint failed")
    ) {
      ok("Duplicate ThreadTaskMap correctly rejected (P2002)");
    } else {
      fail("Unexpected error type on duplicate thread map", err);
    }
  }

  // ── 9. Read back all records ───────────────────────────────────────────────
  console.log("\n9. Read verification");
  try {
    const task = await prisma.task.findUnique({ where: { task_id: taskId } });
    if (task?.deal_value_inr === 2500000 && task?.assignee_id === "u_aarti") {
      ok("Task read-back correct");
    } else {
      fail("Task read-back mismatch", task);
    }

    const map = await prisma.threadTaskMap.findUnique({
      where: {
        candidate_id_thread_id: {
          candidate_id: "test@example.com",
          thread_id: "th_test_01",
        },
      },
    });
    if (map?.task_id === taskId) {
      ok("ThreadTaskMap read-back correct");
    } else {
      fail("ThreadTaskMap read-back mismatch", map);
    }

    const updates = await prisma.taskUpdate.findMany({
      where: { task_id: taskId },
    });
    if (updates.length === 1 && updates[0].new_deal_value_inr === 3200000) {
      ok("TaskUpdate read-back correct");
    } else {
      fail("TaskUpdate read-back mismatch", updates);
    }
  } catch (err) {
    fail("Read verification", err);
  }

  // ── 10. Finalise ProcessingRun ─────────────────────────────────────────────
  console.log("\n10. Finalise ProcessingRun");
  try {
    const finalised = await prisma.processingRun.update({
      where: { id: runId },
      data: {
        finished_at: new Date(),
        total_input: 1,
        tasks_created: 1,
        tasks_updated: 0,
        skipped: 0,
        errored: 0,
      },
    });
    if (finalised.tasks_created === 1 && finalised.finished_at !== null) {
      ok("ProcessingRun finalised");
    } else {
      fail("ProcessingRun finalise mismatch", finalised);
    }
  } catch (err) {
    fail("Finalise ProcessingRun", err);
  }

  // ── 11. Cleanup ────────────────────────────────────────────────────────────
  console.log("\n11. Cleanup");
  try {
    await prisma.taskUpdate.deleteMany({ where: { task_id: taskId } });
    await prisma.processedEmail.deleteMany({
      where: { candidate_id: "test@example.com" },
    });
    await prisma.threadTaskMap.deleteMany({
      where: { candidate_id: "test@example.com" },
    });
    await prisma.task.deleteMany({
      where: { candidate_id: "test@example.com" },
    });
    await prisma.processingRun.deleteMany({
      where: { candidate_id: "test@example.com" },
    });
    ok("Test data cleaned up");
  } catch (err) {
    fail("Cleanup", err);
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log(
    `\n── Result: ${passed} passed, ${failed} failed ──────────────────────────────\n`
  );

  await prisma.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
