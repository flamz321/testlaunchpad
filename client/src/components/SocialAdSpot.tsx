import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Megaphone } from "lucide-react";

interface SocialAd {
  id: number;
  title: string;
  imageUrl?: string | null;
  linkUrl: string;
  callToAction?: string | null;
  placement?: string | null;
  active: boolean;
}

interface Props {
  placement?: string;
  className?: string;
}

export function SocialAdSpot({ placement, className = "" }: Props) {
  const { data: ads = [] } = useQuery<SocialAd[]>({
    queryKey: ["/api/social/ads", placement ?? "all"],
    queryFn: () => fetch(`/api/social/ads${placement ? `?placement=${encodeURIComponent(placement)}` : ""}`).then((r) => r.json()),
    staleTime: 120_000,
  });

  if (!ads.length) return null;

  const ad = ads[Math.floor(Math.random() * ads.length)];

  return (
    <a
      href={ad.linkUrl}
      target="_blank"
      rel="noopener noreferrer"
      data-testid={`ad-spot-${ad.id}`}
      className={`block glass-panel rounded-xl p-4 border border-primary/20 hover:border-primary/40 transition-colors group ${className}`}
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
