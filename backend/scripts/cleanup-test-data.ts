/**
 * Cleanup script — removes stale Phase 3 test data from the database.
 * Run this before re-running test:tasks if a previous run left partial data.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({ log: ["warn", "error"] });

async function main() {
  console.log("Cleaning up stale test data...");

  // Phase 3 test data (th_phase3* threads)
  const tu3 = await prisma.taskUpdate.deleteMany({
    where: { thread_id: { startsWith: "th_phase3" } },
  });
  const pe3 = await prisma.processedEmail.deleteMany({
    where: { thread_id: { startsWith: "th_phase3" } },
  });
  const ttm3 = await prisma.threadTaskMap.deleteMany({
    where: { thread_id: { startsWith: "th_phase3" } },
  });
  const t3 = await prisma.task.deleteMany({
    where: { thread_id: { startsWith: "th_phase3" } },
  });
  console.log(`Phase 3: ${tu3.count} task_updates, ${pe3.count} processed_emails, ${ttm3.count} thread_maps, ${t3.count} tasks`);

  // Phase 4 test data (test-phase4@example.com candidate)
  const P4_CANDIDATE = "test-phase4@example.com";
  const tu4 = await prisma.taskUpdate.deleteMany({ where: { candidate_id: P4_CANDIDATE } });
  const pe4 = await prisma.processedEmail.deleteMany({ where: { candidate_id: P4_CANDIDATE } });
  const ttm4 = await prisma.threadTaskMap.deleteMany({ where: { candidate_id: P4_CANDIDATE } });
  const t4 = await prisma.task.deleteMany({ where: { candidate_id: P4_CANDIDATE } });
  const r4 = await prisma.processingRun.deleteMany({ where: { candidate_id: P4_CANDIDATE } });
  console.log(`Phase 4: ${tu4.count} task_updates, ${pe4.count} processed_emails, ${ttm4.count} thread_maps, ${t4.count} tasks, ${r4.count} runs`);

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
