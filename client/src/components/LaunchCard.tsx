import { formatDistanceToNow } from "date-fns";
import { ExternalLink, CheckCircle, Clock, AlertTriangle, Globe } from "lucide-react";
import { SiX, SiTelegram, SiDiscord } from "react-icons/si";
import type { Launch } from "@shared/schema";

interface LaunchCardProps {
  launch: Launch;
}

function LaunchpadBadge({ launchpad }: { launchpad: string | null }) {
  const key = (launchpad || "").toLowerCase();
  const label =
    key === "pump.fun" || key === "robinhood" || key === "robinhood-dex"
      ? "Robinhood DEX"
      : "Uniswap";
  const style =
    key === "pump.fun" || key === "robinhood" || key === "robinhood-dex"
      ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
      : "bg-cyan-500/15 text-cyan-400 border-cyan-500/30";
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${style}`}>
      {label}
    </span>
  );
}

function PlatformBadge({ platform }: { platform: string | null }) {
  if (platform === "discord") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#5865F2]/20 text-[#7289da] border border-[#5865F2]/30">
        <SiDiscord className="w-2.5 h-2.5" />
        Discord
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#26A5E4]/20 text-[#26A5E4] border border-[#26A5E4]/30">
      <SiTelegram className="w-2.5 h-2.5" />
      Telegram
    </span>
  );
}

export function LaunchCard({ launch }: LaunchCardProps) {
  const viewLabel = "View on Uniswap";

  const getStatusDisplay = () => {
    switch (launch.status) {
      case 'successful':
        return { icon: CheckCircle, color: 'text-primary', bg: 'bg-primary/10', text: 'Live' };
      case 'failed':
        return { icon: AlertTriangle, color: 'text-destructive', bg: 'bg-destructive/10', text: 'Failed' };
      default:
        return { icon: Clock, color: 'text-yellow-400', bg: 'bg-yellow-400/10', text: 'Deploying...' };
    }
  };

  const status = getStatusDisplay();
  const StatusIcon = status.icon;

  const placeholderUrl = `https://ui-avatars.com/api/?name=${launch.ticker}&background=0B0E14&color=00FFA3&size=200&font-size=0.3`;

  return (
    <div className="glass-panel-interactive rounded-2xl overflow-hidden flex flex-col group h-full" data-testid={`card-launch-${launch.id}`}>
      <div className="h-40 overflow-hidden relative bg-black">
        <img
          src={launch.imageUrl || placeholderUrl}
          alt={launch.coinName}
          className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500"
          onError={(e) => {
            (e.target as HTMLImageElement).src = placeholderUrl;
          }}
        />
        <div className="absolute inset-0 bg-background/30" />

        <div className={`absolute top-4 right-4 px-3 py-1.5 rounded-full flex items-center gap-1.5 text-xs font-bold backdrop-blur-md border border-border ${status.bg} ${status.color}`}>
          <StatusIcon className="w-3.5 h-3.5" />
          {status.text}
        </div>
      </div>

      <div className="p-6 flex-1 flex flex-col relative z-10 -mt-6">
        <div className="mb-3">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-xl font-bold font-display line-clamp-1">{launch.coinName}</h3>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-primary font-mono text-sm tracking-wider">${launch.ticker}</p>
            <LaunchpadBadge launchpad={launch.launchpad} />
            <PlatformBadge platform={launch.platform} />
          </div>
        </div>

        {launch.description && (
          <p className="text-xs text-muted-foreground leading-relaxed mb-3 line-clamp-2">
            {launch.description}
          </p>
        )}

        {(launch.website || launch.twitter) && (
          <div className="flex items-center gap-3 mb-3">
            {launch.website && (
              <a
                href={launch.website}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                title={launch.website}
              >
                <Globe className="w-3.5 h-3.5" />
                <span className="truncate max-w-[80px]">Website</span>
              </a>
            )}
            {launch.twitter && (
              <a
                href={launch.twitter}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <SiX className="w-3 h-3" />
                <span>Twitter</span>
              </a>
            )}
          </div>
        )}

        <div className="mt-auto space-y-4">
          {launch.mintAddress && (
            <div className="bg-black/40 p-3 rounded-lg border border-border">
              <p className="text-[10px] text-muted-foreground uppercase font-bold mb-1">Contract Address</p>
              <p className="font-mono text-xs text-gray-300 truncate" title={launch.mintAddress}>
                {launch.mintAddress}
              </p>
            </div>
          )}

          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {launch.createdAt ? formatDistanceToNow(new Date(launch.createdAt), { addSuffix: true }) : 'Just now'}
            </span>

            {launch.pumpUrl && (
              <a
                href={launch.pumpUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-sm font-bold text-white hover:text-primary transition-colors"
                data-testid={`link-view-${launch.id}`}
              >
                {viewLabel}
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
