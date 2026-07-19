import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useSettings } from "@/hooks/use-settings";
import type { DexListing } from "@shared/schema";
import {
  Search, Plus, TrendingUp, Flame, Star, RefreshCw,
  Copy, Check, ChevronRight, Zap, ArrowUpRight, ArrowDownRight,
  Globe, Send, Twitter, ChevronLeft, Upload, Link2, ImageIcon, Loader2,
  ChevronUp, ChevronDown, ChevronsUpDown, Activity, BarChart3, Trophy,
  Rocket, CheckCircle2, Megaphone, Clock, Bookmark, BookmarkCheck, Filter,
} from "lucide-react";
import { SiDiscord } from "react-icons/si";

// ── sanitize helpers ──────────────────────────────────────────────────────────

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, "").replace(/[<>]/g, "").trim();
}

function sanitizeUrl(s: string): string {
  const cleaned = s.trim();
  if (!cleaned) return "";
  if (/^https?:\/\//i.test(cleaned)) return cleaned;
  if (cleaned.startsWith("@")) return cleaned;
  return cleaned;
}

// ── image resize utility ──────────────────────────────────────────────────────

async function resizeImageToMax(file: File, maxPx = 500): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const canvas = document.createElement("canvas");
      let w = img.width;
      let h = img.height;
      if (w > maxPx || h > maxPx) {
        const ratio = Math.min(maxPx / w, maxPx / h);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
      }
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error("Invalid image")); };
    img.src = objectUrl;
  });
}

// ── helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined, prefix = "", suffix = "") {
  if (n == null || isNaN(n)) return "—";
  if (Math.abs(n) >= 1_000_000_000) return `${prefix}${(n / 1_000_000_000).toFixed(2)}B${suffix}`;
  if (Math.abs(n) >= 1_000_000) return `${prefix}${(n / 1_000_000).toFixed(2)}M${suffix}`;
  if (Math.abs(n) >= 1_000) return `${prefix}${(n / 1_000).toFixed(2)}K${suffix}`;
  return `${prefix}${n.toFixed(2)}${suffix}`;
}

function fmtPrice(p: string | number | null | undefined) {
  if (!p) return "—";
  const n = Number(p);
  if (isNaN(n)) return "—";
  if (n < 0.000001) return `$${n.toExponential(2)}`;
  if (n < 0.01) return `$${n.toFixed(6)}`;
  if (n < 1) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

function PriceChange({ value }: { value: number | null | undefined }) {
  if (value == null || isNaN(value)) return <span className="text-muted-foreground text-xs">—</span>;
  const pos = value >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums ${pos ? "text-emerald-400" : "text-red-400"}`}>
      {pos ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
      {Math.abs(value).toFixed(2)}%
    </span>
  );
}

function fmtAge(createdAtMs: number | null | undefined): string {
  if (!createdAtMs) return "—";
  const secs = Math.floor((Date.now() - createdAtMs) / 1000);
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h`;
  return `${Math.floor(secs / 86400)}d`;
}

function BoostBadge({ tier }: { tier: number }) {
  if (tier === 3) return <Badge className="bg-yellow-500/20 text-yellow-300 border-yellow-500/40 text-[10px] px-1.5 py-0"><Star className="w-2.5 h-2.5 mr-0.5 inline" />Featured</Badge>;
  if (tier === 2) return <Badge className="bg-pink-500/20 text-pink-300 border-pink-500/40 text-[10px] px-1.5 py-0"><TrendingUp className="w-2.5 h-2.5 mr-0.5 inline" />Trending</Badge>;
  return <Badge className="bg-orange-500/20 text-orange-300 border-orange-500/40 text-[10px] px-1.5 py-0"><Flame className="w-2.5 h-2.5 mr-0.5 inline" />Hot</Badge>;
}

// Map raw dexId → short display label + colour (Robinhood Chain / EVM DEXes)
const DEX_META: Record<string, { label: string; cls: string }> = {
  "feather":        { label: "Feather App", cls: "bg-primary/20 text-primary border-primary/30" },
  "uniswap":        { label: "Uniswap",   cls: "bg-pink-500/20 text-pink-300 border-pink-500/30" },
  "uniswapv2":      { label: "Uni v2",    cls: "bg-pink-500/20 text-pink-300 border-pink-500/30" },
  "uniswapv3":      { label: "Uni v3",    cls: "bg-pink-500/20 text-pink-300 border-pink-500/30" },
  "uniswapv4":      { label: "Uni v4",    cls: "bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/30" },
  "uniswap-v2":     { label: "Uni v2",    cls: "bg-pink-500/20 text-pink-300 border-pink-500/30" },
  "uniswap-v3":     { label: "Uni v3",    cls: "bg-pink-500/20 text-pink-300 border-pink-500/30" },
  "uniswap-v4":     { label: "Uni v4",    cls: "bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/30" },
  "sushiswap":      { label: "Sushi",     cls: "bg-blue-500/20 text-blue-300 border-blue-500/30" },
  "sushi":          { label: "Sushi",     cls: "bg-blue-500/20 text-blue-300 border-blue-500/30" },
  "pancakeswap":    { label: "Pancake",   cls: "bg-amber-500/20 text-amber-300 border-amber-500/30" },
  "curve":          { label: "Curve",     cls: "bg-teal-500/20 text-teal-300 border-teal-500/30" },
  "balancer":       { label: "Balancer",  cls: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30" },
  "aerodrome":      { label: "Aerodrome", cls: "bg-sky-500/20 text-sky-300 border-sky-500/30" },
  "velodrome":      { label: "Velodrome", cls: "bg-indigo-500/20 text-indigo-300 border-indigo-500/30" },
};

function DexBadge({ dexId, pairsCount }: { dexId: string; pairsCount?: number }) {
  const meta = DEX_META[dexId] ?? { label: dexId || "—", cls: "bg-muted/40 text-muted-foreground border-border/40" };
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border whitespace-nowrap leading-none ${meta.cls}`}>
      {meta.label}
      {pairsCount && pairsCount > 1 && (
        <span className="opacity-60">+{pairsCount - 1}</span>
      )}
    </span>
  );
}

// ── ChainToken type (Robinhood Chain via DexScreener) ─────────────────────────

interface ChainToken {
  pairAddress: string;
  dexId: string;
  allDexIds: string[];
  pairsCount: number;
  tokenAddress: string;
  symbol: string;
  name: string;
  icon: string | null;
  priceUsd: number | null;
  priceChangeM5: number | null;
  priceChangeH1: number | null;
  priceChangeH6: number | null;
  priceChangeH24: number | null;
  volumeM5: number | null;
  volumeH1: number | null;
  volumeH6: number | null;
  volumeH24: number | null;
  buysH24: number;
  sellsH24: number;
  txnsH24: number;
  liquidity: number | null;
  fdv: number | null;
  marketCap: number | null;
  createdAt: number | null;
  isPaid?: boolean;
  boostTier?: number;
  launchpad?: string;
  chainId?: string;
}

type SortCol = "volumeH24" | "liquidity" | "fdv" | "priceChangeH24" | "priceChangeH1" | "priceChangeH6" | "priceChangeM5" | "priceUsd";
type SortDir = "asc" | "desc";
type ViewMode = "trending" | "gainers" | "all" | "watchlist";
type TrendPeriod = "m5" | "h1" | "h6" | "h24";
type Duration = "24h" | "6h" | "1h" | "5m";
type SpecialFilter = "" | "paid" | "boosted" | "launch";
type MinLiq = "" | "1k" | "10k" | "50k" | "100k";

const MIN_LIQ_VALUES: Record<MinLiq, number> = { "": 0, "1k": 1_000, "10k": 10_000, "50k": 50_000, "100k": 100_000 };

// ── Watchlist helpers (localStorage) ─────────────────────────────────────────

const WL_KEY = "feather_dex_watchlist";

function loadWatchlist(): Set<string> {
  try {
    const raw = localStorage.getItem(WL_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch { return new Set(); }
}

function saveWatchlist(wl: Set<string>) {
  localStorage.setItem(WL_KEY, JSON.stringify(Array.from(wl)));
}

// ── DEX tab definitions ───────────────────────────────────────────────────────

const DEX_TABS = [
  { id: "all", label: "All DEXes", ids: [] as string[], launchpad: "" },
  { id: "feather", label: "Feather App", ids: [] as string[], launchpad: "feather" },
  { id: "uniswap", label: "Uniswap", ids: ["uniswap", "uniswapv2", "uniswapv3", "uniswapv4", "uniswap-v2", "uniswap-v3", "uniswap-v4"], launchpad: "" },
  { id: "univ2", label: "Uni v2", ids: ["uniswapv2", "uniswap-v2"], launchpad: "" },
  { id: "univ3", label: "Uni v3", ids: ["uniswapv3", "uniswap-v3"], launchpad: "" },
  { id: "univ4", label: "Uni v4", ids: ["uniswapv4", "uniswap-v4"], launchpad: "" },
  { id: "sushi", label: "Sushi", ids: ["sushiswap", "sushi"], launchpad: "" },
  { id: "other", label: "Other", ids: ["pancakeswap", "curve", "balancer", "aerodrome", "velodrome"], launchpad: "" },
];

// ── Ad placeholders ───────────────────────────────────────────────────────────

function HeroBannerAd() {
  const { settings } = useSettings();
  return (
    <div
      data-testid="ad-hero-banner"
      className="w-full rounded-2xl border border-white/[0.07] bg-[#13131a] flex items-center justify-between py-4 px-6 mb-6 gap-4 flex-wrap"
    >
      <div>
        <div className="text-[10px] font-bold text-primary/60 uppercase tracking-widest mb-0.5">Sponsored</div>
        <div className="text-sm font-semibold text-foreground/70">Promote Your Token — Hero Banner</div>
        <div className="text-xs text-muted-foreground mt-0.5">
          Reach thousands of Robinhood Chain traders daily
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span className="text-sm font-bold text-primary">
          ${settings.adBannerPriceUsd}/{settings.adBannerDurationDays}d
        </span>
        <span className="text-xs px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary font-semibold hover:bg-primary/20 transition-colors cursor-pointer">
          Contact us
        </span>
      </div>
    </div>
  );
}

function InlineAd({ index }: { index: number }) {
  const { settings } = useSettings();
  return (
    <tr data-testid={`ad-inline-${index}`}>
      <td colSpan={9} className="px-3 py-1.5">
        <div className="rounded-xl border border-white/[0.06] bg-[#13131a] flex items-center justify-between px-4 py-2.5">
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-bold text-primary/70 uppercase tracking-widest bg-primary/10 px-1.5 py-0.5 rounded-full border border-primary/20">Sponsored</span>
            <span className="text-xs text-muted-foreground">Promote your Robinhood Chain token to thousands of active traders</span>
          </div>
          <span className="text-xs text-primary font-semibold hidden sm:block">
            ${settings.adBannerPriceUsd}/{settings.adBannerDurationDays}d
          </span>
        </div>
      </td>
    </tr>
  );
}

function SidebarAd() {
  const { settings } = useSettings();
  return (
    <div
      data-testid="ad-sidebar"
      className="rounded-2xl border border-white/[0.07] bg-[#13131a] overflow-hidden mb-4"
    >
      <div className="px-4 py-3 border-b border-white/[0.06]">
        <span className="text-[13px] font-bold text-foreground">Sponsored</span>
      </div>
      <div className="p-3 space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center justify-between rounded-xl border border-white/[0.05] bg-white/[0.02] px-3 py-2.5">
            <div>
              <p className="text-[12px] font-semibold text-foreground/60">Ad Slot {i}</p>
              <p className="text-[11px] text-primary/60 mt-0.5">
                ${settings.adSidebarPriceUsd}/{settings.adSidebarDurationDays}d
              </p>
            </div>
            <span className="text-[11px] px-2.5 py-1 rounded-full bg-primary/10 text-primary font-semibold border border-primary/20">
              Book
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Sort icon ─────────────────────────────────────────────────────────────────

function SortIcon({ col, active, dir }: { col: string; active: boolean; dir: SortDir }) {
  if (!active) return <ChevronsUpDown className="w-3 h-3 text-muted-foreground/40 inline ml-0.5" />;
  return dir === "desc"
    ? <ChevronDown className="w-3 h-3 text-primary inline ml-0.5" />
    : <ChevronUp className="w-3 h-3 text-primary inline ml-0.5" />;
}

// ── Token table row ───────────────────────────────────────────────────────────

function TxnCount({ buys, sells }: { buys: number; sells: number }) {
  const total = buys + sells;
  if (!total) return <span className="text-muted-foreground text-xs">—</span>;
  const buyPct = total > 0 ? (buys / total) * 100 : 50;
  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className="tabular-nums text-xs text-foreground/80">{total >= 1000 ? `${(total / 1000).toFixed(1)}K` : total}</span>
      <div className="flex gap-px h-1 w-16 rounded-full overflow-hidden">
        <div className="bg-emerald-500/70 rounded-l-full" style={{ width: `${buyPct}%` }} />
        <div className="bg-red-500/70 rounded-r-full flex-1" />
      </div>
      <span className="text-[9px] text-muted-foreground tabular-nums">
        <span className="text-emerald-400">{buys >= 1000 ? `${(buys / 1000).toFixed(1)}K` : buys}B</span>
        {" / "}
        <span className="text-red-400">{sells >= 1000 ? `${(sells / 1000).toFixed(1)}K` : sells}S</span>
      </span>
    </div>
  );
}

function StarButton({ address, watchlist, onToggle }: { address: string; watchlist: Set<string>; onToggle: (addr: string) => void }) {
  const starred = watchlist.has(address);
  return (
    <button
      data-testid={`button-star-${address}`}
      onClick={(e) => { e.stopPropagation(); onToggle(address); }}
      className={`transition-colors ${starred ? "text-yellow-400 hover:text-yellow-300" : "text-muted-foreground/30 hover:text-yellow-400"}`}
      title={starred ? "Remove from watchlist" : "Add to watchlist"}
    >
      <Star className="w-3.5 h-3.5" fill={starred ? "currentColor" : "none"} />
    </button>
  );
}

function TokenRow({ token, rank, adAfter, adIndex, watchlist, onToggleStar }: { token: ChainToken; rank: number; adAfter?: boolean; adIndex?: number; watchlist: Set<string>; onToggleStar: (addr: string) => void }) {
  return (
    <>
    <tr
      data-testid={`row-token-${token.pairAddress}`}
      className={`border-b border-border/30 hover:bg-white/[0.02] transition-colors cursor-pointer group ${token.boostTier ? "bg-emerald-500/[0.02]" : ""}`}
      onClick={() => window.location.href = `/dex/${token.tokenAddress}`}
    >
      <td className="px-3 py-2.5 w-8">
        <div className="flex items-center gap-1.5">
          <StarButton address={token.tokenAddress} watchlist={watchlist} onToggle={onToggleStar} />
          <span className="text-muted-foreground text-xs tabular-nums">{rank}</span>
        </div>
      </td>
      <td className="px-3 py-2.5 min-w-[140px]">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full border border-border/60 bg-muted flex-shrink-0 overflow-hidden">
            {token.icon ? (
              <img src={token.icon} alt={token.symbol} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-muted-foreground">
                {token.symbol.slice(0, 2)}
              </div>
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <Link href={`/dex/${token.tokenAddress}`} onClick={(e) => e.stopPropagation()}>
                <span className="font-semibold text-sm group-hover:text-primary transition-colors truncate block max-w-[110px]">{token.name}</span>
              </Link>
              {token.isPaid && (
                <span data-testid={`badge-paid-${token.pairAddress}`} className="inline-flex items-center text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/25 text-emerald-300 border border-emerald-500/50 whitespace-nowrap leading-none">
                  ✓ PAID
                </span>
              )}
              {token.launchpad === "feather" && token.dexId !== "feather" && (
                <span data-testid={`badge-feather-${token.tokenAddress}`} className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/40 whitespace-nowrap leading-none">
                  <Rocket className="w-2.5 h-2.5" /> Feather App
                </span>
              )}
              {(token.boostTier ?? 0) > 0 && <BoostBadge tier={token.boostTier!} />}
            </div>
            <span className="text-muted-foreground text-[11px]">{token.symbol}</span>
          </div>
        </div>
      </td>
      <td className="px-3 py-2.5 hidden md:table-cell">
        <DexBadge dexId={token.dexId} pairsCount={token.pairsCount} />
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums text-sm font-mono">{fmtPrice(token.priceUsd)}</td>
      <td className={`px-3 py-2.5 text-right hidden lg:table-cell ${token.priceChangeM5 != null ? token.priceChangeM5 >= 0 ? "bg-emerald-500/[0.06]" : "bg-red-500/[0.06]" : ""}`}><PriceChange value={token.priceChangeM5} /></td>
      <td className={`px-3 py-2.5 text-right hidden sm:table-cell ${token.priceChangeH1 != null ? token.priceChangeH1 >= 0 ? "bg-emerald-500/[0.06]" : "bg-red-500/[0.06]" : ""}`}><PriceChange value={token.priceChangeH1} /></td>
      <td className={`px-3 py-2.5 text-right hidden xl:table-cell ${token.priceChangeH6 != null ? token.priceChangeH6 >= 0 ? "bg-emerald-500/[0.06]" : "bg-red-500/[0.06]" : ""}`}><PriceChange value={token.priceChangeH6} /></td>
      <td className={`px-3 py-2.5 text-right ${token.priceChangeH24 != null ? token.priceChangeH24 >= 0 ? "bg-emerald-500/[0.06]" : "bg-red-500/[0.06]" : ""}`}><PriceChange value={token.priceChangeH24} /></td>
      <td className="px-3 py-2.5 text-right tabular-nums text-xs text-muted-foreground hidden sm:table-cell">{fmt(token.volumeH24, "$")}</td>
      <td className="px-3 py-2.5 text-right hidden xl:table-cell">
        <TxnCount buys={token.buysH24 ?? 0} sells={token.sellsH24 ?? 0} />
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums text-xs text-muted-foreground hidden lg:table-cell">{fmt(token.liquidity, "$")}</td>
      <td className="px-3 py-2.5 text-right tabular-nums text-xs text-muted-foreground hidden lg:table-cell">{fmt(token.fdv, "$")}</td>
      <td className="px-3 py-2.5 text-right hidden xl:table-cell">
        {token.createdAt ? (
          <span className="text-[10px] text-muted-foreground tabular-nums">{fmtAge(token.createdAt)}</span>
        ) : <span className="text-muted-foreground text-xs">—</span>}
      </td>
    </tr>
    {adAfter && <InlineAd key={`ad-${adIndex}`} index={adIndex ?? 0} />}
    </>
  );
}

// ── Existing Ad Banner (rotating paid ads) ────────────────────────────────────

function AdBanner() {
  const [idx, setIdx] = useState(0);
  const { data: ads = [] } = useQuery<any[]>({ queryKey: ["/api/dex/ads"], staleTime: 60_000 });

  useEffect(() => {
    if (ads.length <= 1) return;
    const id = setInterval(() => setIdx((i) => (i + 1) % ads.length), 5_000);
    return () => clearInterval(id);
  }, [ads.length]);

  useEffect(() => {
    const ad = ads[idx];
    if (ad) fetch(`/api/dex/ads/${ad.id}/impression`, { method: "POST" }).catch(() => {});
  }, [idx, ads]);

  if (!ads.length) return null;
  const ad = ads[idx];
  return (
    <a href={ad.linkUrl} target="_blank" rel="noopener noreferrer" data-testid="link-ad-banner"
      className="block w-full overflow-hidden rounded-xl border border-border/50 mb-4 hover:border-primary/40 transition-colors group relative">
      <img src={ad.imageUrl} alt={ad.label || "Sponsored"} className="w-full h-20 object-cover" />
      <span className="absolute top-1.5 right-2 text-[10px] bg-black/60 text-muted-foreground px-1.5 py-0.5 rounded">AD</span>
      {ads.length > 1 && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
          {ads.map((_, i) => (
            <button key={i} onClick={(e) => { e.preventDefault(); setIdx(i); }}
              className={`w-1.5 h-1.5 rounded-full transition-colors ${i === idx ? "bg-primary" : "bg-white/30"}`} />
          ))}
        </div>
      )}
    </a>
  );
}

// ── Token Card (paid listings) ────────────────────────────────────────────────

function TokenCard({ listing, market }: { listing: DexListing; market: any }) {
  const pair = market;
  const price = pair?.priceUsd;
  const change24 = pair?.priceChange?.h24;
  const vol24 = pair?.volume?.h24;
  const liq = pair?.liquidity?.usd;
  const mcap = pair?.fdv;
  const maxBoost = (listing as any).maxBoostTier ?? 0;

  return (
    <Link href={`/dex/${listing.mintAddress}`} data-testid={`card-token-${listing.id}`}>
      <div className="group bg-card border border-border/60 hover:border-primary/40 rounded-xl p-4 cursor-pointer transition-all duration-200 hover:shadow-[0_0_20px_rgba(0,255,128,0.05)]">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full border border-border/60 bg-muted flex-shrink-0 overflow-hidden">
            {listing.logoUrl ? (
              <img src={listing.logoUrl} alt={listing.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-sm font-bold text-muted-foreground font-display">
                {listing.ticker.slice(0, 2)}
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-sm font-display">{listing.name}</span>
              <span className="text-muted-foreground text-xs">${listing.ticker}</span>
              {maxBoost > 0 && <BoostBadge tier={maxBoost} />}
            </div>
            {listing.description && <p className="text-muted-foreground text-xs mt-0.5 truncate">{listing.description}</p>}
          </div>
          <div className="text-right flex-shrink-0">
            <div className="text-sm font-bold font-display">{fmtPrice(price)}</div>
            <PriceChange value={change24} />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-border/40">
          <div>
            <div className="text-muted-foreground text-[10px]">Volume 24h</div>
            <div className="text-xs font-semibold">{fmt(vol24, "$")}</div>
          </div>
          <div>
            <div className="text-muted-foreground text-[10px]">Liquidity</div>
            <div className="text-xs font-semibold">{fmt(liq, "$")}</div>
          </div>
          <div>
            <div className="text-muted-foreground text-[10px]">FDV</div>
            <div className="text-xs font-semibold">{fmt(mcap, "$")}</div>
          </div>
        </div>
      </div>
    </Link>
  );
}

// ── Listing Form ──────────────────────────────────────────────────────────────

const CURRENCY_OPTIONS = [
  { value: "eth", label: "ETH" },
  { value: "usdc", label: "USDC" },
  { value: "feather", label: "$FEATHER" },
];

function ListTokenModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { settings } = useSettings();
  const [step, setStep] = useState(1);
  const [currency, setCurrency] = useState("eth");
  const [copied, setCopied] = useState(false);
  const [logoMode, setLogoMode] = useState<"upload" | "url">("upload");
  const [logoUploading, setLogoUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    mintAddress: "", name: "", ticker: "", description: "", logoUrl: "",
    website: "", twitter: "", telegram: "", discord: "", tags: "",
    submitterWallet: "", paymentTxSignature: "",
  });

  const { data: payInfo, isLoading: payLoading } = useQuery<any>({
    queryKey: ["/api/dex/payment-info", currency, settings.claimFeeUsd],
    queryFn: () => fetch(`/api/dex/payment-info?usd=${settings.claimFeeUsd}`).then((r) => r.json()),
    enabled: step === 3,
    staleTime: 30_000,
  });

  const submitMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/dex/listings", { ...form, paymentCurrency: currency }),
    onSuccess: () => {
      toast({ title: "Token listed!", description: "Your token is now live on the DEX." });
      queryClient.invalidateQueries({ queryKey: ["/api/dex/listings"] });
      onClose();
      setStep(1);
    },
    onError: (e: any) => {
      toast({ title: "Listing failed", description: e.message, variant: "destructive" });
    },
  });

  const update = (k: string, v: string) => {
    const urlFields = ["website", "twitter", "telegram", "discord", "logoUrl", "mintAddress", "paymentTxSignature", "submitterWallet"];
    const sanitized = urlFields.includes(k) ? sanitizeUrl(v) : stripHtml(v);
    setForm((f) => ({ ...f, [k]: sanitized }));
  };

  const handleLogoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file", description: "Please select an image file.", variant: "destructive" });
      return;
    }
    try {
      setLogoUploading(true);
      const base64 = await resizeImageToMax(file, 500);
      const res = await fetch("/api/dex/upload-logo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64 }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Upload failed");
      setForm((f) => ({ ...f, logoUrl: json.url }));
      toast({ title: "Logo uploaded!", description: "Image resized to 500×500 and saved." });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setLogoUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const copyWallet = () => {
    if (!payInfo?.botWallet) return;
    navigator.clipboard.writeText(payInfo.botWallet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const payAmount = payInfo?.[currency]?.display ?? "…";
  const botWallet = payInfo?.botWallet ?? "";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg bg-card border-border">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">List Your Token</DialogTitle>
          <DialogDescription>${settings.claimFeeUsd} flat fee • 90-day listing • Live market data</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 mb-2">
          {[1, 2, 3, 4].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${s <= step ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{s}</div>
              {s < 4 && <div className={`flex-1 h-0.5 w-8 ${s < step ? "bg-primary" : "bg-border"}`} />}
            </div>
          ))}
          <span className="text-xs text-muted-foreground ml-2">{["Token Info", "Socials", "Pay", "Done"][step - 1]}</span>
        </div>

        {step === 1 && (
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Token Contract Address *</label>
              <Input data-testid="input-mint-address" placeholder="0x…" value={form.mintAddress} onChange={(e) => update("mintAddress", e.target.value)} className="font-mono text-xs" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Token Name *</label>
                <Input data-testid="input-name" placeholder="My Token" value={form.name} onChange={(e) => update("name", e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Ticker *</label>
                <Input data-testid="input-ticker" placeholder="MTK" value={form.ticker} onChange={(e) => update("ticker", e.target.value)} />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Logo (max 500×500px)</label>
              <div className="flex gap-1 mb-2">
                <button type="button" onClick={() => setLogoMode("upload")} className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded-md border transition-colors ${logoMode === "upload" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
                  <Upload className="w-3 h-3" /> Upload File
                </button>
                <button type="button" onClick={() => setLogoMode("url")} className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded-md border transition-colors ${logoMode === "url" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
                  <Link2 className="w-3 h-3" /> Paste URL
                </button>
              </div>
              {logoMode === "upload" ? (
                <div onClick={() => !logoUploading && fileInputRef.current?.click()} data-testid="button-upload-logo"
                  className={`flex flex-col items-center justify-center gap-1.5 border-2 border-dashed border-border rounded-lg p-4 cursor-pointer hover:border-primary/50 transition-colors ${logoUploading ? "opacity-60 cursor-wait" : ""}`}>
                  {logoUploading ? (
                    <><Loader2 className="w-5 h-5 text-muted-foreground animate-spin" /><span className="text-xs text-muted-foreground">Uploading…</span></>
                  ) : form.logoUrl ? (
                    <><img src={form.logoUrl} alt="Logo preview" className="w-12 h-12 rounded-full object-cover border border-border" /><span className="text-xs text-primary">Uploaded — click to replace</span></>
                  ) : (
                    <><ImageIcon className="w-5 h-5 text-muted-foreground" /><span className="text-xs text-muted-foreground">Click to upload (PNG, JPG, GIF)</span></>
                  )}
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoFile} data-testid="input-logo-file" />
                </div>
              ) : (
                <Input data-testid="input-logo-url" placeholder="https://example.com/logo.png" value={form.logoUrl} onChange={(e) => update("logoUrl", e.target.value)} />
              )}
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Description</label>
              <textarea data-testid="input-description" placeholder="Tell the community about your token..." value={form.description}
                onChange={(e) => update("description", e.target.value)}
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm resize-none h-20 focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Tags (comma-separated)</label>
              <Input data-testid="input-tags" placeholder="meme, defi, gaming" value={form.tags} onChange={(e) => update("tags", e.target.value)} />
            </div>
            <Button data-testid="button-step2" className="w-full" onClick={() => setStep(2)} disabled={!form.mintAddress || !form.name || !form.ticker}>
              Continue <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Website</label>
              <Input data-testid="input-website" placeholder="https://mytoken.com" value={form.website} onChange={(e) => update("website", e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Twitter / X</label>
              <Input data-testid="input-twitter" placeholder="@mytoken" value={form.twitter} onChange={(e) => update("twitter", e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Telegram</label>
              <Input data-testid="input-telegram" placeholder="https://t.me/mytoken" value={form.telegram} onChange={(e) => update("telegram", e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Discord</label>
              <Input data-testid="input-discord" placeholder="https://discord.gg/..." value={form.discord} onChange={(e) => update("discord", e.target.value)} />
            </div>
            <div className="flex gap-2">
              <Button data-testid="button-back-step1" variant="outline" onClick={() => setStep(1)} className="flex-1">
                <ChevronLeft className="w-4 h-4 mr-1" /> Back
              </Button>
              <Button data-testid="button-step3" className="flex-1" onClick={() => setStep(3)}>
                Continue <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Pay with</label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger data-testid="select-currency"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CURRENCY_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {payLoading ? (
              <div className="text-center text-muted-foreground py-4">Fetching current price…</div>
            ) : (
              <div className="bg-muted/40 border border-border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-sm">Amount to send</span>
                  <span className="font-bold font-display text-primary text-lg">{payAmount}</span>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Send to wallet</div>
                  <div className="flex items-center gap-2 bg-background/60 rounded border border-border px-3 py-2">
                    <span className="font-mono text-xs truncate flex-1">{botWallet}</span>
                    <button onClick={copyWallet} data-testid="button-copy-wallet" className="text-muted-foreground hover:text-primary">
                      {copied ? <Check className="w-3.5 h-3.5 text-primary" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">
                  <span className="text-yellow-400">⚡</span> Send exactly the amount shown. After sending, paste your transaction hash below.
                </div>
              </div>
            )}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Your wallet address *</label>
              <Input data-testid="input-submitter-wallet" placeholder="Your EVM wallet address (0x…)" value={form.submitterWallet} onChange={(e) => update("submitterWallet", e.target.value)} className="font-mono text-xs" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Transaction hash *</label>
              <Input data-testid="input-tx-sig" placeholder="Paste your 0x… tx hash here" value={form.paymentTxSignature} onChange={(e) => update("paymentTxSignature", e.target.value)} className="font-mono text-xs" />
            </div>
            <div className="flex gap-2">
              <Button data-testid="button-back-step2" variant="outline" onClick={() => setStep(2)} className="flex-1">
                <ChevronLeft className="w-4 h-4 mr-1" /> Back
              </Button>
              <Button data-testid="button-submit-listing" className="flex-1" onClick={() => submitMutation.mutate()}
                disabled={submitMutation.isPending || !form.submitterWallet || !form.paymentTxSignature}>
                {submitMutation.isPending ? "Verifying…" : "Submit Listing"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

type DexSortMode = "newest" | "featured";

export default function Dex() {
  const { settings } = useSettings();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortCol, setSortCol] = useState<SortCol>("volumeH24");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [showList, setShowList] = useState(false);
  const [listingSort, setListingSort] = useState<DexSortMode>("newest");
  const [lastRefresh, setLastRefresh] = useState(Date.now());
  // DEX overhaul state
  const [selectedDex, setSelectedDex] = useState("all");
  const [viewMode, setViewMode] = useState<ViewMode>("trending");
  const [trendPeriod, setTrendPeriod] = useState<TrendPeriod>("h24");
  const [duration, setDuration] = useState<Duration>("24h");
  const [specialFilter, setSpecialFilter] = useState<SpecialFilter>("");
  const [minLiq, setMinLiq] = useState<MinLiq>("");
  const [showLiqFilter, setShowLiqFilter] = useState(false);
  const [watchlist, setWatchlist] = useState<Set<string>>(() => loadWatchlist());

  function toggleStar(address: string) {
    setWatchlist((prev) => {
      const next = new Set(prev);
      if (next.has(address)) next.delete(address);
      else next.add(address);
      saveWatchlist(next);
      return next;
    });
  }

  // Debounce search
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(id);
  }, [search]);

  // Auto-refresh every 30s
  useEffect(() => {
    const id = setInterval(() => setLastRefresh(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Fetch Robinhood Chain tokens from DexScreener proxy
  const { data: chainTokens = [], isLoading: tokensLoading, refetch: refetchTokens } = useQuery<ChainToken[]>({
    queryKey: ["/api/chain-tokens", debouncedSearch, lastRefresh],
    queryFn: () => {
      const url = debouncedSearch
        ? `/api/chain-tokens?q=${encodeURIComponent(debouncedSearch)}`
        : `/api/chain-tokens`;
      return fetch(url).then((r) => r.json());
    },
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  // Existing paid listings
  const { data: listings = [], isLoading: listingsLoading } = useQuery<DexListing[]>({
    queryKey: ["/api/dex/listings"],
    staleTime: 30_000,
  });

  const addresses = listings.map((l) => l.mintAddress).join(",");
  const { data: marketMap = {} } = useQuery<Record<string, any>>({
    queryKey: ["/api/dex/market-batch", addresses],
    queryFn: () => addresses ? fetch(`/api/dex/market-batch?addresses=${addresses}`).then((r) => r.json()) : Promise.resolve({}),
    enabled: listings.length > 0,
    staleTime: 30_000,
  });

  const { data: boosts = [] } = useQuery<any[]>({
    queryKey: ["/api/dex/boosts"],
    queryFn: () => fetch("/api/dex/boosts-active").then((r) => (r.ok ? r.json() : [])),
    staleTime: 60_000,
  });

  // Chain stats (aggregated across all cached pairs)
  const { data: chainStats } = useQuery<{ volume24h: number; txns24h: number; pairsCount: number }>({
    queryKey: ["/api/chain-stats", lastRefresh],
    queryFn: () => fetch("/api/chain-stats").then((r) => r.json()),
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  const boostMap = boosts.reduce((acc: Record<number, number>, b: any) => {
    if (!acc[b.listingId] || b.boostTier > acc[b.listingId]) acc[b.listingId] = b.boostTier;
    return acc;
  }, {});

  const enriched = listings.map((l) => ({ ...l, maxBoostTier: boostMap[l.id] ?? 0 }));
  const filteredListings = enriched
    .filter((l) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return l.name.toLowerCase().includes(q) || l.ticker.toLowerCase().includes(q) || l.mintAddress.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      if (listingSort === "featured") return (b.maxBoostTier ?? 0) - (a.maxBoostTier ?? 0);
      return new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime();
    });

  // Volume key by duration
  const volKey: Record<Duration, keyof ChainToken> = {
    "24h": "volumeH24", "6h": "volumeH6", "1h": "volumeH1", "5m": "volumeM5",
  };
  // Price change key by trendPeriod
  const changeKey: Record<TrendPeriod, keyof ChainToken> = {
    "m5": "priceChangeM5", "h1": "priceChangeH1", "h6": "priceChangeH6", "h24": "priceChangeH24",
  };

  // Filter + sort tokens
  let sortedTokens = [...chainTokens];

  // DEX tab filter
  if (selectedDex !== "all") {
    const tab = DEX_TABS.find((t) => t.id === selectedDex);
    if (tab) {
      if (tab.launchpad) {
        sortedTokens = sortedTokens.filter((t) => t.launchpad === tab.launchpad);
      } else if (tab.ids.length > 0) {
        const allowed = new Set(tab.ids);
        sortedTokens = sortedTokens.filter((t) =>
          (t.allDexIds ?? [t.dexId]).some((id) => allowed.has(id.toLowerCase()))
        );
      }
    }
  }

  // Special filter
  if (specialFilter === "paid") sortedTokens = sortedTokens.filter((t) => t.isPaid);
  if (specialFilter === "boosted") sortedTokens = sortedTokens.filter((t) => (t.boostTier ?? 0) > 0);
  if (specialFilter === "launch") sortedTokens = sortedTokens.filter((t) => t.launchpad === "feather");

  // Watchlist filter
  if (viewMode === "watchlist") sortedTokens = sortedTokens.filter((t) => watchlist.has(t.tokenAddress));

  // Min liquidity filter
  if (minLiq) {
    const minVal = MIN_LIQ_VALUES[minLiq];
    sortedTokens = sortedTokens.filter((t) => (t.liquidity ?? 0) >= minVal);
  }

  // Search filter
  if (debouncedSearch) {
    const q = debouncedSearch.toLowerCase();
    sortedTokens = sortedTokens.filter((t) =>
      t.name.toLowerCase().includes(q) || t.symbol.toLowerCase().includes(q) || t.tokenAddress.toLowerCase().includes(q)
    );
  }

  // Sort
  sortedTokens.sort((a, b) => {
    const aTier = a.boostTier ?? 0;
    const bTier = b.boostTier ?? 0;
    if (bTier !== aTier) return bTier - aTier;
    if (viewMode === "trending") {
      const vk = volKey[duration];
      return ((b[vk] as number) ?? 0) - ((a[vk] as number) ?? 0);
    }
    if (viewMode === "gainers") {
      const ck = changeKey[trendPeriod];
      return ((b[ck] as number) ?? -Infinity) - ((a[ck] as number) ?? -Infinity);
    }
    // viewMode === "all" — column sort
    const aPaid = a.isPaid ? 1 : 0;
    const bPaid = b.isPaid ? 1 : 0;
    if (bPaid !== aPaid) return bPaid - aPaid;
    const av = a[sortCol] ?? (sortDir === "desc" ? -Infinity : Infinity);
    const bv = b[sortCol] ?? (sortDir === "desc" ? -Infinity : Infinity);
    return sortDir === "desc" ? (bv as number) - (av as number) : (av as number) - (bv as number);
  });

  const handleSort = (col: SortCol) => {
    if (sortCol === col) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortCol(col);
      setSortDir("desc");
    }
  };

  const thClass = (col: SortCol) =>
    `px-3 py-2.5 text-right text-[11px] font-semibold text-muted-foreground uppercase tracking-wide cursor-pointer hover:text-foreground transition-colors select-none whitespace-nowrap ${sortCol === col ? "text-primary" : ""}`;

  return (
    <AppShell>
      <div className="pb-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">

          {/* Rotating paid ad banner */}
          <AdBanner />

          {/* Hero placeholder banner */}
          <HeroBannerAd />

          {/* ── DEX filter tabs ─────────────────────────────────────────── */}
          <div className="overflow-x-auto pb-1 mb-4 -mx-1 px-1">
            <div className="flex items-center gap-1 min-w-max">
              {DEX_TABS.map((tab) => (
                <button
                  key={tab.id}
                  data-testid={`tab-dex-${tab.id}`}
                  onClick={() => setSelectedDex(tab.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                    selectedDex === tab.id
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50 border border-border/40"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Stat cards ──────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-card border border-border/60 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <BarChart3 className="w-4 h-4 text-primary" />
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">24H Volume</span>
              </div>
              <div className="text-xl font-bold font-display" data-testid="stat-volume-24h">
                {chainStats
                  ? chainStats.volume24h >= 1e9
                    ? `$${(chainStats.volume24h / 1e9).toFixed(2)}B`
                    : chainStats.volume24h >= 1e6
                    ? `$${(chainStats.volume24h / 1e6).toFixed(2)}M`
                    : `$${chainStats.volume24h.toLocaleString()}`
                  : <span className="text-muted-foreground text-sm">Loading…</span>
                }
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">Across {chainStats?.pairsCount ?? "—"} pairs</div>
            </div>
            <div className="bg-card border border-border/60 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <Activity className="w-4 h-4 text-emerald-400" />
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">24H TXNs</span>
              </div>
              <div className="text-xl font-bold font-display" data-testid="stat-txns-24h">
                {chainStats
                  ? chainStats.txns24h >= 1e6
                    ? `${(chainStats.txns24h / 1e6).toFixed(2)}M`
                    : chainStats.txns24h.toLocaleString()
                  : <span className="text-muted-foreground text-sm">Loading…</span>
                }
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">Buys + sells combined</div>
            </div>
          </div>

          {/* ── Filter bar ──────────────────────────────────────────────── */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            {/* Duration */}
            <div className="flex items-center gap-1 bg-muted/30 border border-border/40 rounded-lg p-0.5">
              <Clock className="w-3.5 h-3.5 text-muted-foreground ml-2" />
              {(["24h", "6h", "1h", "5m"] as Duration[]).map((d) => (
                <button key={d} data-testid={`filter-duration-${d}`}
                  onClick={() => { setDuration(d); setViewMode("trending"); }}
                  className={`px-2.5 py-1 text-[11px] font-semibold rounded transition-all ${duration === d && viewMode === "trending" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                  {d}
                </button>
              ))}
            </div>

            {/* Trending */}
            <div className="flex items-center gap-0.5 bg-muted/30 border border-border/40 rounded-lg p-0.5">
              <button data-testid="filter-trending-label"
                onClick={() => setViewMode("trending")}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded flex items-center gap-1 transition-all ${viewMode === "trending" ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"}`}>
                <TrendingUp className="w-3 h-3" />
                Trending
              </button>
              {(["m5", "h1", "h6", "h24"] as TrendPeriod[]).map((p) => (
                <button key={p} data-testid={`filter-trend-${p}`}
                  onClick={() => { setTrendPeriod(p); setViewMode("trending"); }}
                  className={`px-2 py-1 text-[11px] font-semibold rounded transition-all ${viewMode === "trending" && trendPeriod === p ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                  {p === "m5" ? "5M" : p === "h1" ? "1H" : p === "h6" ? "6H" : "24H"}
                </button>
              ))}
            </div>

            {/* Top Gainers */}
            <button data-testid="filter-gainers"
              onClick={() => setViewMode(viewMode === "gainers" ? "all" : "gainers")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${viewMode === "gainers" ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" : "border-border/40 text-muted-foreground hover:text-foreground hover:bg-muted/40"}`}>
              <Trophy className="w-3.5 h-3.5" />
              Top Gainers
            </button>

            {/* Watchlist */}
            <button data-testid="filter-watchlist"
              onClick={() => setViewMode(viewMode === "watchlist" ? "trending" : "watchlist")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${viewMode === "watchlist" ? "bg-yellow-500/20 text-yellow-300 border-yellow-500/30" : "border-border/40 text-muted-foreground hover:text-foreground hover:bg-muted/40"}`}>
              <Star className="w-3.5 h-3.5" fill={viewMode === "watchlist" ? "currentColor" : "none"} />
              Watchlist {watchlist.size > 0 && <span className="ml-0.5 bg-yellow-400/20 text-yellow-300 rounded-full px-1.5 text-[10px]">{watchlist.size}</span>}
            </button>

            {/* Special filters */}
            <button data-testid="filter-paid"
              onClick={() => setSpecialFilter(specialFilter === "paid" ? "" : "paid")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${specialFilter === "paid" ? "bg-primary/20 text-primary border-primary/30" : "border-border/40 text-muted-foreground hover:text-foreground hover:bg-muted/40"}`}>
              <CheckCircle2 className="w-3.5 h-3.5" />
              Dex Paid
            </button>
            <button data-testid="filter-boosted"
              onClick={() => setSpecialFilter(specialFilter === "boosted" ? "" : "boosted")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${specialFilter === "boosted" ? "bg-orange-500/20 text-orange-300 border-orange-500/30" : "border-border/40 text-muted-foreground hover:text-foreground hover:bg-muted/40"}`}>
              <Flame className="w-3.5 h-3.5" />
              Boosted
            </button>
            <button data-testid="filter-launch"
              onClick={() => setSpecialFilter(specialFilter === "launch" ? "" : "launch")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${specialFilter === "launch" ? "bg-primary/20 text-primary border-primary/30" : "border-border/40 text-muted-foreground hover:text-foreground hover:bg-muted/40"}`}>
              <Rocket className="w-3.5 h-3.5" />
              Feather App
            </button>

            {/* Min Liquidity */}
            <div className="relative">
              <button data-testid="filter-min-liq"
                onClick={() => setShowLiqFilter(!showLiqFilter)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${minLiq ? "bg-blue-500/20 text-blue-300 border-blue-500/30" : "border-border/40 text-muted-foreground hover:text-foreground hover:bg-muted/40"}`}>
                <Filter className="w-3.5 h-3.5" />
                Min Liq{minLiq ? `: $${minLiq}` : ""}
              </button>
              {showLiqFilter && (
                <div className="absolute top-full mt-1 left-0 z-20 bg-card border border-border/80 rounded-lg shadow-xl p-2 flex flex-col gap-1 min-w-[110px]">
                  {(["", "1k", "10k", "50k", "100k"] as MinLiq[]).map((v) => (
                    <button key={v} onClick={() => { setMinLiq(v); setShowLiqFilter(false); }}
                      className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors text-left ${minLiq === v ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted/40"}`}>
                      {v === "" ? "Any" : `≥ $${v}`}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Spacer + right-aligned actions */}
            <div className="flex-1" />
            <Button variant="outline" size="sm"
              onClick={() => { refetchTokens(); setLastRefresh(Date.now()); }}
              data-testid="button-refresh" className="gap-1.5 text-xs h-8">
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </Button>
            <Button data-testid="button-list-token" onClick={() => setShowList(true)} size="sm" className="gap-1.5 h-8">
              <Plus className="w-3.5 h-3.5" />
              List Token
            </Button>
          </div>

          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              data-testid="input-search"
              placeholder="Search by token name, symbol, or address…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 max-w-md"
            />
          </div>

          {/* Token table — full width */}
          <div className="bg-card border border-border/60 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/50 bg-muted/20">
                        <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wide w-8">#</th>
                        <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wide min-w-[140px]">Token</th>
                        <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wide hidden md:table-cell">DEX</th>
                        <th className={thClass("priceUsd")} onClick={() => handleSort("priceUsd")}>
                          Price <SortIcon col="priceUsd" active={sortCol === "priceUsd"} dir={sortDir} />
                        </th>
                        <th className={`${thClass("priceChangeM5")} hidden lg:table-cell`} onClick={() => handleSort("priceChangeM5")}>
                          5m <SortIcon col="priceChangeM5" active={sortCol === "priceChangeM5"} dir={sortDir} />
                        </th>
                        <th className={`${thClass("priceChangeH1")} hidden sm:table-cell`} onClick={() => handleSort("priceChangeH1")}>
                          1h <SortIcon col="priceChangeH1" active={sortCol === "priceChangeH1"} dir={sortDir} />
                        </th>
                        <th className={`${thClass("priceChangeH6")} hidden xl:table-cell`} onClick={() => handleSort("priceChangeH6")}>
                          6h <SortIcon col="priceChangeH6" active={sortCol === "priceChangeH6"} dir={sortDir} />
                        </th>
                        <th className={thClass("priceChangeH24")} onClick={() => handleSort("priceChangeH24")}>
                          24h <SortIcon col="priceChangeH24" active={sortCol === "priceChangeH24"} dir={sortDir} />
                        </th>
                        <th className={`${thClass("volumeH24")} hidden sm:table-cell`} onClick={() => handleSort("volumeH24")}>
                          Vol <SortIcon col="volumeH24" active={sortCol === "volumeH24"} dir={sortDir} />
                        </th>
                        <th className="px-3 py-2.5 text-right text-[11px] font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap hidden xl:table-cell">
                          Txns 24h
                        </th>
                        <th className={`${thClass("liquidity")} hidden lg:table-cell`} onClick={() => handleSort("liquidity")}>
                          Liq <SortIcon col="liquidity" active={sortCol === "liquidity"} dir={sortDir} />
                        </th>
                        <th className={`${thClass("fdv")} hidden lg:table-cell`} onClick={() => handleSort("fdv")}>
                          FDV <SortIcon col="fdv" active={sortCol === "fdv"} dir={sortDir} />
                        </th>
                        <th className="px-3 py-2.5 text-right text-[11px] font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap hidden xl:table-cell">
                          Age
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {tokensLoading ? (
                        [...Array(10)].map((_, i) => (
                          <tr key={i} className="border-b border-border/20">
                            <td colSpan={11} className="px-3 py-3">
                              <div className="h-4 bg-muted/40 rounded animate-pulse w-full" />
                            </td>
                          </tr>
                        ))
                      ) : sortedTokens.length === 0 ? (
                        <tr>
                          <td colSpan={11} className="text-center py-12 text-muted-foreground">
                            {viewMode === "watchlist" ? "No watchlisted tokens — star tokens to add them here" : search ? "No tokens match your search" : "No data — try refreshing"}
                          </td>
                        </tr>
                      ) : (
                        sortedTokens.map((token, i) => (
                          <TokenRow key={token.pairAddress} token={token} rank={i + 1} adAfter={(i + 1) % 8 === 0} adIndex={i} watchlist={watchlist} onToggleStar={toggleStar} />
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

          {/* Mobile: paid listings cards below table */}
          {listings.length > 0 && (
            <div className="mt-8 lg:hidden">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-bold">Featured Listings</h2>
                <div className="flex gap-2">
                  <Button variant={listingSort === "newest" ? "default" : "outline"} size="sm" onClick={() => setListingSort("newest")}>Newest</Button>
                  <Button variant={listingSort === "featured" ? "default" : "outline"} size="sm" onClick={() => setListingSort("featured")}>
                    <Star className="w-3.5 h-3.5 mr-1" /> Featured
                  </Button>
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                {filteredListings.map((listing) => (
                  <TokenCard key={listing.id} listing={listing} market={marketMap[listing.mintAddress]} />
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
      <ListTokenModal open={showList} onClose={() => setShowList(false)} />
    </AppShell>
  );
}
