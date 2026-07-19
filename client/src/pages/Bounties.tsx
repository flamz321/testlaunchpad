import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { SocialLayout } from "@/components/SocialLayout";
import { SponsoredSidebar } from "@/components/SponsoredSidebar";
import { TierBadge, useTier } from "@/components/TierBadge";
import { SocialAdSpot } from "@/components/SocialAdSpot";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useSocialAuth, socialAuthHeaders } from "@/hooks/use-social-auth";
import { Briefcase, Plus, MessageCircle, Clock, Lock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface Profile {
  walletAddress: string;
  username: string | null;
  profileImageIpfsCid: string | null;
}

interface BountyPost {
  id: number;
  userWallet: string;
  content: string;
  type: string;
  createdAt: string;
  commentCount: number;
  profile: Profile | null;
}

function Avatar({ cid, username }: { cid: string | null; username: string | null }) {
  const src = cid ? `https://gateway.pinata.cloud/ipfs/${cid}` : null;
  return src
    ? <img src={src} alt={username ?? "?"} className="w-9 h-9 rounded-full object-cover border border-border/40 shrink-0" />
    : <div className="w-9 h-9 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-primary font-bold text-xs shrink-0">{username ? username.slice(0, 2).toUpperCase() : "??"}</div>;
}

export default function Bounties() {
  const [showForm, setShowForm] = useState(false);
  const [content, setContent] = useState("");
  const { toast } = useToast();
  const qc = useQueryClient();
  const { token, profile } = useSocialAuth();
  const { data: tierInfo } = useTier(profile?.walletAddress);

  const { data: bounties = [], isLoading } = useQuery<BountyPost[]>({
    queryKey: ["/api/bounties"],
    queryFn: () => fetch("/api/bounties").then((r) => r.json()),
    refetchInterval: 30_000,
  });

  const postMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/bounties", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...socialAuthHeaders(token) },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to post");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Bounty posted!", description: "Your collaboration request is live." });
      setContent("");
      setShowForm(false);
      qc.invalidateQueries({ queryKey: ["/api/bounties"] });
    },
    onError: (err: any) => toast({ title: "Failed to post", description: err?.message ?? "Something went wrong", variant: "destructive" }),
  });

  const canPost = !!token;

  return (
    <SocialLayout rightSidebar={<SponsoredSidebar placement="bounties" />}>
      {/* Sticky header */}
      <div className="sticky top-14 lg:top-0 z-20 bg-background/95 backdrop-blur border-b border-border">
        <div className="flex items-center justify-between px-4 py-3">
          <h1 className="text-[17px] font-bold flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-orange-400" />
            Bounty Board
          </h1>
          {canPost && (
            <Button
              size="sm"
              data-testid="button-post-bounty"
              onClick={() => setShowForm((s) => !s)}
              className="gap-1.5 rounded-full"
            >
              <Plus className="w-4 h-4" />
              Post
            </Button>
          )}
        </div>
      </div>

      <div className="px-4 py-4">
        <p className="text-xs text-muted-foreground mb-4">Post collaboration requests &amp; find opportunities</p>

        {/* Post form */}
        {showForm && canPost && (
          <div className="mb-5 p-4 rounded-xl border border-border/60 bg-card space-y-3">
            <h3 className="font-semibold text-sm">New Collaboration Request</h3>
            <Textarea
              data-testid="input-bounty-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Describe what you're looking for — e.g. 'Looking for a dev to build a Telegram bot for my token. Reward: 0.05 ETH. DM me on X @...'"
              rows={5}
              maxLength={1000}
              className="resize-none text-sm"
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{content.length}/1000</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => { setShowForm(false); setContent(""); }} data-testid="button-cancel-bounty">Cancel</Button>
                <Button
                  size="sm"
                  data-testid="button-submit-bounty"
                  disabled={!content.trim() || postMutation.isPending}
                  onClick={() => postMutation.mutate()}
                >
                  {postMutation.isPending ? "Posting…" : "Post Bounty"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {!canPost && (
          <div className="mb-5 p-4 rounded-xl border border-border/40 bg-card/50 flex items-center gap-3 text-sm text-muted-foreground">
            <Lock className="w-4 h-4 shrink-0" />
            <span>Sign in with your social profile to post collaboration requests.</span>
            <Link href="/profile" className="text-primary hover:underline ml-auto shrink-0">Sign in</Link>
          </div>
        )}

        {/* Bounties list */}
        <div className="space-y-0 divide-y divide-border">
          {isLoading
            ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-28 w-full my-2 rounded-xl" />)
            : bounties.length === 0
              ? (
                <div className="text-center py-20 text-muted-foreground">
                  <Briefcase className="w-10 h-10 mx-auto mb-3 opacity-20" />
                  <p className="text-sm font-medium">No bounties yet</p>
                  <p className="text-xs mt-1">Be the first to post a collaboration request</p>
                </div>
              )
              : bounties.map((bounty) => (
                <div key={bounty.id} data-testid={`card-bounty-${bounty.id}`} className="flex gap-3 py-4 hover:bg-muted/20 transition-colors px-1">
                  <Avatar cid={bounty.profile?.profileImageIpfsCid ?? null} username={bounty.profile?.username ?? null} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      {bounty.profile?.username
                        ? <Link href={`/u/${bounty.userWallet}`} className="text-sm font-bold hover:text-primary transition-colors" data-testid={`link-user-${bounty.id}`}>@{bounty.profile.username}</Link>
                        : <span className="text-xs font-mono text-muted-foreground">{bounty.userWallet.slice(0, 8)}…</span>
                      }
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-orange-500/15 text-orange-400 border border-orange-500/20">
                        <Briefcase className="w-2.5 h-2.5" />Bounty
                      </span>
                      <span className="text-xs text-muted-foreground ml-auto">{formatDistanceToNow(new Date(bounty.createdAt), { addSuffix: true })}</span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap break-words leading-relaxed text-foreground/90">{bounty.content}</p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><MessageCircle className="w-3 h-3" />{bounty.commentCount} replies</span>
                    </div>
                  </div>
                </div>
              ))
          }
        </div>

        <SocialAdSpot placement="bounties" className="mt-6" />
      </div>
    </SocialLayout>
  );
}
