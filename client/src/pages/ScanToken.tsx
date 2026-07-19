import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearch } from "wouter";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Microscope, AlertTriangle, ShieldCheck, ShieldX,
  Copy, Check, ExternalLink, Loader2, XCircle, Lock, Droplets,
} from "lucide-react";

// ── Types ───────────────────────────────────────────────────────────────────
interface HolderCluster {
  funder: string;
  funderFull?: string;
  wallets: string[];
  totalSupplyPct: number;
  label: string;
  detectionMethod: "funder_trace" | "prefix" | "amount";
}
interface SupplyBreakdown {
  liquidityPools: number;
  lockedVesting: number;
  bundleClusters: number;
  kolNamed: number;
  circulating: number;
}
interface WalletFunderEntry {
  wallet: string;
  funder: string | null;
  funderLabel?: string;
}
interface TokenScan {
  mint: string;
  name: string;
  symbol: string;
  imageUrl?: string | null;
  supply: number;
  decimals: number;
  holders: number;
  holdersScanned: number;
  scannedAt: number;
  topHolders: { address: string; amount: number; pct: number; label?: string }[];
  clusters: HolderCluster[];
  walletFunders: WalletFunderEntry[];
  top10Pct: number;
  top25Pct: number;
  lpPct: number;
  lockPct: number;
  bundleCount: number;
  bundlePct: number;
  bundleWallets: number;
  kolPct: number;
  exchangeCount: number;
  circulatingPct: number;
  supplyBreakdown: SupplyBreakdown;
  threatLevel: "Safe" | "Suspicious" | "Dangerous";
  threatBullets: string[];
  riskScore: number;
  riskLabel: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function trunc(s: string, n = 6) {
  return `${s.slice(0, n)}…${s.slice(-4)}`;
}

function timeAgo(ts: number) {
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function fmtSupply(n: number) {
  if (n > 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (n > 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n > 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n > 1e3) return `${(n / 1e3).toFixed(2)}K`;
  return n.toFixed(0);
}

// ── Token Image with fallback ─────────────────────────────────────────────────
function TokenImage({ imageUrl, symbol }: { imageUrl?: string | null; symbol: string }) {
  const [failed, setFailed] = useState(false);
  // Prefer Cloudflare IPFS gateway (faster/more reliable than ipfs.io)
  const src = imageUrl
    ? imageUrl.replace("https://ipfs.io/ipfs/", "https://cloudflare-ipfs.com/ipfs/")
    : null;

  if (src && !failed) {
    return (
      <img
        src={src}
        alt={symbol}
        onError={() => setFailed(true)}
        className="w-12 h-12 rounded-lg object-cover shrink-0 border border-border"
      />
    );
  }
  return (
    <div className="w-12 h-12 rounded-lg bg-secondary/15 border border-secondary/30 flex items-center justify-center text-sm font-black text-primary shrink-0">
      {symbol.slice(0, 3)}
    </div>
  );
}

// ── Copy Button ───────────────────────────────────────────────────────────────
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="text-muted-foreground hover:text-foreground transition-colors"
    >
      {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
    </button>
  );
}

// ── Godmode-style Supply Breakdown Row ────────────────────────────────────────
function SupplyRow({
  label, value, color, highlight = false,
}: { label: string; value: number; color: string; highlight?: boolean }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <div className={`w-[3px] h-8 rounded-full shrink-0 ${color}`} />
      <span className={`flex-1 text-sm ${highlight ? "text-foreground font-medium" : "text-muted-foreground"}`}>
        {label}
      </span>
      <span className={`text-sm font-bold tabular-nums ${highlight ? "text-red-400" : "text-foreground"}`}>
        {value.toFixed(2)}%
      </span>
    </div>
  );
}

// ── Threat Assessment ─────────────────────────────────────────────────────────
function ThreatPanel({ level, bullets }: { level: TokenScan["threatLevel"]; bullets: string[] }) {
  const cfg =
    level === "Dangerous"
      ? { headerColor: "text-red-400", badge: "bg-red-500/10 border-red-500/30 text-red-400", label: "DANGEROUS" }
      : level === "Suspicious"
      ? { headerColor: "text-orange-400", badge: "bg-orange-500/10 border-orange-500/30 text-orange-400", label: "SUSPICIOUS" }
      : { headerColor: "text-emerald-400", badge: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400", label: "SAFE" };

  const summary =
    level === "Dangerous"
      ? "High bundle concentration detected. Serious dumping risk — proceed with caution."
      : level === "Suspicious"
      ? "Bundle clusters hold 5–10% of supply. Worth monitoring — could indicate early-stage accumulation."
      : "No significant bundle clusters or concentration risks detected.";

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className={`text-[10px] font-black tracking-widest uppercase ${cfg.headerColor}`}>
          THREAT ASSESSMENT
        </span>
        <span className="text-[10px] text-muted-foreground">·</span>
        <span className={`text-[10px] font-black tracking-widest px-2 py-0.5 rounded border uppercase ${cfg.badge}`}>
          {cfg.label}
        </span>
      </div>
      <p className="text-sm text-muted-foreground mb-3 leading-relaxed">{summary}</p>
      <ul className="space-y-2">
        {bullets.map((b, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
            <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${
              level === "Dangerous" ? "bg-red-400" :
              level === "Suspicious" ? "bg-orange-400" : "bg-emerald-400"
            }`} />
            {b}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Holder Bubble Map ─────────────────────────────────────────────────────────
// Tab: BUNDLES — color by bundle membership
// Tab: FUNDING — color by shared funder group
function HolderMap({
  holders, clusters, walletFunders, totalHolders,
}: {
  holders: TokenScan["topHolders"];
  clusters: HolderCluster[];
  walletFunders: WalletFunderEntry[];
  totalHolders: number;
}) {
  const [tab, setTab] = useState<"BUNDLES" | "FUNDING">("BUNDLES");

  // For BUNDLES tab: assign cluster index
  const bundleMap = new Map<string, number>(); // wallet → clusterIdx
  clusters.forEach((c, ci) => c.wallets.forEach(w => bundleMap.set(w, ci)));

  // For FUNDING tab: assign funder group index
  const funderGroupMap = new Map<string, number>(); // wallet → groupIdx
  const funderIndexMap = new Map<string, number>(); // funder → groupIdx
  let nextFunderIdx = 0;
  walletFunders.forEach(({ wallet, funder }) => {
    if (!funder) return;
    if (!funderIndexMap.has(funder)) funderIndexMap.set(funder, nextFunderIdx++);
    funderGroupMap.set(wallet, funderIndexMap.get(funder)!);
  });

  // Color palettes
  const bundleColors = ["bg-red-400", "bg-orange-400", "bg-yellow-400", "bg-pink-400", "bg-rose-400"];
  const funderColors = ["bg-violet-400", "bg-blue-400", "bg-cyan-400", "bg-teal-400", "bg-fuchsia-400", "bg-indigo-400"];

  const maxPct = Math.max(...holders.map(h => h.pct), 1);

  // LP/lock color (always cyan regardless of tab)
  const LP_ADDRS = new Set([
    "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1",
    "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8",
    "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo",
    "Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EkAW7vAR",
    "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA",
    "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P",
  ]);

  function getBubbleColor(h: typeof holders[0]): string {
    if (LP_ADDRS.has(h.address)) return "bg-cyan-400/80 border-cyan-500/40";
    if (h.label === "Bundle" || h.label === "Sniper") {
      const ci = bundleMap.get(h.address) ?? 0;
      return `${bundleColors[ci % bundleColors.length]}/80 border-red-500/40`;
    }
    if (tab === "BUNDLES") {
      const ci = bundleMap.get(h.address);
      if (ci !== undefined) return `${bundleColors[ci % bundleColors.length]}/80 border-red-500/40`;
      if (h.pct > 2) return "bg-amber-400/70 border-amber-500/40";
      return "bg-zinc-500/60 border-zinc-400/30";
    } else {
      const gi = funderGroupMap.get(h.address);
      if (gi !== undefined) return `${funderColors[gi % funderColors.length]}/80 border-violet-500/40`;
      if (h.pct > 2) return "bg-amber-400/70 border-amber-500/40";
      return "bg-zinc-500/60 border-zinc-400/30";
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-black tracking-widest text-muted-foreground uppercase">HOLDER MAP</span>
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
          {totalHolders > 0 ? `${totalHolders.toLocaleString()} HOLDERS` : ""}
        </span>
      </div>
      {/* Tabs */}
      <div className="flex gap-1 mb-4">
        {(["BUNDLES", "FUNDING"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`text-xs font-bold px-3 py-1 rounded transition-colors ${
              tab === t
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      {/* Bubbles */}
      <div className="flex flex-wrap gap-2 items-center min-h-[140px]">
        {holders.slice(0, 40).map((h) => {
          const size = Math.max(22, Math.round((h.pct / maxPct) * 80));
          const colorClass = getBubbleColor(h);
          return (
            <a
              key={h.address}
              href={`https://robinhoodchain.blockscout.com/address/${h.address}`}
              target="_blank"
              rel="noopener noreferrer"
              title={`${h.address}\n${h.pct.toFixed(2)}%${h.label ? `\n${h.label}` : ""}`}
              className={`rounded-full border flex items-center justify-center transition-opacity hover:opacity-80 shrink-0 cursor-pointer ${colorClass}`}
              style={{ width: size, height: size }}
            >
              <span className="text-[7px] font-bold text-white leading-none text-center px-0.5 select-none">
                {h.pct >= 1.5 ? `${h.pct.toFixed(1)}%` : ""}
              </span>
            </a>
          );
        })}
      </div>
      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t border-border/40">
        {tab === "BUNDLES" ? (
          <>
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <span className="w-2 h-2 rounded-full bg-red-400 inline-block" /> Bundle
            </span>
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" /> KOL
            </span>
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <span className="w-2 h-2 rounded-full bg-cyan-400 inline-block" /> LP/Lock
            </span>
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <span className="w-2 h-2 rounded-full bg-zinc-500 inline-block" /> Holder
            </span>
          </>
        ) : (
          <>
            {funderColors.slice(0, 4).map((c, i) => (
              <span key={i} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <span className={`w-2 h-2 rounded-full ${c} inline-block`} /> Funder {i + 1}
              </span>
            ))}
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <span className="w-2 h-2 rounded-full bg-zinc-500 inline-block" /> Unknown
            </span>
          </>
        )}
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function ScanToken() {
  const search = useSearch();
  const mintParam = new URLSearchParams(search).get("mint") ?? "";

  const [input, setInput] = useState(mintParam);
  const [queried, setQueried] = useState<string | null>(
    /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mintParam) ? mintParam : null
  );

  // Sync if URL changes externally
  useEffect(() => {
    if (mintParam && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mintParam)) {
      setInput(mintParam);
      setQueried(mintParam);
    }
  }, [mintParam]);

  const isValid = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(input.trim());

  const { data, isLoading, isError, error } = useQuery<TokenScan>({
    queryKey: ["/api/intel/token", queried],
    queryFn: async () => {
      if (!queried) throw new Error("No mint");
      const res = await fetch(`/api/intel/token/${queried}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error ?? "Failed to scan token");
      }
      return res.json() as Promise<TokenScan>;
    },
    enabled: !!queried,
    staleTime: 5 * 60_000,
  });

  function handleSearch() {
    const addr = input.trim();
    if (!isValid) return;
    setQueried(addr);
  }

  return (
    <AppShell>
      {/* Centered max-width container — matches the rest of the site */}
      <div className="max-w-6xl mx-auto px-4 py-6">

        {/* ── Search bar (Godmode style) ─────────────────────────────────── */}
        <div className="flex gap-2 mb-4">
          <Input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSearch()}
            placeholder="Paste a Robinhood Chain token address…"
            className="font-mono text-sm h-11 bg-card border-border"
            data-testid="input-token-mint"
          />
          <Button
            onClick={handleSearch}
            disabled={!isValid || isLoading}
            className="gap-1.5 shrink-0 font-bold px-5 h-11 bg-secondary hover:bg-secondary/90 text-secondary-foreground"
            data-testid="button-token-scan"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Scan
          </Button>
        </div>

        {/* Loading hint */}
        {isLoading && (
          <p className="text-xs text-muted-foreground mb-4 flex items-center gap-1.5">
            <Loader2 className="w-3 h-3 animate-spin" />
            Tracing holder funding sources on Robinhood Chain — this may take 10–15 seconds…
          </p>
        )}

        {/* Empty state */}
        {!queried && !isLoading && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Microscope className="w-10 h-10 text-muted-foreground mb-4 opacity-50" />
            <h2 className="text-base font-bold mb-1">Token Holder Scanner</h2>
            <p className="text-sm text-muted-foreground max-w-md">
              Enter any Robinhood Chain token address to detect bundle clusters, trace funder wallets,
              LP/lock breakdown, and full supply distribution.
            </p>
          </div>
        )}

        {/* Error */}
        {isError && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-5 flex items-start gap-3">
            <XCircle className="w-5 h-5 text-red-400 mt-0.5 shrink-0" />
            <div>
              <div className="font-semibold text-sm text-red-300">Scan failed</div>
              <div className="text-xs text-muted-foreground mt-0.5">{(error as Error)?.message}</div>
            </div>
          </div>
        )}

        {/* Loading skeleton */}
        {isLoading && (
          <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-4 animate-pulse">
            <div className="bg-card border border-border rounded-xl p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-full bg-muted" />
                <div className="space-y-2 flex-1">
                  <div className="h-3 bg-muted rounded w-20" />
                  <div className="h-5 bg-muted rounded w-32" />
                  <div className="h-3 bg-muted rounded w-40" />
                </div>
              </div>
              <div className="h-8 bg-muted rounded w-28 mt-2" />
              <div className="h-4 bg-muted rounded w-36" />
              <div className="h-4 bg-muted rounded w-24" />
              <div className="border-t border-border pt-4 space-y-3">
                {[1, 2, 3, 4, 5].map(i => (
                  <div key={i} className="h-4 bg-muted rounded" />
                ))}
              </div>
            </div>
            <div className="space-y-4">
              <div className="bg-card border border-border rounded-xl p-6 h-40" />
              <div className="bg-card border border-border rounded-xl p-6 h-56" />
            </div>
          </div>
        )}

        <AnimatePresence mode="wait">
          {data && !isLoading && (
            <motion.div
              key={data.mint}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              {/* ── Godmode 2-column layout ────────────────────────────────── */}
              <div className="grid grid-cols-1 lg:grid-cols-[370px_1fr] gap-0 border border-border rounded-xl overflow-hidden">

                {/* ═══ LEFT PANEL ════════════════════════════════════════════ */}
                <div className="bg-card border-r border-border p-6 space-y-5">

                  {/* Token identity */}
                  <div>
                    <div className="flex items-start gap-3 mb-3">
                      <TokenImage imageUrl={data.imageUrl} symbol={data.symbol} />
                      <div className="min-w-0 flex-1">
                        {/* Risk badge */}
                        <span className={`inline-block text-[10px] font-black tracking-widest px-2 py-0.5 rounded border uppercase mb-1 ${
                          data.riskLabel === "Critical" || data.riskLabel === "High"
                            ? "bg-red-500/10 border-red-500/30 text-red-400"
                            : data.riskLabel === "Suspicious"
                            ? "bg-orange-500/10 border-orange-500/30 text-orange-400"
                            : "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                        }`}>
                          {data.riskLabel}
                        </span>
                        {data.scannedAt && (
                          <p className="text-[10px] text-muted-foreground">
                            Scanned {timeAgo(data.scannedAt)}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Name + symbol + holders */}
                    <h2 className="text-2xl font-black leading-tight">{data.name}</h2>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-sm text-muted-foreground">${data.symbol}</span>
                      {data.holders > 0 && (
                        <>
                          <span className="text-muted-foreground/40 text-xs">·</span>
                          <span className="text-xs text-muted-foreground">
                            <span className="font-semibold text-foreground">{data.holders.toLocaleString()}</span> total holders
                          </span>
                        </>
                      )}
                    </div>
                    {/* Mint address */}
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="font-mono text-[11px] text-muted-foreground">{trunc(data.mint, 10)}</span>
                      <CopyButton text={data.mint} />
                      <a href={`https://robinhoodchain.blockscout.com/token/${data.mint}`} target="_blank" rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-foreground transition-colors">
                        <ExternalLink className="w-3 h-3" />
                      </a>
                      <a href={`/dex/${data.mint}`}
                        className="text-[10px] text-primary hover:text-primary/80 transition-colors font-bold border border-secondary/30 px-1.5 py-0.5 rounded">
                        DEX ↗
                      </a>
                    </div>
                  </div>

                  {/* Key metrics (Godmode big numbers) */}
                  <div className="space-y-1.5">
                    <div>
                      <span className={`text-3xl font-black tabular-nums ${
                        data.bundlePct > 15 ? "text-red-400" :
                        data.bundlePct > 5 ? "text-orange-400" : "text-foreground"
                      }`}>
                        {data.bundlePct.toFixed(2)}%
                      </span>
                      <span className="text-sm text-muted-foreground ml-2">supply in bundles</span>
                    </div>
                    <div className={`text-sm font-semibold ${data.bundleCount > 3 ? "text-orange-400" : "text-muted-foreground"}`}>
                      <span className="text-foreground font-black text-lg">{data.bundleCount}</span>
                      {" "}anon cluster{data.bundleCount !== 1 ? "s" : ""} · {data.bundleWallets} wallet{data.bundleWallets !== 1 ? "s" : ""}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      <span className="font-black text-foreground">{data.kolPct.toFixed(2)}%</span>
                      {" "}KOL / named
                      {data.exchangeCount > 0 && (
                        <> · <span className="text-emerald-400">{data.exchangeCount} exch (safe)</span></>
                      )}
                    </div>
                  </div>

                  {/* Supply Breakdown (Godmode bracket bars) */}
                  <div>
                    <p className="text-[10px] font-black tracking-widest text-muted-foreground uppercase mb-2">
                      Supply Breakdown
                    </p>
                    <div className="space-y-0.5">
                      <SupplyRow label="Liquidity Pools" value={data.supplyBreakdown.liquidityPools} color="bg-cyan-400" />
                      <SupplyRow label="Locked / Vesting" value={data.supplyBreakdown.lockedVesting} color="bg-violet-400" />
                      <SupplyRow
                        label="Bundle Clusters"
                        value={data.supplyBreakdown.bundleClusters}
                        color="bg-red-400"
                        highlight={data.supplyBreakdown.bundleClusters > 5}
                      />
                      <SupplyRow label="KOL / Named" value={data.supplyBreakdown.kolNamed} color="bg-amber-400" />
                      <SupplyRow label="Circulating" value={data.supplyBreakdown.circulating} color="bg-emerald-400" />
                    </div>
                  </div>

                  {/* Quick stats */}
                  <div className="pt-3 border-t border-border/50 grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5 flex items-center gap-1">
                        <Droplets className="w-3 h-3 text-cyan-400" /> LP / DEX
                      </div>
                      <div className="text-base font-black text-cyan-400">{data.lpPct.toFixed(2)}%</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5 flex items-center gap-1">
                        <Lock className="w-3 h-3 text-violet-400" /> Locked
                      </div>
                      <div className="text-base font-black text-violet-400">{data.lockPct.toFixed(2)}%</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Top 10</div>
                      <div className="text-base font-black">{data.top10Pct.toFixed(1)}%</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Top 25</div>
                      <div className="text-base font-black">{data.top25Pct.toFixed(1)}%</div>
                    </div>
                  </div>

                  {/* Holders scanned indicator */}
                  {data.holdersScanned > 0 && (
                    <p className="text-[10px] text-muted-foreground border-t border-border/50 pt-3">
                      Funder-traced: <span className="text-foreground font-semibold">{data.holdersScanned}</span> of{" "}
                      <span className="text-foreground font-semibold">{data.holders > 0 ? data.holders.toLocaleString() : "?"}</span> holders
                    </p>
                  )}
                </div>

                {/* ═══ RIGHT PANEL ═══════════════════════════════════════════ */}
                <div className="bg-background p-6 space-y-6">

                  {/* Threat assessment */}
                  <ThreatPanel level={data.threatLevel} bullets={data.threatBullets} />

                  <div className="border-t border-border/50" />

                  {/* Holder map */}
                  <HolderMap
                    holders={data.topHolders}
                    clusters={data.clusters}
                    walletFunders={data.walletFunders ?? []}
                    totalHolders={data.holders}
                  />
                </div>
              </div>

              {/* ── Bundle clusters detail (below main panel) ──────────────── */}
              {data.clusters.length > 0 && (
                <div className="mt-4 bg-card border border-amber-500/20 rounded-xl p-5">
                  <h3 className="text-xs font-black uppercase tracking-widest mb-3 flex items-center gap-1.5 text-amber-400">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Bundle Clusters Detected ({data.bundleCount})
                  </h3>
                  <div className="space-y-3">
                    {data.clusters.slice(0, 10).map((c, i) => (
                      <div key={i} className="bg-amber-500/5 border border-amber-500/10 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase border ${
                              c.detectionMethod === "funder_trace"
                                ? "bg-red-500/15 border-red-500/30 text-red-400"
                                : c.label === "Sniper"
                                ? "bg-orange-500/10 border-orange-500/20 text-orange-400"
                                : "bg-amber-500/10 border-amber-500/20 text-amber-400"
                            }`}>
                              {c.detectionMethod === "funder_trace" ? "Funder Traced" : c.label}
                            </span>
                            <span className="text-xs font-mono text-muted-foreground">
                              {c.detectionMethod === "funder_trace"
                                ? `Funder: ${c.funder}`
                                : c.detectionMethod === "amount"
                                ? "Equal-amount wallets"
                                : `Prefix: ${c.funder}`}
                            </span>
                          </div>
                          <span className="text-xs font-bold text-amber-400">{c.totalSupplyPct.toFixed(2)}% supply · {c.wallets.length} wallets</span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {c.wallets.slice(0, 12).map(w => (
                            <a key={w} href={`https://robinhoodchain.blockscout.com/address/${w}`} target="_blank" rel="noopener noreferrer"
                              className="font-mono text-[10px] bg-muted px-2 py-0.5 rounded hover:text-primary transition-colors">
                              {trunc(w, 6)}
                            </a>
                          ))}
                          {c.wallets.length > 12 && (
                            <span className="text-[10px] text-muted-foreground px-2 py-0.5">+{c.wallets.length - 12} more</span>
                          )}
                        </div>
                        {c.funderFull && (
                          <div className="mt-2 flex items-center gap-1.5">
                            <span className="text-[10px] text-muted-foreground">Funder wallet:</span>
                            <a href={`https://robinhoodchain.blockscout.com/address/${c.funderFull}`} target="_blank" rel="noopener noreferrer"
                              className="font-mono text-[10px] text-muted-foreground hover:text-primary transition-colors">
                              {c.funderFull}
                            </a>
                            <CopyButton text={c.funderFull} />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {data.clusters.length === 0 && (
                <div className="mt-4 bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4 flex items-center gap-2 text-emerald-400 text-sm">
                  <ShieldCheck className="w-4 h-4 shrink-0" />
                  No bundle clusters detected across {data.holdersScanned} scanned holders
                </div>
              )}

              {/* ── Top holders table ───────────────────────────────────────── */}
              {data.topHolders.length > 0 && (
                <div className="mt-4 bg-card border border-border rounded-xl overflow-hidden">
                  <div className="px-5 py-3 border-b border-border bg-muted/30 flex items-center justify-between">
                    <h3 className="text-xs font-black text-muted-foreground uppercase tracking-widest">Top Holders</h3>
                    <span className="text-[10px] text-muted-foreground">
                      {data.holders > 0 ? `${data.holders.toLocaleString()} total` : ""}
                    </span>
                  </div>
                  <div className="divide-y divide-border/50">
                    {data.topHolders.slice(0, 25).map((h, i) => {
                      const isBundle = data.clusters.some(c => c.wallets.includes(h.address));
                      const funderEntry = data.walletFunders?.find(f => f.wallet === h.address);
                      return (
                        <div key={h.address} className="flex items-center gap-3 px-5 py-2.5 hover:bg-muted/20 transition-colors">
                          <span className="text-xs text-muted-foreground w-5 shrink-0 tabular-nums">{i + 1}</span>
                          <a href={`https://robinhoodchain.blockscout.com/address/${h.address}`} target="_blank" rel="noopener noreferrer"
                            className="font-mono text-xs text-muted-foreground hover:text-primary transition-colors flex-1 truncate min-w-0">
                            {trunc(h.address, 12)}
                          </a>
                          <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
                            {funderEntry?.funderLabel && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-bold">
                                {funderEntry.funderLabel}
                              </span>
                            )}
                            {h.label && h.label !== "Bundle" && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400 font-bold">
                                {h.label}
                              </span>
                            )}
                            {isBundle && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 border border-red-500/20 text-red-400 font-bold">
                                Bundle
                              </span>
                            )}
                          </div>
                          <div className="w-24 hidden sm:flex items-center gap-2 shrink-0">
                            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${isBundle ? "bg-red-400" : h.pct > 5 ? "bg-amber-400" : "bg-primary"}`}
                                style={{ width: `${Math.min(h.pct * 3, 100)}%` }}
                              />
                            </div>
                            <span className="text-xs tabular-nums font-semibold w-12 text-right">{h.pct.toFixed(2)}%</span>
                          </div>
                          <span className="sm:hidden text-xs font-semibold tabular-nums">{h.pct.toFixed(2)}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </AppShell>
  );
}
