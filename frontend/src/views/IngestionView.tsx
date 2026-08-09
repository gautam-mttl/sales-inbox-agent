import { useState, useEffect, useRef } from "react";
import { Play, Database, FileJson, CheckCircle2, AlertCircle, RefreshCw } from "lucide-react";
import { apiPost, IngestRequest, IngestResponse } from "../api/client";

interface Props {
  candidateId: string;
}

export function IngestionView({ candidateId }: Props) {
  const [jsonInput, setJsonInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<IngestResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  useEffect(() => {
    if (candidateId) {
      const saved = localStorage.getItem(`sales_inbox_generated_emails_${candidateId}`);
      if (saved) {
        setJsonInput(saved);
      } else {
        setJsonInput("");
      }
    }
  }, [candidateId]);

  let parsedEmails: any[] = [];
  try {
    const obj = JSON.parse(jsonInput);
    if (Array.isArray(obj)) parsedEmails = obj;
    else if (obj && Array.isArray(obj.emails)) parsedEmails = obj.emails;
  } catch (e) {
    // Ignore parse errors until submit
  }

  const handleGenerate = () => {
    // Generate sample batch per spec
    const subjects = ["RFP - Document Management", "Quick demo request", "Overdue invoice #4092", "Out of Office", "Sponsorship needed", "Partnership opportunity", "SEO optimization services", "Platform evaluation", "Bhai, product chahiye"];
    const emails = [];
    for (let i = 0; i < 250; i++) {
      const type = Math.random();
      let body = "Please review this request.";
      let subject = subjects[i % subjects.length];
      
      if (type < 0.1) {
        body = "We are looking for an enterprise DMS. Budget is around Rs. 25 lakhs.";
      } else if (type < 0.2) {
        body = "I am an SMB owner looking for a demo.";
      } else if (type < 0.3) {
        body = "Government tender enclosed. Deal value 6.5L.";
      } else if (type < 0.4) {
        body = "Can you sponsor our event for 400000 INR?";
      } else if (type < 0.5) {
        body = "I am out of the office until Monday.";
      } else if (type < 0.6) {
        body = "Boost your website traffic with our SEO services!";
      } else if (type < 0.7) {
        body = "Bhai, humko aapka product chahiye for our dealer network. Budget approx 1.2 cr allocated hai.";
      }

      emails.push({
        email_id: `em_gen_${Date.now()}_${i}`,
        thread_id: `th_gen_${Date.now()}_${i % 100}`,
        from_name: `User ${i}`,
        from_email: `user${i}@example.com`,
        to_email: "sales@company.com",
        subject,
        body,
        received_at: new Date(Date.now() - Math.random() * 10000000000).toISOString(),
        is_reply: Math.random() > 0.8
      });
    }
    const newJson = JSON.stringify({ emails }, null, 2);
    setJsonInput(newJson);
    if (candidateId) {
      localStorage.setItem(`sales_inbox_generated_emails_${candidateId}`, newJson);
    }
  };

  const handleIngest = async () => {
    if (!candidateId) {
      setError("Candidate ID is required in the sidebar.");
      return;
    }
    
    let payload: IngestRequest;
    try {
      const parsed = JSON.parse(jsonInput);
      payload = {
        candidate_id: candidateId,
        emails: Array.isArray(parsed) ? parsed : parsed.emails || []
      };
    } catch (e) {
      setError("Invalid JSON format.");
      return;
    }

    if (!payload.emails || payload.emails.length === 0) {
      setError("No emails found to ingest.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setResult(null);
    
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;
    
    try {
      const allEmails = payload.emails;
      const CHUNK_SIZE = 100;
      let combinedResult: IngestResponse = {
        processed: 0,
        tasks_created: 0,
        tasks_updated: 0,
        skipped: 0,
        errors: [],
        run_id: ""
      };

      for (let i = 0; i < allEmails.length; i += CHUNK_SIZE) {
        if (signal.aborted) return;
        const chunk = allEmails.slice(i, i + CHUNK_SIZE);
        try {
          const chunkPayload = {
            candidate_id: payload.candidate_id,
            emails: chunk
          };
          const res = await apiPost<IngestResponse>("/ingest", chunkPayload, signal);
          
          combinedResult.processed += res.processed;
          combinedResult.tasks_created += res.tasks_created;
          combinedResult.tasks_updated += res.tasks_updated;
          combinedResult.skipped += res.skipped;
          combinedResult.errors.push(...res.errors);
          if (!combinedResult.run_id) combinedResult.run_id = res.run_id;
        } catch (err: any) {
          if (err.name === "AbortError" || signal.aborted) return;
          throw new Error(`Chunk ${Math.floor(i / CHUNK_SIZE) + 1} failed: ${err.message}`);
        }
      }

      setResult(combinedResult);
      setJsonInput(""); // Clear on success
    } catch (err: any) {
      if (err.name === "AbortError" || abortControllerRef.current?.signal.aborted) return;
      setError(err.message || "Failed to ingest emails.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Data Ingestion</h2>
          <p className="text-gray-500 mt-1">Paste a JSON batch of emails or generate a sample batch to process.</p>
        </div>
        <button
          onClick={handleGenerate}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors shadow-sm text-sm"
        >
          <Database size={16} />
          Generate 250 Samples
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-700 rounded-xl border border-red-100 flex items-center gap-3">
          <AlertCircle size={20} className="text-red-500 shrink-0" />
          <p className="text-sm font-medium">{error}</p>
        </div>
      )}

      {result && (
        <div className="p-6 bg-green-50 rounded-2xl border border-green-100 flex items-start gap-4">
          <CheckCircle2 size={24} className="text-green-600 shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-green-900 text-lg">Ingestion Complete</h3>
            <p className="text-green-800/80 text-sm mt-1">Run ID: <span className="font-mono bg-green-100 px-1.5 py-0.5 rounded text-xs">{result.run_id}</span></p>
            <div className="mt-4 flex flex-wrap gap-4">
              <StatBadge label="Processed" value={result.processed} color="blue" />
              <StatBadge label="Created" value={result.tasks_created} color="green" />
              <StatBadge label="Updated" value={result.tasks_updated} color="amber" />
              <StatBadge label="Skipped" value={result.skipped} color="gray" />
            </div>
            {result.errors.length > 0 && (
              <div className="mt-4 text-sm text-red-600 bg-red-50 p-3 rounded-lg border border-red-100">
                {result.errors.length} errors occurred during processing.
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-[400px]">
        {/* Input panel */}
        <div className="flex flex-col bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <FileJson size={16} className="text-gray-400" />
              JSON Input
            </div>
          </div>
          <textarea
            value={jsonInput}
            onChange={(e) => {
              const val = e.target.value;
              setJsonInput(val);
              if (candidateId) {
                if (val.trim()) {
                  localStorage.setItem(`sales_inbox_generated_emails_${candidateId}`, val);
                } else {
                  localStorage.removeItem(`sales_inbox_generated_emails_${candidateId}`);
                }
              }
            }}
            placeholder="Paste your inbox.json array here..."
            className="flex-1 p-4 w-full bg-slate-900 text-emerald-400 font-mono text-sm resize-none focus:outline-none"
            spellCheck={false}
          />
          <div className="p-4 border-t border-gray-100 bg-white">
            <button
              onClick={handleIngest}
              disabled={isLoading || !jsonInput.trim()}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed text-white rounded-xl font-medium shadow-sm transition-all"
            >
              {isLoading ? <RefreshCw size={18} className="animate-spin" /> : <Play size={18} />}
              {isLoading ? "Processing Batch..." : "Process Emails"}
            </button>
          </div>
        </div>

        {/* Preview panel */}
        <div className="flex flex-col bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
            <div className="text-sm font-medium text-gray-700">
              Data Preview <span className="text-gray-400 font-normal ml-1">({parsedEmails.length} emails)</span>
            </div>
          </div>
          <div className="flex-1 overflow-auto p-0">
            {parsedEmails.length > 0 ? (
              <table className="w-full text-sm text-left whitespace-nowrap">
                <thead className="text-xs text-gray-500 uppercase bg-gray-50 sticky top-0 z-10 border-b border-gray-100">
                  <tr>
                    <th className="px-4 py-3 font-medium">From Name</th>
                    <th className="px-4 py-3 font-medium">From Email</th>
                    <th className="px-4 py-3 font-medium">Subject</th>
                    <th className="px-4 py-3 font-medium">Thread ID</th>
                    <th className="px-4 py-3 font-medium text-right">Received At</th>
                    <th className="px-4 py-3 font-medium">Preview</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {parsedEmails.slice(0, 50).map((email: any, i) => (
                    <tr key={i} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3 text-gray-900 font-medium">
                        {email.from_name || "Unknown"}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {email.from_email}
                      </td>
                      <td className="px-4 py-3 text-gray-700 max-w-[200px] truncate" title={email.subject}>
                        {email.subject}
                      </td>
                      <td className="px-4 py-3 text-gray-500 font-mono text-xs">
                        {email.thread_id || "—"}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs text-right whitespace-nowrap">
                        {email.received_at ? new Date(email.received_at).toLocaleString() : "—"}
                      </td>
                      <td className="px-4 py-3 text-gray-500 max-w-[200px] truncate" title={email.body}>
                        {email.body}
                      </td>
                    </tr>
                  ))}
                  {parsedEmails.length > 50 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-3 text-center text-gray-500 text-xs italic bg-gray-50/50">
                        + {parsedEmails.length - 50} more emails not shown in preview
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-400 text-sm p-8 text-center">
                Paste valid JSON to see preview
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatBadge({ label, value, color }: { label: string, value: number, color: string }) {
  const colors = {
    blue: "bg-blue-100 text-blue-800 border-blue-200",
    green: "bg-green-100 text-green-800 border-green-200",
    amber: "bg-amber-100 text-amber-800 border-amber-200",
    gray: "bg-gray-100 text-gray-800 border-gray-200",
  };
  return (
    <div className={`px-4 py-2 rounded-xl border flex flex-col items-center min-w-[90px] ${colors[color as keyof typeof colors]}`}>
      <span className="text-2xl font-bold">{value}</span>
      <span className="text-[10px] uppercase font-semibold tracking-wider opacity-80 mt-0.5">{label}</span>
    </div>
  );
}
