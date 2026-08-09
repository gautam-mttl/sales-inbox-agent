Candidate ID: gautammittal0109@gmail.com
Backend: https://sales-inbox-agent-z3pa.onrender.com
Frontend: https://sales-inbox-agent.vercel.app

# Sales Inbox Agent

The Sales Inbox Agent is an AI-powered B2B email routing system. It autonomously processes inbound emails, uses Gemini to extract key parameters (deal value, priority, deadlines), and applies deterministic rules to accurately route leads, support queries, and spam to the correct internal teams.

## Architecture
- **Frontend**: React (Vite) deployed on Vercel. Provides email generation, processing, task viewing, and chat interfaces.
- **Backend**: Node.js / Express deployed on Render. Handles validation, email ingestion, classification, and chat grounding. Gemini API calls are strictly server-side.
- **Database**: PostgreSQL hosted on Supabase, accessed via Prisma. Ensures persistent storage, duplicate prevention, and thread management.

## API Endpoints (Backend)
- `POST /ingest`: Synchronously processes a batch of emails (max 100), performing LLM classification and deterministic rule mapping.
- `GET /tasks`: Raw list of tasks.
- `POST /tasks`: Create a task manually.
- `PATCH /tasks/:task_id`: Update an existing task.
- `DELETE /tasks/:task_id`: Delete a task.
- `GET /users`: Returns the roster of assignees.
- `GET /api/tasks`: Enhanced task list powering the Tasks UI.
- `GET /api/stats`: Real-time ingestion metrics and run summaries powering the Stats UI.
- `POST /api/chat`: Grounded chat endpoint, querying the local database for statistics.

## Key Features
- **Idempotency & Thread Reconciliation**: Duplicate emails are instantly dropped using composite database constraints. Thread replies safely update existing tasks instead of duplicating tickets.
- **Batch Processing**: Enforces a strict maximum of 100 emails per request to prevent API overload.
- **Chat Grounding**: Translates natural language into deterministic Prisma database queries to ensure 100% factual accuracy without hallucinations.

## Local Setup

You can run the entire system locally in 3 commands:

1. **Configure Environment**
   Copy `.env.example` to `.env` and fill in your Gemini API Key and PostgreSQL database URL.
   ```bash
   cp .env.example .env
   ```

2. **Install Dependencies**
   ```bash
   npm install --prefix frontend && npm install --prefix backend
   ```

3. **Start the Servers**
   ```powershell
   Start-Process npm -ArgumentList "run dev --prefix backend"; npm run dev --prefix frontend
   ```
