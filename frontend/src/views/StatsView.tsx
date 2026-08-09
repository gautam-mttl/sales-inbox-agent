import { useState, useEffect } from "react";
import { Activity, BarChart2, PieChart, Database } from "lucide-react";
import { apiGet, StatsResponse } from "../api/client";
import { format } from "date-fns";

interface Props {
  candidateId: string;
}

export function StatsView({ candidateId }: Props) {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!candidateId) return;
    setIsLoading(true);
    apiGet<StatsResponse>("/api/stats", { candidate_id: candidateId })
      .then(res => setStats(res))
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, [candidateId]);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500">
        Failed to load statistics.
      </div>
    );
  }

  const categoryMax = Math.max(...Object.values(stats.by_category), 1);
  const skipMax = Math.max(...Object.values(stats.by_skip_reason), 1);

  return (
    <div className="flex flex-col h-full space-y-6 overflow-auto pb-8">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 tracking-tight">System Statistics</h2>
        <p className="text-gray-500 mt-1">Overall ingestion and classification metrics.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Processed" value={stats.total_processed} icon={Database} color="blue" />
        <StatCard title="Tasks Created" value={stats.tasks_created} icon={Activity} color="green" />
        <StatCard title="Tasks Updated" value={stats.tasks_updated} icon={Activity} color="amber" />
        <StatCard title="Skipped" value={stats.skipped} icon={Activity} color="gray" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <h3 className="text-sm font-bold uppercase tracking-wider text-gray-500 mb-6 flex items-center gap-2">
            <BarChart2 size={16} /> By Category
          </h3>
          <div className="space-y-4">
            {Object.entries(stats.by_category).sort((a, b) => b[1] - a[1]).map(([key, val]) => (
              <div key={key}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium text-gray-700 capitalize">{key.replace("_", " ")}</span>
                  <span className="font-semibold text-gray-900">{val}</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2">
                  <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${(val / categoryMax) * 100}%` }} />
                </div>
              </div>
            ))}
            {Object.keys(stats.by_category).length === 0 && (
              <div className="text-sm text-gray-400 italic">No tasks categorized yet.</div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <h3 className="text-sm font-bold uppercase tracking-wider text-gray-500 mb-6 flex items-center gap-2">
            <PieChart size={16} /> Skipped Reasons
          </h3>
          <div className="space-y-4">
            {Object.entries(stats.by_skip_reason).sort((a, b) => b[1] - a[1]).map(([key, val]) => (
              <div key={key}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium text-gray-700 capitalize">{key.replace(/_/g, " ")}</span>
                  <span className="font-semibold text-gray-900">{val}</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2">
                  <div className="bg-gray-400 h-2 rounded-full" style={{ width: `${(val / skipMax) * 100}%` }} />
                </div>
              </div>
            ))}
            {Object.keys(stats.by_skip_reason).length === 0 && (
              <div className="text-sm text-gray-400 italic">No emails skipped yet.</div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
          <h3 className="text-sm font-bold uppercase tracking-wider text-gray-500">Recent Ingestion Runs</h3>
        </div>
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-gray-500 uppercase bg-white border-b border-gray-100">
            <tr>
              <th className="px-6 py-3 font-medium">Run ID</th>
              <th className="px-6 py-3 font-medium">Date</th>
              <th className="px-6 py-3 font-medium text-right">Emails Processed</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {stats.runs.map((run) => (
              <tr key={run.run_id} className="hover:bg-gray-50/50 transition-colors">
                <td className="px-6 py-3 font-mono text-xs text-blue-600">{run.run_id}</td>
                <td className="px-6 py-3 text-gray-500">{format(new Date(run.processed_at), "MMM d, yyyy HH:mm:ss")}</td>
                <td className="px-6 py-3 text-right font-semibold text-gray-900">{run.emails_processed}</td>
              </tr>
            ))}
            {stats.runs.length === 0 && (
              <tr>
                <td colSpan={3} className="px-6 py-8 text-center text-gray-400 italic">No runs recorded yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, color }: any) {
  const colors = {
    blue: "bg-blue-50 text-blue-600",
    green: "bg-green-50 text-green-600",
    amber: "bg-amber-50 text-amber-600",
    gray: "bg-gray-50 text-gray-600",
  };
  return (
    <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wider text-gray-500">{title}</span>
        <div className={`p-2 rounded-lg ${colors[color as keyof typeof colors]}`}>
          <Icon size={18} />
        </div>
      </div>
      <span className="text-3xl font-black text-gray-900 tracking-tight">{value}</span>
    </div>
  );
}
