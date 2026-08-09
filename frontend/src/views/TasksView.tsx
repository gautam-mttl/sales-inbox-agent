import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, X, Clock, User, Tag, IndianRupee, AlertTriangle } from "lucide-react";
import { apiGet, apiPatch, Task, TaskUpdate } from "../api/client";
import { cn } from "../utils/cn";
import { format } from "date-fns";

interface Props {
  candidateId: string;
}

export function TasksView({ candidateId }: Props) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  
  const [limit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [decision, setDecision] = useState<string>("");
  const [category, setCategory] = useState<string>("");
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  const fetchTasks = async () => {
    if (!candidateId) return;
    setIsLoading(true);
    try {
      const query: any = { candidate_id: candidateId, limit: limit.toString(), offset: offset.toString() };
      if (decision) query.decision = decision;
      if (category) query.category = category;
      
      const res: any = await apiGet("/tasks", query);
      setTasks(res.items || res.tasks || []);
      setTotal(res.total || 0);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, [candidateId, offset, limit, decision, category]);

  return (
    <div className="flex h-full gap-6">
      {/* Main List */}
      <div className={cn("flex-1 flex flex-col bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden transition-all duration-300", selectedTask ? "hidden lg:flex" : "flex")}>
        <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <h2 className="text-xl font-bold text-gray-900 tracking-tight">Task Inbox</h2>
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={decision}
              onChange={(e) => { setDecision(e.target.value); setOffset(0); }}
              className="text-sm bg-white border border-gray-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            >
              <option value="">All Decisions</option>
              <option value="created">Created</option>
              <option value="skipped">Skipped</option>
            </select>
            <select
              value={category}
              onChange={(e) => { setCategory(e.target.value); setOffset(0); }}
              className="text-sm bg-white border border-gray-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            >
              <option value="">All Categories</option>
              <option value="enterprise_rfp">Enterprise RFP</option>
              <option value="smb_enquiry">SMB Enquiry</option>
              <option value="marketing">Marketing</option>
              <option value="alliances">Alliances</option>
              <option value="finance">Finance</option>
              <option value="triage">Triage</option>
            </select>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="h-full flex items-center justify-center p-8">
              <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" />
            </div>
          ) : tasks.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-400 p-8 text-center space-y-3">
              <InboxIcon size={48} className="text-gray-200" />
              <p>No tasks found matching your filters.</p>
            </div>
          ) : (
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead className="text-xs text-gray-500 uppercase bg-gray-50 sticky top-0 z-10 border-b border-gray-100">
                <tr>
                  <th className="px-4 py-3 font-medium">Task / Subject</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">Assignee</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Received</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {tasks.map((task) => (
                  <tr 
                    key={task.task_id || task.source_email_id} 
                    onClick={() => setSelectedTask(task)}
                    className={cn(
                      "cursor-pointer transition-colors",
                      selectedTask?.task_id === task.task_id && task.task_id !== null ? "bg-blue-50/50 hover:bg-blue-50/80" : "hover:bg-gray-50/80"
                    )}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900 max-w-[200px] sm:max-w-[300px] truncate">
                        {task.subject || "No Subject"}
                      </div>
                      <div className="text-xs text-gray-500 font-mono mt-0.5">{task.task_id || "Skipped (No ID)"}</div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge label={task.category || "none"} color={task.category ? "blue" : "gray"} />
                    </td>
                    <td className="px-4 py-3 text-gray-600">{task.assignee_id || "Unassigned"}</td>
                    <td className="px-4 py-3">
                      {task.decision === "skipped" ? (
                        <span className="text-xs font-semibold px-2 py-1 bg-gray-100 text-gray-600 rounded">Skipped ({task.skip_reason})</span>
                      ) : (
                        <Badge label={task.priority || "none"} color={task.priority === "high" ? "red" : task.priority === "medium" ? "amber" : "gray"} />
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-right text-xs">
                      {format(new Date(task.received_at), "MMM d, HH:mm")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        <div className="p-4 border-t border-gray-100 bg-white flex items-center justify-between">
          <div className="text-sm text-gray-500">
            Showing <span className="font-medium text-gray-900">{offset + 1}</span> to <span className="font-medium text-gray-900">{Math.min(offset + limit, total)}</span> of <span className="font-medium text-gray-900">{total}</span>
          </div>
          <div className="flex gap-2">
            <button
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - limit))}
              className="p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={20} />
            </button>
            <button
              disabled={offset + limit >= total}
              onClick={() => setOffset(offset + limit)}
              className="p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </div>
      </div>

      {/* Task Detail Panel */}
      {selectedTask && (
        <TaskDetailPanel 
          task={selectedTask} 
          candidateId={candidateId} 
          onClose={() => setSelectedTask(null)} 
          onUpdate={(updated) => {
            setTasks(tasks.map(t => t.task_id === updated.task_id ? updated : t));
            setSelectedTask(updated);
          }}
        />
      )}
    </div>
  );
}

function TaskDetailPanel({ task, candidateId, onClose, onUpdate }: { task: Task, candidateId: string, onClose: () => void, onUpdate: (t: Task) => void }) {
  const [isEditing, setIsEditing] = useState(false);
  const [updates, setUpdates] = useState<TaskUpdate[]>([]);
  
  // Edit form state
  const [editPriority, setEditPriority] = useState(task.priority || "");
  const [editAssignee, setEditAssignee] = useState(task.assignee_id || "");
  const [editValue, setEditValue] = useState(task.deal_value_inr?.toString() || "");

  useEffect(() => {
    if (task.task_id) {
      apiGet<any>(`/tasks/${task.task_id}/history`, { candidate_id: candidateId })
        .then(res => setUpdates(res.updates || []))
        .catch(console.error);
    }
  }, [task.task_id, candidateId]);

  const handleSave = async () => {
    if (!task.task_id) return;
    try {
      const payload: any = {};
      if (editPriority !== (task.priority||"")) payload.priority = editPriority;
      if (editAssignee !== (task.assignee_id||"")) payload.assignee_id = editAssignee;
      if (editValue !== (task.deal_value_inr?.toString()||"")) payload.deal_value_inr = editValue ? parseInt(editValue) : null;
      
      if (Object.keys(payload).length > 0) {
        payload.candidate_id = candidateId;
        const res = await apiPatch<Task>(`/tasks/${task.task_id}`, payload);
        onUpdate(res);
      }
      setIsEditing(false);
    } catch (e) {
      alert("Failed to update task.");
    }
  };

  return (
    <div className="w-full lg:w-96 shrink-0 bg-white rounded-2xl border border-gray-200 shadow-xl overflow-hidden flex flex-col animate-in slide-in-from-right-8 duration-200">
      <div className="p-4 border-b border-gray-100 bg-gray-50 flex items-start justify-between gap-4">
        <div>
          <h3 className="font-bold text-gray-900 leading-tight pr-4">{task.subject || "No Subject"}</h3>
          <div className="text-xs text-gray-500 font-mono mt-1">{task.task_id || task.source_email_id}</div>
        </div>
        <button onClick={onClose} className="p-1.5 bg-gray-100 hover:bg-gray-200 text-gray-500 rounded-lg shrink-0">
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-auto p-5 space-y-6">
        {/* Classification Data */}
        <section>
          <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3 flex items-center gap-2">
            <Tag size={14} /> Classification
          </h4>
          <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-4 space-y-3 text-sm">
            <div className="flex justify-between items-center">
              <span className="text-gray-500">Category</span>
              <Badge label={task.category || "None"} color="blue" />
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-500">Confidence</span>
              <span className="font-mono bg-white px-2 py-0.5 rounded border border-gray-200 text-xs shadow-sm">
                {task.confidence !== null ? task.confidence.toFixed(2) : "N/A"}
              </span>
            </div>
            <div className="pt-2 border-t border-blue-100/50">
              <span className="text-gray-500 text-xs block mb-1">Reasoning</span>
              <p className="text-gray-800 text-xs leading-relaxed">{task.reasoning || "No reasoning provided."}</p>
            </div>
          </div>
        </section>

        {/* Task Properties */}
        {task.decision === "created" && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2">
                <ListTodoIcon size={14} /> Properties
              </h4>
              {!isEditing && (
                <button onClick={() => setIsEditing(true)} className="text-xs text-blue-600 hover:text-blue-700 font-medium px-2 py-1 hover:bg-blue-50 rounded">Edit</button>
              )}
            </div>

            <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 space-y-3 text-sm">
              {isEditing ? (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Assignee</label>
                    <input type="text" value={editAssignee} onChange={e => setEditAssignee(e.target.value)} className="w-full px-2 py-1 text-sm border rounded" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Priority</label>
                    <select value={editPriority} onChange={e => setEditPriority(e.target.value)} className="w-full px-2 py-1 text-sm border rounded bg-white">
                      <option value="high">High</option>
                      <option value="medium">Medium</option>
                      <option value="low">Low</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Deal Value (INR)</label>
                    <input type="number" value={editValue} onChange={e => setEditValue(e.target.value)} className="w-full px-2 py-1 text-sm border rounded" />
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button onClick={handleSave} className="flex-1 bg-blue-600 text-white text-xs py-1.5 rounded-lg font-medium hover:bg-blue-700">Save</button>
                    <button onClick={() => setIsEditing(false)} className="flex-1 bg-gray-200 text-gray-700 text-xs py-1.5 rounded-lg font-medium hover:bg-gray-300">Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500 flex items-center gap-1.5"><User size={14}/> Assignee</span>
                    <span className="font-medium text-gray-900">{task.assignee_id || "Unassigned"}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500 flex items-center gap-1.5"><AlertTriangle size={14}/> Priority</span>
                    <Badge label={task.priority || "none"} color={task.priority === "high" ? "red" : task.priority === "medium" ? "amber" : "gray"} />
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500 flex items-center gap-1.5"><IndianRupee size={14}/> Deal Value</span>
                    <span className="font-mono text-gray-900">{task.deal_value_inr !== null ? `₹${task.deal_value_inr.toLocaleString()}` : "—"}</span>
                  </div>
                </>
              )}
            </div>
          </section>
        )}

        {/* History */}
        {task.decision === "created" && updates.length > 0 && (
          <section>
            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3 flex items-center gap-2">
              <Clock size={14} /> Thread History
            </h4>
            <div className="space-y-4">
              {updates.map(u => (
                <div key={u.update_id} className="relative pl-4 border-l-2 border-gray-200 py-1">
                  <div className="absolute -left-[5px] top-2 w-2 h-2 rounded-full bg-blue-500 ring-4 ring-white" />
                  <div className="text-xs text-gray-500 mb-1">{format(new Date(u.received_at), "MMM d, HH:mm")}</div>
                  <div className="text-sm font-medium text-gray-900">{u.from_name || u.from_email}</div>
                  <div className="text-xs text-gray-600 mt-1 line-clamp-2 bg-gray-50 p-2 rounded-lg border border-gray-100">{u.body_preview}</div>
                </div>
              ))}
            </div>
          </section>
        )}

      </div>
    </div>
  );
}

// Icons workaround for Lucide
const InboxIcon = ({ size, className }: any) => <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" /></svg>;
const ListTodoIcon = ({ size, className }: any) => <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 6h11M9 12h11M9 18h11M5 6v.01M5 12v.01M5 18v.01" /></svg>;

function Badge({ label, color }: { label: string, color: string }) {
  const colors = {
    blue: "bg-blue-100 text-blue-700",
    red: "bg-red-100 text-red-700",
    amber: "bg-amber-100 text-amber-700",
    gray: "bg-gray-100 text-gray-600",
    green: "bg-green-100 text-green-700",
  };
  return (
    <span className={cn("text-xs font-semibold px-2 py-0.5 rounded capitalize", colors[color as keyof typeof colors])}>
      {label}
    </span>
  );
}
