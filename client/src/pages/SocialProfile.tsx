import { useState, useEffect } from "react";
import { useRoute, useLocation, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { normalizeWallet } from "@shared/chain";
import { profilePath } from "@/lib/profileUrl";
import { useSocialAuth, socialAuthHeaders } from "@/hooks/use-social-auth";
import { useToast } from "@/hooks/use-toast";
import { SocialLayout } from "@/components/SocialLayout";
import { SponsoredSidebar } from "@/components/SponsoredSidebar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Users, UserPlus, UserMinus, Globe, Github, Instagram, MessageCircle,
  Trash2, Calendar, Settings, Loader2, ArrowLeft, X, Mail, Zap
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { SiX } from "react-icons/si";
import { TierBadge, useTier } from "@/components/TierBadge";

interface Profile {
  walletAddress: string;
  username: string | null;
  profileImageIpfsCid?: string | null;
  bio?: string | null;
  twitterLink?: string | null;
  githubLink?: string | null;
  instagramLink?: string | null;
  websiteLink?: string | null;
  totpEnabled?: boolean;
  createdAt?: string | null;
  followerCount?: number;
  followingCount?: number;
  isAgent?: boolean;
  agentLabel?: string | null;
}

interface FeedItem {
  id: number;
  userWallet: string;
  content: string;
  imageIpfsCid?: string | null;
  type: string;
  createdAt: string;
  commentCount: number;
  profile: Profile | null;
}

function avatarSrc(cid?: string | null) {
  return cid ? `https://gateway.pinata.cloud/ipfs/${cid}` : null;
}

function initials(username?: string | null) {
  return username ? username.slice(0, 2).toUpperCase() : "??";
}

function truncatePk(pk: string) {
  return `${pk.slice(0, 4)}...${pk.slice(-4)}`;
}

type SocialListModal = "followers" | "following" | null;

function FollowListModal({ wallet, type, onClose }: { wallet: string; type: "followers" | "following"; onClose: () => void }) {
  const { data: list = [], isLoading } = useQuery<Profile[]>({
    queryKey: [type === "followers" ? "/api/social/followers" : "/api/social/following", wallet],
    queryFn: () => fetch(`/api/social/${type}/${wallet}`).then((r) => r.json()),
    enabled: !!wallet,
  });

  const src = (cid?: string | null) => cid ? `https://gateway.pinata.cloud/ipfs/${cid}` : null;
  const ini = (u?: string | null) => u ? u.slice(0, 2).toUpperCase() : "??";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/75" onClick={onClose} />
      <div className="relative z-10 w-full max-w-xs rounded-2xl bg-[#0d0d0d] border border-border shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="font-bold text-sm capitalize">{type}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="max-h-72 overflow-y-auto p-2">
          {isLoading && (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {!isLoading && list.length === 0 && (
            <p className="text-center text-xs text-muted-foreground py-8">No {type} yet</p>
          )}
          {list.map((p) => {
            const avatar = src(p.profileImageIpfsCid);
            return (
              <Link key={p.walletAddress} href={profilePath(p)} onClick={onClose}>
                <div
                  data-testid={`follow-list-${p.walletAddress.slice(0, 6)}`}
                  className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-muted transition-colors cursor-pointer"
                >
                  {avatar ? (
                    <img src={avatar} alt={p.username ?? ""} className="w-8 h-8 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                      {ini(p.username)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {p.username ? `@${p.username}` : `${p.walletAddress.slice(0, 6)}…${p.walletAddress.slice(-4)}`}
                    </p>
                    {p.bio && <p className="text-[11px] text-muted-foreground truncate">{p.bio}</p>}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function SocialProfile() {
  const [, paramsLong] = useRoute("/social/profile/:wallet");
  const [, paramsShort] = useRoute("/u/:wallet");
  const [, navigate] = useLocation();
  // urlParam may be a username OR a wallet address — the profile API handles both
  const urlParam = (paramsLong?.wallet ?? paramsShort?.wallet) ?? "";
  const qc = useQueryClient();
  const { token, profile: myProfile, loading: myProfileLoading } = useSocialAuth();
  const { toast } = useToast();
  const [socialListModal, setSocialListModal] = useState<SocialListModal>(null);

  // Step 1: Resolve profile by urlParam (backend accepts username OR wallet)
  const { data: profile, isLoading: profileLoading } = useQuery<Profile & { canonicalPath?: string }>({
    queryKey: ["/api/social/profile", urlParam],
    queryFn: () => fetch(`/api/social/profile/${encodeURIComponent(urlParam)}`).then((r) => { if (!r.ok) throw new Error("Not found"); return r.json(); }),
    enabled: !!urlParam,
  });

  // Canonical URL: always prefer /u/username when a username exists
  useEffect(() => {
    if (!profile?.username) return;
    const canonical = `/u/${profile.username}`;
    const decoded = decodeURIComponent(urlParam);
    if (decoded.toLowerCase() !== profile.username.toLowerCase()) {
      navigate(canonical, { replace: true });
    }
  }, [profile?.username, urlParam, navigate]);

  // Always use the canonical wallet address from the resolved profile for secondary queries
  const resolvedWallet = profile?.walletAddress ?? "";
  const isOwnProfile =
    !!myProfile?.walletAddress &&
    !!resolvedWallet &&
    normalizeWallet(myProfile.walletAddress) === normalizeWallet(resolvedWallet);

  const { data: posts = [], isLoading: postsLoading } = useQuery<FeedItem[]>({
    queryKey: ["/api/social/feed/user", resolvedWallet],
    queryFn: () => fetch(`/api/social/feed/user/${resolvedWallet}`).then((r) => r.json()),
    enabled: !!resolvedWallet,
  });

  const { data: tierInfo } = useTier(resolvedWallet);

  const { data: followStatus } = useQuery<{ following: boolean }>({
    queryKey: ["/api/social/is-following", resolvedWallet],
    queryFn: () => fetch(`/api/social/is-following/${resolvedWallet}`, { headers: socialAuthHeaders(token) }).then((r) => r.json()),
    enabled: !!token && !!resolvedWallet && !isOwnProfile,
  });

  const followMutation = useMutation({
    mutationFn: async () => {
      const isFollowing = followStatus?.following;
      const res = await fetch(`/api/social/follow/${resolvedWallet}`, {
        method: isFollowing ? "DELETE" : "POST",
        headers: socialAuthHeaders(token) as Record<string, string>,
      });
      if (!res.ok) throw new Error((await res.json()).error);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/social/is-following", resolvedWallet] });
      qc.invalidateQueries({ queryKey: ["/api/social/profile", urlParam] });
    },
  });

  async function deletePost(id: number) {
    if (!token) return;
    await fetch(`/api/social/feed/${id}`, { method: "DELETE", headers: socialAuthHeaders(token) });
    qc.invalidateQueries({ queryKey: ["/api/social/feed/user", resolvedWallet] });
  }

  const typeTag: Record<string, string> = { launch: "🚀 Launch", bounty: "💰 Bounty", general: "" };

  const src = avatarSrc(profile?.profileImageIpfsCid);

  if (profileLoading) {
    return (
      <SocialLayout rightSidebar={<SponsoredSidebar placement="feed" />}>
        <>
          <div className="h-48 bg-muted animate-pulse" />
          <div className="px-4 pb-4 -mt-10">
            <Skeleton className="w-24 h-24 rounded-full border-4 border-background" />
            <div className="mt-3 space-y-2">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-16 w-full" />
            </div>
          </div>
        </>
      </SocialLayout>
    );
  }

  if (!profile) {
    return (
      <SocialLayout rightSidebar={<SponsoredSidebar placement="feed" />}>
        <div className="flex flex-col items-center justify-center gap-4 py-24">
          <Users className="w-12 h-12 text-muted-foreground opacity-30" />
          <p className="text-muted-foreground font-semibold">This account doesn't exist</p>
          <Link href="/community">
            <Button variant="outline" size="sm" className="rounded-full">Back to Feed</Button>
          </Link>
        </div>
      </SocialLayout>
    );
  }

  return (
    <>
    <SocialLayout rightSidebar={<SponsoredSidebar placement="feed" />}>
      <>

          {/* Sticky back-nav / title */}
          <div className="sticky top-14 z-20 bg-background/95 backdrop-blur border-b border-border px-4 py-3 flex items-center gap-4">
            <Link href="/community">
              <button className="p-1.5 rounded-full hover:bg-muted transition-colors text-foreground/70 hover:text-foreground">
                <ArrowLeft className="w-4 h-4" />
              </button>
            </Link>
            <div>
              <h1 className="font-bold text-[18px] leading-tight">
                {profile.username ?? `${resolvedWallet.slice(0, 6)}…`}
              </h1>
              <p className="text-xs text-muted-foreground">{posts.length} posts</p>
            </div>
          </div>

          {/* Cover banner */}
          <div
            className="h-48 w-full shrink-0"
            style={{
              background: "#0f172a",
            }}
          />

          {/* Avatar + action buttons row */}
          <div className="px-4 flex items-end justify-between -mt-12 mb-4">
            <div className="relative">
              {src ? (
                <img
                  src={src}
                  alt={profile.username ?? "avatar"}
                  className="w-24 h-24 rounded-full object-cover border-4 border-background"
                />
              ) : (
                <div className="w-24 h-24 rounded-full bg-primary/30 flex items-center justify-center text-2xl font-bold text-primary border-4 border-background">
                  {profile.username ? profile.username.slice(0, 2).toUpperCase() : "??"}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 mb-2">
              {isOwnProfile && (
                <Link href="/profile">
                  <Button size="sm" variant="outline" className="rounded-full font-bold px-4">
                    <Settings className="w-3.5 h-3.5 mr-1.5" />
                    Edit profile
                  </Button>
                </Link>
              )}
              {!profileLoading && !myProfileLoading && !isOwnProfile && token && (
                <>
                  <Link href={`/inbox?to=${resolvedWallet}`} data-testid="button-send-dm">
                    <Button size="sm" variant="outline" className="rounded-full font-bold w-9 h-9 p-0">
                      <Mail className="w-4 h-4" />
                    </Button>
                  </Link>
                  <Button
                    data-testid="button-follow"
                    size="sm"
                    className={`rounded-full font-bold px-5 ${
                      followStatus?.following
                        ? "bg-transparent text-foreground border border-border hover:border-destructive hover:text-destructive hover:bg-transparent"
                        : "bg-foreground text-background hover:bg-foreground/90"
                    }`}
                    onClick={() => followMutation.mutate()}
                    disabled={followMutation.isPending}
                  >
                    {followMutation.isPending
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : followStatus?.following ? "Following" : "Follow"
                    }
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Profile info */}
          <div className="px-4 pb-4 border-b border-border">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 data-testid="text-profile-username" className="text-[20px] font-bold leading-tight">
                {profile.username ?? `${resolvedWallet.slice(0, 6)}…${resolvedWallet.slice(-4)}`}
              </h2>
              {tierInfo && tierInfo.tier >= 1 && <TierBadge tier={tierInfo.tier} size="sm" />}
              {profile.isAgent && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/40">
                  <Zap className="w-3 h-3" /> AI Agent
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground font-mono">
              @{profile.username ?? truncatePk(resolvedWallet)}
            </p>

            {profile.bio && (
              <p className="text-sm mt-3 text-foreground/90 leading-relaxed">{profile.bio}</p>
            )}

            {/* Meta row */}
            <div className="flex items-center gap-4 mt-3 flex-wrap">
              {profile.websiteLink && (
                <a href={profile.websiteLink} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-sm text-primary hover:underline">
                  <Globe className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate max-w-[160px]">{profile.websiteLink.replace(/^https?:\/\//, "")}</span>
                </a>
              )}
              {profile.twitterLink && (
                <a href={profile.twitterLink} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                  <SiX className="w-3.5 h-3.5" />
                </a>
              )}
              {profile.githubLink && (
                <a href={profile.githubLink} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                  <Github className="w-3.5 h-3.5" />
                </a>
              )}
              {profile.instagramLink && (
                <a href={profile.instagramLink} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                  <Instagram className="w-3.5 h-3.5" />
                </a>
              )}
              {profile.createdAt && (
                <span className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Calendar className="w-3.5 h-3.5 shrink-0" />
                  Joined {format(new Date(profile.createdAt), "MMMM yyyy")}
                </span>
              )}
            </div>

            {/* Follow counts */}
            <div className="flex items-center gap-5 mt-3">
              <button
                data-testid="button-following-count"
                onClick={() => setSocialListModal("following")}
                className="flex items-center gap-1.5 text-sm hover:underline"
              >
                <span className="font-bold">{profile.followingCount ?? 0}</span>
                <span className="text-muted-foreground">Following</span>
              </button>
              <button
                data-testid="button-followers-count"
                onClick={() => setSocialListModal("followers")}
                className="flex items-center gap-1.5 text-sm hover:underline"
              >
                <span className="font-bold">{profile.followerCount ?? 0}</span>
                <span className="text-muted-foreground">Followers</span>
              </button>
            </div>
          </div>

          {/* Posts tab header */}
          <div className="border-b border-border">
            <div className="flex">
              <div className="relative flex-1 py-4 text-sm font-bold text-center text-foreground">
                Posts
                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-1 bg-primary rounded-full" />
              </div>
            </div>
          </div>

          {/* Posts feed — X.com tweet style */}
          {postsLoading ? (
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
          ) : posts.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground">
              <MessageCircle className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-semibold">No posts yet</p>
              <p className="text-sm mt-1">When {profile.username ?? "this user"} posts, they'll appear here.</p>
            </div>
          ) : (
            posts.map((post) => (
              <article key={post.id} data-testid={`card-post-${post.id}`} className="flex gap-3 px-4 py-3 border-b border-border hover:bg-muted/20 transition-colors">
                {/* Avatar column */}
                <div className="shrink-0 mt-0.5">
                  {src ? (
                    <img src={src} alt={profile.username ?? ""} className="w-10 h-10 rounded-full object-cover" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-sm font-bold text-primary">
                      {profile.username ? profile.username.slice(0, 2).toUpperCase() : "??"}
                    </div>
                  )}
                </div>
                {/* Content column */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1 min-w-0">
                      <span className="font-bold text-sm truncate">
                        {profile.username ?? truncatePk(resolvedWallet)}
                      </span>
                      {typeTag[post.type] && (
                        <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium shrink-0">
                          {typeTag[post.type]}
                        </span>
                      )}
                      <span className="text-muted-foreground text-xs shrink-0">·</span>
                      <span className="text-muted-foreground text-xs shrink-0">
                        {formatDistanceToNow(new Date(post.createdAt), { addSuffix: false })}
                      </span>
                    </div>
                    {isOwnProfile && token && (
                      <button
                        onClick={() => deletePost(post.id)}
                        className="p-1.5 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <p className="text-sm mt-0.5 whitespace-pre-wrap break-words leading-relaxed text-foreground/90">
                    {post.content}
                  </p>
                  {post.imageIpfsCid && (
                    <img
                      src={`https://gateway.pinata.cloud/ipfs/${post.imageIpfsCid}`}
                      alt="post image"
                      className="mt-3 rounded-2xl max-h-64 object-cover w-full border border-border/50"
                    />
                  )}
                  <div className="flex items-center gap-1 mt-2 -ml-1.5 text-muted-foreground">
                    <span className="flex items-center gap-1.5 text-xs px-1.5 py-1.5">
                      <MessageCircle className="w-4 h-4" />
                      {post.commentCount > 0 && <span>{post.commentCount}</span>}
                    </span>
                  </div>
                </div>
              </article>
            ))
          )}
      </>
    </SocialLayout>
      {socialListModal && resolvedWallet && (
        <FollowListModal
          wallet={resolvedWallet}
          type={socialListModal}
          onClose={() => setSocialListModal(null)}
        />
      )}
    </>
  );
}
