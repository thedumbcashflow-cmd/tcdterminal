import { useState, useRef, useEffect } from "react";
import { MessageCircle, X, Send, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Msg = { role: "user" | "assistant"; content: string };

const SESSION_ID = "lovable-main-session";

function extractReply(data: any): string {
  if (!data) return "";
  if (typeof data === "string") return data;
  return (
    data.reply ?? data.response ?? data.message ?? data.output ?? data.content ??
    data.choices?.[0]?.message?.content ?? JSON.stringify(data)
  );
}

const ChatBubble = () => {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", content: "TCD Terminal AI ready. Ask about whale flows, liquidations, or network health." },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    const userMsg: Msg = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    // Call the proxy with an explicit timeout so the UI never hangs
    const ctrl = new AbortController();
    const timeoutId = setTimeout(() => ctrl.abort(), 30_000);

    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/agent-proxy`;
      const resp = await fetch(url, {
        method: "POST",
        signal: ctrl.signal,
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ message: text, session: SESSION_ID, mode: "agent" }),
      });

      const reqId = resp.headers.get("x-request-id") || "—";
      const raw = await resp.text();

      if (resp.status === 429) {
        setMessages((prev) => [...prev, { role: "assistant", content: "Rate limit reached. Please wait a moment and try again." }]);
        return;
      }
      if (resp.status === 401) {
        setMessages((prev) => [...prev, { role: "assistant", content: "Authentication required to use the agent." }]);
        return;
      }
      if (resp.status === 504) {
        setMessages((prev) => [...prev, { role: "assistant", content: "Agent timed out. The backend took too long to respond." }]);
        return;
      }
      if (!resp.ok) {
        let detail = raw.slice(0, 240);
        try { detail = JSON.parse(raw).error || detail; } catch { /* keep raw */ }
        setMessages((prev) => [...prev, { role: "assistant", content: `Agent error (${resp.status}): ${detail}  [req ${reqId}]` }]);
        return;
      }

      let parsed: any = null;
      try { parsed = JSON.parse(raw); } catch {
        setMessages((prev) => [...prev, { role: "assistant", content: `Malformed response from agent. [req ${reqId}]` }]);
        return;
      }
      const reply = extractReply(parsed);
      setMessages((prev) => [...prev, { role: "assistant", content: reply || "(empty response)" }]);
    } catch (e: any) {
      const msg = e?.name === "AbortError" ? "Request timed out after 30s." : (e?.message || "Connection error");
      setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${msg}` }]);
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  };



  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(!open)}
        className="fixed bottom-4 right-4 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-colors"
        aria-label="Open chat"
      >
        {open ? <X className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
      </button>

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-20 right-4 z-50 flex h-[420px] w-[340px] flex-col border border-border bg-card shadow-2xl">
          {/* Header */}
          <div className="border-b border-border px-3 py-2 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-terminal-green" />
            <span className="text-xs font-bold uppercase tracking-wider text-foreground">TCD Terminal AI</span>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-auto p-3 space-y-3">
            {messages.map((m, i) => (
              <div key={i} className={`text-xs leading-relaxed ${m.role === "user" ? "text-primary ml-6" : "text-foreground mr-6"}`}>
                <span className="font-data text-[9px] uppercase tracking-wider text-muted-foreground block mb-0.5">
                  {m.role === "user" ? "YOU" : "TCD AI"}
                </span>
                {m.content}
              </div>
            ))}
            {loading && messages[messages.length - 1]?.role === "user" && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Analyzing...
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="border-t border-border p-2 flex gap-1">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="Ask about whale flows, liquidations..."
              className="flex-1 bg-secondary border border-border px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
            />
            <button
              onClick={send}
              disabled={loading || !input.trim()}
              className="border border-primary bg-primary/10 px-2 text-primary hover:bg-primary/20 disabled:opacity-50 transition-colors"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default ChatBubble;
