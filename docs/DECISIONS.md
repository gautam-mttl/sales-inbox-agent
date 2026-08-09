# Engineering Decisions

This file records important technical decisions, assumptions, tradeoffs, and known limitations.

Do not invent results or claim a decision was validated unless it was actually tested.

## 1. PostgreSQL

### Decision
Use PostgreSQL with Prisma for production persistence.

### Reason
The grader performs multiple runs and state must survive application restarts and deployments.

### Tradeoff
More setup than in-memory storage or SQLite.

## 2. Gemini + Deterministic Rules

### Decision
Use Gemini for semantic understanding and extraction. Apply deterministic business rules after Gemini.

### Reason
Rules such as the ₹10 lakh routing threshold, government/PSU override, and 72-hour priority should behave consistently.

### Tradeoff
The rule engine adds complexity but improves consistency and testability.

## 3. Database-Level Idempotency

### Decision
Use database uniqueness constraints for:
- `(candidate_id, source_email_id)`
- `(candidate_id, thread_id)`

### Reason
Application-only duplicate checks can have race conditions.

### Tradeoff
Conflict handling must be implemented explicitly.

## 4. Grounded Chat

### Decision
Use:
`question → structured query → database → supporting_data → Gemini phrasing`

### Reason
Gemini must not invent factual counts or statistics.

### Tradeoff
The application must explicitly support the required query types.

## 5. Gemini Failure Handling

### Decision
Use bounded retries with exponential backoff and jitter for transient failures.

### Reason
Gemini may encounter rate limits, timeouts, or malformed responses.

### Fallback
Transient errors (e.g., HTTP 429/503) are mitigated using a bounded retry wrapper with exponential backoff and jitter. Malformed JSON parsing exceptions are caught safely by the classifier and gracefully degraded to `u_triage` without crashing the ingestion loop.

## 6. Quoted Replies

### Decision
Prioritize the current/top-level message during thread reconciliation.

Quoted and forwarded historical content must not overwrite current information.

### Implementation
Thread reconciliation is handled via the `thread_task_map`. The most recent/top-level message content is explicitly prioritized, while any quoted or forwarded historical content is treated separately so that it does not overwrite current, actionable data in existing tickets.

### Known Limitation
Email quote formatting varies between clients and cannot always be identified perfectly.

## 7. Chat Batch Scope

### Decision
Associate ingestion with a persistent processing run so chat can distinguish the relevant batch.

### Reason
Questions may refer specifically to the emails the user has just pasted or processed.

## 8. Known Intentional Limitation

**Gemini Malformed JSON Outputs**

### Context
During testing, Gemini occasionally returned malformed JSON responses (e.g., adding markdown code fences around the JSON, appending trailing commas, or truncating the end of the JSON object entirely when hitting output limits).

### Decision
Rather than attempting complex regex heuristics to "repair" the malformed JSON or silently dropping the email from the ingestion batch, the pipeline strictly enforces `JSON.parse` wrapped in a `try/catch`. When parsing fails, the classifier intentionally catches the exception and degrades the email to `u_triage` with a low `confidence` score (0.3).

### Reason
This ensures the email is never permanently lost and the ingestion queue continues processing uninterrupted.

### Tradeoff
While this ensures reliability, it means some emails that Gemini successfully understood but failed to format correctly will require manual human triage. A future iteration should leverage native Gemini Structured Outputs to strictly enforce the JSON schema at the API layer.

## Decision Log

When adding a new architectural decision, record:
- date
- decision
- reason
- alternatives considered
- tradeoffs
- consequences
