/**
 * Phase 3 Task API integration test.
 *
 * Starts the Express app on an ephemeral port, runs HTTP tests against it,
 * then shuts it down. Uses Node 22's built-in fetch — no extra dependencies.
 *
 * Tests:
 *   1.  GET  /users              → 200, team array with 6 members
 *   2.  POST /tasks              → 201, spec-shape response
 *   3.  POST /tasks (bad enum)   → 400, spec-shape error body
 *   4.  POST /tasks (missing req)→ 400, validation_error
 *   5.  GET  /tasks              → 200, includes created task
 *   6.  GET  /tasks/:task_id     → 200, full task object
 *   7.  GET  /tasks (filter)     → 200, correct filtering by assignee_id
 *   8.  GET  /tasks (filter)     → 200, correct filtering by thread_id
 *   9.  PATCH /tasks/:task_id    → 200, returns updated task
 *   10. PATCH /tasks/:task_id (bad enum) → 400, spec-shape error
 *   11. PATCH /tasks/:task_id (empty body) → 400
 *   12. PATCH /tasks/:task_id (unknown field) → 400 (strict schema)
 *   13. GET  /tasks/:task_id/history → 200, no updates yet (PATCH did enum test only)
 *   14. POST /tasks (duplicate)  → 409
 *   15. GET  /tasks/:task_id (not found) → 404
 *   16. PATCH /tasks/:task_id (not found) → 404
 *   17. DELETE /tasks/:task_id   → 204
 *   18. GET  /tasks after delete → 200, task gone
 *   19. DELETE /tasks/:task_id (already gone) → 404
 *
 * Run: npm run test:tasks
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

async function patch(path: string, body: unknown) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

async function del(path: string) {
  const res = await fetch(`${baseUrl}${path}`, { method: "DELETE" });
  return { status: res.status, body: res.status === 204 ? null : await res.json() };
}

// ─── Test data ────────────────────────────────────────────────────────────────

const CANDIDATE_ID = process.env.CANDIDATE_ID ?? "test-phase3@example.com";

const TASK_PAYLOAD = {
  candidate_id: CANDIDATE_ID,
  source_email_id: "em_phase3_001",
  thread_id: "th_phase3_01",
  title: "Phase 3 test: RFP from Meridian Steel",
  description: "Test task created during Phase 3 verification",
  assignee_id: "u_aarti",
  category: "enterprise_rfp",
  priority: "high",
  due_date: "2026-08-20",
  deal_value_inr: 2500000,
  company_name: "Meridian Steel",
  confidence: 0.91,
};

const TASK_PAYLOAD_2 = {
  ...TASK_PAYLOAD,
  source_email_id: "em_phase3_002",
  thread_id: "th_phase3_02",
  assignee_id: "u_rohit",
  category: "smb_enquiry",
  priority: "medium",
  confidence: 0.75,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

async function runTests() {
  let taskId = "";
  let taskId2 = "";

  // 1. GET /users
  console.log("\n1. GET /users");
  {
    const r = await get("/users");
    if (r.status === 200 && Array.isArray(r.body.team) && r.body.team.length === 6) {
      ok("Returns 200 with 6 team members");
    } else {
      fail("Expected 200 with 6 team members", r.body);
    }
    const userIds = r.body.team?.map((u: { user_id: string }) => u.user_id) ?? [];
    if (userIds.includes("u_aarti") && userIds.includes("u_triage")) {
      ok("Contains expected user_ids");
    } else {
      fail("Missing expected user_ids", userIds);
    }
  }

  // 2. POST /tasks — success
  console.log("\n2. POST /tasks — create");
  {
    const r = await post("/tasks", TASK_PAYLOAD);
    if (r.status === 201) {
      ok("Returns 201");
    } else {
      fail("Expected 201", r.body);
    }
    if (r.body.task_id && r.body.task_id.startsWith("tsk_")) {
      ok(`task_id has tsk_ prefix: ${r.body.task_id}`);
      taskId = r.body.task_id;
    } else {
      fail("task_id missing or bad format", r.body);
    }
    // Spec §5.1 — exactly 4 fields in 201 response
    const keys = Object.keys(r.body).sort();
    if (JSON.stringify(keys) === JSON.stringify(["candidate_id", "created_at", "source_email_id", "task_id"])) {
      ok("201 response has exactly the 4 spec-required fields");
    } else {
      fail("201 response shape mismatch", { expected: ["candidate_id","created_at","source_email_id","task_id"], got: keys });
    }
    if (r.body.candidate_id === CANDIDATE_ID) {
      ok("candidate_id echoed correctly");
    } else {
      fail("candidate_id mismatch", r.body.candidate_id);
    }
  }

  // Create a second task for filter tests
  const r2 = await post("/tasks", TASK_PAYLOAD_2);
  if (r2.status === 201) taskId2 = r2.body.task_id;

  // 3. POST /tasks — bad enum (spec-required error shape)
  console.log("\n3. POST /tasks — invalid enum");
  {
    const r = await post("/tasks", { ...TASK_PAYLOAD, source_email_id: "em_enum_test", thread_id: "th_enum_01", assignee_id: "Aarti" });
    if (r.status === 400) {
      ok("Returns 400 for bad enum");
    } else {
      fail("Expected 400", r.body);
    }
    if (
      r.body.error === "invalid_enum_value" &&
      r.body.field === "assignee_id" &&
      r.body.received === "Aarti" &&
      Array.isArray(r.body.allowed) &&
      r.body.allowed.includes("u_aarti")
    ) {
      ok("Error body matches spec §5.1 shape exactly");
    } else {
      fail("Error body does not match spec §5.1", r.body);
    }
  }

  // 4. POST /tasks — missing required field
  console.log("\n4. POST /tasks — missing required field");
  {
    const { title: _title, ...noTitle } = TASK_PAYLOAD;
    const r = await post("/tasks", { ...noTitle, source_email_id: "em_no_title" });
    if (r.status === 400) {
      ok("Returns 400 for missing title");
    } else {
      fail("Expected 400", r.body);
    }
  }

  // 5. GET /tasks?candidate_id=
  console.log("\n5. GET /tasks — list");
  {
    const r = await get(`/tasks?candidate_id=${encodeURIComponent(CANDIDATE_ID)}`);
    if (r.status === 200 && Array.isArray(r.body.tasks)) {
      ok("Returns 200 with tasks array");
    } else {
      fail("Expected 200 with tasks array", r.body);
    }
    const found = r.body.tasks?.find((t: { task_id: string }) => t.task_id === taskId);
    if (found) {
      ok("Created task appears in list");
    } else {
      fail("Created task not in list", { taskId, tasks: r.body.tasks?.map((t: { task_id: string }) => t.task_id) });
    }
  }

  // 6. GET /tasks/:task_id
  console.log("\n6. GET /tasks/:task_id");
  {
    const r = await get(`/tasks/${taskId}`);
    if (r.status === 200) {
      ok("Returns 200");
    } else {
      fail("Expected 200", r.body);
    }
    if (
      r.body.task_id === taskId &&
      r.body.deal_value_inr === 2500000 &&
      r.body.confidence === 0.91 &&
      r.body.assignee_id === "u_aarti"
    ) {
      ok("All fields correct");
    } else {
      fail("Field mismatch", r.body);
    }
    if (r.body.created_at && r.body.updated_at) {
      ok("created_at and updated_at present");
    } else {
      fail("Timestamps missing", { created_at: r.body.created_at, updated_at: r.body.updated_at });
    }
  }

  // 7. GET /tasks — filter by assignee_id
  console.log("\n7. GET /tasks — filter by assignee_id");
  {
    const r = await get(`/tasks?candidate_id=${encodeURIComponent(CANDIDATE_ID)}&assignee_id=u_rohit`);
    if (r.status === 200) {
      ok("Returns 200");
    } else {
      fail("Expected 200", r.body);
    }
    const allRohit = r.body.tasks?.every((t: { assignee_id: string }) => t.assignee_id === "u_rohit");
    const noAarti = !r.body.tasks?.some((t: { assignee_id: string }) => t.assignee_id === "u_aarti");
    if (allRohit && noAarti) {
      ok("Filter by assignee_id=u_rohit returns only Rohit's tasks");
    } else {
      fail("Filter not applied correctly", r.body.tasks?.map((t: { assignee_id: string; task_id: string }) => ({ id: t.task_id, assignee: t.assignee_id })));
    }
  }

  // 8. GET /tasks — filter by thread_id
  console.log("\n8. GET /tasks — filter by thread_id");
  {
    const r = await get(`/tasks?candidate_id=${encodeURIComponent(CANDIDATE_ID)}&thread_id=th_phase3_01`);
    if (r.status === 200) {
      ok("Returns 200");
    } else {
      fail("Expected 200", r.body);
    }
    const tasks = r.body.tasks ?? [];
    if (tasks.length === 1 && tasks[0].task_id === taskId) {
      ok("Filter by thread_id returns exactly 1 task");
    } else {
      fail("Thread filter mismatch", tasks.map((t: { task_id: string }) => t.task_id));
    }
  }

  // 9. GET /tasks — missing candidate_id
  console.log("\n9. GET /tasks — missing candidate_id");
  {
    const r = await get("/tasks");
    if (r.status === 400) {
      ok("Returns 400 when candidate_id missing");
    } else {
      fail("Expected 400", r.body);
    }
  }

  // 10. PATCH /tasks/:task_id — success
  console.log("\n10. PATCH /tasks/:task_id — update fields");
  {
    const r = await patch(`/tasks/${taskId}`, {
      priority: "medium",
      due_date: "2026-08-25",
      deal_value_inr: 3200000,
    });
    if (r.status === 200) {
      ok("Returns 200");
    } else {
      fail("Expected 200", r.body);
    }
    if (
      r.body.task_id === taskId &&
      r.body.priority === "medium" &&
      r.body.due_date === "2026-08-25" &&
      r.body.deal_value_inr === 3200000 &&
      r.body.assignee_id === "u_aarti" // unchanged
    ) {
      ok("Updated fields correct, unchanged fields preserved");
    } else {
      fail("PATCH response mismatch", r.body);
    }
  }

  // 11. PATCH /tasks/:task_id — set nullable to null
  console.log("\n11. PATCH /tasks/:task_id — set due_date to null");
  {
    const r = await patch(`/tasks/${taskId}`, { due_date: null });
    if (r.status === 200 && r.body.due_date === null) {
      ok("Nullable field set to null correctly");
    } else {
      fail("Expected due_date: null", r.body);
    }
  }

  // 12. PATCH /tasks/:task_id — bad enum
  console.log("\n12. PATCH /tasks/:task_id — invalid enum");
  {
    const r = await patch(`/tasks/${taskId}`, { priority: "urgent" });
    if (r.status === 400) {
      ok("Returns 400");
    } else {
      fail("Expected 400", r.body);
    }
    if (r.body.error === "invalid_enum_value" && r.body.field === "priority") {
      ok("Error body has correct shape");
    } else {
      fail("Error body mismatch", r.body);
    }
  }

  // 13. PATCH /tasks/:task_id — empty body
  console.log("\n13. PATCH /tasks/:task_id — empty body");
  {
    const r = await patch(`/tasks/${taskId}`, {});
    if (r.status === 400) {
      ok("Returns 400 for empty patch body");
    } else {
      fail("Expected 400", r.body);
    }
  }

  // 14. PATCH /tasks/:task_id — unknown field (strict schema)
  console.log("\n14. PATCH /tasks/:task_id — unknown field");
  {
    const r = await patch(`/tasks/${taskId}`, { nonexistent_field: "x" });
    if (r.status === 400) {
      ok("Returns 400 for unknown field (strict schema)");
    } else {
      fail("Expected 400", r.body);
    }
  }

  // 15. GET /tasks/:task_id/history
  console.log("\n15. GET /tasks/:task_id/history");
  {
    const r = await get(`/tasks/${taskId}/history`);
    if (r.status === 200 && Array.isArray(r.body.updates)) {
      ok("Returns 200 with updates array");
    } else {
      fail("Expected 200 with updates array", r.body);
    }
    if (r.body.task_id === taskId) {
      ok("History response contains correct task_id");
    } else {
      fail("task_id mismatch in history", r.body);
    }
  }

  // 16. POST /tasks — duplicate
  console.log("\n16. POST /tasks — duplicate source_email_id");
  {
    const r = await post("/tasks", TASK_PAYLOAD); // same source_email_id as test 2
    if (r.status === 409) {
      ok("Returns 409 for duplicate (candidate_id, source_email_id)");
    } else {
      fail("Expected 409", r.body);
    }
  }

  // 17. GET /tasks/:task_id — not found
  console.log("\n17. GET /tasks/:task_id — not found");
  {
    const r = await get("/tasks/tsk_notexist");
    if (r.status === 404) {
      ok("Returns 404 for unknown task_id");
    } else {
      fail("Expected 404", r.body);
    }
  }

  // 18. PATCH /tasks/:task_id — not found
  console.log("\n18. PATCH /tasks/:task_id — not found");
  {
    const r = await patch("/tasks/tsk_notexist", { priority: "low" });
    if (r.status === 404) {
      ok("Returns 404 for unknown task_id");
    } else {
      fail("Expected 404", r.body);
    }
  }

  // 19. DELETE /tasks/:task_id — success
  console.log("\n19. DELETE /tasks/:task_id");
  {
    const r = await del(`/tasks/${taskId}`);
    if (r.status === 204) {
      ok("Returns 204 on delete");
    } else {
      fail("Expected 204", r.body);
    }
  }

  // 20. GET /tasks — task gone after delete
  console.log("\n20. Task absent after delete");
  {
    const r = await get(`/tasks?candidate_id=${encodeURIComponent(CANDIDATE_ID)}`);
    const stillThere = r.body.tasks?.some((t: { task_id: string }) => t.task_id === taskId);
    if (!stillThere) {
      ok("Deleted task no longer in list");
    } else {
      fail("Deleted task still appears in list");
    }
    const r2 = await get(`/tasks/${taskId}`);
    if (r2.status === 404) {
      ok("GET /tasks/:task_id returns 404 after delete");
    } else {
      fail("Expected 404 after delete", r2.body);
    }
  }

  // 21. DELETE /tasks/:task_id — already deleted
  console.log("\n21. DELETE /tasks/:task_id — already deleted");
  {
    const r = await del(`/tasks/${taskId}`);
    if (r.status === 404) {
      ok("Returns 404 when deleting already-deleted task");
    } else {
      fail("Expected 404", r.body);
    }
  }

  // Cleanup second task
  if (taskId2) await del(`/tasks/${taskId2}`);

  return { passed, failed };
}

// ─── Server bootstrap ─────────────────────────────────────────────────────────

const server = http.createServer(app);

server.listen(0, async () => {
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  baseUrl = `http://localhost:${port}`;

  console.log(`\n── Phase 3 Task API Tests — server on ${baseUrl} ──────────\n`);

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
