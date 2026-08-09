import React, { useState } from "react";
import { Inbox, ListTodo, BarChart3, MessageSquare, Menu, X, UserCircle } from "lucide-react";
import { cn } from "./utils/cn";
import { IngestionView } from "./views/IngestionView";
import { TasksView } from "./views/TasksView";
import { StatsView } from "./views/StatsView";
import { ChatView } from "./views/ChatView";

type Tab = "ingest" | "tasks" | "stats" | "chat";

const TABS: { id: Tab; label: string; icon: React.FC<any> }[] = [
  { id: "ingest", label: "Ingestion", icon: Inbox },
  { id: "tasks", label: "Tasks", icon: ListTodo },
  { id: "stats", label: "Statistics", icon: BarChart3 },
  { id: "chat", label: "Chat", icon: MessageSquare },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>("ingest");
  const [candidateId, setCandidateId] = useState<string>("default-candidate@example.com");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden font-sans">
      {/* Mobile sidebar overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 z-20 bg-black/50 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 w-64 bg-white border-r border-gray-200 transform transition-transform duration-200 ease-in-out md:relative md:translate-x-0 flex flex-col",
          isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <h1 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
            Sales Inbox Agent
          </h1>
          <button className="md:hidden text-gray-500" onClick={() => setIsMobileMenuOpen(false)}>
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                setIsMobileMenuOpen(false);
              }}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200",
                activeTab === tab.id
                  ? "bg-blue-50 text-blue-700 shadow-sm ring-1 ring-blue-100"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              )}
            >
              <tab.icon size={18} className={activeTab === tab.id ? "text-blue-600" : "text-gray-400"} />
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-gray-100 bg-gray-50/50">
          <div className="flex items-center gap-2 mb-2 px-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
            <UserCircle size={14} />
            Candidate ID
          </div>
          <input
            type="email"
            value={candidateId}
            onChange={(e) => setCandidateId(e.target.value)}
            placeholder="Enter candidate email"
            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-shadow"
          />
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        <header className="md:hidden flex items-center justify-between p-4 bg-white border-b border-gray-200">
          <h1 className="font-bold text-gray-900">Sales Inbox Agent</h1>
          <button onClick={() => setIsMobileMenuOpen(true)} className="p-2 text-gray-600 bg-gray-100 rounded-lg">
            <Menu size={20} />
          </button>
        </header>
        
        <div className="flex-1 overflow-auto p-4 md:p-8 bg-gray-50/50">
          <div className="max-w-6xl mx-auto h-full flex flex-col">
            {activeTab === "ingest" && <IngestionView candidateId={candidateId} />}
            {activeTab === "tasks" && <TasksView candidateId={candidateId} />}
            {activeTab === "stats" && <StatsView candidateId={candidateId} />}
            {activeTab === "chat" && <ChatView candidateId={candidateId} />}
          </div>
        </div>
      </main>
    </div>
  );
}
