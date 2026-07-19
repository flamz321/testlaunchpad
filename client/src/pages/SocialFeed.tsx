import { useState, useRef, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSocialAuth, socialAuthHeaders } from "@/hooks/use-social-auth";
import { useWalletConnect } from "@/hooks/use-wallet-connect";
import { useToast } from "@/hooks/use-toast";
import { SocialLayout } from "@/components/SocialLayout";
import { ReportModal } from "@/components/ReportModal";
import { SocialAdSpot } from "@/components/SocialAdSpot";
import { SponsoredSidebar } from "@/components/SponsoredSidebar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Users, Globe, MessageCircle, Trash2, Loader2, ImagePlus, Send,
  LogIn, UserPlus, UserMinus, Flag, X, RefreshCw, Settings, ExternalLink, Megaphone, CornerDownRight,
  Rocket, TrendingUp, Flame, Zap, Hash, Copy, Check, Heart
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import DOMPurify from "dompurify";

function clean(s: string): string {
  return DOMPurify.sanitize(s, { ALLOWED_TAGS: [] });
}

// ── Rich content renderer (@mentions, #hashtags) ───────────────────────────────

function RichContent({ content, onHashtagClick }: { content: string; onHashtagClick?: (tag: string) => void }) {
  const safe = clean(content);
  const parts = safe.split(/((?<!\w)@[a-zA-Z0-9_]{1,32}|(?<!\w)#[a-zA-Z][a-zA-Z0-9_]{1,49})/g);
  return (
    <span>
      {parts.map((part, i) => {
        if (/^@[a-zA-Z0-9_]+$/.test(part)) {
          const handle = part.slice(1);
          return (
            <Link key={i} href={`/u/${handle}`} className="text-primary hover:underline font-medium">
              {part}
            </Link>
          );
        }
        if (/^#[a-zA-Z][a-zA-Z0-9_]*$/.test(part)) {
          const tag = part.slice(1).toLowerCase();
          return (
            <button
              key={i}
              onClick={(e) => { e.stopPropagation(); onHashtagClick?.(tag); }}
              className="text-primary/80 hover:text-primary hover:underline font-medium"
            >
              {part}
            </button>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
}

// ── Like button ────────────────────────────────────────────────────────────────

function LikeButton({ feedItemId, likeCount, likedByViewer, token }: {
  feedItemId: number;
  likeCount: number;
  likedByViewer: boolean;
  token: string | null;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [optimisticLiked, setOptimisticLiked] = useState(likedByViewer);
  const [optimisticCount, setOptimisticCount] = useState(likeCount);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setOptimisticLiked(likedByViewer);
    setOptimisticCount(likeCount);
  }, [likedByViewer, likeCount]);

  async function toggle() {
    if (!token) {
      toast({ title: "Sign in to like posts", variant: "destructive" });
      return;
    }
    if (pending) return;
    const wasLiked = optimisticLiked;
    setOptimisticLiked(!wasLiked);
    setOptimisticCount((c) => wasLiked ? c - 1 : c + 1);
    setPending(true);
    try {
      const res = await fetch(`/api/social/feed/${feedItemId}/like`, {
        method: "POST",
        headers: socialAuthHeaders(token) as Record<string, string>,
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const { liked, count } = await res.json();
      setOptimisticLiked(liked);
      setOptimisticCount(count);
      // No cache invalidation needed — optimistic state is already accurate
      // and triggering full feed refetches on every like is expensive
    } catch {
      setOptimisticLiked(wasLiked);
      setOptimisticCount((c) => wasLiked ? c + 1 : c - 1);
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      data-testid={`button-like-${feedItemId}`}
      onClick={toggle}
      disabled={pending}
      className={`flex items-center gap-1.5 text-xs transition-colors ${
        optimisticLiked ? "text-rose-400" : "text-muted-foreground hover:text-rose-400"
      }`}
    >
      <Heart className={`w-3.5 h-3.5 ${optimisticLiked ? "fill-rose-400" : ""}`} />
      {optimisticCount > 0 && <span>{optimisticCount}</span>}
    </button>
  );
}

// ── Launch feed helpers ────────────────────────────────────────────────────────
interface LaunchItem {
  id: string;
  mintAddress: string;
  name: string;
  ticker: string;
  imageUrl?: string | null;
  description?: string | null;
  launchpad: string;
  mcap?: number;
  volume24h?: number;
  priceUsd?: string | null;
  dexUrl?: string | null;
  pumpUrl?: string | null;
  createdAt: string;
}

interface LaunchFeedResponse {
  items: LaunchItem[];
  page: number;
  limit: number;
  total: number;
}

function fmtMcapSmall(n?: number): string {
  if (!n) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}
function fmtPriceSmall(p?: string | null): string {
  if (!p) return "";
  const n = Number(p);
  if (!n || isNaN(n) || n <= 0) return "";
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(4)}`;
  if (n >= 0.000001) return `$${n.toFixed(8)}`;
  return `$${n.toFixed(12)}`;
}

function MiniLaunchCard({ item }: { item: LaunchItem }) {
  const [copied, setCopied] = useState(false);
  const apeUrl = item.pumpUrl ?? `https://app.uniswap.org/explore/tokens/robinhood/${item.mintAddress}`;
  const lpColor = item.launchpad === "uniswap"
    ? "text-blue-400 border-blue-400/30 bg-blue-400/10"
    : "text-emerald-400 border-emerald-400/30 bg-emerald-400/10";

  function copy() {
    navigator.clipboard.writeText(item.mintAddress).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div data-testid={`card-launch-tab-${item.id}`} className="glass-panel rounded-xl p-3.5 mb-2.5 hover:border-border transition-all">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg overflow-hidden bg-muted/50 border border-border flex items-center justify-center shrink-0">
          {item.imageUrl
            ? <img src={item.imageUrl} alt={item.ticker} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
            : <span className="text-sm font-bold text-primary/60">{item.ticker.slice(0, 2)}</span>
          }
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm truncate max-w-[140px]">{item.name}</span>
            <span className="text-xs text-muted-foreground font-mono">${item.ticker}</span>
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${lpColor}`}>{item.launchpad}</span>
          </div>
          <div className="flex items-center gap-1 mt-0.5">
            <Hash className="w-3 h-3 text-muted-foreground shrink-0" />
            <span className="text-[11px] font-mono text-muted-foreground">{item.mintAddress.slice(0,4)}...{item.mintAddress.slice(-4)}</span>
            <button onClick={copy} className="text-muted-foreground hover:text-foreground transition-colors">
              {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            </button>
            <span className="text-[10px] text-muted-foreground ml-1">{formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Link href={`/dex/${item.mintAddress}`} className="text-[11px] px-2.5 py-1 rounded-lg border border-primary/30 bg-primary/10 hover:bg-primary/20 text-primary font-medium transition-colors">Chart</Link>
          <a href={apeUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 font-semibold transition-colors">
            <Zap className="w-3 h-3" />Ape
          </a>
        </div>
      </div>
      <div className="flex items-center gap-4 mt-2.5">
        <span className="flex items-center gap-1 text-xs">
          <TrendingUp className="w-3 h-3 text-muted-foreground" />
          <span className="text-muted-foreground">MCAP </span>
          <span className={`font-semibold ${(item.mcap ?? 0) >= 100000 ? "text-emerald-400" : ""}`}>{fmtMcapSmall(item.mcap)}</span>
        </span>
        {item.volume24h !== undefined && (
          <span className="flex items-center gap-1 text-xs">
            <Flame className="w-3 h-3 text-muted-foreground" />
            <span className="text-muted-foreground">Vol </span>
            <span className="font-semibold">{fmtMcapSmall(item.volume24h)}</span>
          </span>
        )}
        {fmtPriceSmall(item.priceUsd) && (
          <span className="text-xs font-mono text-muted-foreground">{fmtPriceSmall(item.priceUsd)}</span>
        )}
      </div>
    </div>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface SocialAd {
  id: number;
  title: string;
  imageUrl?: string | null;
  linkUrl: string;
  callToAction?: string | null;
  placement?: string | null;
  active: boolean;
}

function AdSpot({ ad }: { ad: SocialAd }) {
  return (
    <a
      href={ad.linkUrl}
      target="_blank"
      rel="noopener noreferrer"
      data-testid={`ad-spot-${ad.id}`}
      className="block glass-panel rounded-xl p-4 mb-3 border border-primary/20 hover:border-primary/40 transition-colors group"
    >
      <div className="flex items-center gap-1.5 mb-2">
        <Megaphone className="w-3 h-3 text-primary/60" />
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Sponsored</span>
      </div>
      <div className="flex items-start gap-3">
        {ad.imageUrl && (
          <img src={ad.imageUrl} alt={ad.title} className="w-14 h-14 rounded-lg object-cover shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm group-hover:text-primary transition-colors">{ad.title}</p>
          {ad.callToAction && (
            <p className="text-xs text-primary/80 mt-1 flex items-center gap-1">
              {ad.callToAction}
              <ExternalLink className="w-2.5 h-2.5" />
            </p>
          )}
        </div>
      </div>
    </a>
  );
}

interface Profile {
  walletAddress: string;
  username: string | null;
  profileImageIpfsCid?: string | null;
  bio?: string | null;
  isAgent?: boolean;
  agentLabel?: string | null;
}

function AgentBadge({ label }: { label?: string | null }) {
  return (
    <span
      title={label ? `AI Agent: ${label}` : "AI Agent"}
      className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/40 whitespace-nowrap leading-none shrink-0"
    >
      <Zap className="w-2.5 h-2.5" />
      AI
    </span>
  );
}

interface FeedItem {
  id: number;
  userWallet: string;
  content: string;
  imageIpfsCid?: string | null;
  type: string;
  createdAt: string;
  commentCount: number;
  replyCount: number;
  likeCount: number;
  likedByViewer: boolean;
  parentId?: number | null;
  communityId?: number | null;
  communityName?: string | null;
  communitySlug?: string | null;
  profile: Profile | null;
}

interface Comment {
  id: number;
  userWallet: string;
  content: string;
  createdAt: string;
  feedItemId?: number;
  profile: Profile | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function avatarSrc(cid?: string | null) {
  return cid ? `https://gateway.pinata.cloud/ipfs/${cid}` : null;
}

function initials(username?: string | null) {
  return username ? username.slice(0, 2).toUpperCase() : "??";
}

function Avatar({ profile, size = "sm" }: { profile: Profile | null; size?: "sm" | "md" }) {
  const sz = size === "sm" ? "w-9 h-9 text-sm" : "w-11 h-11 text-base";
  const src = avatarSrc(profile?.profileImageIpfsCid);
  if (src) return <img src={src} alt={profile?.username} className={`${sz} rounded-full object-cover shrink-0`} />;
  return (
    <div className={`${sz} rounded-full bg-primary/20 flex items-center justify-center font-bold text-primary shrink-0`}>
      {initials(profile?.username)}
    </div>
  );
}

// ── Comment section ───────────────────────────────────────────────────────────

function CommentSection({ feedItemId, token }: { feedItemId: number; token: string | null }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const wallet = useWalletConnect();
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [reportingComment, setReportingComment] = useState<number | null>(null);

  const { data: comments = [], isLoading } = useQuery<Comment[]>({
    queryKey: ["/api/social/comments", feedItemId],
    queryFn: () => fetch(`/api/social/comments/${feedItemId}`).then((r) => r.json()),
  });

  async function postComment() {
    if (!text.trim() || !token) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/social/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...socialAuthHeaders(token) },
        body: JSON.stringify({ feedItemId, content: text.trim() }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setText("");
      qc.invalidateQueries({ queryKey: ["/api/social/comments", feedItemId] });
      qc.invalidateQueries({ queryKey: ["/api/social/feed"] });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteComment(id: number) {
    if (!token) return;
    await fetch(`/api/social/comments/${id}`, { method: "DELETE", headers: socialAuthHeaders(token) });
    qc.invalidateQueries({ queryKey: ["/api/social/comments", feedItemId] });
  }

  if (isLoading) return <div className="mt-3 text-xs text-muted-foreground">Loading comments...</div>;

  return (
    <div className="mt-3 border-t border-border pt-3">
      {comments.map((c) => (
        <div key={c.id} className="flex gap-2.5 mb-2.5">
          <Avatar profile={c.profile} size="sm" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Link href={`/u/${c.userWallet}`} className="text-xs font-semibold hover:underline truncate">
                @{c.profile?.username ?? c.userWallet.slice(0, 6)}
              </Link>
              {c.profile?.isAgent && <AgentBadge label={c.profile.agentLabel} />}
              <span className="text-[10px] text-muted-foreground shrink-0">
                {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}
              </span>
            </div>
            <p className="text-xs text-foreground/80 mt-0.5 break-words"><RichContent content={c.content} /></p>
          </div>
          <div className="flex items-start gap-1 shrink-0 mt-0.5">
            {token && wallet.publicKey !== c.userWallet && (
              <button
                onClick={() => setReportingComment(c.id)}
                className="text-muted-foreground hover:text-amber-400 transition-colors"
                title="Report comment"
                data-testid={`button-report-comment-${c.id}`}
              >
                <Flag className="w-3 h-3" />
              </button>
            )}
            {wallet.publicKey === c.userWallet && token && (
              <button onClick={() => deleteComment(c.id)} className="text-muted-foreground hover:text-destructive">
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      ))}
      {reportingComment !== null && token && (
        <ReportModal
          reportedId={reportingComment}
          reportedType="comment"
          token={token}
          onClose={() => setReportingComment(null)}
        />
      )}
      {token ? (
        <div className="flex gap-2 mt-2">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Write a comment..."
            className="resize-none h-14 text-xs"
            maxLength={280}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); postComment(); }
            }}
          />
          <Button size="sm" onClick={postComment} disabled={submitting || !text.trim()} className="self-end shrink-0">
            {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground mt-2">Sign in to comment</p>
      )}
    </div>
  );
}

// ── Feed card (with inline follow button) ────────────────────────────────────

function FeedCard({
  item,
  token,
  currentWallet,
  followingSet,
  onFollowToggle,
  onHashtagClick,
}: {
  item: FeedItem;
  token: string | null;
  currentWallet: string | null;
  followingSet: Set<string>;
  onFollowToggle: (wallet: string, nowFollowing: boolean) => void;
  onHashtagClick?: (tag: string) => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showComments, setShowComments] = useState(false);
  const [showReplies, setShowReplies] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const [followPending, setFollowPending] = useState(false);
  const [reporting, setReporting] = useState(false);
  const imgSrc = item.imageIpfsCid ? `https://gateway.pinata.cloud/ipfs/${item.imageIpfsCid}` : null;
  const isOwn = currentWallet === item.userWallet;
  const isFollowing = followingSet.has(item.userWallet);

  async function deletePost() {
    if (!token) return;
    await fetch(`/api/social/feed/${item.id}`, { method: "DELETE", headers: socialAuthHeaders(token) });
    qc.invalidateQueries({ queryKey: ["/api/feed/public"] });
    qc.invalidateQueries({ queryKey: ["/api/social/feed"] });
    qc.invalidateQueries({ queryKey: ["/api/feed/following"] });
    qc.invalidateQueries({ queryKey: ["/api/social/feed/home"] });
  }

  async function toggleFollow() {
    if (!token || !item.profile || isOwn) return;
    setFollowPending(true);
    try {
      const method = isFollowing ? "DELETE" : "POST";
      const res = await fetch(`/api/social/follow/${item.userWallet}`, {
        method,
        headers: socialAuthHeaders(token) as Record<string, string>,
      });
      if (!res.ok) throw new Error((await res.json()).error);
      onFollowToggle(item.userWallet, !isFollowing);
      qc.invalidateQueries({ queryKey: ["/api/social/following"] });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setFollowPending(false);
    }
  }

  function openReport() {
    if (!token) return;
    setReporting(true);
  }

  const typeTag: Record<string, string> = { launch: "🚀 Launch", bounty: "💰 Bounty", general: "", community: "" };

  return (
    <article data-testid={`card-feed-${item.id}`} className="border-b border-border hover:bg-muted/20 transition-colors">
      <div className="flex gap-3 px-4 py-3">
        <Link href={`/u/${item.profile?.username ?? item.userWallet}`} className="shrink-0 mt-0.5">
          <Avatar profile={item.profile} size="md" />
        </Link>
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-1 flex-wrap min-w-0">
              <Link href={`/u/${item.profile?.username ?? item.userWallet}`} className="font-bold text-sm hover:underline truncate">
                {item.profile?.username ?? item.userWallet.slice(0, 8) + "…"}
              </Link>
              {item.profile?.isAgent && <AgentBadge label={item.profile.agentLabel} />}
              {typeTag[item.type] && (
                <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium shrink-0">
                  {typeTag[item.type]}
                </span>
              )}
              {item.communityId && item.communityName && (
                <Link href={`/communities/${item.communitySlug ?? ""}`}>
                  <span className="text-[10px] bg-violet-500/10 text-violet-500 dark:text-violet-400 px-1.5 py-0.5 rounded-full font-medium shrink-0 hover:bg-violet-500/20 transition-colors cursor-pointer flex items-center gap-0.5">
                    🏘 {item.communityName}
                  </span>
                </Link>
              )}
              <span className="text-muted-foreground text-xs shrink-0">·</span>
              <span className="text-muted-foreground text-xs shrink-0">
                {formatDistanceToNow(new Date(item.createdAt), { addSuffix: false })}
              </span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {token && !isOwn && item.profile && (
                <button
                  data-testid={`button-follow-${item.userWallet}`}
                  onClick={toggleFollow}
                  disabled={followPending}
                  className={`text-[11px] font-bold px-3 py-1 rounded-full border transition-colors ${
                    isFollowing
                      ? "border-border text-foreground/70 hover:border-destructive/60 hover:text-destructive"
                      : "border-primary/50 text-primary hover:bg-primary/10"
                  }`}
                >
                  {followPending ? <Loader2 className="w-3 h-3 animate-spin" /> : isFollowing ? "Following" : "Follow"}
                </button>
              )}
              {token && !isOwn && (
                <button
                  onClick={openReport}
                  data-testid={`button-report-post-${item.id}`}
                  className="p-1.5 rounded-full text-muted-foreground hover:text-amber-400 hover:bg-amber-400/10 transition-colors"
                >
                  <Flag className="w-3.5 h-3.5" />
                </button>
              )}
              {token && isOwn && (
                <button onClick={deletePost} className="p-1.5 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Content */}
          <p className="text-sm mt-1 whitespace-pre-wrap break-words leading-relaxed text-foreground/90">
            <RichContent content={item.content} onHashtagClick={onHashtagClick} />
          </p>

          {imgSrc && (
            <img src={imgSrc} alt="post image" className="mt-3 rounded-2xl max-h-72 object-cover w-full border border-border/50" />
          )}

          {/* X.com-style action bar */}
          <div className="flex items-center gap-1 mt-2 -ml-1.5 text-muted-foreground">
            {/* Comments */}
            <button
              data-testid={`button-comments-${item.id}`}
              onClick={() => setShowComments((s) => !s)}
              className="flex items-center gap-1.5 text-xs group hover:text-primary transition-colors px-1.5 py-1.5 rounded-full hover:bg-primary/10"
            >
              <MessageCircle className="w-4 h-4" />
              {item.commentCount > 0 && <span>{item.commentCount}</span>}
            </button>
            {/* Replies */}
            {token && (
              <button
                data-testid={`button-reply-toggle-${item.id}`}
                onClick={() => setShowReplies((s) => !s)}
                className="flex items-center gap-1.5 text-xs hover:text-emerald-400 transition-colors px-1.5 py-1.5 rounded-full hover:bg-emerald-400/10"
              >
                <CornerDownRight className="w-4 h-4" />
                {item.replyCount > 0 && <span>{item.replyCount}</span>}
              </button>
            )}
            {/* Likes */}
            <LikeButton
              feedItemId={item.id}
              likeCount={item.likeCount ?? 0}
              likedByViewer={item.likedByViewer ?? false}
              token={token}
            />
          </div>

          {showComments && <CommentSection feedItemId={item.id} token={token} />}
          {showReplies && token && (
            <div className="mt-3 pl-4 border-l-2 border-border">
              <ReplyComposer
                parentId={item.id}
                token={token}
                replyText={replyText}
                setReplyText={setReplyText}
                sending={sendingReply}
                setSending={setSendingReply}
                onSuccess={() => {
                  qc.invalidateQueries({ queryKey: ["/api/social/feed", item.id, "replies"] });
                  qc.invalidateQueries({ queryKey: ["/api/feed/public"] });
                  qc.invalidateQueries({ queryKey: ["/api/social/feed"] });
                }}
              />
              <ReplyList parentId={item.id} currentWallet={currentWallet} token={token} onHashtagClick={onHashtagClick} />
            </div>
          )}
        </div>
      </div>
      {reporting && token && (
        <ReportModal
          reportedId={item.id}
          reportedType="post"
          token={token}
          onClose={() => setReporting(false)}
        />
      )}
    </article>
  );
}

// ── Reply composer ────────────────────────────────────────────────────────────

function ReplyComposer({
  parentId, token, replyText, setReplyText, sending, setSending, onSuccess,
}: {
  parentId: number;
  token: string | null;
  replyText: string;
  setReplyText: (v: string) => void;
  sending: boolean;
  setSending: (v: boolean) => void;
  onSuccess: () => void;
}) {
  const { toast } = useToast();

  async function submit() {
    if (!replyText.trim() || !token) return;
    setSending(true);
    try {
      const res = await fetch("/api/social/feed", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...socialAuthHeaders(token) },
        body: JSON.stringify({ content: replyText.trim(), type: "general", parentId }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to reply");
      setReplyText("");
      onSuccess();
    } catch (err: any) {
      toast({ title: "Reply failed", description: err.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex gap-2 mb-3">
      <Textarea
        data-testid={`input-reply-${parentId}`}
        value={replyText}
        onChange={(e) => setReplyText(e.target.value)}
        placeholder="Write a reply…"
        rows={2}
        className="text-sm resize-none flex-1"
        onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(); }}
      />
      <button
        data-testid={`button-send-reply-${parentId}`}
        onClick={submit}
        disabled={sending || !replyText.trim()}
        className="self-end px-3 py-2 rounded-lg bg-primary text-primary-foreground disabled:opacity-50 transition-opacity"
      >
        {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
      </button>
    </div>
  );
}

// ── Reply list ────────────────────────────────────────────────────────────────

function ReplyList({ parentId, currentWallet, token, onHashtagClick }: { parentId: number; currentWallet: string | null; token: string | null; onHashtagClick?: (tag: string) => void }) {
  const qc = useQueryClient();
  const wallet = useWalletConnect();
  const viewerParam = wallet.publicKey ? `?viewer=${wallet.publicKey}` : "";
  const { data: replies = [], isLoading } = useQuery<FeedItem[]>({
    queryKey: ["/api/social/feed", parentId, "replies", wallet.publicKey],
    queryFn: () => fetch(`/api/social/feed/${parentId}/replies${viewerParam}`).then((r) => r.json()),
  });

  async function deleteReply(id: number) {
    if (!token) return;
    await fetch(`/api/social/feed/${id}`, { method: "DELETE", headers: socialAuthHeaders(token) });
    qc.invalidateQueries({ queryKey: ["/api/social/feed", parentId, "replies"] });
  }

  if (isLoading) return <Skeleton className="h-12 rounded-lg" />;
  if (!replies.length) return null;

  return (
    <div className="space-y-2">
      {replies.map((reply) => (
        <div key={reply.id} data-testid={`card-reply-${reply.id}`} className="flex gap-2 bg-muted/50 rounded-lg p-3">
          <Link href={`/u/${reply.profile?.username ?? reply.userWallet}`}>
            <Avatar profile={reply.profile} size="sm" />
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <Link href={`/u/${reply.profile?.username ?? reply.userWallet}`} className="text-xs font-semibold hover:underline truncate">
                  {reply.profile?.username ? `@${reply.profile.username}` : reply.userWallet.slice(0, 8) + "…"}
                </Link>
                {reply.profile?.isAgent && <AgentBadge label={reply.profile.agentLabel} />}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground">{formatDistanceToNow(new Date(reply.createdAt), { addSuffix: true })}</span>
                {currentWallet === reply.userWallet && token && (
                  <button onClick={() => deleteReply(reply.id)} className="text-muted-foreground hover:text-destructive transition-colors" title="Delete reply">
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
            <p className="text-xs mt-1 whitespace-pre-wrap break-words text-foreground/80">
              <RichContent content={reply.content} onHashtagClick={onHashtagClick} />
            </p>
            <div className="mt-1.5">
              <LikeButton feedItemId={reply.id} likeCount={reply.likeCount ?? 0} likedByViewer={reply.likedByViewer ?? false} token={token} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Post composer ─────────────────────────────────────────────────────────────

function PostComposer({ token, myAvatarSrc, onSignIn }: { token: string | null; myAvatarSrc: string | null; onSignIn?: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [content, setContent] = useState("");
  const [type, setType] = useState("general");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Too large", description: "Max 5MB", variant: "destructive" });
      return;
    }
    setImageFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function uploadImage(): Promise<string | undefined> {
    if (!imageFile) return undefined;
    setUploading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(imageFile);
      });
      const res = await fetch("/api/ipfs/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: dataUrl, type: "post" }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Upload failed");
      }
      const { cid } = await res.json();
      return cid;
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    if (!content.trim() || !token) return;
    setSubmitting(true);
    try {
      const imageIpfsCid = await uploadImage();
      const res = await fetch("/api/social/feed", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...socialAuthHeaders(token) },
        body: JSON.stringify({ content: content.trim(), type, imageIpfsCid }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setContent("");
      setType("general");
      setImageFile(null);
      setImagePreview(null);
      qc.invalidateQueries({ queryKey: ["/api/feed/public"] });
      qc.invalidateQueries({ queryKey: ["/api/social/feed"] });
      qc.invalidateQueries({ queryKey: ["/api/feed/following"] });
      qc.invalidateQueries({ queryKey: ["/api/social/feed/home"] });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <div className="border-b border-border px-4 py-5 bg-primary/[0.04]">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
            <span className="text-primary text-lg font-black">+</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-semibold text-foreground/80">What's happening in the markets?</p>
            <p className="text-[13px] text-muted-foreground mt-0.5">Connect your wallet to post, comment, and earn.</p>
          </div>
          <button
            data-testid="button-connect-to-post"
            onClick={() => onSignIn?.()}
            className="shrink-0 px-4 py-2 rounded-full bg-primary text-primary-foreground text-[13px] font-bold hover:bg-primary/90 transition-all hover:shadow-[0_0_16px_rgba(139,92,246,0.35)]"
          >
            Sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="border-b border-border px-4 py-4">
      <div className="flex gap-3">
        <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center shrink-0 text-primary font-bold text-sm overflow-hidden">
          {myAvatarSrc
            ? <img src={myAvatarSrc} className="w-10 h-10 rounded-full object-cover" alt="" />
            : "+"
          }
        </div>
        <div className="flex-1 min-w-0">
          <Textarea
            data-testid="input-post-content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="What's happening in the markets?"
            className="resize-none border-0 bg-transparent text-[17px] leading-relaxed focus-visible:ring-0 focus-visible:ring-offset-0 p-0 min-h-[80px] placeholder:text-muted-foreground/60"
            maxLength={500}
          />
          {imagePreview && (
            <div className="relative mt-2 w-fit">
              <img src={imagePreview} alt="preview" className="max-h-48 rounded-2xl object-cover border border-border/50" />
              <button
                onClick={() => { setImageFile(null); setImagePreview(null); }}
                className="absolute top-2 right-2 bg-black/70 rounded-full p-1 hover:bg-black/90"
              >
                <X className="w-3 h-3 text-white" />
              </button>
            </div>
          )}
          <div className="flex items-center justify-between pt-3 border-t border-border/40 mt-2">
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => fileRef.current?.click()}
                className="p-2 rounded-full hover:bg-primary/10 text-primary transition-colors"
                title="Add image"
              >
                <ImagePlus className="w-4 h-4" />
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
              <select
                data-testid="select-post-type"
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="text-xs text-primary bg-transparent border-0 cursor-pointer focus:outline-none px-2 py-1.5 hover:bg-primary/10 rounded-full transition-colors"
              >
                <option value="general">General</option>
                <option value="launch">🚀 Launch</option>
                <option value="bounty">💰 Bounty</option>
              </select>
              {content.length > 400 && (
                <span className={`text-xs ml-2 ${content.length > 480 ? "text-destructive" : "text-muted-foreground"}`}>
                  {500 - content.length}
                </span>
              )}
            </div>
            <Button
              data-testid="button-post-submit"
              onClick={submit}
              disabled={submitting || uploading || !content.trim()}
              className="rounded-full px-5 font-bold"
              size="sm"
            >
              {(submitting || uploading) ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
              {uploading ? "Uploading…" : submitting ? "Posting…" : "Post"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main feed page ────────────────────────────────────────────────────────────

export default function SocialFeed() {
  const [, navigate] = useLocation();
  const wallet = useWalletConnect();
  const { token, profile, signIn, loading: authLoading } = useSocialAuth();
  const [tab, setTab] = useState<"global" | "home" | "launches">("global");
  const [activeHashtag, setActiveHashtag] = useState<string | null>(() => {
    const p = new URLSearchParams(window.location.search);
    return p.get("tag") ?? null;
  });

  // Track following set in local state so follow buttons update immediately
  const [followingSet, setFollowingSet] = useState<Set<string>>(new Set());
  const qc = useQueryClient();

  // Fetch current user's following list once (to populate followingSet)
  useQuery<{ walletAddress: string }[]>({
    queryKey: ["/api/social/following", wallet.publicKey],
    queryFn: async () => {
      const res = await fetch(`/api/social/following/${wallet.publicKey}`);
      const data = await res.json();
      setFollowingSet(new Set(data.map((p: { walletAddress: string }) => p.walletAddress)));
      return data;
    },
    enabled: !!token && !!wallet.publicKey,
  });

  function handleFollowToggle(targetWallet: string, nowFollowing: boolean) {
    setFollowingSet((prev) => {
      const next = new Set(prev);
      if (nowFollowing) next.add(targetWallet);
      else next.delete(targetWallet);
      return next;
    });
    qc.invalidateQueries({ queryKey: ["/api/feed/following"] });
    qc.invalidateQueries({ queryKey: ["/api/social/feed/home"] });
  }

  function handleHashtagClick(tag: string) {
    setActiveHashtag(tag);
    setTab("global");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Build global feed URL with optional viewer wallet + hashtag filter
  const globalFeedUrl = (() => {
    const params = new URLSearchParams({ limit: "30" });
    if (wallet.publicKey) params.set("viewer", wallet.publicKey);
    if (activeHashtag) params.set("hashtag", activeHashtag);
    return `/api/feed/public?${params}`;
  })();

  // Global feed — no polling needed (manual refresh)
  const { data: globalFeed = [], isLoading: globalLoading, refetch: refetchGlobal } = useQuery<FeedItem[]>({
    queryKey: ["/api/feed/public", wallet.publicKey, activeHashtag],
    queryFn: () => fetch(globalFeedUrl).then((r) => r.json()),
  });

  // Following feed — only fetch when on this tab; manual refresh available
  const { data: homeFeed = [], isLoading: homeLoading, refetch: refetchHome } = useQuery<FeedItem[]>({
    queryKey: ["/api/feed/following"],
    queryFn: () =>
      fetch("/api/feed/following?limit=30", { headers: socialAuthHeaders(token) }).then((r) => r.json()),
    enabled: !!token && tab === "home",
    staleTime: 60_000,
  });

  // Launches tab feed
  const { data: launchFeedData, isLoading: launchLoading, refetch: refetchLaunches } = useQuery<LaunchFeedResponse>({
    queryKey: ["/api/launch-feed", "social-tab"],
    queryFn: () => fetch("/api/launch-feed?tab=all&limit=20").then((r) => r.json()),
    refetchInterval: 60_000,
    enabled: tab === "launches",
  });
  const launchFeed: LaunchItem[] = launchFeedData?.items ?? [];

  const activeFeed = tab === "home" ? homeFeed : globalFeed;
  const isLoading = tab === "home" ? homeLoading : tab === "launches" ? launchLoading : globalLoading;
  const refetch = tab === "home" ? refetchHome : tab === "launches" ? refetchLaunches : refetchGlobal;

  const { data: feedAds = [] } = useQuery<SocialAd[]>({
    queryKey: ["/api/social/ads", "feed"],
    queryFn: () => fetch("/api/social/ads?placement=feed").then((r) => r.json()),
    staleTime: 60_000,
  });

  const myAvatarSrc = avatarSrc(profile?.profileImageIpfsCid ?? null);

  // Mark replies as seen when the feed is viewed (clears notification badge)
  useEffect(() => {
    if (!token) return;
    fetch("/api/notifications/replies-seen", {
      method: "PATCH",
      headers: socialAuthHeaders(token) as Record<string, string>,
    }).then(() => {
      qc.invalidateQueries({ queryKey: ["/api/notifications/count"] });
    }).catch(() => {});
  }, [token]);

  const composerRef = useRef<HTMLDivElement>(null);

  function scrollToComposer() {
    composerRef.current?.scrollIntoView({ behavior: "smooth" });
    composerRef.current?.querySelector("textarea")?.focus();
  }

  return (
    <SocialLayout
      onPostClick={scrollToComposer}
      rightSidebar={<SponsoredSidebar placement="feed" onHashtagClick={handleHashtagClick} />}
    >
      <>

          {/* Sticky header */}
          <div className="sticky top-14 lg:top-0 z-20 bg-background/95 backdrop-blur border-b border-border">
            {/* Page title row */}
            <div className="flex items-center justify-between px-4 py-3">
              <h1 className="text-[20px] font-bold">Home</h1>
              <div className="flex items-center gap-2">
                {authLoading && !token && (
                  <div className="w-4 h-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                )}
                {token && !profile && (
                  <Button data-testid="button-setup-profile" onClick={() => navigate("/profile/setup")} size="sm" className="rounded-full text-xs font-bold">
                    Create Profile
                  </Button>
                )}
                <button
                  data-testid="button-refresh-feed"
                  onClick={() => refetch()}
                  className="p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  title="Refresh"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* X.com-style underline tabs */}
            <div className="flex">
              <button
                data-testid="tab-global-feed"
                onClick={() => setTab("global")}
                className={`relative flex-1 py-3.5 text-sm font-semibold text-center transition-colors hover:bg-muted/30 ${
                  tab === "global" ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                For You
                {tab === "global" && (
                  <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-14 h-1 bg-primary rounded-full" />
                )}
              </button>
              <button
                data-testid="tab-home-feed"
                onClick={() => { if (!token) { signIn(); } else { setTab("home"); } }}
                className={`relative flex-1 py-3.5 text-sm font-semibold text-center transition-colors hover:bg-muted/30 ${
                  tab === "home" ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                Following
                {tab === "home" && (
                  <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-16 h-1 bg-primary rounded-full" />
                )}
              </button>
              <button
                data-testid="tab-launches-feed"
                onClick={() => setTab("launches")}
                className={`relative flex-1 py-3.5 text-sm font-semibold text-center transition-colors hover:bg-muted/30 ${
                  tab === "launches" ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                Launches
                {tab === "launches" && (
                  <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-14 h-1 bg-primary rounded-full" />
                )}
              </button>
            </div>
          </div>

          {/* ── Active hashtag filter ─────────────────────────────────────── */}
          {activeHashtag && (
            <div className="flex items-center gap-2 px-4 py-2.5 bg-primary/5 border-b border-border">
              <Hash className="w-3.5 h-3.5 text-primary shrink-0" />
              <span className="text-sm font-medium text-primary">#{activeHashtag}</span>
              <span className="text-xs text-muted-foreground">— filtering by this tag</span>
              <button
                data-testid="button-clear-hashtag"
                onClick={() => setActiveHashtag(null)}
                className="ml-auto p-1 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* ── Composer ─────────────────────────────────────────────────── */}
          <div ref={composerRef}>
            {tab !== "launches" && <PostComposer token={token} myAvatarSrc={myAvatarSrc} onSignIn={signIn} />}
          </div>

          {/* ── Launches tab ─────────────────────────────────────────────── */}
          {tab === "launches" && (
            <div className="p-4">
              <div className="flex items-center gap-2 mb-4">
                <Rocket className="w-4 h-4 text-primary" />
                <h2 className="font-semibold text-sm">Recent Launches</h2>
                <span className="text-xs text-muted-foreground">— Uniswap on Robinhood Chain</span>
              </div>
              {launchLoading ? (
                <div className="space-y-2.5">
                  {[1,2,3,4,5].map((i) => (
                    <div key={i} className="border border-border rounded-xl p-3.5">
                      <div className="flex gap-3">
                        <Skeleton className="w-10 h-10 rounded-lg" />
                        <div className="flex-1 space-y-2">
                          <Skeleton className="h-3.5 w-36" />
                          <Skeleton className="h-3 w-48" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : launchFeed.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                  <Rocket className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="font-medium">No launches yet</p>
                  <p className="text-sm mt-1">New tokens appear here as they launch</p>
                </div>
              ) : (
                launchFeed.flatMap((item, idx) => {
                  const nodes: React.ReactNode[] = [<MiniLaunchCard key={item.id} item={item} />];
                  if (feedAds.length > 0 && (idx + 1) % 6 === 0) {
                    const ad = feedAds[(Math.floor(idx / 6)) % feedAds.length];
                    nodes.push(<AdSpot key={`lad-${ad.id}-${idx}`} ad={ad} />);
                  }
                  return nodes;
                })
              )}
            </div>
          )}

          {/* ── Social Feed ──────────────────────────────────────────────── */}
          {tab !== "launches" && (
            isLoading ? (
              <div>
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex gap-3 px-4 py-3 border-b border-border">
                    <Skeleton className="w-10 h-10 rounded-full shrink-0" />
                    <div className="flex-1 space-y-2 pt-1">
                      <Skeleton className="h-3.5 w-32" />
                      <Skeleton className="h-14 w-full" />
                    </div>
                  </div>
                ))}
              </div>
            ) : activeFeed.length === 0 ? (
              <div className="text-center py-20 text-muted-foreground">
                <MessageCircle className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="font-semibold">Nothing here yet</p>
                <p className="text-sm mt-1">
                  {activeHashtag
                    ? `No posts with #${activeHashtag} yet`
                    : tab === "home"
                    ? "Follow some members to see their posts here"
                    : "Be the first to post!"}
                </p>
              </div>
            ) : (
              activeFeed.flatMap((item, idx) => {
                const nodes: React.ReactNode[] = [
                  <FeedCard
                    key={item.id}
                    item={item}
                    token={token}
                    currentWallet={wallet.publicKey}
                    followingSet={followingSet}
                    onFollowToggle={handleFollowToggle}
                    onHashtagClick={handleHashtagClick}
                  />,
                ];
                if (feedAds.length > 0 && (idx + 1) % 5 === 0) {
                  const ad = feedAds[(Math.floor(idx / 5)) % feedAds.length];
                  nodes.push(<AdSpot key={`ad-${ad.id}-${idx}`} ad={ad} />);
                }
                return nodes;
              })
            )
          )}

          <SocialAdSpot placement="feed" className="px-4 py-4" />
      </>
    </SocialLayout>
  );
}
