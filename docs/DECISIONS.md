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
Finalize after implementation and testing.

## 6. Quoted Replies

### Decision
Prioritize the current/top-level message during thread reconciliation.

Quoted and forwarded historical content must not overwrite current information.

### Implementation
Finalize after testing.

### Known Limitation
Email quote formatting varies between clients and cannot always be identified perfectly.

## 7. Chat Batch Scope

### Decision
Associate ingestion with a persistent processing run so chat can distinguish the relevant batch.

### Reason
Questions may refer specifically to the emails the user has just pasted or processed.

## 8. Known Intentional Limitation

**TO BE COMPLETED AFTER REAL EVALUATION.**

Document one genuine unresolved limitation here.

Do not fabricate one before testing.

## Decision Log

When adding a new architectural decision, record:
- date
- decision
- reason
- alternatives considered
- tradeoffs
- consequences
