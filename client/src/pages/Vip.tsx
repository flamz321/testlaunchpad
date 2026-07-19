import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { SocialLayout } from "@/components/SocialLayout";
import { SponsoredSidebar } from "@/components/SponsoredSidebar";
import { TierBadge } from "@/components/TierBadge";
import { SocialAdSpot } from "@/components/SocialAdSpot";
import { Skeleton } from "@/components/ui/skeleton";
import { useSocialAuth } from "@/hooks/use-social-auth";
import { Crown, Rocket, Star, Zap, MessageCircle } from "lucide-react";

interface FeedItem {
  id: number;
  userWallet: string;
  content: string;
  type: string;
  createdAt: string;
  commentCount: number;
  profile: { walletAddress: string; username: string | null; profileImageIpfsCid: string | null } | null;
}

function Avatar({ cid, username }: { cid: string | null; username: string | null }) {
  const src = cid ? `https://gateway.pinata.cloud/ipfs/${cid}` : null;
  return src
    ? <img src={src} alt={username ?? "?"} className="w-8 h-8 rounded-full object-cover border border-yellow-500/30 shrink-0" />
    : <div className="w-8 h-8 rounded-full bg-yellow-500/20 border border-yellow-500/30 flex items-center justify-center text-yellow-400 font-bold text-xs shrink-0">{username ? username.slice(0, 2).toUpperCase() : "??"}</div>;
}

export default function Vip() {
  const { profile } = useSocialAuth();
  const { data: feed = [], isLoading: feedLoading } = useQuery<FeedItem[]>({
    queryKey: ["/api/social/feed"],
    queryFn: () => fetch("/api/social/feed?limit=10").then((r) => r.json()),
    enabled: true,
    refetchInterval: 30_000,
  });

  const vipPosts = feed.slice(0, 5);

  return (
    <SocialLayout rightSidebar={<SponsoredSidebar placement="vip" />}>
      <div className="px-4 py-6 max-w-2xl mx-auto">
        <div>

        {/* Header */}
        <div className="mb-8 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-yellow-500/20 border border-yellow-500/30 flex items-center justify-center">
            <Crown className="w-5 h-5 text-yellow-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-display flex items-center gap-2">
              VIP Lounge
              <TierBadge tier={3} size="sm" />
            </h1>
            <p className="text-sm text-muted-foreground">Exclusive zone for verified holders (1M+ $FEATHER)</p>
          </div>
        </div>

        <div>
            {/* Welcome banner */}
            <div className="p-4 rounded-xl border border-yellow-500/30 bg-yellow-500/5 mb-6 flex items-center gap-3">
              <Crown className="w-5 h-5 text-yellow-400 shrink-0" />
              <div className="text-sm">
                <span className="font-semibold text-yellow-400">Welcome, Verified Trencher.</span>
                <span className="text-muted-foreground ml-2">Early feature flags and VIP-only perks drop here first.</span>
              </div>
            </div>

            {/* Feature flags panel */}
            <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { icon: Rocket, label: "Priority Launch Slot", desc: "Your launches always appear at top of feed", active: true },
                { icon: Star, label: "Custom Profile Flair", desc: "Elite badge shown on all posts & profile", active: true },
                { icon: MessageCircle, label: "DM Inbox", desc: "Send & receive direct messages", active: true, href: "/inbox" },
                { icon: Crown, label: "VIP Early Access", desc: "New features roll out to you first", active: true },
              ].map(({ icon: Icon, label, desc, active, href }) => (
                <div key={label} data-testid={`card-feature-${label.toLowerCase().replace(/\s/g, "-")}`} className="p-4 rounded-xl border border-border/40 bg-card/80">
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className="w-4 h-4 text-yellow-400" />
                    <span className="text-sm font-semibold">{label}</span>
                    <span className={`ml-auto text-xs px-1.5 py-0.5 rounded ${active ? "bg-emerald-500/20 text-emerald-400" : "bg-muted text-muted-foreground"}`}>{active ? "Active" : "Coming soon"}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                  {href && <Link href={href} className="text-xs text-primary hover:underline mt-1 inline-block">Open →</Link>}
                </div>
              ))}
            </div>

            {/* Recent community activity preview */}
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Recent Community Posts</h2>
              <Link href="/community" className="text-xs text-primary hover:underline">View all →</Link>
            </div>
            <div className="space-y-2">
              {feedLoading
                ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)
                : vipPosts.length === 0
                  ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <MessageCircle className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">No posts yet</p>
                      <Link href="/community" className="text-xs text-primary hover:underline mt-1 inline-block">Go to Community →</Link>
                    </div>
                  )
                  : vipPosts.map((post) => (
                    <div key={post.id} data-testid={`card-vip-post-${post.id}`} className="p-3 rounded-xl border border-border/40 bg-card/60 flex items-start gap-2.5">
                      <Avatar cid={post.profile?.profileImageIpfsCid ?? null} username={post.profile?.username ?? null} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          {post.profile?.username
                            ? <Link href={`/u/${post.userWallet}`} className="text-xs font-semibold hover:text-primary">@{post.profile.username}</Link>
                            : <span className="text-xs font-mono text-muted-foreground">{post.userWallet.slice(0, 8)}…</span>
                          }
                        </div>
                        <p className="text-xs text-foreground/80 mt-0.5 line-clamp-2 break-words leading-relaxed">{post.content}</p>
                      </div>
                    </div>
                  ))
              }
            </div>
          </div>

        {/* Sponsored */}
        <SocialAdSpot placement="vip" className="mt-6" />
        </div>
      </div>
    </SocialLayout>
  );
}
