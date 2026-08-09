# Phase 7 — Grounded Chat API Implementation Plan

## Goal
Implement the `POST /api/chat` endpoint to provide a conversational interface over the processed email data, exactly following the Challenge Spec.

## Proposed Architecture: Two-Pass "Intent-Driven" System
To ensure strict grounding, prevent hallucinations, and guarantee predictable `supporting_data` shapes, the chat API will use a two-pass system:

1. **Pass 1: Intent Extraction (LLM)**
   - The user's query is sent to Gemini enforcing a strict JSON structured output (`responseSchema`).
   - Gemini classifies the query into a specific `IntentType` (e.g., `CategoryCounts`, `TriageTasks`, `SpuriousRate`, `FilterTasks`, `RfpValue`, `ThreadUpdates`, `ActionNotSupported`).
   - It also extracts any necessary parameters (e.g., filtering categories or confidence thresholds).

2. **Data Fetching (Backend / Prisma)**
   - Based on the parsed `IntentType`, the backend executes the corresponding Prisma queries, scoped securely by `candidate_id`.
   - This raw data forms the exact `supporting_data` object required by the spec.

3. **Pass 2: Answer Generation (LLM)**
   - The original query and the JSON `supporting_data` are sent back to Gemini.
   - A strict system prompt instructs Gemini to formulate a natural language `answer` using **only** the provided `supporting_data`. If the data says zero, Gemini must say zero. If the data is empty, Gemini must politely decline or state the data is unavailable.

## Implementation Steps

### 1. Define Intents & Schemas (`backend/src/validation/chatSchemas.ts`)
Create Zod schemas for the API request/response and the internal LLM Intent structure.
Supported Intents based on Spec requirements:
- `CATEGORY_COUNTS`: For questions about routing volumes (e.g. RFPs, marketing, spam).
- `TRIAGE_LIST`: For fetching tasks in the triage category and their reasons.
- `SPURIOUS_RATE`: For calculating spurious task ratios.
- `FILTER_TASKS`: For compound filters (e.g. high priority + low confidence).
- `RFP_DEAL_VALUES`: For summing open RFP deal values.
- `THREAD_UPDATES`: For finding threads updated multiple times.
- `UNANSWERABLE`: For out-of-scope requests (e.g. taking actions, unsupported breakdowns).

### 2. Implement Data Fetchers (`backend/src/db/chatQueries.ts`)
Write the Prisma queries for each intent.
- **Spurious Rate**: Counts tasks where `category` is not `triage` but should have been skipped, OR counts `ProcessedEmail` rows with `decision = skipped` that were mistakenly processed? (Spec: "spurious tasks ÷ total processed"). We will count tasks created from `spam`, `newsletter`, `out_of_office` (if the system failed and created them) OR track spurious flags if any. Wait, the spec says: "Systems that create a u_triage task here [auto-reply] are marked spurious... What's our spurious rate so far? (spurious tasks ÷ total processed)". We will calculate this by checking tasks that were created but have spurious characteristics, or we can add a simple heuristic (e.g., tasks whose body contained spam/ooo but bypassed rules). I will clarify this in the open questions.
- **Filter Tasks**: Prisma `findMany` with dynamic `where` clauses (priority, confidence).
- **RFP Deal Values**: Prisma `aggregate` to sum `deal_value_inr` where category is `enterprise_rfp`.
- **Thread Updates**: Prisma `groupBy` on `TaskUpdate` to find threads with > 1 update.

### 3. Build Chat Service (`backend/src/services/chatService.ts`)
Implement the two-pass Gemini flow:
- `extractIntent(query)` -> calls Gemini with Structured Output.
- `executeIntent(candidate_id, intent)` -> calls Prisma.
- `generateAnswer(query, supportingData)` -> calls Gemini with system prompt.

### 4. Create API Route (`backend/src/routes/chat.ts`)
Expose `POST /api/chat`, connect it to `chatService.ts`, and integrate into Express router.

### 5. Phase 7 Integration Tests (`backend/scripts/test-phase7.ts`)
Create isolated test fixtures.
Mock `global.fetch` to intercept Gemini calls and return deterministic Intents and Answer strings to avoid quota exhaustion.
Test all 10 query scenarios, candidate scoping, and error handling.

## Open Questions
1. **Spurious Rate Calculation**: The spec defines spurious rate as `spurious tasks ÷ total processed`. Since our system correctly skips OOO/spam, our spurious rate should inherently be 0. I will calculate it by checking `Task` records that shouldn't exist (e.g., tasks where the `ProcessedEmail` has a skip reason but `task_id` is somehow populated, or simply returning 0 if our system is perfect). Is returning exactly 0 acceptable for the perfect implementation?
2. **Gemini Quota**: The two-pass system uses 2 calls per chat request. For testing, I will completely stub Gemini using `global.fetch` to ensure zero quota usage during automated tests. Real calls will only happen when actually hitting the endpoint externally.

## User Review Required
Please review the two-pass architecture. It trades an extra LLM call for extreme stability, strict data typing, and zero hallucination risk compared to standard tool-calling. If this plan is approved, I will begin implementation.
