import { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  Home, Bell, Mail, Trophy, Star, Megaphone, Sparkles,
  User, LayoutDashboard, Rocket, PenSquare, X, Loader2,
  ImagePlus, Users, BarChart2, Repeat2, Bot, Zap, LogOut, Settings, MoreHorizontal,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSocialAuth, socialAuthHeaders } from "@/hooks/use-social-auth";
import { useWalletConnect } from "@/hooks/use-wallet-connect";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

function FeatherLogo({ className }: { className?: string }) {
  return (
    <img
      src="/feather_logo.png"
      alt="Feather"
      className={`rounded-lg object-cover ${className ?? ""}`}
    />
  );
}

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

interface AppSidebarProps {
  profile?: SidebarProfile | null;
  onPostClick?: () => void;
}

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  badge?: number;
  testId?: string;
  accent?: boolean;
}

const MAX_POST_LEN = 280;

function SidebarLogoutButton() {
  const { signOut } = useSocialAuth();
  const { disconnect } = useWalletConnect();
  return (
    <button
      title="Log out"
      onClick={() => { signOut(); disconnect(); }}
      className="p-2 rounded-xl text-muted-foreground hover:text-red-400 hover:bg-muted transition-colors shrink-0"
    >
      <LogOut className="w-4 h-4" />
    </button>
  );
}

export function AppSidebar({ profile, onPostClick }: AppSidebarProps) {
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

  const navItems: NavItem[] = [
    { href: "/", label: "Home", icon: <Home className="w-5 h-5" />, testId: "home" },
    { href: "/launch", label: "Launch Token", icon: <BagsIcon className="w-5 h-5" />, testId: "launch", accent: true },
    { href: "/community", label: "Social Feed", icon: <Zap className="w-5 h-5" />, testId: "social" },
    { href: "/communities", label: "Communities", icon: <Users className="w-5 h-5" />, testId: "communities" },
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
    { href: "/leaderboards", label: "Leaderboards", icon: <Trophy className="w-5 h-5" />, testId: "leaderboards" },
    { href: "/bounties", label: "Bounties", icon: <Megaphone className="w-5 h-5" />, testId: "bounties" },
    { href: "/vip", label: "VIP Lounge", icon: <Star className="w-5 h-5" />, testId: "vip" },
    { href: "/feather-ai", label: "Feather AI", icon: <Sparkles className="w-5 h-5" />, testId: "feather-ai" },
    { href: "/bots", label: "Bots", icon: <Bot className="w-5 h-5" />, testId: "bots" },
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
        data-testid="app-sidebar"
        className="hidden lg:flex flex-col w-[72px] xl:w-[240px] shrink-0 sticky top-0 h-screen overflow-y-auto border-r border-border bg-background"
      >
        {/* Nav items */}
        <nav className="flex flex-col px-2 xl:px-3 gap-0.5 flex-1">
          {navItems.map((item) => {
            const isActive =
              item.href === "/"
                ? location === "/"
                : location === item.href || location.startsWith(item.href + "/");
            return (
              <Link key={item.href + item.label} href={item.href}>
                <button
                  data-testid={`sidebar-link-${item.testId ?? item.label.toLowerCase().replace(/\s/g, "-")}`}
                  className={`relative flex items-center gap-3 px-3 py-2.5 rounded-xl w-full transition-all duration-150 text-left group
                    ${isActive
                      ? item.accent
                        ? "bg-primary/15 text-primary font-semibold"
                        : "bg-muted text-foreground font-semibold"
                      : item.accent
                        ? "text-primary/80 hover:bg-primary/10 hover:text-primary"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                    }`}
                >
                  <span className="shrink-0 relative">
                    {item.icon}
                    {(item.badge ?? 0) > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-0.5 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center">
                        {(item.badge ?? 0) > 99 ? "99+" : item.badge}
                      </span>
                    )}
                  </span>
                  <span className="hidden xl:block text-[14px]">{item.label}</span>
                  {isActive && (
                    <span className="hidden xl:block ml-auto w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                  )}
                </button>
              </Link>
            );
          })}

          {/* Post / Compose button */}
          <button
            data-testid="sidebar-post-button"
            onClick={handlePostButtonClick}
            className="mt-4 flex items-center justify-center xl:justify-start gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-[14px] hover:bg-primary/90 transition-all hover:shadow-[0_0_16px_rgba(0,200,5,0.3)] w-full"
          >
            <PenSquare className="w-4 h-4 shrink-0" />
            <span className="hidden xl:block">Post</span>
          </button>
        </nav>

        {/* Profile mini at bottom */}
        {profile && (
          <div className="px-2 xl:px-3 py-4 border-t border-border">
            <div className="flex items-center gap-1">
              <Link href={`/u/${profile.username ?? profile.walletAddress}`} className="flex-1 min-w-0">
                <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-muted transition-colors cursor-pointer">
                  {avatarSrc(profile.profileImageIpfsCid) ? (
                    <img
                      src={avatarSrc(profile.profileImageIpfsCid)!}
                      alt=""
                      className="w-8 h-8 rounded-full object-cover shrink-0 ring-2 ring-primary/20"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                      {profile.username ? profile.username.slice(0, 2).toUpperCase() : "??"}
                    </div>
                  )}
                  <div className="hidden xl:block min-w-0">
                    <p className="text-sm font-semibold truncate">
                      {profile.username ?? `${profile.walletAddress.slice(0, 6)}…`}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      @{profile.username ?? profile.walletAddress.slice(0, 8)}
                    </p>
                  </div>
                </div>
              </Link>
              <SidebarLogoutButton />
            </div>
          </div>
        )}
      </aside>

      {/* ── Post Compose Modal ─────────────────────────────────────────────────── */}
      <Dialog open={postModalOpen} onOpenChange={(open) => { setPostModalOpen(open); if (!open) { setPostContent(""); setPostType("general"); } }}>
        <DialogContent className="sm:max-w-[560px] p-0 gap-0 overflow-hidden bg-card border-border">
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
          <div className="flex gap-3 px-4 pt-4 pb-2">
            <div className="shrink-0">
              {composerAvatar ? (
                <img src={composerAvatar} alt="" className="w-10 h-10 rounded-full object-cover ring-2 ring-primary/20" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-sm font-bold text-primary">
                  {authProfile?.username?.slice(0, 2).toUpperCase() ?? "??"}
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <Textarea
                data-testid="modal-post-content"
                placeholder="What's happening in the trenches?"
                value={postContent}
                onChange={(e) => setPostContent(e.target.value.slice(0, MAX_POST_LEN))}
                rows={4}
                className="resize-none border-0 bg-transparent p-0 text-[17px] placeholder:text-muted-foreground/50 focus-visible:ring-0 focus-visible:ring-offset-0 shadow-none"
              />
            </div>
          </div>
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
