import { useState, useEffect, useCallback, useRef } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Flame, TrendingUp, Clock, Rocket, Search, RefreshCw,
  ChevronRight, Zap, BarChart2, ArrowUpRight, ArrowDownRight,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

interface TokenCard {
  id: string;
  name: string;
  symbol: string;
  imageUrl?: string | null;
  mintAddress?: string | null;
  marketCap?: number | null;
  priceUsd?: number | null;
  change24h?: number | null;
  volume24h?: number | null;
  createdAt?: string | null;
  source: "feather" | "trenchy" | "uniswap" | "bags";
  bagsUrl?: string | null;
  pumpUrl?: string | null;
  description?: string | null;
  creatorWallet?: string | null;
  bondingProgress?: number | null;
  website?: string | null;
  twitter?: string | null;
  launchpad?: string;
  migrated?: boolean;
}

type FilterTab = "new" | "trending" | "top" | "graduating";

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatMcap(v?: number | null): string {
  if (!v) return "—";
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(2)}B`;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

function timeAgo(dateStr?: string | null): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function shortAddr(addr?: string | null): string {
  if (!addr) return "";
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

function isFeatherSource(token: TokenCard): boolean {
  return token.source === "feather" || token.source === "trenchy" || token.launchpad === "feather";
}

// ── Bonding progress bar ──────────────────────────────────────────────────────

function BondingBar({ pct }: { pct: number }) {
  const clamped = Math.min(100, Math.max(0, pct));
  return (
    <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
      <div
        className="h-full rounded-full bg-primary transition-all duration-500"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

// ── Token Card ────────────────────────────────────────────────────────────────

function TokenCardItem({ token }: { token: TokenCard }) {
  const href = token.mintAddress ? `/dex/${token.mintAddress}` : "#";
  const isUp = (token.change24h ?? 0) >= 0;
  const feather = isFeatherSource(token);

  const inner = (
    <div
      data-testid={`token-card-${token.id}`}
      className="group relative bg-card border border-border/60 rounded-xl overflow-hidden cursor-pointer
        hover:border-primary/40 hover:bg-card/90 transition-all duration-200"
    >
      <div className="relative overflow-hidden bg-muted/40" style={{ aspectRatio: "1" }}>
        {token.imageUrl ? (
          <img
            src={token.imageUrl}
            alt={token.name}
            className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500"
            loading="lazy"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-primary/10">
            <span className="text-3xl font-black text-muted-foreground/30 select-none tracking-tighter">
              {(token.symbol || "??").slice(0, 3).toUpperCase()}
            </span>
          </div>
        )}

        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/70 to-transparent" />

        <div
          className={`absolute top-2 left-2 px-2 py-0.5 rounded-md text-[10px] font-bold leading-none border ${
            feather
              ? "bg-primary/90 border-primary/50 text-primary-foreground"
              : "bg-pink-500/90 border-pink-400/50 text-white"
          }`}
        >
          {feather ? "FEATHER" : "UNISWAP"}
        </div>

        {token.createdAt && (
          <div className="absolute top-2 right-2 text-[10px] text-white/80 bg-black/55 rounded-md px-2 py-0.5 leading-none border border-white/10">
            {timeAgo(token.createdAt)}
          </div>
        )}

        <div className="absolute bottom-0 inset-x-0 px-3 pb-2.5">
          <div className="flex items-end justify-between gap-1">
            <div className="min-w-0">
              <p className="font-bold text-[13px] text-white leading-tight truncate drop-shadow-sm">
                {token.name}
              </p>
              <p className="text-[11px] text-white/60 font-medium leading-none mt-0.5">
                ${token.symbol}
              </p>
            </div>
            {token.change24h != null && (
              <div className={`flex items-center gap-0.5 text-[11px] font-bold shrink-0 ${isUp ? "text-emerald-400" : "text-red-400"}`}>
                {isUp ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                {Math.abs(token.change24h).toFixed(1)}%
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="px-3 py-2.5 space-y-1">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-muted-foreground">mkt cap</span>
          <span className={`font-bold ${token.marketCap ? "text-foreground" : "text-muted-foreground/50"}`}>
            {formatMcap(token.marketCap)}
          </span>
        </div>

        {token.volume24h != null && token.volume24h > 0 && (
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground">vol 24h</span>
            <span className="font-medium text-foreground/80">{formatMcap(token.volume24h)}</span>
          </div>
        )}

        {token.bondingProgress != null && token.bondingProgress > 0 && !token.migrated && (
          <div className="pt-1">
            <div className="flex items-center justify-between text-[10px] mb-1">
              <span className="text-muted-foreground">bonding curve</span>
              <span className="text-muted-foreground font-medium">{token.bondingProgress.toFixed(1)}%</span>
            </div>
            <BondingBar pct={token.bondingProgress} />
          </div>
        )}

        {token.description && !token.marketCap && (
          <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed pt-0.5">
            {token.description}
          </p>
        )}

        {token.creatorWallet && (
          <div className="text-[10px] text-muted-foreground/70 truncate pt-0.5">
            by {shortAddr(token.creatorWallet)}
          </div>
        )}
      </div>
    </div>
  );

  return <Link href={href}>{inner}</Link>;
}

function SkeletonCard() {
  return (
    <div className="bg-card border border-border/60 rounded-xl overflow-hidden animate-pulse">
      <div className="aspect-square bg-muted" />
      <div className="p-3 space-y-2">
        <div className="h-2.5 bg-muted rounded-full w-3/4" />
        <div className="h-2 bg-muted rounded-full w-1/2" />
      </div>
    </div>
  );
}

function TickerBar({ tokens }: { tokens: TokenCard[] }) {
  if (tokens.length === 0) return null;
  const items = [...tokens, ...tokens];
  return (
    <div className="overflow-hidden border border-border/60 rounded-xl bg-card/50 mb-4">
      <div
        className="flex gap-8 py-2.5 px-4 whitespace-nowrap"
        style={{ animation: "ticker 40s linear infinite", willChange: "transform" }}
      >
        {items.map((t, i) => (
          <span key={`${t.id}-${i}`} className="inline-flex items-center gap-2 text-[12px] shrink-0">
            {t.imageUrl && (
              <img src={t.imageUrl} alt="" className="w-4 h-4 rounded-full object-cover border border-border/60" />
            )}
            <span className="text-foreground/80 font-semibold">{t.symbol}</span>
            {t.marketCap ? (
              <span className="text-primary/80 font-medium">{formatMcap(t.marketCap)}</span>
            ) : null}
          </span>
        ))}
      </div>
    </div>
  );
}

const TABS: { id: FilterTab; label: string; icon: React.ReactNode }[] = [
  { id: "new",        label: "New",        icon: <Clock className="w-3.5 h-3.5" /> },
  { id: "trending",   label: "Trending",   icon: <Flame className="w-3.5 h-3.5" /> },
  { id: "top",        label: "Top",        icon: <TrendingUp className="w-3.5 h-3.5" /> },
  { id: "graduating", label: "Graduating", icon: <Rocket className="w-3.5 h-3.5" /> },
];

const PAGE_SIZE = 24;

export default function Launchpad() {
  const [tab, setTab] = useState<FilterTab>("new");
  const [search, setSearch] = useState("");
  const [spinning, setSpinning] = useState(false);
  const [page, setPage] = useState(1);
  const [accTokens, setAccTokens] = useState<TokenCard[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const prevPageRef = useRef(1);

  const { data: feedData, isLoading: feedLoading, refetch } = useQuery<{
    tokens: TokenCard[];
    total: number;
    page: number;
    pageSize: number;
    hasMore: boolean;
  }>({
    queryKey: ["/api/home/feed", tab, page],
    queryFn: async () => {
      const r = await fetch(`/api/home/feed?tab=${tab}&page=${page}&pageSize=${PAGE_SIZE}`);
      if (!r.ok) return { tokens: [], total: 0, page, pageSize: PAGE_SIZE, hasMore: false };
      return r.json();
    },
    staleTime: 30_000,
  });

  useEffect(() => {
    setPage(1);
    setAccTokens([]);
    setHasMore(false);
    setTotal(0);
    setSearch("");
    prevPageRef.current = 1;
  }, [tab]);

  useEffect(() => {
    if (!feedData) return;
    const incoming = feedData.tokens ?? [];
    if (feedData.page === 1) {
      setAccTokens(incoming);
    } else {
      setAccTokens((prev) => {
        const seen = new Set(prev.map((t) => t.id));
        return [...prev, ...incoming.filter((t) => !seen.has(t.id))];
      });
    }
    setHasMore(feedData.hasMore);
    setTotal(feedData.total);
    prevPageRef.current = feedData.page;
  }, [feedData]);

  const isLoading = feedLoading && page === 1;
  const isLoadingMore = feedLoading && page > 1;

  const filtered = search
    ? accTokens.filter((t) => {
        const q = search.toLowerCase();
        return (
          t.name.toLowerCase().includes(q) ||
          t.symbol.toLowerCase().includes(q) ||
          (t.mintAddress ?? "").toLowerCase().includes(q)
        );
      })
    : accTokens;

  const handleLoadMore = useCallback(() => {
    setPage((p) => p + 1);
  }, []);

  const handleRefresh = useCallback(() => {
    setSpinning(true);
    setPage(1);
    setAccTokens([]);
    setHasMore(false);
    setTotal(0);
    refetch().finally(() => setTimeout(() => setSpinning(false), 400));
  }, [refetch]);

  return (
    <AppShell>
      <div className="pb-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">

          {/* Header */}
          <div className="flex flex-wrap items-end justify-between gap-3 py-5 border-b border-border/60 mb-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Rocket className="w-5 h-5 text-primary" />
                <h1 className="text-xl font-bold font-display" data-testid="launchpad-title">
                  Launchpad
                </h1>
              </div>
              <p className="text-sm text-muted-foreground">
                Tokens launched on Feather App · Robinhood Chain
              </p>
            </div>
            <Link href="/launch">
              <Button data-testid="launchpad-launch-button" className="gap-1.5">
                <Rocket className="w-4 h-4" /> Launch coin
              </Button>
            </Link>
          </div>

          {/* Stats */}
          <div className="flex flex-wrap items-center gap-4 mb-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-medium text-foreground/80">Live</span>
            </div>
            <div className="h-3 w-px bg-border" />
            <div className="flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-primary" />
              <span>Tokens launched:</span>
              <span className="font-bold text-foreground">{total}</span>
            </div>
            <div className="h-3 w-px bg-border" />
            <div className="flex items-center gap-1.5">
              <BarChart2 className="w-3.5 h-3.5" />
              <span>Powered by Robinhood Chain</span>
            </div>
            <div className="flex-1" />
            <Link href="/dex">
              <span className="text-primary hover:underline font-medium inline-flex items-center gap-0.5">
                Open DEX <ChevronRight className="w-3 h-3" />
              </span>
            </Link>
          </div>

          <TickerBar tokens={accTokens.slice(0, 20)} />

          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-2 mb-4 sticky top-14 z-20 bg-background/95 backdrop-blur-sm py-2 -mx-1 px-1 border-b border-border/40">
            <div className="flex items-center gap-1 flex-1 overflow-x-auto">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  data-testid={`filter-tab-${t.id}`}
                  onClick={() => setTab(t.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                    tab === t.id
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50 border border-border/40"
                  }`}
                >
                  {t.icon}
                  <span>{t.label}</span>
                </button>
              ))}
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                data-testid="token-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search tokens…"
                className="pl-9 h-8 w-36 sm:w-52 text-xs"
              />
            </div>

            <button
              data-testid="token-refresh"
              onClick={handleRefresh}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${spinning ? "animate-spin" : ""}`} />
            </button>

            {!isLoading && (
              <span className="text-[11px] text-muted-foreground hidden sm:block font-medium tabular-nums">
                {filtered.length} / {total}
              </span>
            )}
          </div>

          {/* Token grid */}
          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {Array.from({ length: 24 }).map((_, i) => <SkeletonCard key={i} />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center border border-dashed border-border/60 rounded-xl bg-card/30">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-5">
                <Rocket className="w-8 h-8 text-primary/40" />
              </div>
              <h3 className="font-bold text-lg text-foreground/70 mb-2">
                {search ? "No tokens match" : "No tokens yet"}
              </h3>
              <p className="text-muted-foreground text-sm max-w-xs leading-relaxed">
                {search
                  ? "Try a different search term."
                  : "Be the first to launch a token on Feather App"}
              </p>
              {!search && (
                <Link href="/launch">
                  <Button className="mt-6 gap-2">
                    <Rocket className="w-4 h-4" /> Launch your first coin
                  </Button>
                </Link>
              )}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                {filtered.map((token) => (
                  <TokenCardItem key={token.id} token={token} />
                ))}
              </div>

              {!search && (hasMore || isLoadingMore) && (
                <div className="flex justify-center mt-8">
                  <Button
                    data-testid="button-load-more"
                    variant="outline"
                    onClick={handleLoadMore}
                    disabled={isLoadingMore}
                    className="gap-2"
                  >
                    {isLoadingMore ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Loading…
                      </>
                    ) : (
                      <>
                        Load more
                        <ChevronRight className="w-4 h-4" />
                      </>
                    )}
                  </Button>
                </div>
              )}
            </>
          )}

          {!isLoading && filtered.length > 0 && (
            <div className="flex items-center justify-between mt-10 pt-5 border-t border-border/60 text-xs text-muted-foreground">
              <span>{accTokens.length} of {total} tokens on Robinhood Chain</span>
              <div className="flex gap-4">
                <Link href="/dex">
                  <span className="hover:text-foreground transition-colors inline-flex items-center gap-0.5 cursor-pointer font-medium">
                    DEX Screener <ChevronRight className="w-3 h-3" />
                  </span>
                </Link>
                <Link href="/launch">
                  <span className="hover:text-foreground transition-colors inline-flex items-center gap-0.5 cursor-pointer font-medium">
                    Launch Token <ChevronRight className="w-3 h-3" />
                  </span>
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes ticker {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </AppShell>
  );
}
