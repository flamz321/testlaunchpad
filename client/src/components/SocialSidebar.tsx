import { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  Home, Search, Bell, Mail, Trophy, Megaphone, Sparkles, User, LayoutDashboard,
  Rocket, PenSquare, X, Loader2, ImagePlus, Users,
} from "lucide-react";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSocialAuth, socialAuthHeaders } from "@/hooks/use-social-auth";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

// Launchpad brand icon (shopping bag silhouette)
function BagsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M6.5 2a1 1 0 0 0-.894.553L4 6H3a1 1 0 0 0-1 1v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a1 1 0 0 0-1-1h-1l-1.606-3.447A1 1 0 0 0 17.5 2h-11zm.882 2h9.236l1.2 2H6.182l1.2-2zM4 8h16v11H4V8zm5 3a3 3 0 1 0 6 0h-2a1 1 0 1 1-2 0H9z" />
    </svg>
  );
}

interface SidebarProfile {
  walletAddress: string;
  username: string | null;
  profileImageIpfsCid?: string | null;
}

function avatarSrc(cid?: string | null) {
  return cid ? `https://gateway.pinata.cloud/ipfs/${cid}` : null;
}

interface SocialSidebarProps {
  profile?: SidebarProfile | null;
  onPostClick?: () => void;
}

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  badge?: number;
  testId?: string;
}

const MAX_POST_LEN = 280;

export function SocialSidebar({ profile, onPostClick }: SocialSidebarProps) {
  const [location] = useLocation();
  const { token, profile: authProfile } = useSocialAuth();
  const [postModalOpen, setPostModalOpen] = useState(false);
  const [postContent, setPostContent] = useState("");
  const [postType, setPostType] = useState<"general" | "alpha" | "bounty" | "launch">("general");
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: notifData } = useQuery<{ unreadDMs: number; newReplies: number; total: number }>({
    queryKey: ["/api/notifications/count"],
    queryFn: () =>
      fetch("/api/notifications/count", { headers: socialAuthHeaders(token) }).then(async (r) => {
        if (!r.ok) return { unreadDMs: 0, newReplies: 0, total: 0 };
        return r.json();
      }),
    enabled: !!token,
    refetchInterval: 5 * 60 * 1000,
    staleTime: 4 * 60 * 1000,
  });

  const postMutation = useMutation({
    mutationFn: () =>
      fetch("/api/social/feed", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...socialAuthHeaders(token) },
        body: JSON.stringify({ content: postContent.trim(), type: postType }),
      }).then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? "Failed to post");
        return r.json();
      }),
    onSuccess: () => {
      toast({ title: "Posted!" });
      setPostContent("");
      setPostType("general");
      setPostModalOpen(false);
      qc.invalidateQueries({ queryKey: ["/api/social/feed"] });
    },
    onError: (err: any) =>
      toast({ title: "Failed to post", description: err?.message, variant: "destructive" }),
  });

  const totalNotifs = notifData?.total ?? 0;

  const navItems: NavItem[] = [
    { href: "/community", label: "Home", icon: <Home className="w-5 h-5" />, testId: "home" },
    { href: "/bags-launch", label: "Launch on Uniswap", icon: <BagsIcon className="w-5 h-5" />, testId: "bags-launch" },
    {
      href: "/notifications",
      label: "Notifications",
      icon: <Bell className="w-5 h-5" />,
      badge: notifData?.newReplies,
      testId: "notifications",
    },
    {
      href: "/inbox",
      label: "Messages",
      icon: <Mail className="w-5 h-5" />,
      badge: notifData?.unreadDMs,
      testId: "messages",
    },
    { href: "/communities", label: "Communities", icon: <Users className="w-5 h-5" />, testId: "communities" },
    { href: "/leaderboards", label: "Leaderboards", icon: <Trophy className="w-5 h-5" />, testId: "leaderboards" },
    { href: "/bounties", label: "Bounties", icon: <Megaphone className="w-5 h-5" />, testId: "bounties" },
    { href: "/launch-feed", label: "Launches", icon: <Rocket className="w-5 h-5" />, testId: "launches" },
    { href: "/feather-ai", label: "Feather AI", icon: <Sparkles className="w-5 h-5" />, testId: "feather-ai" },
    { href: "/dashboard", label: "Dashboard", icon: <LayoutDashboard className="w-5 h-5" />, testId: "dashboard" },
  ];

  if (profile) {
    navItems.push({
      href: `/u/${profile.username ?? profile.walletAddress}`,
      label: "Profile",
      icon: <User className="w-5 h-5" />,
      testId: "profile",
    });
  }

  const composerAvatar = avatarSrc(authProfile?.profileImageIpfsCid);

  const handlePostButtonClick = () => {
    if (token) {
      setPostModalOpen(true);
    } else {
      onPostClick?.();
    }
  };

  return (
    <>
      <aside
        data-testid="social-sidebar"
        className="hidden lg:flex flex-col w-[72px] xl:w-[240px] shrink-0 sticky top-14 h-[calc(100vh-56px)] overflow-y-auto border-r border-border"
      >
        <div className="flex flex-col h-full px-2 xl:px-3 py-4 gap-1">
          {navItems.map((item) => {
            const isActive =
              location === item.href ||
              (item.href !== "/" && location.startsWith(item.href + "/"));
            return (
              <Link key={item.href + item.label} href={item.href}>
                <button
                  data-testid={`sidebar-link-${item.testId ?? item.label.toLowerCase().replace(/\s/g, "-")}`}
                  className={`relative flex items-center gap-3 px-3 py-3 rounded-full w-full transition-colors text-left
                    ${isActive
                      ? "font-bold text-foreground"
                      : "text-foreground/70 hover:text-foreground hover:bg-muted"
                    }`}
                >
                  <span className="shrink-0 relative">
                    {item.icon}
                    {(item.badge ?? 0) > 0 && (
                      <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-0.5 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center">
                        {(item.badge ?? 0) > 99 ? "99+" : item.badge}
                      </span>
                    )}
                  </span>
                  <span className="hidden xl:block text-[15px]">{item.label}</span>
                  {isActive && (
                    <span className="hidden xl:block ml-auto w-1 h-1 rounded-full bg-primary" />
                  )}
                </button>
              </Link>
            );
          })}

          {/* Post / Compose button */}
          <button
            data-testid="sidebar-post-button"
            onClick={handlePostButtonClick}
            className="mt-3 flex items-center justify-center xl:justify-start gap-2 px-4 py-3 rounded-full bg-primary text-primary-foreground font-bold text-[15px] hover:bg-primary/90 transition-colors w-full xl:w-auto"
          >
            <PenSquare className="w-5 h-5 shrink-0" />
            <span className="hidden xl:block">Post</span>
          </button>

          {/* Profile mini at bottom */}
          {profile && (
            <div className="mt-auto pt-4">
              <Link href={`/u/${profile.username ?? profile.walletAddress}`}>
                <div className="flex items-center gap-2.5 px-3 py-2 rounded-full hover:bg-muted transition-colors cursor-pointer">
                  {avatarSrc(profile.profileImageIpfsCid) ? (
                    <img
                      src={avatarSrc(profile.profileImageIpfsCid)!}
                      alt=""
                      className="w-8 h-8 rounded-full object-cover shrink-0"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                      {profile.username ? profile.username.slice(0, 2).toUpperCase() : "??"}
                    </div>
                  )}
                  <div className="hidden xl:block min-w-0">
                    <p className="text-sm font-bold truncate">
                      {profile.username ?? `${profile.walletAddress.slice(0, 6)}…`}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      @{profile.username ?? profile.walletAddress.slice(0, 8)}
                    </p>
                  </div>
                </div>
              </Link>
            </div>
          )}
        </div>
      </aside>

      {/* ── Post Compose Modal ─────────────────────────────────────────────────── */}
      <Dialog open={postModalOpen} onOpenChange={(open) => { setPostModalOpen(open); if (!open) { setPostContent(""); setPostType("general"); } }}>
        <DialogContent className="sm:max-w-[560px] p-0 gap-0 overflow-hidden bg-background border-border">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <button
              onClick={() => setPostModalOpen(false)}
              className="p-1.5 rounded-full hover:bg-muted transition-colors text-muted-foreground"
            >
              <X className="w-5 h-5" />
            </button>
            <span className="text-sm font-semibold">New Post</span>
            <div className="w-8" />
          </div>

          {/* Composer */}
          <div className="flex gap-3 px-4 pt-4 pb-2">
            {/* Avatar */}
            <div className="shrink-0">
              {composerAvatar ? (
                <img
                  src={composerAvatar}
                  alt=""
                  className="w-10 h-10 rounded-full object-cover"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-sm font-bold text-primary">
                  {authProfile?.username?.slice(0, 2).toUpperCase() ?? "??"}
                </div>
              )}
            </div>

            {/* Text area */}
            <div className="flex-1 min-w-0">
              <Textarea
                data-testid="modal-post-content"
                placeholder="What's happening in the markets?"
                value={postContent}
                onChange={(e) => setPostContent(e.target.value.slice(0, MAX_POST_LEN))}
                rows={4}
                className="resize-none border-0 bg-transparent p-0 text-[17px] placeholder:text-muted-foreground/50 focus-visible:ring-0 focus-visible:ring-offset-0 shadow-none"
              />
            </div>
          </div>

          {/* Type pills */}
          <div className="flex items-center gap-2 px-16 pb-3">
            {(["general", "alpha", "bounty", "launch"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setPostType(t)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  postType === t
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                }`}
              >
                {t === "general" ? "Post" : t === "alpha" ? "Alpha" : t === "bounty" ? "Bounty" : "Launch"}
              </button>
            ))}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <div className="flex items-center gap-2 text-primary/70">
              <button className="p-2 rounded-full hover:bg-primary/10 transition-colors" title="Attach image (coming soon)" disabled>
                <ImagePlus className="w-5 h-5" />
              </button>
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-xs tabular-nums ${postContent.length > MAX_POST_LEN * 0.9 ? "text-orange-400" : "text-muted-foreground"}`}>
                {MAX_POST_LEN - postContent.length}
              </span>
              <Button
                data-testid="modal-post-submit"
                onClick={() => postMutation.mutate()}
                disabled={!postContent.trim() || postContent.length > MAX_POST_LEN || postMutation.isPending || !token}
                className="rounded-full px-5 font-bold"
                size="sm"
              >
                {postMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Post"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
