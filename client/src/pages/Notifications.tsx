import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { SocialLayout } from "@/components/SocialLayout";
import { SponsoredSidebar } from "@/components/SponsoredSidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useSocialAuth, socialAuthHeaders } from "@/hooks/use-social-auth";
import { Bell, Heart, MessageCircle, UserPlus, CornerDownRight, Lock, RefreshCw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { apiRequest } from "@/lib/queryClient";

interface ActivityNotification {
  id: string;
  type: "follow" | "like" | "reply" | "comment";
  actorWallet: string;
  actorUsername: string | null;
  actorImageCid: string | null;
  postId?: number;
  postPreview?: string;
  createdAt: string;
}

function avatarSrc(cid?: string | null) {
  return cid ? `https://gateway.pinata.cloud/ipfs/${cid}` : null;
}

function ActorAvatar({ cid, username, wallet }: { cid?: string | null; username?: string | null; wallet: string }) {
  const src = avatarSrc(cid);
  return src ? (
    <img src={src} alt={username ?? wallet} className="w-10 h-10 rounded-full object-cover shrink-0" />
  ) : (
    <div className="w-10 h-10 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-primary font-bold text-xs shrink-0">
      {username ? username.slice(0, 2).toUpperCase() : wallet.slice(0, 2).toUpperCase()}
    </div>
  );
}

function NotifIcon({ type }: { type: ActivityNotification["type"] }) {
  if (type === "like") return <Heart className="w-4 h-4 text-rose-400" />;
  if (type === "follow") return <UserPlus className="w-4 h-4 text-primary" />;
  if (type === "reply") return <CornerDownRight className="w-4 h-4 text-blue-400" />;
  return <MessageCircle className="w-4 h-4 text-emerald-400" />;
}

function notifText(n: ActivityNotification) {
  const actor = n.actorUsername ? `@${n.actorUsername}` : `${n.actorWallet.slice(0, 6)}…`;
  if (n.type === "follow") return `${actor} followed you`;
  if (n.type === "like") return `${actor} liked your post`;
  if (n.type === "reply") return `${actor} replied to your post`;
  return `${actor} commented on your post`;
}

type Tab = "all" | "replies" | "likes" | "follows";

export default function Notifications() {
  const [tab, setTab] = useState<Tab>("all");
  const { token } = useSocialAuth();
  const qc = useQueryClient();

  const { data: notifications = [], isLoading, refetch } = useQuery<ActivityNotification[]>({
    queryKey: ["/api/notifications"],
    queryFn: () =>
      fetch("/api/notifications", { headers: socialAuthHeaders(token) }).then(async (r) => {
        if (!r.ok) throw new Error("Failed");
        return r.json();
      }),
    enabled: !!token,
    staleTime: 60_000,
  });

  const markSeenMutation = useMutation({
    mutationFn: () => apiRequest("PATCH", "/api/notifications/replies-seen"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/notifications/count"] }),
  });

  const filtered = notifications.filter((n) => {
    if (tab === "all") return true;
    if (tab === "replies") return n.type === "reply" || n.type === "comment";
    if (tab === "likes") return n.type === "like";
    if (tab === "follows") return n.type === "follow";
    return true;
  });

  const tabs: { id: Tab; label: string }[] = [
    { id: "all", label: "All" },
    { id: "replies", label: "Replies" },
    { id: "likes", label: "Likes" },
    { id: "follows", label: "Follows" },
  ];

  return (
    <SocialLayout rightSidebar={<SponsoredSidebar placement="feed" />}>
      {/* Sticky header */}
      <div className="sticky top-14 lg:top-0 z-20 bg-background/95 backdrop-blur border-b border-border">
        <div className="flex items-center justify-between px-4 py-3">
          <h1 className="text-[17px] font-bold">Notifications</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { refetch(); markSeenMutation.mutate(); }}
              className="p-1.5 rounded-full hover:bg-muted transition-colors text-muted-foreground"
              title="Refresh"
              data-testid="button-refresh-notifications"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Sub-tabs */}
        <div className="flex border-b border-border">
          {tabs.map((t) => (
            <button
              key={t.id}
              data-testid={`tab-notif-${t.id}`}
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
          <p className="text-muted-foreground text-sm">Sign in to see your notifications</p>
          <Link href="/profile" className="text-primary hover:underline text-sm">
            Sign in →
          </Link>
        </div>
      )}

      {/* Loading */}
      {token && isLoading && (
        <div className="divide-y divide-border">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-start gap-3 px-4 py-4">
              <Skeleton className="w-10 h-10 rounded-full shrink-0" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {token && !isLoading && filtered.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-24 text-center px-4">
          <Bell className="w-10 h-10 text-muted-foreground/20" />
          <p className="font-semibold text-muted-foreground">No notifications yet</p>
          <p className="text-sm text-muted-foreground/60">
            {tab === "all"
              ? "When someone follows, likes, or replies to you, it'll show up here."
              : `No ${tab} notifications in the last 30 days.`}
          </p>
        </div>
      )}

      {/* Notification list */}
      {token && !isLoading && filtered.length > 0 && (
        <div className="divide-y divide-border">
          {filtered.map((n) => (
            <div
              key={n.id}
              data-testid={`notif-${n.id}`}
              className="flex items-start gap-3 px-4 py-4 hover:bg-muted/30 transition-colors"
            >
              {/* Type icon overlay */}
              <div className="relative shrink-0">
                <Link href={`/u/${n.actorWallet}`}>
                  <ActorAvatar cid={n.actorImageCid} username={n.actorUsername} wallet={n.actorWallet} />
                </Link>
                <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-background border border-border flex items-center justify-center">
                  <NotifIcon type={n.type} />
                </span>
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm leading-snug">
                  <Link href={`/u/${n.actorWallet}`} className="font-bold hover:text-primary">
                    {n.actorUsername ? `@${n.actorUsername}` : `${n.actorWallet.slice(0, 6)}…`}
                  </Link>{" "}
                  <span className="text-muted-foreground">{notifText(n).split(" ").slice(1).join(" ")}</span>
                </p>

                {n.postPreview && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-1 italic">
                    "{n.postPreview}{n.postPreview.length >= 60 ? "…" : ""}"
                  </p>
                )}

                <p className="text-xs text-muted-foreground/60 mt-1">
                  {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                </p>
              </div>

              {n.postId && (
                <Link href={`/community`} className="text-xs text-primary hover:underline shrink-0 self-center">
                  View
                </Link>
              )}
            </div>
          ))}
        </div>
      )}
    </SocialLayout>
  );
}
