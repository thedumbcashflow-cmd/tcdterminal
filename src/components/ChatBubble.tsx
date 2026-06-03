import { useState, useRef, useEffect } from "react";
import { MessageCircle, X, Send, Loader2, LogIn } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

type Msg = { role: "user" | "assistant"; content: string; kind?: "text" | "auth" | "error" };

const SESSION_ID = "lovable-main-session";

function extractDelta(obj: any): string {
  if (!obj) return "";
  if (typeof obj === "string") return obj;
  return (
    obj.delta ?? obj.token ?? obj.text ?? obj.content ??
    obj.choices?.[0]?.delta?.content ?? obj.choices?.[0]?.message?.content ?? ""
  );
}
function finalReply(obj: any): string {
  if (!obj) return "";
  if (typeof obj === "string") return obj;
  return (
    obj.reply ?? obj.response ?? obj.message ?? obj.output ?? obj.content ??
    obj.choices?.[0]?.message?.content ?? JSON.stringify(obj)
  );
}

const ChatBubble = () => {
  const navigate = useNavigate();
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

  const appendAssistant = (content: string, kind: Msg["kind"] = "text") =>
    setMessages((prev) => [...prev, { role: "assistant", content, kind }]);

  const updateLastAssistant = (content: string) =>
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role !== "assistant" || last.kind !== "text") {
        return [...prev, { role: "assistant", content, kind: "text" }];
      }
      return [...prev.slice(0, -1), { ...last, content }];
    });

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setLoading(true);

    const ctrl = new AbortController();
    const timeoutId = setTimeout(() => ctrl.abort(), 60_000);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const bearer = session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/agent-proxy`;

      const resp = await fetch(url, {
        method: "POST",
        signal: ctrl.signal,
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream, application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${bearer}`,
        },
        body: JSON.stringify({ message: text, session: SESSION_ID, mode: "agent", stream: true }),
      });

      const reqId = resp.headers.get("x-request-id") || "—";

      if (resp.status === 401) {
        const reason = resp.headers.get("x-auth-reason") || "missing";
        const messagesByReason: Record<string, string> = {
          missing: "Sign in required to chat with the agent.",
          expired: "Your session expired. Please sign in again.",
          invalid: "Invalid credentials. Please sign in again.",
        };
        appendAssistant(messagesByReason[reason] || "Authentication required.", "auth");
        return;
      }
      if (resp.status === 429) { appendAssistant("Rate limit reached. Please wait a moment and try again.", "error"); return; }
      if (resp.status === 504) { appendAssistant("Agent timed out. The backend took too long to respond.", "error"); return; }
      if (!resp.ok) {
        const raw = await resp.text();
        let detail = raw.slice(0, 240);
        try { detail = JSON.parse(raw).error || detail; } catch { /* keep raw */ }
        appendAssistant(`Agent error (${resp.status}): ${detail}  [req ${reqId}]`, "error");
        return;
      }

      const ct = resp.headers.get("content-type") || "";
      // --- SSE stream path ---
      if (ct.includes("text/event-stream") && resp.body) {
        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let assistantSoFar = "";
        // seed placeholder bubble for incremental updates
        setMessages((prev) => [...prev, { role: "assistant", content: "", kind: "text" }]);

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let idx: number;
          while ((idx = buffer.indexOf("\n")) !== -1) {
            let line = buffer.slice(0, idx); buffer = buffer.slice(idx + 1);
            if (line.endsWith("\r")) line = line.slice(0, -1);
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (!payload || payload === "[DONE]") continue;
            let chunk = "";
            try { chunk = extractDelta(JSON.parse(payload)); }
            catch { chunk = payload; }
            if (chunk) {
              assistantSoFar += chunk;
              updateLastAssistant(assistantSoFar);
            }
          }
        }
        if (!assistantSoFar) updateLastAssistant("(empty response)");
        return;
      }

      // --- Buffered JSON path ---
      const raw = await resp.text();
      let parsed: any = null;
      try { parsed = JSON.parse(raw); } catch {
        appendAssistant(`Malformed response from agent. [req ${reqId}]`, "error");
        return;
      }
      appendAssistant(finalReply(parsed) || "(empty response)");
    } catch (e: any) {
      const msg = e?.name === "AbortError" ? "Request timed out after 60s." : (e?.message || "Connection error");
      appendAssistant(`Error: ${msg}`, "error");
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        className="fixed bottom-4 right-4 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-colors"
        aria-label="Open chat"
      >
        {open ? <X className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
      </button>

      {open && (
        <div className="fixed bottom-20 right-4 z-50 flex h-[420px] w-[340px] flex-col border border-border bg-card shadow-2xl">
          <div className="border-b border-border px-3 py-2 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-terminal-green" />
            <span className="text-xs font-bold uppercase tracking-wider text-foreground">TCD Terminal AI</span>
          </div>

          <div className="flex-1 overflow-auto p-3 space-y-3">
            {messages.map((m, i) => {
              const isAuth = m.kind === "auth";
              const isErr = m.kind === "error";
              return (
                <div
                  key={i}
                  className={`text-xs leading-relaxed ${
                    m.role === "user"
                      ? "text-primary ml-6"
                      : isAuth
                      ? "border border-amber-500/40 bg-amber-500/10 p-2 text-amber-300 mr-6"
                      : isErr
                      ? "border border-terminal-red/40 bg-terminal-red/10 p-2 text-terminal-red mr-6"
                      : "text-foreground mr-6"
                  }`}
                >
                  <span className="font-data text-[9px] uppercase tracking-wider text-muted-foreground block mb-0.5">
                    {m.role === "user" ? "YOU" : isAuth ? "AUTH REQUIRED" : isErr ? "ERROR" : "TCD AI"}
                  </span>
                  {m.content}
                  {isAuth && (
                    <button
                      onClick={() => { setOpen(false); navigate("/auth"); }}
                      className="mt-2 inline-flex items-center gap-1 border border-amber-500/40 px-2 py-0.5 text-[10px] uppercase tracking-wider hover:bg-amber-500/20"
                    >
                      <LogIn className="h-3 w-3" /> Sign in
                    </button>
                  )}
                </div>
              );
            })}
            {loading && messages[messages.length - 1]?.role === "user" && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Analyzing...
              </div>
            )}
            <div ref={bottomRef} />
          </div>

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
