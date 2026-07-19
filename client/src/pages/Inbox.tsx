import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { SocialLayout } from "@/components/SocialLayout";
import { SponsoredSidebar } from "@/components/SponsoredSidebar";
import { useTier } from "@/components/TierBadge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useSocialAuth, socialAuthHeaders } from "@/hooks/use-social-auth";
import { apiRequest } from "@/lib/queryClient";
import { Inbox as InboxIcon, Send, Lock, MessageCircle, User, Flag, Check, PenSquare } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface ProfileSnip {
  walletAddress: string;
  username: string | null;
  profileImageIpfsCid: string | null;
}

interface InboxMessage {
  id: number;
  fromWallet: string;
  toWallet: string;
  content: string;
  readAt: string | null;
  createdAt: string;
  fromProfile: ProfileSnip | null;
}

interface SentMessage {
  id: number;
  fromWallet: string;
  toWallet: string;
  content: string;
  readAt: string | null;
  createdAt: string;
  toProfile: ProfileSnip | null;
}

function Avatar({ cid, username }: { cid: string | null; username: string | null }) {
  const src = cid ? `https://gateway.pinata.cloud/ipfs/${cid}` : null;
  return src
    ? <img src={src} alt={username ?? "?"} className="w-10 h-10 rounded-full object-cover border border-border/40 shrink-0" />
    : <div className="w-10 h-10 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-primary font-bold text-xs shrink-0">{username ? username.slice(0, 2).toUpperCase() : "??"}</div>;
}

type Tab = "inbox" | "sent" | "compose";

export default function InboxPage() {
  const [tab, setTab] = useState<Tab>("inbox");
  const [toWallet, setToWallet] = useState("");
  const [reportedIds, setReportedIds] = useState<Set<number>>(new Set());
  const [body, setBody] = useState("");
  const { toast } = useToast();
  const qc = useQueryClient();
  const { token, profile } = useSocialAuth();
  const { data: tierInfo, isLoading: tierLoading } = useTier(profile?.walletAddress);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const to = params.get("to");
    if (to) { setToWallet(to); setTab("compose"); }
  }, []);

  const canSend = tierInfo && tierInfo.tier >= 2;

  const { data: inbox = [], isLoading: inboxLoading } = useQuery<InboxMessage[]>({
    queryKey: ["/api/messages/inbox"],
    queryFn: () => fetch("/api/messages/inbox", { headers: socialAuthHeaders(token) }).then(async (r) => {
      if (!r.ok) throw new Error((await r.json()).error);
      return r.json();
    }),
    enabled: !!token,
    refetchInterval: 30_000,
  });

  const { data: sent = [], isLoading: sentLoading } = useQuery<SentMessage[]>({
    queryKey: ["/api/messages/sent"],
    queryFn: () => fetch("/api/messages/sent", { headers: socialAuthHeaders(token) }).then(async (r) => {
      if (!r.ok) throw new Error((await r.json()).error);
      return r.json();
    }),
    enabled: !!token && canSend === true && tab === "sent",
  });

  const sendMutation = useMutation({
    mutationFn: () => fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...socialAuthHeaders(token) },
      body: JSON.stringify({ toWallet: toWallet.trim(), content: body }),
    }).then(async (r) => { if (!r.ok) throw new Error((await r.json()).error ?? "Failed"); return r.json(); }),
    onSuccess: () => {
      toast({ title: "Message sent!" });
      setToWallet("");
      setBody("");
      setTab("sent");
      qc.invalidateQueries({ queryKey: ["/api/messages/sent"] });
    },
    onError: (err: any) => toast({ title: "Failed to send", description: err?.message ?? "Something went wrong", variant: "destructive" }),
  });

  const reportMutation = useMutation({
    mutationFn: (msgId: number) => apiRequest("POST", "/api/social/report", { reportedId: msgId, reportedType: "dm", reason: "inappropriate" }),
    onSuccess: (_data, msgId) => {
      setReportedIds((prev) => new Set(prev).add(msgId));
      toast({ title: "Message reported", description: "Our moderation team will review it." });
    },
    onError: () => toast({ title: "Report failed", description: "Please try again.", variant: "destructive" }),
  });

  const unread = inbox.filter((m) => !m.readAt).length;

  const tabs: { id: Tab; label: string; always: boolean }[] = [
    { id: "inbox", label: `Inbox${unread > 0 ? ` (${unread})` : ""}`, always: true },
    { id: "sent", label: "Sent", always: false },
    { id: "compose", label: "Compose", always: false },
  ];

  return (
    <SocialLayout rightSidebar={<SponsoredSidebar placement="feed" />}>
      {/* Sticky header */}
      <div className="sticky top-14 lg:top-0 z-20 bg-background/95 backdrop-blur border-b border-border">
        <div className="flex items-center justify-between px-4 py-3">
          <h1 className="text-[17px] font-bold flex items-center gap-2">
            <InboxIcon className="w-5 h-5 text-blue-400" />
            Messages
            {unread > 0 && (
              <span className="text-xs px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground font-bold">{unread}</span>
            )}
          </h1>
          {canSend && (
            <button
              onClick={() => setTab("compose")}
              data-testid="button-compose-new"
              className="p-2 rounded-full hover:bg-muted transition-colors text-primary"
              title="Compose new message"
            >
              <PenSquare className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border">
          {tabs.filter((t) => t.always || canSend).map((t) => (
            <button
              key={t.id}
              data-testid={`tab-inbox-${t.id}`}
              onClick={() => setTab(t.id)}
              className={`flex-1 py-3 text-sm font-medium relative transition-colors ${
                tab === t.id ? "text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
              }`}
            >
              {t.label}
              {tab === t.id && (
                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-[3px] rounded-full bg-primary" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Auth gate */}
      {!token && (
        <div className="flex flex-col items-center gap-4 py-24 text-center px-4">
          <Lock className="w-10 h-10 text-muted-foreground/30" />
          <p className="text-muted-foreground text-sm">Sign in to access your inbox.</p>
          <Link href="/profile" className="text-primary hover:underline text-sm">Sign in →</Link>
        </div>
      )}

      {token && tierLoading && (
        <div className="p-4 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      )}

      {token && !tierLoading && (
        <div className="divide-y divide-border">
          {/* Tier notice */}
          {!canSend && (
            <div className="px-4 py-3 bg-muted/30 flex items-center gap-2 text-xs text-muted-foreground">
              <Lock className="w-3.5 h-3.5 shrink-0" />
              Sending DMs requires 500k+ $FEATHER (Elite)
            </div>
          )}

          {/* Inbox */}
          {tab === "inbox" && (
            inboxLoading
              ? <div className="p-4 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
              : inbox.length === 0
                ? (
                  <div className="text-center py-20 text-muted-foreground">
                    <InboxIcon className="w-8 h-8 mx-auto mb-2 opacity-20" />
                    <p className="text-sm">Your inbox is empty</p>
                  </div>
                )
                : inbox.map((msg) => (
                  <div
                    key={msg.id}
                    data-testid={`row-inbox-${msg.id}`}
                    className={`flex items-start gap-3 px-4 py-4 hover:bg-muted/20 transition-colors ${!msg.readAt ? "bg-primary/5" : ""}`}
                  >
                    <Avatar cid={msg.fromProfile?.profileImageIpfsCid ?? null} username={msg.fromProfile?.username ?? null} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {msg.fromProfile?.username
                          ? <Link href={`/u/${msg.fromWallet}`} className="text-sm font-bold hover:text-primary" data-testid={`link-from-${msg.id}`}>@{msg.fromProfile.username}</Link>
                          : <span className="text-xs font-mono text-muted-foreground">{msg.fromWallet.slice(0, 8)}…</span>
                        }
                        {!msg.readAt && <span className="w-2 h-2 rounded-full bg-primary shrink-0" />}
                        <span className="text-xs text-muted-foreground ml-auto">{formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true })}</span>
                        <button
                          data-testid={`button-report-dm-${msg.id}`}
                          onClick={() => !reportedIds.has(msg.id) && reportMutation.mutate(msg.id)}
                          disabled={reportedIds.has(msg.id) || reportMutation.isPending}
                          title={reportedIds.has(msg.id) ? "Reported" : "Report this message"}
                          className={`shrink-0 p-1 rounded transition-colors ${reportedIds.has(msg.id) ? "text-emerald-400" : "text-muted-foreground/40 hover:text-red-400"}`}
                        >
                          {reportedIds.has(msg.id) ? <Check className="w-3.5 h-3.5" /> : <Flag className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                      <p className="text-sm text-muted-foreground break-words">{msg.content}</p>
                    </div>
                  </div>
                ))
          )}

          {/* Sent */}
          {tab === "sent" && (
            sentLoading
              ? <div className="p-4 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
              : sent.length === 0
                ? (
                  <div className="text-center py-20 text-muted-foreground">
                    <Send className="w-8 h-8 mx-auto mb-2 opacity-20" />
                    <p className="text-sm">No messages sent yet</p>
                  </div>
                )
                : sent.map((msg) => (
                  <div key={msg.id} data-testid={`row-sent-${msg.id}`} className="flex items-start gap-3 px-4 py-4 hover:bg-muted/20 transition-colors">
                    <div className="w-10 h-10 rounded-full bg-muted border border-border/40 flex items-center justify-center shrink-0">
                      <User className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {msg.toProfile?.username
                          ? <Link href={`/u/${msg.toWallet}`} className="text-sm font-bold hover:text-primary">→ @{msg.toProfile.username}</Link>
                          : <span className="text-xs font-mono text-muted-foreground">→ {msg.toWallet.slice(0, 8)}…</span>
                        }
                        <span className="text-xs text-muted-foreground ml-auto">{formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true })}</span>
                      </div>
                      <p className="text-sm text-muted-foreground break-words">{msg.content}</p>
                    </div>
                  </div>
                ))
          )}

          {/* Compose */}
          {tab === "compose" && (
            <div className="px-4 py-6 space-y-4">
              <h3 className="font-semibold text-sm">New Message</h3>
              <div className="text-[10px] text-muted-foreground/60 leading-tight">
                Messages are moderated. Do not share private keys or sensitive info.
              </div>
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground font-medium">Recipient Wallet Address</label>
                <Input
                  data-testid="input-to-wallet"
                  value={toWallet}
                  onChange={(e) => setToWallet(e.target.value)}
                  placeholder="EVM wallet address or paste from profile"
                  className="font-mono text-sm"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground font-medium">Message</label>
                <Textarea
                  data-testid="input-message-body"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Write your message…"
                  rows={5}
                  maxLength={500}
                  className="resize-none text-sm"
                />
                <div className="text-xs text-muted-foreground text-right">{body.length}/500</div>
              </div>
              <Button
                data-testid="button-send-message"
                disabled={!toWallet.trim() || !body.trim() || sendMutation.isPending}
                onClick={() => sendMutation.mutate()}
                className="w-full gap-2"
              >
                <Send className="w-4 h-4" />
                {sendMutation.isPending ? "Sending…" : "Send Message"}
              </Button>
            </div>
          )}
        </div>
      )}
    </SocialLayout>
  );
}
