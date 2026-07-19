import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { SocialLayout } from "@/components/SocialLayout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useWalletConnect } from "@/hooks/use-wallet-connect";
import { useSocialAuth, socialAuthHeaders } from "@/hooks/use-social-auth";
import { useToast } from "@/hooks/use-toast";
import { Send, Bot, Plus, Trash2, ChevronRight, Zap, Search, TrendingUp, Shield, AlertTriangle, Sparkles, MessageSquare, Flame } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "wouter";

const ADMIN_WALLET = "0x752C3b6CB472D426AD0438f202A46dFa7D58aF34";

function randomId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  chunks?: StreamChunk[];
  streaming?: boolean;
}

interface StreamChunk {
  type: "thinking" | "tool" | "text" | "done" | "error";
  content?: string;
  toolName?: string;
}

interface AiMessage {
  id: number;
  walletAddress: string;
  sessionId: string;
  role: string;
  content: string;
  createdAt: string;
}

interface AiSession {
  sessionId: string;
  lastMessage: string;
  createdAt: string;
}

const QUICK_PROMPTS = [
  { icon: <Search className="w-4 h-4" />, label: "Research a token", prompt: "Research the token " },
  { icon: <TrendingUp className="w-4 h-4" />, label: "Market analysis", prompt: "Give me a current market analysis of Robinhood Chain meme coins — what's trending and why?" },
  { icon: <Shield className="w-4 h-4" />, label: "Rug pull check", prompt: "How do I identify potential rug pulls on Robinhood Chain? What red flags should I look for?" },
  { icon: <Zap className="w-4 h-4" />, label: "Gem hunting", prompt: "What's your strategy for finding early-stage gem tokens on Robinhood Chain before they pump?" },
  { icon: <AlertTriangle className="w-4 h-4" />, label: "DYOR checklist", prompt: "Give me a thorough DYOR checklist for evaluating a new Robinhood Chain token launch." },
];

function ThinkingBubble({ content }: { content: string }) {
  return (
    <div className="flex items-start gap-2 text-xs text-muted-foreground/70 italic pl-1 my-1">
      <Sparkles className="w-3 h-3 mt-0.5 shrink-0 text-primary/40 animate-pulse" />
      <span className="line-clamp-2">{content}</span>
    </div>
  );
}

function ToolBubble({ toolName }: { toolName?: string }) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground/60 pl-1 my-1">
      <Zap className="w-3 h-3 shrink-0 text-yellow-500/60" />
      <span>Running tool: <span className="font-mono text-yellow-400/70">{toolName ?? "unknown"}</span></span>
    </div>
  );
}

function MarkdownContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
        strong: ({ children }) => <strong className="font-bold text-foreground">{children}</strong>,
        em: ({ children }) => <em className="italic">{children}</em>,
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 hover:opacity-80 break-all">
            {children}
          </a>
        ),
        ul: ({ children }) => <ul className="list-disc pl-5 mb-2 space-y-0.5">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal pl-5 mb-2 space-y-0.5">{children}</ol>,
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        code: ({ children, className }) => {
          const isBlock = className?.includes("language-");
          return isBlock
            ? <code className="block bg-black/30 border border-border rounded-lg px-3 py-2 text-xs font-mono my-2 overflow-x-auto whitespace-pre">{children}</code>
            : <code className="bg-black/30 border border-border rounded px-1 py-0.5 text-xs font-mono">{children}</code>;
        },
        pre: ({ children }) => <pre className="overflow-x-auto">{children}</pre>,
        blockquote: ({ children }) => <blockquote className="border-l-2 border-primary/40 pl-3 italic text-muted-foreground my-2">{children}</blockquote>,
        h1: ({ children }) => <h1 className="text-base font-bold mb-2 mt-3 first:mt-0">{children}</h1>,
        h2: ({ children }) => <h2 className="text-sm font-bold mb-1.5 mt-2.5 first:mt-0">{children}</h2>,
        h3: ({ children }) => <h3 className="text-sm font-semibold mb-1 mt-2 first:mt-0">{children}</h3>,
        hr: () => <hr className="border-border my-3" />,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === "user";
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}
    >
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center shrink-0 mt-0.5">
          <Bot className="w-4 h-4 text-primary" />
        </div>
      )}
      <div className={`max-w-[82%] ${isUser ? "items-end" : "items-start"} flex flex-col gap-1`}>
        {msg.chunks && msg.chunks.filter(c => c.type === "thinking").map((c, i) => (
          <ThinkingBubble key={i} content={c.content ?? ""} />
        ))}
        {msg.chunks && msg.chunks.filter(c => c.type === "tool").map((c, i) => (
          <ToolBubble key={i} toolName={c.toolName} />
        ))}
        <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed break-words ${
          isUser
            ? "bg-primary text-primary-foreground rounded-tr-sm whitespace-pre-wrap"
            : "bg-card border border-border/50 text-foreground rounded-tl-sm"
        }`}>
          {isUser
            ? (msg.content || "")
            : msg.content
              ? <MarkdownContent content={msg.content} />
              : msg.streaming
                ? <span className="inline-flex gap-1 items-center"><span className="animate-bounce" style={{animationDelay:"0ms"}}>·</span><span className="animate-bounce" style={{animationDelay:"150ms"}}>·</span><span className="animate-bounce" style={{animationDelay:"300ms"}}>·</span></span>
                : ""
          }
        </div>
        {msg.streaming && (
          <div className="text-[10px] text-muted-foreground/50 pl-1">Feather AI is thinking…</div>
        )}
      </div>
    </motion.div>
  );
}

export default function TrenchyAI() {
  const wallet = useWalletConnect();
  const { token, profile, signIn, loading: authLoading } = useSocialAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<(() => void) | null>(null);

  const [sessionId, setSessionId] = useState<string>(() => randomId());
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);

  const isAdmin = wallet.publicKey?.toLowerCase() === ADMIN_WALLET.toLowerCase();

  const { data: aiConfig } = useQuery<{ minTrenchyToAI: number; aiDailyLimit: number }>({
    queryKey: ["/api/ai/config"],
    queryFn: () => fetch("/api/ai/config").then(r => r.json()),
    staleTime: 60_000,
  });
  const aiDailyLimit = aiConfig?.aiDailyLimit ?? 10;

  const { data: usageData, refetch: refetchUsage } = useQuery<{ used: number; limit: number | null; remaining: number | null }>({
    queryKey: ["/api/ai/usage"],
    queryFn: () => fetch("/api/ai/usage", { headers: socialAuthHeaders(token) }).then(r => r.json()),
    enabled: !!token && !isAdmin,
    refetchOnWindowFocus: false,
  });

  const { data: sessionsRaw, refetch: refetchSessions } = useQuery<AiSession[]>({
    queryKey: ["/api/ai/sessions"],
    queryFn: () =>
      fetch("/api/ai/sessions", { headers: socialAuthHeaders(token) }).then(r =>
        r.ok ? r.json() : []
      ).catch(() => []),
    enabled: !!token,
  });
  const sessions: AiSession[] = Array.isArray(sessionsRaw) ? sessionsRaw : [];

  const loadSession = useCallback(async (sid: string) => {
    setSessionId(sid);
    try {
      const history: AiMessage[] = await fetch(`/api/ai/history/${sid}`, {
        headers: socialAuthHeaders(token),
      }).then(r => r.json());
      setMessages(history.map(m => ({
        id: String(m.id),
        role: m.role as "user" | "assistant",
        content: m.content,
      })));
    } catch {
      setMessages([]);
    }
  }, [token]);

  const clearSession = useCallback(async (sid: string) => {
    await fetch(`/api/ai/sessions/${sid}`, {
      method: "DELETE",
      headers: socialAuthHeaders(token),
    });
    if (sid === sessionId) {
      setMessages([]);
      setSessionId(randomId());
    }
    refetchSessions();
  }, [token, sessionId, refetchSessions]);

  const newChat = useCallback(() => {
    if (abortRef.current) abortRef.current();
    abortRef.current = null;
    setStreaming(false);
    setMessages([]);
    setSessionId(randomId());
    refetchSessions();
    setTimeout(() => textareaRef.current?.focus(), 100);
  }, [refetchSessions]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || streaming) return;
    if (!token) {
      toast({ title: "Sign in required", description: "Please sign in to your Feather profile first.", variant: "destructive" });
      return;
    }
    setInput("");

    const userMsg: ChatMessage = { id: randomId(), role: "user", content: text.trim() };
    setMessages(prev => [...prev, userMsg]);

    const assistantId = randomId();
    const assistantMsg: ChatMessage = { id: assistantId, role: "assistant", content: "", chunks: [], streaming: true };
    setMessages(prev => [...prev, assistantMsg]);
    setStreaming(true);

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...socialAuthHeaders(token) },
        body: JSON.stringify({ message: text.trim(), sessionId }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        setMessages(prev => prev.map(m =>
          m.id === assistantId ? { ...m, content: err.error ?? "Error connecting to Feather AI.", streaming: false } : m
        ));
        setStreaming(false);
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let aborted = false;
      let finished = false;

      abortRef.current = () => { aborted = true; reader.cancel(); };

      while (!finished) {
        const { done, value } = await reader.read();
        if (done || aborted) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const chunk: StreamChunk = JSON.parse(line.slice(6));
            if (chunk.type === "done") {
              setMessages(prev => prev.map(m =>
                m.id === assistantId ? { ...m, streaming: false } : m
              ));
              setStreaming(false);
              refetchSessions();
              refetchUsage();
              finished = true;
              break;
            }
            if (chunk.type === "error") {
              setMessages(prev => prev.map(m =>
                m.id === assistantId ? { ...m, content: chunk.content ?? "An error occurred.", streaming: false } : m
              ));
              setStreaming(false);
              finished = true;
              break;
            }
            if (chunk.type === "text" && chunk.content) {
              setMessages(prev => prev.map(m =>
                m.id === assistantId
                  ? { ...m, content: m.content + chunk.content, chunks: [...(m.chunks ?? []), chunk] }
                  : m
              ));
            } else if (chunk.type === "thinking" || chunk.type === "tool") {
              setMessages(prev => prev.map(m =>
                m.id === assistantId
                  ? { ...m, chunks: [...(m.chunks ?? []), chunk] }
                  : m
              ));
            }
          } catch {}
        }
      }
    } catch (err: any) {
      setMessages(prev => prev.map(m =>
        m.id === assistantId ? { ...m, content: "Connection lost. Please try again.", streaming: false } : m
      ));
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [streaming, token, sessionId, refetchSessions]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  if (!wallet.connected) {
    return (
      <SocialLayout>
        <div className="flex flex-col items-center justify-center h-[60vh] text-center px-4">
          <Bot className="w-12 h-12 text-primary mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-3">Feather AI</h1>
          <p className="text-muted-foreground mb-6 text-sm">Connect your wallet to access Feather AI.</p>
          <Button onClick={() => wallet.connect()} data-testid="button-connect-feather-ai">
            Connect Wallet
          </Button>
        </div>
      </SocialLayout>
    );
  }

  return (
    <SocialLayout>
      <div className="flex overflow-hidden" style={{ height: "calc(100vh - 56px)" }}>

        {/* AI sessions sidebar */}
        <aside className="hidden xl:flex flex-col w-56 border-r border-border/40 bg-card/30 shrink-0 overflow-hidden">
          <div className="p-4 border-b border-border/30">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center">
                <Bot className="w-4 h-4 text-primary" />
              </div>
              <span className="font-bold text-sm">Feather AI</span>
              <span className="ml-auto text-[9px] bg-primary/20 text-primary px-1.5 py-0.5 rounded font-semibold">BETA</span>
            </div>
            <Button
              data-testid="button-new-chat"
              onClick={newChat}
              size="sm"
              className="w-full gap-2"
              variant="outline"
            >
              <Plus className="w-3.5 h-3.5" />
              New Chat
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {sessions.length === 0 ? (
              <div className="text-center text-xs text-muted-foreground py-6 px-3">
                <MessageSquare className="w-5 h-5 mx-auto mb-2 opacity-30" />
                <p>No conversations yet</p>
              </div>
            ) : (
              <div className="space-y-0.5">
                {sessions.map((s) => (
                  <div
                    key={s.sessionId}
                    data-testid={`button-session-${s.sessionId}`}
                    className={`group flex items-center gap-2 w-full px-3 py-2 rounded-lg text-left cursor-pointer transition-colors hover:bg-muted ${
                      s.sessionId === sessionId ? "bg-muted/50 text-foreground" : "text-muted-foreground"
                    }`}
                    onClick={() => loadSession(s.sessionId)}
                  >
                    <MessageSquare className="w-3 h-3 shrink-0" />
                    <span className="text-xs flex-1 truncate">{s.lastMessage.slice(0, 40)}</span>
                    <button
                      data-testid={`button-delete-session-${s.sessionId}`}
                      onClick={(e) => { e.stopPropagation(); clearSession(s.sessionId); }}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-400 transition-all"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="p-3 border-t border-border/30">
            <p className="text-[10px] text-muted-foreground text-center leading-relaxed">
              DYOR — Feather AI is not financial advice.<br />
              Always verify on-chain data yourself.
            </p>
          </div>
        </aside>

        {/* Main chat area */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {messages.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center px-4 overflow-y-auto">
              <div className="w-16 h-16 rounded-2xl bg-primary/15 border border-primary/25 flex items-center justify-center mb-5">
                <Bot className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-2xl font-bold mb-1">Feather AI</h2>
              <p className="text-muted-foreground text-sm mb-8 text-center max-w-xs">
                Your AI guide to the Robinhood Chain markets. Ask me anything about tokens, projects, or market trends.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-xl">
                {QUICK_PROMPTS.map((p) => (
                  <button
                    key={p.label}
                    data-testid={`button-prompt-${p.label.toLowerCase().replace(/\s/g, "-")}`}
                    onClick={() => { setInput(p.prompt); textareaRef.current?.focus(); }}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl border border-border/50 bg-card/50 hover:bg-card hover:border-primary/30 transition-all text-left group"
                  >
                    <span className="text-muted-foreground group-hover:text-primary transition-colors">{p.icon}</span>
                    <div>
                      <div className="text-sm font-medium">{p.label}</div>
                      <div className="text-xs text-muted-foreground truncate">{p.prompt.slice(0, 40)}…</div>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground ml-auto group-hover:text-primary transition-colors" />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto px-4 py-6 space-y-5">
              <AnimatePresence initial={false}>
                {messages.map((msg) => (
                  <MessageBubble key={msg.id} msg={msg} />
                ))}
              </AnimatePresence>
              <div ref={messagesEndRef} />
            </div>
          )}

          {/* Input bar */}
          <div className="shrink-0 px-4 pb-4 pt-2 border-t border-border/30 bg-background/80 backdrop-blur">
            {!token && (
              <div className="max-w-3xl mx-auto mb-3 flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-primary/10 border border-primary/20">
                <p className="text-xs text-muted-foreground">Sign in to your Feather profile to start chatting.</p>
                <Button
                  data-testid="button-signin-ai"
                  size="sm"
                  variant="outline"
                  className="shrink-0 text-xs h-7 px-3"
                  onClick={() => signIn()}
                  disabled={authLoading}
                >
                  {authLoading ? "Signing in…" : "Sign In"}
                </Button>
              </div>
            )}
            <div className="max-w-3xl mx-auto flex gap-2 items-end">
              <div className="flex-1 relative">
                <Textarea
                  ref={textareaRef}
                  data-testid="input-ai-message"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={token ? "Ask Feather AI anything…" : "Sign in above to start chatting…"}
                  rows={1}
                  disabled={streaming || !token}
                  className="resize-none min-h-[44px] max-h-[160px] pr-4 py-3 text-sm bg-card border-border/50 focus:border-primary/50 rounded-xl overflow-y-auto"
                  style={{ fieldSizing: "content" } as any}
                />
              </div>
              <Button
                data-testid="button-send-ai"
                onClick={() => sendMessage(input)}
                disabled={streaming || !input.trim() || !token}
                size="icon"
                className="h-11 w-11 rounded-xl shrink-0"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex items-center justify-center gap-3 mt-2">
              <p className="text-center text-[10px] text-muted-foreground">
                Feather AI can make mistakes. Always DYOR before investing.
              </p>
              {!isAdmin && usageData && (
                <span className={`shrink-0 inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border ${
                  (usageData.remaining ?? 0) === 0
                    ? "bg-red-500/10 border-red-500/30 text-red-400"
                    : (usageData.remaining ?? 0) <= 3
                    ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
                    : "bg-card border-border/40 text-muted-foreground"
                }`}>
                  <Flame className="w-2.5 h-2.5" />
                  {usageData.remaining ?? 0}/{aiDailyLimit} prompts left today
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </SocialLayout>
  );
}
