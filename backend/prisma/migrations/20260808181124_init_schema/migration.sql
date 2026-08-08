-- CreateEnum
CREATE TYPE "AssigneeId" AS ENUM ('u_aarti', 'u_rohit', 'u_meera', 'u_karan', 'u_divya', 'u_triage');

-- CreateEnum
CREATE TYPE "Category" AS ENUM ('enterprise_rfp', 'smb_enquiry', 'marketing', 'alliances', 'finance', 'triage');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('high', 'medium', 'low');

-- CreateEnum
CREATE TYPE "EmailDecision" AS ENUM ('created', 'updated', 'skipped', 'errored');

-- CreateEnum
CREATE TYPE "SkipReason" AS ENUM ('out_of_office', 'newsletter', 'spam');

-- CreateTable
CREATE TABLE "processing_runs" (
    "id" TEXT NOT NULL,
    "candidate_id" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "total_input" INTEGER NOT NULL DEFAULT 0,
    "tasks_created" INTEGER NOT NULL DEFAULT 0,
    "tasks_updated" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "errored" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "processing_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "candidate_id" TEXT NOT NULL,
    "source_email_id" TEXT NOT NULL,
    "thread_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "assignee_id" "AssigneeId" NOT NULL,
    "category" "Category" NOT NULL,
    "priority" "Priority" NOT NULL,
    "due_date" TEXT,
    "deal_value_inr" INTEGER,
    "company_name" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "thread_task_map" (
    "id" TEXT NOT NULL,
    "candidate_id" TEXT NOT NULL,
    "thread_id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "thread_task_map_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processed_emails" (
    "id" TEXT NOT NULL,
    "candidate_id" TEXT NOT NULL,
    "source_email_id" TEXT NOT NULL,
    "thread_id" TEXT NOT NULL,
    "from_name" TEXT,
    "from_email" TEXT,
    "subject" TEXT,
    "received_at" TIMESTAMP(3),
    "is_reply" BOOLEAN NOT NULL DEFAULT false,
    "raw_body" TEXT,
    "decision" "EmailDecision" NOT NULL,
    "category" "Category",
    "assignee_id" "AssigneeId",
    "priority" "Priority",
    "due_date" TEXT,
    "deal_value_inr" INTEGER,
    "company_name" TEXT,
    "confidence" DOUBLE PRECISION,
    "reasoning" TEXT,
    "skip_reason" "SkipReason",
    "error_message" TEXT,
    "task_id" TEXT,
    "run_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_emails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_updates" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "candidate_id" TEXT NOT NULL,
    "source_email_id" TEXT NOT NULL,
    "thread_id" TEXT NOT NULL,
    "prev_priority" "Priority",
    "new_priority" "Priority",
    "prev_due_date" TEXT,
    "new_due_date" TEXT,
    "prev_deal_value_inr" INTEGER,
    "new_deal_value_inr" INTEGER,
    "prev_assignee_id" "AssigneeId",
    "new_assignee_id" "AssigneeId",
    "prev_confidence" DOUBLE PRECISION,
    "new_confidence" DOUBLE PRECISION,
    "prev_company_name" TEXT,
    "new_company_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_updates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "processing_runs_candidate_id_idx" ON "processing_runs"("candidate_id");

-- CreateIndex
CREATE UNIQUE INDEX "tasks_task_id_key" ON "tasks"("task_id");

-- CreateIndex
CREATE INDEX "tasks_candidate_id_idx" ON "tasks"("candidate_id");

-- CreateIndex
CREATE INDEX "tasks_candidate_id_thread_id_idx" ON "tasks"("candidate_id", "thread_id");

-- CreateIndex
CREATE INDEX "tasks_candidate_id_assignee_id_idx" ON "tasks"("candidate_id", "assignee_id");

-- CreateIndex
CREATE UNIQUE INDEX "tasks_candidate_id_source_email_id_key" ON "tasks"("candidate_id", "source_email_id");

-- CreateIndex
CREATE UNIQUE INDEX "thread_task_map_task_id_key" ON "thread_task_map"("task_id");

-- CreateIndex
CREATE INDEX "thread_task_map_candidate_id_idx" ON "thread_task_map"("candidate_id");

-- CreateIndex
CREATE UNIQUE INDEX "thread_task_map_candidate_id_thread_id_key" ON "thread_task_map"("candidate_id", "thread_id");

-- CreateIndex
CREATE INDEX "processed_emails_candidate_id_idx" ON "processed_emails"("candidate_id");

-- CreateIndex
CREATE INDEX "processed_emails_candidate_id_thread_id_idx" ON "processed_emails"("candidate_id", "thread_id");

-- CreateIndex
CREATE INDEX "processed_emails_candidate_id_decision_idx" ON "processed_emails"("candidate_id", "decision");

-- CreateIndex
CREATE INDEX "processed_emails_candidate_id_category_idx" ON "processed_emails"("candidate_id", "category");

-- CreateIndex
CREATE INDEX "processed_emails_run_id_idx" ON "processed_emails"("run_id");

-- CreateIndex
CREATE UNIQUE INDEX "processed_emails_candidate_id_source_email_id_key" ON "processed_emails"("candidate_id", "source_email_id");

-- CreateIndex
CREATE INDEX "task_updates_task_id_idx" ON "task_updates"("task_id");

-- CreateIndex
CREATE INDEX "task_updates_candidate_id_thread_id_idx" ON "task_updates"("candidate_id", "thread_id");

-- AddForeignKey
ALTER TABLE "thread_task_map" ADD CONSTRAINT "thread_task_map_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("task_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processed_emails" ADD CONSTRAINT "processed_emails_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "processing_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processed_emails" ADD CONSTRAINT "processed_emails_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("task_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_updates" ADD CONSTRAINT "task_updates_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("task_id") ON DELETE RESTRICT ON UPDATE CASCADE;
