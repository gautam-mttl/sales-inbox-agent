/**
 * Cleanup script — removes stale Phase 3 test data from the database.
 * Run this before re-running test:tasks if a previous run left partial data.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({ log: ["warn", "error"] });

async function main() {
  console.log("Cleaning up stale phase3 test data...");

  // Order matters: FKs must be satisfied
  const tu = await prisma.taskUpdate.deleteMany({
    where: { thread_id: { startsWith: "th_phase3" } },
  });
  const pe = await prisma.processedEmail.deleteMany({
    where: { thread_id: { startsWith: "th_phase3" } },
  });
  const ttm = await prisma.threadTaskMap.deleteMany({
    where: { thread_id: { startsWith: "th_phase3" } },
  });
  const t = await prisma.task.deleteMany({
    where: { thread_id: { startsWith: "th_phase3" } },
  });

  console.log(`Deleted: ${tu.count} task_updates, ${pe.count} processed_emails, ${ttm.count} thread_maps, ${t.count} tasks`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
