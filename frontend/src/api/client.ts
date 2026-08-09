/// <reference types="vite/client" />
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

// --- Types ---

export interface CandidateQuery {
  candidate_id: string;
}

// Stats
export interface StatsResponse {
  total_processed: number;
  tasks_created: number;
  tasks_updated: number;
  skipped: number;
  by_category: Record<string, number>;
  by_skip_reason: Record<string, number>;
  runs: Array<{ run_id: string; started_at: string; total_input: number }>;
}

// Tasks
export interface Task {
  task_id: string;
  source_email_id: string;
  thread_id: string | null;
  from_name: string | null;
  from_email: string;
  subject: string | null;
  received_at: string;
  is_reply: boolean;
  decision: "created" | "skipped";
  skip_reason: string | null;
  category: string | null;
  assignee_id: string | null;
  priority: "high" | "medium" | "low" | null;
  due_date: string | null;
  deal_value_inr: number | null;
  company_name: string | null;
  confidence: number | null;
  reasoning: string | null;
  run_id: string;
  processed_at: string;
}

export interface TaskUpdate {
  update_id: string;
  task_id: string;
  received_at: string;
  from_name: string | null;
  from_email: string;
  body_preview: string;
}

// Chat
export interface ChatRequest {
  candidate_id: string;
  query: string;
}

export interface ChatResponse {
  answer: string;
  supporting_data: Record<string, any>;
}

// Ingest
export interface IngestRequest {
  candidate_id: string;
  emails: Array<{
    email_id: string;
    from_name?: string;
    from_email: string;
    to_email: string;
    subject: string;
    body: string;
    received_at: string;
    thread_id?: string;
    is_reply?: boolean;
  }>;
}

export interface IngestResponse {
  processed: number;
  tasks_created: number;
  tasks_updated: number;
  skipped: number;
  errors: any[];
  run_id: string;
}

// --- Methods ---

export async function apiGet<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(API_BASE + endpoint);
  Object.keys(params).forEach((key) => {
    if (params[key] !== undefined && params[key] !== null) {
      url.searchParams.append(key, params[key]);
    }
  });
  
  const response = await fetch(url.toString(), {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok) {
    let err = `HTTP ${response.status}`;
    try {
      const json = await response.json();
      if (json.error) err = json.error;
    } catch {
      // ignore
    }
    throw new Error(err);
  }
  return response.json();
}

export async function apiPost<T>(endpoint: string, body: any, signal?: AbortSignal): Promise<T> {
  const response = await fetch(API_BASE + endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) {
    let err = `HTTP ${response.status}`;
    try {
      const json = await response.json();
      if (json.error) err = json.error;
    } catch {
      // ignore
    }
    throw new Error(err);
  }
  return response.json();
}

export async function apiPatch<T>(endpoint: string, body: any): Promise<T> {
  const response = await fetch(API_BASE + endpoint, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    let err = `HTTP ${response.status}`;
    try {
      const json = await response.json();
      if (json.error) err = json.error;
    } catch {
      // ignore
    }
    throw new Error(err);
  }
  return response.json();
}
