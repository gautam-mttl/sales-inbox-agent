import React, { useState, useRef, useEffect } from "react";
import { Send, User, Bot, Database, ChevronDown, ChevronUp } from "lucide-react";
import { apiPost, ChatResponse } from "../api/client";
import { cn } from "../utils/cn";

interface Props {
  candidateId: string;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  supportingData?: any;
}

export function ChatView({ candidateId }: Props) {
  const [messages, setMessages] = useState<Message[]>([
    { id: "0", role: "assistant", content: "Hi! I can answer questions about the emails processed in this batch. For example, ask me how many RFP emails came in, or what's sitting in triage." }
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;

    const query = input.trim();
    setInput("");
    
    const userMsg: Message = { id: Date.now().toString(), role: "user", content: query };
    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const res = await apiPost<ChatResponse>("/api/chat", { candidate_id: candidateId, query });
      const botMsg: Message = { 
        id: (Date.now() + 1).toString(), 
        role: "assistant", 
        content: res.answer,
        supportingData: res.supporting_data
      };
      setMessages(prev => [...prev, botMsg]);
    } catch (e: any) {
      setMessages(prev => [...prev, { 
        id: (Date.now() + 1).toString(), 
        role: "assistant", 
        content: `Error: ${e.message}` 
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full max-w-4xl mx-auto w-full bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900 tracking-tight">Grounded Assistant</h2>
          <p className="text-xs text-gray-500">Answers strictly constrained to ingested DB data.</p>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 md:p-6 space-y-6 bg-gray-50/30">
        {messages.map((msg) => (
          <div key={msg.id} className={cn("flex gap-4 max-w-[85%]", msg.role === "user" ? "ml-auto flex-row-reverse" : "")}>
            <div className={cn("shrink-0 w-8 h-8 rounded-full flex items-center justify-center mt-1", 
              msg.role === "user" ? "bg-blue-600 text-white" : "bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-sm"
            )}>
              {msg.role === "user" ? <User size={16} /> : <Bot size={16} />}
            </div>
            
            <div className="flex flex-col gap-2 min-w-0">
              <div className={cn("px-4 py-3 rounded-2xl text-[15px] leading-relaxed shadow-sm",
                msg.role === "user" 
                  ? "bg-blue-600 text-white rounded-tr-sm" 
                  : "bg-white border border-gray-100 text-gray-800 rounded-tl-sm"
              )}>
                {msg.content}
              </div>
              
              {msg.supportingData && Object.keys(msg.supportingData).length > 0 && (
                <SupportingDataPreview data={msg.supportingData} />
              )}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex gap-4 max-w-[85%]">
            <div className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center mt-1 bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-sm">
              <Bot size={16} />
            </div>
            <div className="px-4 py-4 rounded-2xl bg-white border border-gray-100 rounded-tl-sm flex gap-1.5 shadow-sm">
              <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
              <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
              <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="p-4 bg-white border-t border-gray-100">
        <form onSubmit={handleSend} className="flex gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question about the processed emails..."
            className="flex-1 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:bg-white transition-all shadow-inner"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="px-5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed transition-colors shadow-sm flex items-center justify-center"
          >
            <Send size={18} />
          </button>
        </form>
      </div>
    </div>
  );
}

function SupportingDataPreview({ data }: { data: any }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="bg-slate-900 rounded-xl overflow-hidden shadow-sm border border-slate-800">
      <button 
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-emerald-400 hover:bg-slate-800 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Database size={12} />
          Raw Supporting Data (Grounding Proof)
        </div>
        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {expanded && (
        <div className="px-3 pb-3 pt-1 text-[11px] font-mono text-emerald-300 overflow-x-auto whitespace-pre">
          {JSON.stringify(data, null, 2)}
        </div>
      )}
    </div>
  );
}
