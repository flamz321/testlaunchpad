import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSocialAuth, socialAuthHeaders } from "@/hooks/use-social-auth";
import { useWalletConnect } from "@/hooks/use-wallet-connect";
import { useToast } from "@/hooks/use-toast";
import { SocialLayout } from "@/components/SocialLayout";
import { SponsoredSidebar } from "@/components/SponsoredSidebar";
import { ReportModal } from "@/components/ReportModal";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Rocket, Zap, TrendingUp, Clock, Star, ExternalLink, Copy,
  Flag, RefreshCw, Twitter, Globe, Check, Loader2, LogIn, ChevronRight,
  Flame, Sparkles, AlertTriangle, Hash, BarChart2
} from "lucide-react";
import { SiX, SiTelegram } from "react-icons/si";
import { formatDistanceToNow } from "date-fns";

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = "all" | "trenchy" | "trending" | "new" | "curated";

interface LaunchFeedItem {
  id: string;
  source: "trenchy" | "external";
  launchpad: string;
  platform?: string;
  name: string;
  ticker: string;
  mintAddress: string;
  imageUrl?: string | null;
  description?: string | null;
  website?: string | null;
  twitter?: string | null;
  mcap?: number;
  volume24h?: number;
  priceUsd?: string;
  launcherHandle?: string | null;
  launcherWallet?: string | null;
  trenchyBoost: boolean;
  createdAt: string;
  pumpUrl?: string | null;
  dexUrl: string;
}

interface FeedResponse {
  items: LaunchFeedItem[];
  page: number;
  limit: number;
  config: { minMcapUsd: number; minVolume24hUsd: number; trenchyBoostThreshold: number };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtMcap(n?: number): string {
  if (!n) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtVol(n?: number): string {
  if (!n) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtPrice(p?: string | null): string {
  if (!p) return "";
  const n = Number(p);
  if (!n || isNaN(n) || n <= 0) return "";
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(4)}`;
  if (n >= 0.000001) return `$${n.toFixed(8)}`;
  return `$${n.toFixed(12)}`;
}

function truncateCa(addr: string) {
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
}

function launchpadColor(lp: string) {
  if (lp === "uniswap" || lp === "bags.fm") return "text-blue-400 border-blue-400/30 bg-blue-400/10";
  if (lp === "pump.fun" || lp === "robinhood" || lp === "robinhood-dex") return "text-emerald-400 border-emerald-400/30 bg-emerald-400/10";
  return "text-gray-400 border-gray-400/30 bg-gray-400/10";
}

/** User-facing launchpad label — never show pump.fun / bags.fm */
function launchpadLabel(lp: string) {
  const key = (lp || "").toLowerCase();
  if (key === "bags.fm" || key === "uniswap") return "Uniswap";
  if (key === "pump.fun" || key === "robinhood" || key === "robinhood-dex") return "Robinhood DEX";
  if (key === "feather" || key === "trenchy") return "Feather";
  return "Uniswap";
}

function platformLabel(platform?: string) {
  if (platform === "telegram") return { icon: <SiTelegram className="w-2.5 h-2.5" />, label: "TG" };
  if (platform === "discord") return { icon: <span className="text-[9px]">DC</span>, label: "DC" };
  return null;
}

// ── CopyButton ────────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  return (
    <button onClick={copy} title="Copy CA" className="text-muted-foreground hover:text-foreground transition-colors">
      {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
    </button>
  );
}

// ── Report button ─────────────────────────────────────────────────────────────

function ReportButton({ item, token }: { item: LaunchFeedItem; token: string | null }) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  if (done) return <Flag className="w-3 h-3 text-amber-400" />;
  if (!token) return null;
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Report token"
        data-testid={`button-report-token-${item.mintAddress}`}
        className="text-muted-foreground hover:text-amber-400 transition-colors"
      >
        <Flag className="w-3 h-3" />
      </button>
      {open && (
        <ReportModal
          reportedId={item.mintAddress}
          reportedType="token"
          token={token}
          endpoint="/api/launch-report"
          buildBody={(reason) => ({ mintAddress: item.mintAddress, reason })}
          onClose={() => { setOpen(false); setDone(true); }}
        />
      )}
    </>
  );
}

// ── Launch Card ───────────────────────────────────────────────────────────────

function LaunchCard({ item, token }: { item: LaunchFeedItem; token: string | null }) {
  const isFeather = item.source === "trenchy";
  const lpClass = launchpadColor(item.launchpad);
  const platInfo = platformLabel(item.platform);

  // Share to X
  const shareText = `🚀 ${item.name} ($${item.ticker}) just launched on ${launchpadLabel(item.launchpad)}!\nCA: ${item.mintAddress}\n\nvia @FeatherApp #RobinhoodChain`;
  const xUrl = `https://x.com/intent/tweet?text=${encodeURIComponent(shareText)}`;

  // Share to Telegram
  const tgUrl = `https://t.me/share/url?url=${encodeURIComponent(item.dexUrl)}&text=${encodeURIComponent(`🚀 ${item.name} ($${item.ticker}) just launched!`)}`;

  // Buy/Ape link
  const apeUrl = item.pumpUrl
    ? item.pumpUrl
    : `https://app.uniswap.org/explore/tokens/robinhood/${item.mintAddress}`;

  return (
    <div
      data-testid={`card-launch-${item.id}`}
      className={`glass-panel rounded-xl p-4 mb-3 transition-all hover:border-border ${
        item.trenchyBoost ? "border border-primary/30 shadow-[0_0_12px_rgba(var(--primary-rgb),0.08)]" : ""
      }`}
    >
      {/* Header row */}
      <div className="flex items-start gap-3">
        {/* Token icon */}
        <div className="w-12 h-12 rounded-xl overflow-hidden bg-muted/50 border border-border flex items-center justify-center shrink-0">
          {item.imageUrl ? (
            <img
              src={item.imageUrl}
              alt={item.ticker}
              className="w-full h-full object-cover"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          ) : (
            <span className="text-lg font-bold text-primary/60">
              {item.ticker.slice(0, 2).toUpperCase()}
            </span>
          )}
        </div>

        {/* Name + badges */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-base truncate max-w-[160px] sm:max-w-xs">{item.name}</span>
            <span className="text-muted-foreground text-sm font-mono">${item.ticker}</span>

            {/* Launchpad badge */}
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${lpClass}`}>
              {launchpadLabel(item.launchpad)}
            </span>

            {/* Platform badge (Feather-only) */}
            {isFeather && platInfo && (
              <span className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-muted/50 border border-border text-muted-foreground">
                {platInfo.icon} {platInfo.label}
              </span>
            )}

            {/* Feather boost crown */}
            {item.trenchyBoost && (
              <span className="flex items-center gap-1 text-[10px] text-amber-400 font-semibold">
                <Sparkles className="w-2.5 h-2.5" />
                Boosted
              </span>
            )}

            {/* Source badge */}
            {isFeather && (
              <span className="flex items-center gap-1 text-[10px] text-primary/80 font-semibold bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20">
                <Rocket className="w-2.5 h-2.5" />
                Feather
              </span>
            )}
          </div>

          {/* CA row */}
          <div className="flex items-center gap-1.5 mt-1">
            <Hash className="w-3 h-3 text-muted-foreground shrink-0" />
            <span className="text-xs font-mono text-muted-foreground">{truncateCa(item.mintAddress)}</span>
            <CopyButton text={item.mintAddress} />
            <span className="text-[10px] text-muted-foreground ml-1">
              {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
            </span>
          </div>

          {/* Launcher (Feather only) */}
          {isFeather && item.launcherHandle && (
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Launched by{" "}
              {item.launcherWallet ? (
                <Link href={`/u/${item.launcherWallet}`} className="text-primary hover:underline">
                  @{item.launcherHandle}
                </Link>
              ) : (
                <span>@{item.launcherHandle}</span>
              )}
            </p>
          )}
        </div>

        {/* Report button */}
        <div className="flex items-center gap-1.5 ml-auto shrink-0 mt-0.5">
          <ReportButton item={item} token={token} />
        </div>
      </div>

      {/* Description */}
      {item.description && (
        <p className="text-xs text-foreground/70 mt-2.5 leading-relaxed line-clamp-2">{item.description}</p>
      )}

      {/* Stats row */}
      <div className="flex items-center gap-4 mt-3 flex-wrap">
        <div className="flex items-center gap-1">
          <TrendingUp className="w-3 h-3 text-muted-foreground" />
          <span className="text-xs">
            <span className="text-muted-foreground">MCAP </span>
            <span className={`font-semibold ${(item.mcap ?? 0) >= 100000 ? "text-emerald-400" : "text-foreground"}`}>
              {fmtMcap(item.mcap)}
            </span>
          </span>
        </div>
        {item.volume24h !== undefined && (
          <div className="flex items-center gap-1">
            <Flame className="w-3 h-3 text-muted-foreground" />
            <span className="text-xs">
              <span className="text-muted-foreground">Vol 24h </span>
              <span className="font-semibold">{fmtVol(item.volume24h)}</span>
            </span>
          </div>
        )}
        {item.priceUsd && fmtPrice(item.priceUsd) && (
          <div className="text-xs text-muted-foreground font-mono">
            {fmtPrice(item.priceUsd)}
          </div>
        )}
      </div>

      {/* Action row */}
      <div className="flex items-center gap-2 mt-3 flex-wrap">
        {/* Feather DEX Chart (internal) */}
        <Link
          href={`/dex/${item.mintAddress}`}
          data-testid={`link-dex-${item.id}`}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-primary/30 bg-primary/10 hover:bg-primary/20 text-primary transition-colors font-medium"
        >
          <BarChart2 className="w-3 h-3" />
          Chart
        </Link>
        {/* Dexscreener external */}
        {item.dexUrl && (
          <a
            data-testid={`link-dexscreener-${item.id}`}
            href={item.dexUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-border bg-muted/50 hover:bg-muted transition-colors text-muted-foreground"
            title="View on Dexscreener"
          >
            <ExternalLink className="w-3 h-3" />
            DS
          </a>
        )}

        {/* Ape / Buy */}
        <a
          data-testid={`link-ape-${item.id}`}
          href={apeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-semibold"
        >
          <Zap className="w-3 h-3" />
          Ape
        </a>

        {/* Share to X */}
        <a
          data-testid={`link-x-${item.id}`}
          href={xUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-border bg-muted/50 hover:bg-muted transition-colors"
        >
          <SiX className="w-3 h-3" />
        </a>

        {/* Share to Telegram */}
        <a
          data-testid={`link-tg-${item.id}`}
          href={tgUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-border bg-muted/50 hover:bg-muted transition-colors text-[#24A1DE]"
        >
          <SiTelegram className="w-3 h-3" />
        </a>

        {/* Twitter/X link (if token has one) */}
        {item.twitter && (
          <a
            href={item.twitter}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <SiX className="w-2.5 h-2.5" />
            <span>Twitter</span>
          </a>
        )}

        {/* Website link */}
        {item.website && (
          <a
            href={item.website}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Globe className="w-2.5 h-2.5" />
            <span>Web</span>
          </a>
        )}
      </div>
    </div>
  );
}

// ── Tab config ────────────────────────────────────────────────────────────────

const TABS: { key: Tab; label: string; icon: React.ReactNode; desc: string }[] = [
  { key: "all", label: "All", icon: <Rocket className="w-3.5 h-3.5" />, desc: "All recent launches" },
  { key: "trenchy", label: "Feather", icon: <Sparkles className="w-3.5 h-3.5" />, desc: "Launched via Feather bot" },
  { key: "trending", label: "Trending", icon: <TrendingUp className="w-3.5 h-3.5" />, desc: "Sorted by market cap" },
  { key: "new", label: "New", icon: <Clock className="w-3.5 h-3.5" />, desc: "Just launched" },
  { key: "curated", label: "Curated", icon: <Star className="w-3.5 h-3.5" />, desc: "Top picks from Feather App" },
];

// ── Main page ─────────────────────────────────────────────────────────────────

export default function LaunchFeed() {
  const wallet = useWalletConnect();
  const { token, signIn } = useSocialAuth();
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("all");
  const [page, setPage] = useState(0);

  const { data, isLoading, refetch, isFetching } = useQuery<FeedResponse>({
    queryKey: ["/api/launch-feed", tab, page],
    queryFn: () =>
      fetch(`/api/launch-feed?tab=${tab}&page=${page}&limit=20`).then((r) => r.json()),
    refetchInterval: 60_000,
    placeholderData: (prev) => prev,
  });

  const items = data?.items ?? [];

  function changeTab(t: Tab) {
    setTab(t);
    setPage(0);
  }

  return (
    <SocialLayout rightSidebar={<SponsoredSidebar placement="feed" />}>
      {/* Sticky header */}
      <div className="sticky top-14 z-20 bg-background/95 backdrop-blur border-b border-border">
        <div className="flex items-center justify-between px-4 py-3">
          <h1 className="text-[17px] font-bold flex items-center gap-2">
            <Rocket className="w-5 h-5 text-primary" />
            Launch Feed
          </h1>
          <div className="flex items-center gap-2">
            <button
              data-testid="button-refresh-launches"
              onClick={() => refetch()}
              disabled={isFetching}
              className="p-1.5 rounded-full hover:bg-muted transition-colors text-muted-foreground"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
            </button>
            {!token && (
              <Button size="sm" variant="outline" onClick={signIn} className="rounded-full text-xs px-3">
                <LogIn className="w-3.5 h-3.5 mr-1.5" />
                Sign In
              </Button>
            )}
          </div>
        </div>

        {/* Underline tabs */}
        <div className="flex border-b border-border overflow-x-auto scrollbar-hide">
          {TABS.map(({ key, label, icon }) => (
            <button
              key={key}
              data-testid={`tab-launch-${key}`}
              onClick={() => changeTab(key)}
              className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium whitespace-nowrap shrink-0 relative transition-colors ${
                tab === key ? "text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
              }`}
            >
              {icon}
              {label}
              {tab === key && <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-10 h-[3px] rounded-full bg-primary" />}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 py-4">

        {/* ── Anti-spam notice ───────────────────────────────────────────────── */}
        {data?.config && tab !== "trenchy" && (
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-4 px-3 py-2 rounded-lg bg-muted/50 border border-border">
            <AlertTriangle className="w-3 h-3 text-amber-400/70 shrink-0" />
            External tokens filtered: MCAP ≥ {fmtMcap(data.config.minMcapUsd)} or Vol 24h ≥ {fmtVol(data.config.minVolume24hUsd)} · Feather accounts with 250k+ $FEATHER get priority
          </div>
        )}

        {/* ── Feed ───────────────────────────────────────────────────────────── */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="glass-panel rounded-xl p-4">
                <div className="flex gap-3">
                  <Skeleton className="w-12 h-12 rounded-xl" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-5 w-48" />
                    <Skeleton className="h-3 w-32" />
                    <Skeleton className="h-8 w-full" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Rocket className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No launches found</p>
            <p className="text-sm mt-1">
              {tab === "trenchy"
                ? "No tokens launched via Feather yet — be the first!"
                : "No tokens passed the quality filters right now"}
            </p>
            {tab === "trenchy" && (
              <a
                href="https://t.me/FeatherAppBot"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 mt-4 text-sm text-primary hover:underline"
              >
                <SiTelegram className="w-3.5 h-3.5" />
                Launch via Feather Bot
              </a>
            )}
          </div>
        ) : (
          <>
            {items.map((item) => (
              <LaunchCard key={item.id} item={item} token={token} />
            ))}

            {/* Pagination */}
            <div className="flex items-center justify-between mt-5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0 || isFetching}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">Page {page + 1}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => p + 1)}
                disabled={items.length < 20 || isFetching}
              >
                Next
              </Button>
            </div>
          </>
        )}

        {/* ── Footer info ────────────────────────────────────────────────────── */}
        <p className="text-center text-[11px] text-muted-foreground mt-6 pb-4">
          Auto-refreshes every 60s · External data via DexScreener ·{" "}
          <Link href="/community" className="hover:underline text-primary/70">Community Posts</Link>
        </p>
      </div>
    </SocialLayout>
  );
}
