import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useSocialAuth, socialAuthHeaders } from "@/hooks/use-social-auth";
import {
  MessageSquare, Flag, Share2, Send, Users, ChevronDown, ChevronUp,
} from "lucide-react";
import { SiTelegram } from "react-icons/si";
import { Link } from "wouter";
import { ReportModal } from "@/components/ReportModal";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CommentProfile {
  username: string | null;
  avatarUrl: string | null;
  walletAddress: string;
}

interface TokenComment {
  id: number;
  userWallet: string;
  content: string;
  createdAt: string;
  profile: CommentProfile | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function shortWallet(w: string): string {
  if (w.length < 10) return w;
  return `${w.slice(0, 4)}…${w.slice(-4)}`;
}

// ── Single comment row ────────────────────────────────────────────────────────

function CommentRow({
  comment,
  token,
  onReport,
}: {
  comment: TokenComment;
  token: string | null;
  onReport: (id: number) => void;
}) {
  const display = comment.profile?.username ?? shortWallet(comment.userWallet);
  const profileHref = comment.profile?.username
    ? `/u/${comment.profile.username}`
    : `/u/${comment.userWallet}`;
  const initial = display.charAt(0).toUpperCase();
  const avatarCid = comment.profile?.profileImageIpfsCid;
  const avatarUrl = avatarCid
    ? (avatarCid.startsWith("http") ? avatarCid : `https://gateway.pinata.cloud/ipfs/${avatarCid}`)
    : null;

  return (
    <div
      className="flex gap-3 py-3 border-b border-border/40 last:border-0 group"
      data-testid={`comment-row-${comment.id}`}
    >
      {/* Avatar */}
      <Link href={profileHref}>
        <div className="w-8 h-8 rounded-full flex-shrink-0 overflow-hidden bg-primary/20 flex items-center justify-center text-xs font-bold text-primary cursor-pointer">
          {avatarUrl ? (
            <img src={avatarUrl} alt={display} className="w-full h-full object-cover" />
          ) : (
            initial
          )}
        </div>
      </Link>

      {/* Body */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Link href={profileHref}>
            <span
              className="text-xs font-semibold text-foreground/90 hover:text-primary cursor-pointer"
              data-testid={`comment-author-${comment.id}`}
            >
              {display}
            </span>
          </Link>
          <span className="text-[10px] text-muted-foreground">
            {timeAgo(comment.createdAt)}
          </span>
        </div>
        <p
          className="text-sm text-foreground/80 mt-0.5 break-words leading-relaxed"
          data-testid={`comment-content-${comment.id}`}
        >
          {comment.content}
        </p>
      </div>

      {/* Report */}
      {token && (
        <button
          onClick={() => onReport(comment.id)}
          title="Report comment"
          data-testid={`button-report-comment-${comment.id}`}
          className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 text-muted-foreground hover:text-amber-400 mt-0.5"
        >
          <Flag className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface TokenCommentsProps {
  mintAddress: string;
  tokenName?: string;
}

export function TokenComments({ mintAddress, tokenName }: TokenCommentsProps) {
  const { token, profile, signIn, loading: authLoading } = useSocialAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [reportingCommentId, setReportingCommentId] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const qKey = ["/api/comments/token", mintAddress];

  const { data: comments = [], isLoading } = useQuery<TokenComment[]>({
    queryKey: qKey,
    queryFn: () =>
      fetch(`/api/comments/token/${mintAddress}?limit=100`).then((r) => r.json()),
    refetchInterval: 15_000,
    staleTime: 10_000,
  });

  const postMutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...socialAuthHeaders(token),
        },
        body: JSON.stringify({ tokenContractAddress: mintAddress, content }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to post");
      return data;
    },
    onSuccess: () => {
      setText("");
      queryClient.invalidateQueries({ queryKey: qKey });
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  function handleSubmit() {
    const trimmed = text.trim();
    if (!trimmed) return;
    postMutation.mutate(trimmed);
  }

  // "Feather Squad" — shareable invite link.
  // Design choice: We generate a shareable URL to this token's comment section
  // (https://feather.app/dex/{ca}#comments) and a Telegram share link pointing
  // to it. Creating a dedicated Telegram *group* programmatically would require
  // the bot to have admin permissions, generate the group, store its invite
  // link per-token, and handle group management — that's a much larger surface.
  // The shareable URL approach is instant, zero-infra, and lets users paste it
  // into any Telegram/Discord group with one click.
  function handleTrenchSquad() {
    const url = `${window.location.origin}/dex/${mintAddress}#comments`;
    const tgUrl = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(
      `🪖 Join the Feather Squad for ${tokenName ?? mintAddress.slice(0, 8)} on Feather App!`
    )}`;
    window.open(tgUrl, "_blank", "noopener,noreferrer");
  }

  function handleCopyLink() {
    const url = `${window.location.origin}/dex/${mintAddress}#comments`;
    navigator.clipboard.writeText(url);
    toast({ title: "Link copied!", description: "Share it to invite your Feather Squad." });
  }

  return (
    <section id="comments" className="mt-6 bg-card border border-border/60 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
        <button
          onClick={() => setCollapsed((p) => !p)}
          className="flex items-center gap-2 text-sm font-semibold text-foreground/90 hover:text-foreground transition-colors"
          data-testid="button-toggle-comments"
        >
          <MessageSquare className="w-4 h-4 text-primary" />
          Trench Chat
          {comments.length > 0 && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{comments.length}</Badge>
          )}
          {collapsed ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />}
        </button>

        {/* Feather Squad + Share */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleTrenchSquad}
            data-testid="button-trench-squad"
            className="flex items-center gap-1.5 text-xs font-semibold text-primary border border-primary/30 rounded-lg px-2.5 py-1.5 hover:bg-primary/10 transition-colors"
            title="Share to Telegram — invite your Feather Squad"
          >
            <Users className="w-3.5 h-3.5" />
            <SiTelegram className="w-3 h-3" />
            Feather Squad
          </button>
          <button
            onClick={handleCopyLink}
            data-testid="button-copy-squad-link"
            className="text-muted-foreground hover:text-primary transition-colors"
            title="Copy shareable link"
          >
            <Share2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="px-4 pb-4">
          {/* Comment list */}
          <div className="max-h-[380px] overflow-y-auto mt-1 pr-1" data-testid="comments-list">
            {isLoading ? (
              <div className="py-8 text-center">
                <div className="text-muted-foreground text-sm animate-pulse">Loading comments…</div>
              </div>
            ) : comments.length === 0 ? (
              <div className="py-8 text-center">
                <MessageSquare className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-muted-foreground text-sm">No comments yet.</p>
                <p className="text-muted-foreground text-xs mt-0.5">Be the first to trench.</p>
              </div>
            ) : (
              <>
                {comments.map((c) => (
                  <CommentRow
                    key={c.id}
                    comment={c}
                    token={token}
                    onReport={(id) => setReportingCommentId(id)}
                  />
                ))}
                <div ref={bottomRef} />
              </>
            )}
          </div>

          {/* Input area */}
          <div className="mt-3 pt-3 border-t border-border/40">
            {!token && !authLoading ? (
              <div className="flex items-center justify-between bg-muted/30 rounded-xl px-4 py-3">
                <p className="text-sm text-muted-foreground">Sign in to join the Trench Chat</p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={signIn}
                  data-testid="button-signin-comments"
                  className="text-xs"
                >
                  Sign In
                </Button>
              </div>
            ) : (
              <div className="flex gap-2 items-end">
                {/* Commenter avatar */}
                <div className="w-7 h-7 rounded-full flex-shrink-0 bg-primary/20 flex items-center justify-center text-xs font-bold text-primary overflow-hidden mb-0.5">
                  {profile?.avatarUrl ? (
                    <img src={profile.avatarUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    (profile?.username ?? "?").charAt(0).toUpperCase()
                  )}
                </div>
                <div className="flex-1">
                  <Textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSubmit();
                      }
                    }}
                    placeholder="Write a comment… (Enter to send)"
                    className="resize-none min-h-[60px] text-sm bg-muted/30 border-border/50 focus:border-primary/50"
                    maxLength={500}
                    data-testid="input-comment"
                    disabled={postMutation.isPending}
                  />
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="text-[10px] text-muted-foreground">{text.length}/500</span>
                    <Button
                      size="sm"
                      onClick={handleSubmit}
                      disabled={!text.trim() || postMutation.isPending}
                      data-testid="button-post-comment"
                      className="text-xs gap-1.5"
                    >
                      <Send className="w-3 h-3" />
                      {postMutation.isPending ? "Posting…" : "Post"}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {reportingCommentId !== null && token && (
        <ReportModal
          reportedId={reportingCommentId}
          reportedType="comment"
          token={token}
          endpoint="/api/reports"
          onClose={() => setReportingCommentId(null)}
        />
      )}
    </section>
  );
}
