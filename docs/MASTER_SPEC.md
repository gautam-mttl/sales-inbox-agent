# ALUMNX AI LABS — Sales Inbox → Task Router
## Master Engineering Specification

## Purpose
Build a production-quality prototype for the ALUMNX AI LABS FDE Intern Hiring Challenge: **The Sales Inbox → Task Router**.

The system must:
- accept batches of messy B2B emails
- classify legitimate business emails
- route them to the correct assignee
- skip spam, newsletters, and out-of-office messages
- extract structured fields
- create and update tasks
- prevent duplicate tasks
- reconcile thread replies
- persist processing state
- provide grounded conversational analytics
- provide the required frontend

The official challenge specification is the ultimate source of truth. When ambiguous, identify the ambiguity, choose a defensible behavior, document it in `DECISIONS.md`, implement it consistently, and test it.

## Candidate Identity
Candidate ID: `gautammittal0109@gmail.com`

It must be lowercase, trimmed, and byte-identical everywhere.

## Preferred Technology
- Backend: Node.js, TypeScript, Express
- ORM: Prisma
- Database: PostgreSQL
- Frontend: React, TypeScript, Vite, Tailwind CSS
- LLM: Gemini API
- Validation: Zod

Avoid unnecessary infrastructure. Do not introduce microservices, Redis, Kafka, vector databases, RAG, LangChain, or autonomous-agent frameworks unless a later documented decision proves a genuine need.

## Backend APIs

### Task API
Implement exactly:
- `POST /tasks`
- `PATCH /tasks/:task_id`
- `GET /tasks`
- `DELETE /tasks/:task_id`
- `GET /users`

Follow the challenge specification exactly, including fields, enums, validation, query parameters, and errors.

### Application API
Implement:
- `POST /ingest`
- `GET /api/tasks`
- `GET /api/stats`
- `POST /api/chat`

`/tasks` and `/api/tasks` are separate APIs.

## Ingestion
`POST /ingest` is synchronous.

For every email:
1. Validate input.
2. Check idempotency.
3. Identify an existing thread.
4. Classify/extract using Gemini.
5. Validate Gemini output.
6. Apply deterministic business rules.
7. Create, update, or skip.
8. Persist processing information.
9. Return only after the batch is fully processed.

Never silently drop an email.

## Routing Rules

### `u_aarti`
- RFPs
- RFIs
- tenders
- inbound deals above ₹10,00,000
- government/PSU tenders regardless of value

### `u_rohit`
- product enquiries
- demo requests
- inbound deals at or below ₹10,00,000

### `u_meera`
- webinars
- event/conference sponsorships
- content collaborations
- PR/media

### `u_karan`
- reseller proposals
- channel partner proposals
- technology integration proposals

### `u_divya`
- invoices
- purchase orders
- payment reminders
- GST
- vendor billing

### `u_triage`
- genuinely ambiguous cases
- cases that cannot be safely assigned

### Skip
- out-of-office/autoreplies
- newsletters
- unsolicited vendor spam

## Deterministic Rules
Gemini performs semantic understanding and extraction; the backend applies deterministic rules afterward.

If an explicit deadline is within 72 hours of `received_at`, set `priority = high`.

Government/PSU tenders override normal value-based routing.

Never fabricate company name, deal value, or due date. Use `null` when information is not reliably available.

## Email Handling
Emails may contain HTML, quoted replies, forwarded blocks, Hinglish, typos, inconsistent signatures, and multi-message threads.

Classification must focus on the current message. Quoted/forwarded historical content must not overwrite current information.

For replies:
- identify the existing task
- extract new information
- compare it with the existing task
- PATCH only changed fields
- preserve task identity

## Idempotency
Use persistent database constraints.

At minimum:
`(candidate_id, source_email_id)` must be unique.

Thread mapping must also be unique:
`(candidate_id, thread_id) → task_id`

Repeated ingestion must not create another task and must survive application restarts/redeployments.

## Persistence
Use PostgreSQL. Never depend on in-memory state, process-local Maps, temporary files, or frontend state.

Persist enough information about every processed email to support dashboard statistics, chat, skipped-email analysis, reasoning, evaluation, and thread history.

## Gemini Responsibility
Gemini may perform:
- semantic classification
- intent detection
- inbound/vendor direction detection
- company extraction
- deal-value extraction
- deadline extraction
- confidence estimation
- reasoning
- ambiguous-case detection

Gemini is not the authoritative database. Its output must be structured, schema-validated, normalized, and passed through deterministic rules.

## Extraction Rules
Examples:
- `₹6,50,000` → `650000`
- `25 lakhs` → `2500000`
- `1.2 cr` → `12000000`

Do not treat invoice, payment, or purchase-order amounts as deal value unless the email actually indicates an opportunity/deal value.

Do not infer a company name merely from an email domain when the company is not reliably identified.

## LLM Failure Handling
Gemini may fail because of rate limits, timeout, temporary API failure, malformed output, or validation failure.

Implement bounded retries with exponential backoff and jitter. Do not retry indefinitely.

If classification ultimately fails:
- do not silently lose the email
- persist the processing failure
- use a defensible degraded/triage path where appropriate
- expose the failure in logs and ingest results

Document the exact fallback behavior in `DECISIONS.md`.

## Chat
Never implement `question → Gemini → invented answer`.

Use:
`question → structured query → database → supporting_data → Gemini phrasing → answer`

Gemini must not calculate factual counts from raw emails.

Every successful chat response must contain:
```json
{
  "answer": "...",
  "supporting_data": {}
}
```

Support:
- category counts
- skipped counts
- spam/newsletter/OOO
- triage
- reasons
- spurious rate
- compound filters
- high-priority/low-confidence queries
- deal-value totals
- null deal values
- thread update history
- zero-result queries
- unsupported/out-of-scope requests

## Frontend
The frontend must:
1. accept/paste JSON
2. display raw emails in a table
3. allow processing
4. display processing results
5. provide the conversational interface

The browser must communicate only with the backend. Never expose `GEMINI_API_KEY` or call Gemini/Task API directly.

The raw table should expose:
- from_name
- from_email
- subject
- received_at
- thread_id
- truncated body preview

Provide a way to generate the 250 sample emails. Do not use static/fake processing results.

## Synthetic Dataset
Generate 250 realistic synthetic emails matching the challenge schema.

Include:
- RFPs/RFIs/tenders
- SMB enquiries
- marketing
- sponsorships
- alliances
- finance
- spam
- OOO
- ambiguous cases
- Hinglish
- Indian currency formats
- HTML
- quoted replies
- forwards
- typos
- multi-message threads
- misleading emails

Do not make the dataset artificially easy.

## Evaluation
Create `EVALS.md` containing:
- at least 50 manually labelled emails
- precision per category
- recall per category
- methodology
- at least 3 genuine unresolved failure cases

Never fabricate evaluation metrics.

## Documentation
Maintain:
- `README.md`
- `EVALS.md`
- `DECISIONS.md`

README must eventually include candidate ID, setup, environment variables, architecture, deployed backend URL, deployed frontend URL, GitHub repository, and testing instructions.

## Security
Secrets must never be committed.

Required environment variables:
```env
GEMINI_API_KEY=
CANDIDATE_ID=gautammittal0109@gmail.com
DATABASE_URL=
PORT=8000
FRONTEND_URL=http://localhost:5173
```

The Gemini key must remain server-side.

## Engineering Principles
Prioritize:
1. Correctness
2. Persistence
3. Idempotency
4. Thread reconciliation
5. Grounded chat
6. Graceful failure
7. Security
8. Testability
9. Explainability
10. UI quality

Do not add complexity without a clear reason.

## Agent Rules
Before modifying the project:
1. Read `MASTER_SPEC.md`.
2. Read `PHASES.md`.
3. Inspect the existing implementation.
4. Work only on the approved phase.
5. Do not rewrite unrelated code.
6. Run relevant tests and type checks.
7. Report actual results.
8. Never claim tests passed unless executed.
9. Update documentation when architecture changes.
10. Stop when the current phase is complete.

The repository is the source of truth for implementation state.
