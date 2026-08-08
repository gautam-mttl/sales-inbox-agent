# Development Phases

Only one phase may be `IN_PROGRESS` at a time.

## Phase 0 — Repository & Specification Audit
Status: `NOT_STARTED`

- inspect repository
- inspect challenge specification
- inspect environment
- verify candidate ID
- verify API requirements
- verify architecture
- identify risks
- identify missing setup

No application implementation, dataset generation, or deployment.

Deliverable: Phase 0 report.

## Phase 1 — Project Foundation
Status: `NOT_STARTED`

- backend setup
- frontend setup
- TypeScript
- Express
- React/Vite
- environment validation
- health endpoint
- error handling
- project scripts

Test backend/frontend startup and TypeScript.

## Phase 2 — Database & Persistence
Status: `NOT_STARTED`

- Prisma
- PostgreSQL
- migrations
- email/processing records
- tasks
- thread mapping
- update history
- processing runs
- uniqueness constraints

Test migration, CRUD, constraints, and restart persistence.

## Phase 3 — Task API
Status: `NOT_STARTED`

Implement:
- `POST /tasks`
- `PATCH /tasks/:task_id`
- `GET /tasks`
- `DELETE /tasks/:task_id`
- `GET /users`

Test create, read, update, delete, filtering, validation, errors, and persistence.

## Phase 4 — Classification
Status: `NOT_STARTED`

- email preprocessing
- quote/forward handling
- Gemini client
- structured output
- schema validation
- retries
- extraction
- routing rules

Test all challenge worked examples.

## Phase 5 — Ingestion
Status: `NOT_STARTED`

Pipeline:
`validation → idempotency → thread detection → classification → rules → create/update/skip → persistence → response`

Test normal, skipped, duplicate, reply, changed-field, Gemini failure, malformed-input, batch, and synchronous behavior.

## Phase 6 — Idempotency & Thread Reconciliation
Status: `NOT_STARTED`

Simulate:
- Run 1: original batch
- Run 2: identical batch
- Run 3: thread replies

Verify no duplicates, correct PATCH behavior, correct new-thread creation, update history, and restart survival.

## Phase 7 — Statistics
Status: `NOT_STARTED`

Implement:
- `GET /api/tasks`
- `GET /api/stats`

Support required counts, breakdowns, and processing information.

## Phase 8 — Grounded Chat
Status: `NOT_STARTED`

Pipeline:
`question → intent/query interpretation → structured query → database → supporting_data → Gemini phrasing → answer`

Test counts, filters, triage, spam, spurious rate, deal values, null values, thread updates, zero results, and unsupported requests.

## Phase 9 — Frontend
Status: `NOT_STARTED`

- JSON paste/upload
- raw table
- sample generation
- process action
- results
- chat
- loading/error/empty states

No direct Gemini/Task API calls and no mock processing results.

## Phase 10 — Dataset & Evaluation
Status: `NOT_STARTED`

- generate 250 emails
- include difficult cases
- ensure realistic threads
- manually label at least 50
- calculate precision/recall
- document failures

## Phase 11 — Full Grader Simulation
Status: `NOT_STARTED`

Simulate:
- Run 1: fresh batch
- Run 2: same batch
- Run 3: thread replies

Verify candidate ID, routing, task counts, idempotency, thread reconciliation, persistence, and exact API contracts.

## Phase 12 — Deployment
Status: `NOT_STARTED`

- deploy backend
- deploy frontend
- configure PostgreSQL
- configure environment variables
- configure CORS
- verify HTTPS
- verify every required endpoint
- verify persistence
- verify Gemini access

## Phase 13 — Final Submission
Status: `NOT_STARTED`

Verify README, EVALS.md, DECISIONS.md, GitHub, backend URL, frontend URL, candidate ID, no secrets, and complete end-to-end testing.
