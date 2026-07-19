import { useQuery } from "@tanstack/react-query";
import { UserPlus, TrendingUp, Hash, Flame, Search, ExternalLink } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useSettings } from "@/hooks/use-settings";

interface SocialAd {
  id: number;
  title: string;
  imageUrl?: string | null;
  linkUrl: string;
  callToAction?: string | null;
  placement?: string | null;
  active: boolean;
}

interface NewProfile {
  walletAddress: string;
  username: string | null;
  profileImageIpfsCid?: string | null;
  createdAt?: string | null;
}

interface TrendingTag {
  tag: string;
  count: number;
}

interface Props {
  placement?: string;
  onHashtagClick?: (tag: string) => void;
}

function avatarSrc(cid?: string | null) {
  return cid ? `https://gateway.pinata.cloud/ipfs/${cid}` : null;
}

function initials(username?: string | null, wallet?: string) {
  if (username) return username.slice(0, 2).toUpperCase();
  if (wallet) return wallet.slice(0, 2).toUpperCase();
  return "??";
}

export function SponsoredSidebar({ placement = "feed", onHashtagClick }: Props) {
  const { settings } = useSettings();
  const [, navigate] = useLocation();

  function handleTagClick(tag: string) {
    if (onHashtagClick) {
      onHashtagClick(tag);
    } else {
      navigate(`/community?tag=${encodeURIComponent(tag)}`);
    }
  }

  const { data: ads = [] } = useQuery<SocialAd[]>({
    queryKey: ["/api/social/ads", placement],
    queryFn: () =>
      fetch(`/api/social/ads?placement=${encodeURIComponent(placement)}`).then((r) => r.json()),
    staleTime: 120_000,
  });

  const { data: newestProfiles = [] } = useQuery<NewProfile[]>({
    queryKey: ["/api/social/newest-profiles"],
    queryFn: () => fetch("/api/social/newest-profiles?limit=5").then((r) => r.json()),
    staleTime: 60_000,
  });

  const { data: trendingTags = [] } = useQuery<TrendingTag[]>({
    queryKey: ["/api/social/trending-hashtags"],
    queryFn: () => fetch("/api/social/trending-hashtags?limit=8&hours=24").then((r) => r.json()),
    staleTime: 120_000,
    refetchInterval: 120_000,
  });

  const activeAds = ads.filter((a) => a.active).slice(0, 3);
  const placeholderCount = Math.max(0, 3 - activeAds.length);

  return (
    <div className="space-y-4 sticky top-20">

      {/* Trending section — X.com style */}
      <div
        data-testid="trending-topics-panel"
        className="rounded-2xl bg-[#16161d] border border-white/[0.07] overflow-hidden"
      >
        <div className="px-4 py-3 border-b border-white/[0.06]">
          <h2 className="text-[15px] font-bold text-foreground">Trending in crypto</h2>
        </div>

        {trendingTags.length === 0 ? (
          <div className="px-4 py-6 text-center">
            <Hash className="w-6 h-6 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-[13px] text-muted-foreground/60">No trending topics yet</p>
            <p className="text-[11px] text-muted-foreground/40 mt-1">Start using #hashtags in posts</p>
          </div>
        ) : (
          <div>
            {trendingTags.map((t, i) => (
              <button
                key={t.tag}
                data-testid={`trending-tag-${t.tag}`}
                onClick={() => handleTagClick(t.tag)}
                className="w-full flex items-start gap-3 px-4 py-3 hover:bg-white/[0.04] transition-colors group text-left"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] text-muted-foreground">
                    {i + 1} · Trending
                  </p>
                  <p className="text-[14px] font-bold text-foreground group-hover:text-primary transition-colors">
                    #{t.tag}
                  </p>
                  <p className="text-[12px] text-muted-foreground mt-0.5">
                    {t.count} {t.count === 1 ? "post" : "posts"}
                  </p>
                </div>
                {i < 3 && <Flame className="w-4 h-4 text-orange-400 mt-1 shrink-0 opacity-80" />}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Who to Follow / Newest Members — X.com style */}
      {newestProfiles.length > 0 && (
        <div
          data-testid="newest-members-panel"
          className="rounded-2xl bg-[#16161d] border border-white/[0.07] overflow-hidden"
        >
          <div className="px-4 py-3 border-b border-white/[0.06]">
            <h2 className="text-[15px] font-bold text-foreground">Who to follow</h2>
          </div>
          <div>
            {newestProfiles.map((p) => {
              const src = avatarSrc(p.profileImageIpfsCid);
              return (
                <Link key={p.walletAddress} href={`/u/${p.walletAddress}`}>
                  <div
                    data-testid={`newest-member-${p.walletAddress.slice(0, 6)}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.04] transition-colors cursor-pointer group"
                  >
                    {src ? (
                      <img src={src} alt={p.username ?? ""} className="w-10 h-10 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                        {initials(p.username, p.walletAddress)}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-semibold truncate text-foreground group-hover:text-primary transition-colors">
                        {p.username ?? `${p.walletAddress.slice(0, 6)}…`}
                      </p>
                      <p className="text-[12px] text-muted-foreground truncate">
                        @{p.username ?? `${p.walletAddress.slice(0, 6)}…${p.walletAddress.slice(-4)}`}
                      </p>
                    </div>
                    <button className="shrink-0 px-3 py-1.5 rounded-full border border-white/20 text-[12px] font-bold text-foreground hover:bg-white/10 hover:border-white/40 transition-all">
                      Follow
                    </button>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Sponsored ads — clean card */}
      {(activeAds.length > 0 || placeholderCount > 0) && (
        <div
          data-testid="sponsored-sidebar"
          className="rounded-2xl bg-[#16161d] border border-white/[0.07] overflow-hidden"
        >
          <div className="px-4 py-3 border-b border-white/[0.06]">
            <h2 className="text-[15px] font-bold text-foreground">Sponsored</h2>
          </div>
          <div>
            {activeAds.map((ad) => (
              <a
                key={ad.id}
                href={ad.linkUrl}
                target="_blank"
                rel="noopener noreferrer"
                data-testid={`sidebar-ad-${ad.id}`}
                className="flex items-start gap-3 px-4 py-3 hover:bg-white/[0.04] transition-colors group"
              >
                {ad.imageUrl && (
                  <img
                    src={ad.imageUrl}
                    alt={ad.title}
                    className="w-10 h-10 rounded-lg object-cover shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold truncate group-hover:text-primary transition-colors">
                    {ad.title}
                  </p>
                  {ad.callToAction && (
                    <p className="text-[12px] text-muted-foreground mt-0.5 flex items-center gap-1">
                      {ad.callToAction}
                      <ExternalLink className="w-3 h-3 shrink-0" />
                    </p>
                  )}
                </div>
              </a>
            ))}

            {Array.from({ length: placeholderCount }).map((_, i) => (
              <div
                key={`placeholder-${i}`}
                data-testid={`sidebar-ad-placeholder-${i + 1}`}
                className="flex items-center justify-between px-4 py-3 border-t border-white/[0.05] first:border-0"
              >
                <div>
                  <p className="text-[13px] font-semibold text-foreground/50">Ad Slot {activeAds.length + i + 1}</p>
                  <p className="text-[12px] text-primary/60 mt-0.5">
                    ${settings.adSidebarPriceUsd}/{settings.adSidebarDurationDays}d — available
                  </p>
                </div>
                <span className="text-[11px] px-2.5 py-1 rounded-full bg-primary/10 text-primary font-medium border border-primary/20">
                  Book
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-[11px] text-center text-muted-foreground/30 px-2">
        Contact us to advertise on Feather App
      </p>
    </div>
  );
}
