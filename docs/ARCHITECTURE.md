# Architecture

## 1. High-Level

```text
React Frontend
      |
      | HTTPS
      v
Express Backend
      |
      +--------------------+
      |                    |
      v                    v
Application API        Task API
      |                    |
      +---------+----------+
                |
                v
           PostgreSQL
                |
                v
            Gemini API
```

## 2. Backend API

One backend deployment contains two API surfaces.

### Task API
- `POST /tasks`
- `PATCH /tasks/:task_id`
- `GET /tasks`
- `DELETE /tasks/:task_id`
- `GET /users`

### Application API
- `POST /ingest`
- `GET /api/tasks`
- `GET /api/stats`
- `POST /api/chat`

`/tasks` and `/api/tasks` are separate.

## 3. Ingestion Pipeline

```text
POST /ingest
      |
      v
Validate
      |
      v
Idempotency check
      |
      v
Thread lookup
      |
      v
Gemini classification/extraction
      |
      v
Validate LLM output
      |
      v
Deterministic rules
      |
      +----------+----------+
      |          |          |
      v          v          v
    CREATE     UPDATE      SKIP
      |          |          |
      +----------+----------+
                 |
                 v
            Persist state
                 |
                 v
           Final response
```

## 4. Database

### Processing Emails
Store every processed source email and result:
- candidate_id
- source_email_id
- thread_id
- sender
- subject
- received_at
- raw email
- decision
- category
- assignee
- priority
- due_date
- deal_value_inr
- company_name
- confidence
- reasoning
- skip_reason
- task_id
- run_id

Unique: `(candidate_id, source_email_id)`

### Tasks
Backing store for the Task API.

### Thread Task Map
Maps `(candidate_id, thread_id) → task_id` and must be unique.

### Task Updates
Stores task changes for audit/history.

### Processing Runs
Stores ingestion batch information.

## 5. Idempotency

Email-level:
`UNIQUE(candidate_id, source_email_id)`

Thread-level:
`UNIQUE(candidate_id, thread_id)`

Combine application checks with database constraints.

## 6. Classification Boundary

Gemini:
- semantic understanding
- intent classification
- information extraction
- confidence/reasoning

Backend:
- schema validation
- deterministic rules
- create/update/skip
- persistence

Gemini output is never trusted blindly.

## 7. Rule Engine

Apply deterministic corrections after LLM extraction.

Examples:

```text
deadline <= 72 hours
        ↓
priority = high
```

```text
government/PSU tender
        ↓
assignee = u_aarti
```

```text
deal > ₹10L
        ↓
assignee = u_aarti
```

```text
deal <= ₹10L
        ↓
assignee = u_rohit
```

Conflict-resolution behavior must be documented in `DECISIONS.md`.

## 8. Chat

```text
Question
   |
   v
Intent / query interpretation
   |
   v
Structured database query
   |
   v
Database result
   |
   +-------> supporting_data
   |
   v
Gemini phrasing
   |
   v
Answer
```

Gemini must not calculate factual counts from raw emails.

## 9. Frontend Boundary

The frontend communicates only with the backend.

```text
Frontend → Backend → Gemini
Frontend → Backend → PostgreSQL
```

Never:

```text
Frontend → Gemini
Frontend → Task API
Frontend → PostgreSQL
```

## 10. Deployment

```text
Frontend
    |
    | HTTPS
    v
Backend
    |
    +---- PostgreSQL
    |
    +---- Gemini API
```

Task API and Application API share the same backend deployment.
