import { useState } from "react";
import { useParams, Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { SocialLayout } from "@/components/SocialLayout";
import { SponsoredSidebar } from "@/components/SponsoredSidebar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useSocialAuth, socialAuthHeaders } from "@/contexts/SocialAuthContext";
import {
  Users, Globe, Lock, Crown, Loader2, ArrowLeft,
  Send, MessageSquare, Calendar, Trash2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const IPFS_GW = "https://gateway.pinata.cloud/ipfs/";

interface Community {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  logoIpfsCid: string | null;
  memberCount: number;
  isPublic: boolean;
  createdByWallet: string;
  createdAt: string | null;
}

interface CommunityPost {
  id: number;
  communityId: number;
  walletAddress: string;
  content: string;
  createdAt: string | null;
  profile: {
    username: string | null;
    displayName: string | null;
    profileImageIpfsCid: string | null;
  } | null;
}

interface MemberRow {
  id: number;
  walletAddress: string;
  role: string;
  joinedAt: string | null;
  profile: { username: string | null; displayName: string | null; profileImageIpfsCid: string | null } | null;
}

type Tab = "posts" | "members";

function Avatar({ profile, wallet, size = "sm" }: { profile: { profileImageIpfsCid?: string | null; displayName?: string | null; username?: string | null } | null; wallet: string; size?: "sm" | "md" }) {
  const dim = size === "md" ? "w-10 h-10" : "w-8 h-8";
  const text = size === "md" ? "text-sm" : "text-xs";
  const initial = (profile?.displayName ?? profile?.username ?? wallet).slice(0, 1).toUpperCase();
  if (profile?.profileImageIpfsCid) {
    return (
      <img
        src={`${IPFS_GW}${profile.profileImageIpfsCid}`}
        alt={initial}
        className={`${dim} rounded-full object-cover flex-shrink-0`}
      />
    );
  }
  return (
    <div className={`${dim} rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0`}>
      <span className={`${text} font-bold text-primary`}>{initial}</span>
    </div>
  );
}

export default function CommunityDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { token, profile: myProfile, walletAddress: myWallet } = useSocialAuth();

  const [activeTab, setActiveTab] = useState<Tab>("posts");
  const [postContent, setPostContent] = useState("");
  const [shareToFeed, setShareToFeed] = useState(false);
  const [posting, setPosting] = useState(false);
  const [joining, setJoining] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const { data: community, isLoading: loadingCommunity } = useQuery<Community>({
    queryKey: ["/api/communities/slug", slug],
    queryFn: () => fetch(`/api/communities/${slug}`).then(r => r.json()),
    enabled: !!slug,
    staleTime: 30_000,
  });

  const { data: members = [] } = useQuery<MemberRow[]>({
    queryKey: ["/api/communities/members", community?.id],
    queryFn: () => fetch(`/api/communities/${community!.id}/members`).then(r => r.json()),
    enabled: !!community?.id,
    staleTime: 30_000,
  });

  const { data: posts = [], isLoading: loadingPosts } = useQuery<CommunityPost[]>({
    queryKey: ["/api/communities/posts", community?.id],
    queryFn: () => fetch(`/api/communities/${community!.id}/posts`).then(r => r.json()),
    enabled: !!community?.id,
    staleTime: 15_000,
  });

  const isMember = myWallet ? members.some((m: any) => m.walletAddress === myWallet) : false;
  const isOwner = myWallet ? community?.createdByWallet === myWallet : false;

  const creatorMember = members.find((m: any) => m.walletAddress === community?.createdByWallet);
  const creatorName = (creatorMember as any)?.profile?.displayName ?? (creatorMember as any)?.profile?.username ?? (community?.createdByWallet?.slice(0, 8) + "…");

  async function handleJoinLeave() {
    if (!token) {
      toast({ title: "Sign in required", variant: "destructive" });
      return;
    }
    setJoining(true);
    try {
      const action = isMember ? "leave" : "join";
      const res = await fetch(`/api/communities/${community!.id}/${action}`, {
        method: "POST",
        headers: socialAuthHeaders(token),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Action failed");
      }
      queryClient.invalidateQueries({ queryKey: ["/api/communities/members", community!.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/communities"] });
    } catch (e: any) {
      toast({ title: e.message ?? "Action failed", variant: "destructive" });
    } finally {
      setJoining(false);
    }
  }

  async function handlePost() {
    if (!token) {
      toast({ title: "Sign in required", variant: "destructive" });
      return;
    }
    if (!postContent.trim()) return;
    setPosting(true);
    try {
      const res = await fetch(`/api/communities/${community!.id}/posts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...socialAuthHeaders(token) },
        body: JSON.stringify({ content: postContent.trim(), shareToFeed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to post");
      setPostContent("");
      setShareToFeed(false);
      queryClient.invalidateQueries({ queryKey: ["/api/communities/posts", community!.id] });
      if (shareToFeed) {
        queryClient.invalidateQueries({ queryKey: ["/api/social/feed"] });
        queryClient.invalidateQueries({ queryKey: ["/api/feed/public"] });
      }
      toast({ title: "Post created!" });
    } catch (e: any) {
      toast({ title: e.message ?? "Failed to post", variant: "destructive" });
    } finally {
      setPosting(false);
    }
  }

  async function handleDeletePost(postId: number) {
    if (!token) return;
    setDeletingId(postId);
    try {
      const res = await fetch(`/api/communities/posts/${postId}`, {
        method: "DELETE",
        headers: socialAuthHeaders(token),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to delete post");
      queryClient.invalidateQueries({ queryKey: ["/api/communities/posts", community!.id] });
      toast({ title: "Post deleted" });
    } catch (e: any) {
      toast({ title: e.message ?? "Failed to delete", variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  }

  if (loadingCommunity) {
    return (
      <SocialLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </SocialLayout>
    );
  }

  if (!community || (community as any).error) {
    return (
      <SocialLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <Users className="w-12 h-12 text-muted-foreground/30" />
          <p className="text-muted-foreground">Community not found.</p>
          <Link href="/communities">
            <Button variant="outline" size="sm" className="gap-1.5">
              <ArrowLeft className="w-4 h-4" /> Back to Communities
            </Button>
          </Link>
        </div>
      </SocialLayout>
    );
  }

  return (
    <SocialLayout rightSidebar={<SponsoredSidebar placement="community" />}>
      <div className="max-w-3xl mx-auto px-4 py-6">

          <Link href="/communities">
            <button className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-5">
              <ArrowLeft className="w-4 h-4" /> All Communities
            </button>
          </Link>

          {/* Community header card */}
          <div className="bg-card border border-border/60 rounded-2xl p-6 mb-6">
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center overflow-hidden flex-shrink-0">
                {community.logoIpfsCid ? (
                  <img src={`${IPFS_GW}${community.logoIpfsCid}`} alt={community.name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-2xl font-bold text-primary">{community.name.slice(0, 1).toUpperCase()}</span>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl font-bold font-display">{community.name}</h1>
                  {isOwner && <Crown className="w-4 h-4 text-yellow-400" title="You own this community" />}
                  <Badge variant="outline" className="text-[10px] px-1.5">
                    {community.isPublic ? (
                      <span className="flex items-center gap-1"><Globe className="w-2.5 h-2.5" /> Public</span>
                    ) : (
                      <span className="flex items-center gap-1"><Lock className="w-2.5 h-2.5" /> Private</span>
                    )}
                  </Badge>
                </div>

                {community.description && (
                  <p className="text-sm text-muted-foreground mt-1">{community.description}</p>
                )}

                <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground flex-wrap">
                  <span className="flex items-center gap-1">
                    <Users className="w-3.5 h-3.5" />
                    {community.memberCount.toLocaleString()} {community.memberCount === 1 ? "member" : "members"}
                  </span>
                  <span className="flex items-center gap-1">
                    <Crown className="w-3.5 h-3.5 text-yellow-400/80" />
                    Created by{" "}
                    <Link href={`/u/${community.createdByWallet}`}>
                      <span className="text-primary hover:underline cursor-pointer ml-0.5">{creatorName}</span>
                    </Link>
                  </span>
                  {community.createdAt && (
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      {formatDistanceToNow(new Date(community.createdAt), { addSuffix: true })}
                    </span>
                  )}
                </div>
              </div>

              {myWallet && !isOwner && (
                <Button
                  data-testid="button-join-leave"
                  size="sm"
                  variant={isMember ? "outline" : "default"}
                  onClick={handleJoinLeave}
                  disabled={joining}
                  className="flex-shrink-0"
                >
                  {joining ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : isMember ? "Leave" : "Join"}
                </Button>
              )}
            </div>
          </div>

          {/* Post composer — visible to members and owners */}
          {(isMember || isOwner) ? (
            <div className="bg-card border border-border/60 rounded-xl p-4 mb-5">
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {myProfile?.profileImageIpfsCid ? (
                    <img src={`${IPFS_GW}${myProfile.profileImageIpfsCid}`} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-xs font-bold text-primary">
                      {(myProfile?.username ?? myWallet ?? "?").slice(0, 1).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="flex-1">
                  <Textarea
                    data-testid="input-post-content"
                    placeholder={`Post something to ${community.name}…`}
                    value={postContent}
                    onChange={(e) => setPostContent(e.target.value)}
                    maxLength={1000}
                    rows={3}
                    className="resize-none text-sm mb-2"
                  />
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        data-testid="checkbox-share-to-feed"
                        checked={shareToFeed}
                        onChange={(e) => setShareToFeed(e.target.checked)}
                        className="w-3.5 h-3.5 accent-primary"
                      />
                      <span className="text-xs text-muted-foreground">Also share to my profile feed</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground">{postContent.length}/1000</span>
                      <Button
                        data-testid="button-submit-post"
                        size="sm"
                        disabled={!postContent.trim() || posting}
                        onClick={handlePost}
                        className="gap-1.5"
                      >
                        {posting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                        Post
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : !myWallet ? (
            <div className="text-center py-6 text-sm text-muted-foreground bg-card border border-border/60 rounded-xl mb-5">
              Connect your wallet and sign in to join and post.
            </div>
          ) : (
            <div className="text-center py-6 text-sm text-muted-foreground bg-card border border-border/60 rounded-xl mb-5">
              Join this community to post and interact.
            </div>
          )}

          {/* Tab nav */}
          <div className="flex gap-1 mb-4 border-b border-border/50">
            <button
              data-testid="tab-posts"
              onClick={() => setActiveTab("posts")}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors -mb-px ${activeTab === "posts" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              <MessageSquare className="w-4 h-4" />
              Posts <span className="text-xs text-muted-foreground font-normal ml-0.5">({posts.length})</span>
            </button>
            <button
              data-testid="tab-members"
              onClick={() => setActiveTab("members")}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors -mb-px ${activeTab === "members" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              <Users className="w-4 h-4" />
              Members <span className="text-xs text-muted-foreground font-normal ml-0.5">({community.memberCount})</span>
            </button>
          </div>

          {/* Posts tab */}
          {activeTab === "posts" && (
            <div className="space-y-3">
              {loadingPosts ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : posts.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground text-sm">
                  No posts yet.{(isMember || isOwner) ? " Be the first to post!" : " Join to start the conversation."}
                </div>
              ) : (
                posts.map((post) => {
                  const name = post.profile?.displayName ?? post.profile?.username ?? post.walletAddress.slice(0, 8) + "…";
                  const canDelete = myWallet && (post.walletAddress === myWallet || isOwner);
                  return (
                    <div
                      key={post.id}
                      data-testid={`post-community-${post.id}`}
                      className="bg-card border border-border/60 rounded-xl p-4"
                    >
                      <div className="flex gap-3">
                        <Avatar profile={post.profile} wallet={post.walletAddress} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <Link href={`/u/${post.walletAddress}`}>
                              <span className="text-sm font-semibold hover:text-primary transition-colors cursor-pointer">
                                {name}
                              </span>
                            </Link>
                            {post.walletAddress === community.createdByWallet && (
                              <Badge className="text-[9px] px-1.5 py-0 bg-yellow-400/10 text-yellow-500 border-yellow-400/30">
                                Owner
                              </Badge>
                            )}
                            {post.createdAt && (
                              <span className="text-[11px] text-muted-foreground ml-auto">
                                {formatDistanceToNow(new Date(post.createdAt), { addSuffix: true })}
                              </span>
                            )}
                            {canDelete && (
                              <button
                                data-testid={`button-delete-post-${post.id}`}
                                onClick={() => handleDeletePost(post.id)}
                                disabled={deletingId === post.id}
                                className="ml-1 text-muted-foreground/40 hover:text-red-400 transition-colors"
                                title="Delete post"
                              >
                                {deletingId === post.id
                                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  : <Trash2 className="w-3.5 h-3.5" />}
                              </button>
                            )}
                          </div>
                          <p className="text-sm whitespace-pre-wrap break-words">{post.content}</p>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* Members tab */}
          {activeTab === "members" && (
            <div className="space-y-2">
              {members.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground text-sm">No members yet.</div>
              ) : (
                members.map((member: any) => {
                  const name = member.profile?.displayName ?? member.profile?.username ?? member.walletAddress.slice(0, 8) + "…";
                  const isCreator = member.walletAddress === community.createdByWallet;
                  return (
                    <div
                      key={member.id}
                      data-testid={`member-row-${member.walletAddress}`}
                      className="flex items-center gap-3 bg-card border border-border/60 rounded-xl p-3"
                    >
                      <Avatar profile={member.profile} wallet={member.walletAddress} size="md" />
                      <div className="flex-1 min-w-0">
                        <Link href={`/u/${member.walletAddress}`}>
                          <span className="text-sm font-semibold hover:text-primary transition-colors cursor-pointer">
                            {name}
                          </span>
                        </Link>
                        <div className="text-[11px] text-muted-foreground font-mono mt-0.5">
                          {member.walletAddress.slice(0, 12)}…{member.walletAddress.slice(-6)}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {isCreator && (
                          <Badge className="text-[9px] px-1.5 py-0 bg-yellow-400/10 text-yellow-500 border-yellow-400/30">
                            <Crown className="w-2.5 h-2.5 mr-0.5" />Owner
                          </Badge>
                        )}
                        {member.joinedAt && (
                          <span className="text-[10px] text-muted-foreground">
                            Joined {formatDistanceToNow(new Date(member.joinedAt), { addSuffix: true })}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

        </div>
    </SocialLayout>
  );
}
