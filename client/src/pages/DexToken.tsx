import { useState } from "react";
import { Link, useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useWalletConnect } from "@/hooks/use-wallet-connect";
import { ClaimModal } from "@/components/ClaimModal";
import { TokenComments } from "@/components/TokenComments";
import { CreatorFeesPanel } from "@/components/CreatorFeesPanel";
import { UniswapSwapWidget } from "@/components/UniswapSwapWidget";
import { BondingCurveChart } from "@/components/BondingCurveChart";
import { useSettings } from "@/hooks/use-settings";
import type { DexListing } from "@shared/schema";
import {
  WETH_ADDRESS,
  DEXSCREENER_CHAIN_ID,
  EXPLORER_ADDRESS_URL,
  DEFAULT_RPC_URL,
} from "@shared/chain";
import {
  ArrowLeft, Copy, Check, Globe, Send, Twitter, Github,
  Flame, TrendingUp, Star, Zap, ArrowUpRight, ArrowDownRight,
  ChevronLeft, CheckCircle2, LayoutDashboard, Shield, AlertTriangle,
  Users, Lock, Clock, ExternalLink, ArrowLeftRight, Rocket,
} from "lucide-react";
import { SiDiscord } from "react-icons/si";

const RPC_URL = (import.meta.env.VITE_RPC_URL as string | undefined) || DEFAULT_RPC_URL;

// ── helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined, prefix = "") {
  if (n == null || isNaN(n)) return "—";
  if (Math.abs(n) >= 1_000_000_000) return `${prefix}${(n / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(n) >= 1_000_000)     return `${prefix}${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000)         return `${prefix}${(n / 1_000).toFixed(2)}K`;
  return `${prefix}${n.toFixed(2)}`;
}

function fmtPrice(p: string | number | null | undefined) {
  if (!p) return "—";
  const n = Number(p);
  if (isNaN(n)) return "—";
  if (n === 0) return "$0.00";
  if (n < 0.000001) return `$${n.toExponential(3)}`;
  if (n < 0.0001)   return `$${n.toFixed(8)}`;
  if (n < 0.01)     return `$${n.toFixed(6)}`;
  if (n < 1)        return `$${n.toFixed(4)}`;
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function PriceChange({ value, size = "md" }: { value: number | null | undefined; size?: "sm" | "md" | "lg" }) {
  if (value == null || isNaN(value)) return <span className="text-muted-foreground text-xs">—</span>;
  const pos = value >= 0;
  const sizeClass = size === "lg" ? "text-xl font-bold" : size === "md" ? "text-sm font-semibold" : "text-xs font-semibold";
  return (
    <span className={`flex items-center gap-0.5 ${sizeClass} ${pos ? "text-emerald-400" : "text-red-400"}`}>
      {pos ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
      {Math.abs(value).toFixed(2)}%
    </span>
  );
}

function BoostBadge({ tier }: { tier: number }) {
  if (tier === 3) return <Badge className="bg-yellow-500/20 text-yellow-300 border-yellow-500/40 text-[10px]"><Star className="w-2.5 h-2.5 mr-0.5" />Featured</Badge>;
  if (tier === 2) return <Badge className="bg-pink-500/20 text-pink-300 border-pink-500/40 text-[10px]"><TrendingUp className="w-2.5 h-2.5 mr-0.5" />Trending</Badge>;
  return <Badge className="bg-orange-500/20 text-orange-300 border-orange-500/40 text-[10px]"><Flame className="w-2.5 h-2.5 mr-0.5" />Hot</Badge>;
}

// ── Boost modal ───────────────────────────────────────────────────────────────

const CURRENCY_OPTIONS = [
  { value: "eth", label: "ETH" },
  { value: "usdc", label: "USDC" },
  { value: "feather", label: "$FEATHER" },
];

function BoostModal({ open, onClose, mintAddress }: { open: boolean; onClose: () => void; mintAddress: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [currency, setCurrency] = useState("eth");
  const [selectedTier, setSelectedTier] = useState<number>(1);
  const [copied, setCopied] = useState(false);
  const [txSig, setTxSig] = useState("");
  const [submitterWallet, setSubmitterWallet] = useState("");

  const { data: boostInfo } = useQuery<any>({
    queryKey: ["/api/dex/boost-info"],
    staleTime: 60_000,
  });

  const tier = boostInfo?.tiers?.find((t: any) => t.tier === selectedTier);
  const payAmount = tier?.[currency]?.display ?? tier?.[currency === "eth" ? "sol" : currency === "feather" ? "trenchy" : currency]?.display ?? "…";
  const botWallet = boostInfo?.botWallet ?? "";

  const copyWallet = () => {
    navigator.clipboard.writeText(botWallet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const submitMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/dex/boost", {
        mintAddress, boostTier: selectedTier,
        paymentTxSignature: txSig, paymentCurrency: currency, submitterWallet,
      }),
    onSuccess: () => {
      toast({ title: "Boost activated!", description: `Your token is now ${tier?.label}.` });
      queryClient.invalidateQueries({ queryKey: ["/api/dex/listings", mintAddress] });
      queryClient.invalidateQueries({ queryKey: ["/api/dex/listings"] });
      onClose();
    },
    onError: (e: any) => {
      toast({ title: "Boost failed", description: e.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="font-display text-xl flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" /> Boost Your Token
          </DialogTitle>
          <DialogDescription>Buy boosted placement to get more visibility</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            {boostInfo?.tiers?.map((t: any) => (
              <button key={t.tier} data-testid={`button-tier-${t.tier}`} onClick={() => setSelectedTier(t.tier)}
                className={`rounded-xl border p-3 text-center transition-all ${selectedTier === t.tier ? "border-primary bg-primary/10" : "border-border/60 hover:border-primary/40"}`}>
                <div className="text-sm font-bold font-display">{t.label}</div>
                <div className="text-primary text-xs font-semibold">${t.usd}</div>
                <div className="text-muted-foreground text-[10px]">{t.durationHours}h</div>
              </button>
            ))}
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Pay with</label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger data-testid="select-boost-currency"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CURRENCY_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="bg-muted/40 border border-border rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-sm">Amount</span>
              <span className="text-primary font-bold font-display">{payAmount}</span>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Send to</div>
              <div className="flex items-center gap-2 bg-background/60 rounded border border-border px-3 py-2">
                <span className="font-mono text-xs truncate flex-1">{botWallet}</span>
                <button onClick={copyWallet} data-testid="button-copy-boost-wallet" className="text-muted-foreground hover:text-primary">
                  {copied ? <Check className="w-3.5 h-3.5 text-primary" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Your wallet</label>
            <Input data-testid="input-boost-wallet" placeholder="Your EVM wallet address (0x…)" value={submitterWallet} onChange={(e) => setSubmitterWallet(e.target.value)} className="font-mono text-xs" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Transaction hash</label>
            <Input data-testid="input-boost-tx" placeholder="Paste your 0x… tx hash" value={txSig} onChange={(e) => setTxSig(e.target.value)} className="font-mono text-xs" />
          </div>
          <Button data-testid="button-submit-boost" className="w-full" onClick={() => submitMutation.mutate()}
            disabled={submitMutation.isPending || !txSig || !submitterWallet}>
            {submitMutation.isPending ? "Verifying…" : "Activate Boost"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Stat row ──────────────────────────────────────────────────────────────────

function StatRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border/40 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-xs font-semibold font-mono ${highlight ? "text-primary" : "text-foreground"}`}>{value}</span>
    </div>
  );
}

// ── Safety helper ─────────────────────────────────────────────────────────────

function fmtAge(ms: number | null | undefined): string {
  if (!ms) return "—";
  const secs = Math.floor((Date.now() - ms) / 1000);
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h`;
  return `${Math.floor(secs / 86400)}d`;
}

function SafetySection({ mintAddress, pair }: { mintAddress: string; pair: any }) {
  const pairCreatedAt = pair?.pairCreatedAt;
  const ageLabel = pairCreatedAt ? fmtAge(pairCreatedAt) : (pair?.createTime ? fmtAge(pair.createTime * 1000) : null);

  const risks: { label: string; level: "low" | "medium" | "high" | "unknown" }[] = [];

  const liq = pair?.liquidity?.usd ?? 0;
  if (liq < 1000) risks.push({ label: `Very low liquidity ($${liq.toFixed(0)})`, level: "high" });
  else if (liq < 10_000) risks.push({ label: `Low liquidity ($${(liq / 1000).toFixed(1)}K)`, level: "medium" });
  else risks.push({ label: `Liquidity $${(liq / 1000).toFixed(1)}K`, level: "low" });

  if (ageLabel && pairCreatedAt) {
    const ageMs = Date.now() - pairCreatedAt;
    if (ageMs < 3600_000) risks.push({ label: "Pair created less than 1h ago", level: "high" });
    else if (ageMs < 86_400_000) risks.push({ label: "Pair created less than 24h ago", level: "medium" });
    else risks.push({ label: `Pair age ${ageLabel}`, level: "low" });
  } else {
    risks.push({ label: "Pair age unavailable", level: "unknown" });
  }

  const riskColor = (level: string) => {
    if (level === "high") return "text-red-400 bg-red-500/10 border-red-500/30";
    if (level === "medium") return "text-amber-400 bg-amber-500/10 border-amber-500/30";
    if (level === "low") return "text-emerald-400 bg-emerald-500/10 border-emerald-500/30";
    return "text-muted-foreground bg-muted/30 border-border/40";
  };

  const overallRisk = risks.some((r) => r.level === "high") ? "high"
    : risks.some((r) => r.level === "medium") ? "medium" : "low";

  return (
    <div className="bg-card border border-border/60 rounded-xl px-4 py-3 space-y-3" data-testid="section-safety">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Shield className="w-3.5 h-3.5" /> Safety Check
        </div>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${riskColor(overallRisk)}`}>
          {overallRisk === "high" ? "HIGH RISK" : overallRisk === "medium" ? "MODERATE" : "LOW RISK"}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-muted/30 rounded-lg px-2 py-2">
          <div className="text-[10px] text-muted-foreground flex items-center justify-center gap-1 mb-1">
            <Clock className="w-2.5 h-2.5" /> Age
          </div>
          <div className="text-sm font-bold">{ageLabel ?? "—"}</div>
        </div>
        <div className="bg-muted/30 rounded-lg px-2 py-2">
          <div className="text-[10px] text-muted-foreground flex items-center justify-center gap-1 mb-1">
            <Users className="w-2.5 h-2.5" /> Chain
          </div>
          <div className="text-sm font-bold">RH</div>
        </div>
        <div className="bg-muted/30 rounded-lg px-2 py-2">
          <div className="text-[10px] text-muted-foreground flex items-center justify-center gap-1 mb-1">
            <Lock className="w-2.5 h-2.5" /> Liq
          </div>
          <div className={`text-sm font-bold ${liq < 1000 ? "text-red-400" : liq < 10_000 ? "text-amber-400" : "text-emerald-400"}`}>
            {fmt(liq, "$")}
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        {risks.map((r, i) => (
          <div key={i} className={`flex items-center gap-2 text-[11px] px-2.5 py-1.5 rounded-lg border ${riskColor(r.level)}`}>
            {r.level === "high" || r.level === "medium"
              ? <AlertTriangle className="w-3 h-3 flex-shrink-0" />
              : r.level === "low" ? <CheckCircle2 className="w-3 h-3 flex-shrink-0" />
              : <Shield className="w-3 h-3 flex-shrink-0" />}
            {r.label}
          </div>
        ))}
      </div>

      <a
        href={EXPLORER_ADDRESS_URL(mintAddress)}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
      >
        View contract on Blockscout <ExternalLink className="w-3 h-3" />
      </a>
    </div>
  );
}

// ── Swap panel (Uniswap widget — defaults to this token) ─────────────────────

function SwapPanel({ tokenAddress, symbol }: { tokenAddress: string; symbol: string }) {
  return (
    <div data-testid="swap-panel">
      <UniswapSwapWidget
        defaultTokenAddress={tokenAddress}
        defaultTokenSymbol={symbol}
      />
    </div>
  );
}

export default function DexToken() {
  const { mintAddress } = useParams<{ mintAddress: string }>();
  const wallet = useWalletConnect();
  const { settings } = useSettings();
  const [showBoost, setShowBoost] = useState(false);
  const [showClaim, setShowClaim] = useState(false);
  const [copiedMint, setCopiedMint] = useState(false);
  const [copiedPair, setCopiedPair] = useState(false);

  const { data: listing, isLoading: listingLoading } = useQuery<DexListing & { activeBoosts: any[] }>({
    queryKey: ["/api/dex/listings", mintAddress],
    queryFn: () => fetch(`/api/dex/listings/${mintAddress}`).then((r) => r.json()),
    enabled: !!mintAddress,
    staleTime: 30_000,
  });

  const { data: marketData, isLoading: marketLoading } = useQuery<any>({
    queryKey: ["/api/dex/market", mintAddress],
    queryFn: () => fetch(`/api/dex/market/${mintAddress}`).then((r) => r.json()),
    enabled: !!mintAddress,
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  /** On-chain Feather App launchpad token (bonding curve) — works before DexScreener indexes */
  const { data: factoryData, isLoading: factoryLoading, isFetched: factoryFetched } = useQuery<{
    exists: boolean;
    name?: string;
    symbol?: string;
    icon?: string | null;
    priceUsd?: number | null;
    marketCap?: number | null;
    fdv?: number | null;
    liquidity?: number | null;
    launchpad?: string;
    migrated?: boolean;
    bondingProgressPct?: number;
    chainId?: string;
  }>({
    queryKey: ["/api/factory-token", mintAddress],
    queryFn: async () => {
      const r = await fetch(`/api/factory-token/${mintAddress}`);
      if (r.status === 404) return { exists: false };
      if (!r.ok) throw new Error("Failed to load factory token");
      return r.json();
    },
    enabled: !!mintAddress,
    staleTime: 20_000,
    refetchInterval: 30_000,
    retry: false,
  });

  const { data: tokenStat, refetch: refetchStat } = useQuery<{
    isPaid: boolean;
    boostTier: number;
    boostExpiresAt: string | null;
    paidAt: string | null;
    paidBy: string | null;
    claimedByWallet: string | null;
    tokenName: string | null;
    tokenSymbol: string | null;
    description: string | null;
    logoUrl: string | null;
    bannerUrl: string | null;
    logoIpfsCid: string | null;
    bannerIpfsCid: string | null;
    metadataIpfsCid: string | null;
    twitter: string | null;
    discord: string | null;
    website: string | null;
    github: string | null;
    isRemoved: boolean;
    removalReason: string | null;
    removalNote: string | null;
  }>({
    queryKey: ["/api/status", mintAddress],
    queryFn: () => fetch(`/api/status/${mintAddress}`).then((r) => r.json()),
    enabled: !!mintAddress,
    staleTime: 30_000,
  });

  const validListing = listing && !(listing as any).message;
  const factoryToken = factoryData?.exists ? factoryData : null;

  const pairs = marketData?.pairs ?? [];
  const pair = pairs.sort((a: any, b: any) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
  const pairAddress = pair?.pairAddress;
  const chainId = pair?.chainId ?? factoryToken?.chainId ?? DEXSCREENER_CHAIN_ID;
  const isFeatherLaunch = factoryToken?.launchpad === "feather" || pair?.launchpad === "feather";

  const needsFactoryFallback = !validListing && !pair;
  const isLoading =
    listingLoading ||
    marketLoading ||
    (needsFactoryFallback && factoryLoading && !factoryFetched);

  const displayName =
    tokenStat?.tokenName ||
    (validListing ? listing!.name : null) ||
    pair?.baseToken?.name ||
    factoryToken?.name ||
    mintAddress?.slice(0, 8) ||
    "Unknown Token";
  const displayTicker =
    tokenStat?.tokenSymbol ||
    (validListing ? listing!.ticker : null) ||
    pair?.baseToken?.symbol ||
    factoryToken?.symbol ||
    "—";
  const displayLogo =
    tokenStat?.logoUrl ||
    (validListing ? listing!.logoUrl : null) ||
    pair?.info?.imageUrl ||
    factoryToken?.icon ||
    null;
  const displayBanner = tokenStat?.bannerUrl ?? null;
  const displayDescription = tokenStat?.description || listing?.description || null;
  const displaySocials = {
    website: tokenStat?.website || listing?.website || null,
    twitter: tokenStat?.twitter || listing?.twitter || null,
    discord: tokenStat?.discord || listing?.discord || null,
    github: tokenStat?.github || null,
  };

  const priceUsd = pair?.priceUsd != null ? Number(pair.priceUsd) : factoryToken?.priceUsd ?? null;
  const marketCap = pair?.marketCap ?? factoryToken?.marketCap ?? null;
  const fdv = pair?.fdv ?? factoryToken?.fdv ?? null;
  const liquidityUsd = pair?.liquidity?.usd ?? factoryToken?.liquidity ?? null;

  const maxBoostTier = tokenStat?.boostTier ?? Math.max(...((validListing ? listing!.activeBoosts : null) ?? []).map((b: any) => b.boostTier), 0);

  const copyMint = () => {
    if (!mintAddress) return;
    navigator.clipboard.writeText(mintAddress);
    setCopiedMint(true);
    setTimeout(() => setCopiedMint(false), 2000);
  };
  const copyPair = () => {
    if (!pairAddress) return;
    navigator.clipboard.writeText(pairAddress);
    setCopiedPair(true);
    setTimeout(() => setCopiedPair(false), 2000);
  };

  if (isLoading) {
    return (
      <AppShell>
        <main className="flex-1">
          <div className="border-b border-border/60 px-4 py-3 animate-pulse">
            <div className="max-w-7xl mx-auto flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-muted" />
              <div className="h-5 bg-muted rounded w-32" />
            </div>
          </div>
          <div className="max-w-7xl mx-auto px-4 py-4">
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
              <div className="h-[560px] bg-card border border-border/60 rounded-xl animate-pulse" />
              <div className="h-[560px] bg-card border border-border/60 rounded-xl animate-pulse" />
            </div>
          </div>
        </main>
      </AppShell>
    );
  }

  if (!listingLoading && !marketLoading && !validListing && !pair && !factoryToken) {
    return (
      <AppShell>
        <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-8">
          <div className="flex flex-col items-center gap-4 mb-10">
            <h2 className="text-2xl font-bold font-display">Token Not Found</h2>
            <p className="text-muted-foreground">No market data found for this address.</p>
            <Link href="/dex">
              <Button data-testid="button-back-dex" variant="outline" className="gap-2">
                <ArrowLeft className="w-4 h-4" /> Back to DEX
              </Button>
            </Link>
          </div>
          {mintAddress && (
            <TokenComments mintAddress={mintAddress} />
          )}
        </main>
      </AppShell>
    );
  }

  const h24Change = pair?.priceChange?.h24;
  const priceUp = h24Change != null && h24Change >= 0;
  // Charts are DexScreener-only — show embed once a real pair exists
  const chartSrc = pairAddress
    ? `https://dexscreener.com/${DEXSCREENER_CHAIN_ID}/${pairAddress}?embed=1&theme=dark&trades=0&info=0`
    : null;

  return (
    <AppShell>
      <div className="border-b border-border/60 bg-card/50 pt-2">
        {displayBanner && (
          <div className="w-full h-36 overflow-hidden relative">
            <img src={displayBanner} alt="Token banner" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-card/40" />
          </div>
        )}
        <div className="max-w-7xl mx-auto px-4 py-3">
          <Link href="/dex">
            <button data-testid="button-back-dex" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-3 transition-colors">
              <ChevronLeft className="w-3.5 h-3.5" /> DEX Listings
            </button>
          </Link>

          <div className="flex flex-wrap items-center gap-3">
            <div className="w-9 h-9 rounded-full border border-border/60 bg-muted flex-shrink-0 overflow-hidden">
              {displayLogo ? (
                <img src={displayLogo} alt={displayName} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xs font-bold text-muted-foreground">
                  {displayTicker.slice(0, 2)}
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-base font-display">{displayName}</span>
                <span className="text-muted-foreground text-sm">{displayTicker}</span>
                {tokenStat?.isPaid && (
                  <span data-testid="badge-dex-paid" className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/50">
                    ✓ DEX IS PAID
                  </span>
                )}
                {isFeatherLaunch && (
                  <span data-testid="badge-feather-launch" className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/40">
                    <Rocket className="w-3 h-3" /> Feather App
                  </span>
                )}
                {maxBoostTier > 0 && <BoostBadge tier={maxBoostTier} />}
              </div>
              {pair && (
                <div className="text-xs text-muted-foreground mt-0.5">
                  {pair.dexId && <span className="capitalize">{pair.dexId}</span>}
                  {pair.dexId && pair.quoteToken?.symbol && <span> · </span>}
                  {pair.quoteToken?.symbol && <span>{displayTicker}/{pair.quoteToken.symbol}</span>}
                </div>
              )}
              {!pair && factoryToken && (
                <div className="text-xs text-muted-foreground mt-0.5">
                  Feather App · {factoryToken.migrated ? "Migrated" : "Bonding curve"}
                </div>
              )}
            </div>

            <div className="hidden sm:block w-px h-8 bg-border/60" />

            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground font-mono hidden sm:block">{mintAddress?.slice(0,8)}…{mintAddress?.slice(-6)}</span>
              <button onClick={copyMint} data-testid="button-copy-mint" className="text-muted-foreground hover:text-primary transition-colors" title="Copy contract address">
                {copiedMint ? <Check className="w-3.5 h-3.5 text-primary" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 ml-auto">
              {displaySocials.website && (
                <a href={displaySocials.website} target="_blank" rel="noopener noreferrer" data-testid="link-website"
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border border-border/60 rounded-md px-2 py-1 transition-colors">
                  <Globe className="w-3 h-3" /> Website
                </a>
              )}
              {displaySocials.twitter && (
                <a href={displaySocials.twitter.startsWith("http") ? displaySocials.twitter : `https://x.com/${displaySocials.twitter.replace("@","")}`}
                  target="_blank" rel="noopener noreferrer" data-testid="link-twitter"
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border border-border/60 rounded-md px-2 py-1 transition-colors">
                  <Twitter className="w-3 h-3" /> Twitter
                </a>
              )}
              {listing?.telegram && (
                <a href={listing.telegram} target="_blank" rel="noopener noreferrer" data-testid="link-telegram"
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border border-border/60 rounded-md px-2 py-1 transition-colors">
                  <Send className="w-3 h-3" /> Telegram
                </a>
              )}
              {displaySocials.discord && (
                <a href={displaySocials.discord} target="_blank" rel="noopener noreferrer" data-testid="link-discord"
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border border-border/60 rounded-md px-2 py-1 transition-colors">
                  <SiDiscord className="w-3 h-3" /> Discord
                </a>
              )}
              {displaySocials.github && (
                <a href={displaySocials.github} target="_blank" rel="noopener noreferrer" data-testid="link-github"
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border border-border/60 rounded-md px-2 py-1 transition-colors">
                  <Github className="w-3 h-3" /> GitHub
                </a>
              )}
            </div>
          </div>
        </div>
      </div>

      {tokenStat?.isRemoved && (
        <div className="bg-red-500/10 border-y border-red-500/40">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-start gap-3">
            <div className="text-red-400 mt-0.5 flex-shrink-0">⚠️</div>
            <div>
              <div className="font-bold text-red-300 text-sm">
                This token profile has been removed by Feather App administrators
                {tokenStat.removalReason && ` — ${tokenStat.removalReason.replace("_", " ").replace(/\b\w/g, c => c.toUpperCase())}`}
              </div>
              {tokenStat.removalNote && <div className="text-xs text-red-200/70 mt-0.5">{tokenStat.removalNote}</div>}
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-4">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4 items-start">

          <div className="space-y-3">
            <div className="bg-card border border-border/60 rounded-xl px-4 py-3">
              <div className="flex flex-wrap items-end gap-4 mb-3">
                <div>
                  <div className="text-xs text-muted-foreground mb-0.5">{displayTicker}/USD</div>
                  <div className={`text-3xl font-bold font-display ${priceUp ? "text-emerald-400" : pair ? "text-red-400" : "text-foreground"}`}>
                    {fmtPrice(priceUsd)}
                  </div>
                </div>
                {h24Change != null && (
                  <PriceChange value={h24Change} size="lg" />
                )}
              </div>

              {factoryToken && !factoryToken.migrated && factoryToken.bondingProgressPct != null && (
                <div className="mb-3" data-testid="bonding-progress">
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
                    <span>Bonding progress</span>
                    <span className="font-mono">{Number(factoryToken.bondingProgressPct).toFixed(1)}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${Math.min(100, Math.max(0, Number(factoryToken.bondingProgressPct)))}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: "5m",  val: pair?.priceChange?.m5 },
                  { label: "1h",  val: pair?.priceChange?.h1 },
                  { label: "6h",  val: pair?.priceChange?.h6 },
                  { label: "24h", val: pair?.priceChange?.h24 },
                ].map(({ label, val }) => (
                  <div key={label} className="bg-muted/40 rounded-lg px-2 py-1.5 text-center">
                    <div className="text-[10px] text-muted-foreground mb-0.5">{label}</div>
                    <PriceChange value={val} size="sm" />
                  </div>
                ))}
              </div>
            </div>

            {chartSrc ? (
              <div className="bg-card border border-border/60 rounded-xl overflow-hidden">
                <iframe
                  title="Price Chart"
                  src={chartSrc}
                  className="w-full h-[520px] border-0"
                  loading="lazy"
                  data-testid="iframe-chart"
                  allow="clipboard-write"
                />
              </div>
            ) : factoryToken && !factoryToken.migrated && mintAddress ? (
              <BondingCurveChart
                tokenAddress={mintAddress}
                currentPriceUsd={priceUsd}
                symbol={displayTicker}
              />
            ) : (
              <div className="bg-card border border-dashed border-border/60 rounded-xl flex flex-col items-center justify-center py-24 gap-3">
                <TrendingUp className="w-10 h-10 text-muted-foreground/40" />
                <p className="text-muted-foreground text-sm">No trading pairs found yet</p>
                <p className="text-xs text-muted-foreground/60">DexScreener chart loads after on-chain liquidity is indexed</p>
              </div>
            )}

            {pair?.txns && (
              <div className="bg-card border border-border/60 rounded-xl px-4 py-3" data-testid="section-buys-sells">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Buys &amp; Sells</div>

                <div className="grid grid-cols-5 text-xs text-muted-foreground mb-1.5 px-1">
                  <span>Period</span>
                  <span className="text-center text-green-400">Buys</span>
                  <span className="text-center text-red-400">Sells</span>
                  <span className="text-center">Total</span>
                  <span className="text-right">Ratio</span>
                </div>

                {(["m5","h1","h6","h24"] as const).map((period) => {
                  const txns = (pair.txns as any)?.[period];
                  if (!txns) return null;
                  const buys = txns.buys ?? 0;
                  const sells = txns.sells ?? 0;
                  const total = buys + sells;
                  const buyPct = total > 0 ? Math.round((buys / total) * 100) : 50;
                  const periodLabel: Record<string, string> = { m5: "5m", h1: "1h", h6: "6h", h24: "24h" };
                  return (
                    <div key={period} className="grid grid-cols-5 items-center text-xs py-1.5 px-1 rounded-lg hover:bg-muted/30 transition-colors border-t border-border/30">
                      <span className="text-muted-foreground font-medium">{periodLabel[period]}</span>
                      <span className="text-center text-green-400 font-mono">{buys.toLocaleString()}</span>
                      <span className="text-center text-red-400 font-mono">{sells.toLocaleString()}</span>
                      <span className="text-center text-foreground font-mono">{total.toLocaleString()}</span>
                      <div className="flex items-center justify-end gap-1">
                        <div className="w-16 h-1.5 rounded-full bg-red-500/30 overflow-hidden">
                          <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${buyPct}%` }} />
                        </div>
                        <span className="text-green-400 w-8 text-right">{buyPct}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {mintAddress && (
              <SafetySection mintAddress={mintAddress} pair={pair} />
            )}

            <TokenComments mintAddress={mintAddress!} tokenName={displayName} />
          </div>

          <div className="space-y-3">

            {!tokenStat?.isPaid && (
              <div className="bg-emerald-500/10 border-2 border-emerald-500/40 rounded-xl p-4 space-y-3">
                <div className="text-center">
                  <div className="text-sm font-bold text-emerald-300 mb-1">This token is unclaimed</div>
                  <div className="text-xs text-muted-foreground">Own the token owner? List it on Feather DEX with your branding for a one-time ${settings.claimFeeUsd} fee.</div>
                </div>
                <button
                  data-testid="button-claim-token"
                  onClick={() => {
                    if (!wallet.connected) wallet.connect();
                    else setShowClaim(true);
                  }}
                  className="w-full flex items-center justify-center gap-2 rounded-xl px-4 py-3.5 text-sm font-bold text-white transition-all hover:opacity-90 active:scale-[0.98] bg-emerald-600 hover:bg-emerald-500"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {wallet.connected ? `Claim Token — $${settings.claimFeeUsd}` : "Connect Wallet to Claim"}
                </button>
                <div className="text-center text-[10px] text-muted-foreground">Includes logo, banner, description, socials & 90-day listing</div>
              </div>
            )}

            {tokenStat?.isPaid && (
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <div>
                    <div className="text-xs font-bold text-emerald-300">DEX IS PAID</div>
                    {tokenStat.paidAt && <div className="text-[10px] text-muted-foreground">Since {new Date(tokenStat.paidAt).toLocaleDateString()}</div>}
                  </div>
                </div>
                {tokenStat.claimedByWallet?.toLowerCase() === wallet.publicKey?.toLowerCase() && (
                  <Link href="/dashboard">
                    <Button size="sm" variant="outline" className="gap-1.5 text-xs h-7">
                      <LayoutDashboard className="w-3 h-3" /> Manage
                    </Button>
                  </Link>
                )}
              </div>
            )}

            <button
              data-testid="button-boost-top"
              onClick={() => setShowBoost(true)}
              className="w-full flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-white transition-all hover:opacity-90 active:scale-[0.98]"
              style={{ background: "#9333ea" }}
            >
              <Zap className="w-4 h-4" /> Boost Visibility
            </button>

            {mintAddress && <CreatorFeesPanel tokenAddress={mintAddress} />}

            {mintAddress && <SwapPanel tokenAddress={mintAddress} symbol={displayTicker} />}

            <div className="bg-card border border-border/60 rounded-xl px-4 py-3">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Market Stats</div>
              <StatRow label="Price USD"    value={fmtPrice(priceUsd)} highlight />
              <StatRow label="Market Cap"   value={fmt(marketCap, "$")} />
              <StatRow label="FDV"          value={fmt(fdv, "$")} />
              <StatRow label="Liquidity"    value={fmt(liquidityUsd, "$")} />
              <StatRow label="Vol (24h)"    value={fmt(pair?.volume?.h24, "$")} />
              <StatRow label="Vol (6h)"     value={fmt(pair?.volume?.h6, "$")} />
              <StatRow label="Vol (1h)"     value={fmt(pair?.volume?.h1, "$")} />
              <StatRow label="Buys (24h)"   value={pair?.txns?.h24?.buys != null ? String(pair.txns.h24.buys) : "—"} />
              <StatRow label="Sells (24h)"  value={pair?.txns?.h24?.sells != null ? String(pair.txns.h24.sells) : "—"} />
            </div>

            <div className="bg-card border border-border/60 rounded-xl px-4 py-3 space-y-2">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Token Info</div>

              <div>
                <div className="text-[10px] text-muted-foreground mb-1">Contract Address</div>
                <div className="flex items-center gap-2 bg-muted/40 rounded-lg px-2.5 py-2">
                  <span className="font-mono text-[11px] truncate flex-1 text-foreground/80">{mintAddress}</span>
                  <button onClick={copyMint} data-testid="button-copy-mint-sidebar" className="text-muted-foreground hover:text-primary flex-shrink-0">
                    {copiedMint ? <Check className="w-3 h-3 text-primary" /> : <Copy className="w-3 h-3" />}
                  </button>
                </div>
              </div>

              {pairAddress && (
                <div>
                  <div className="text-[10px] text-muted-foreground mb-1">Pair Address</div>
                  <div className="flex items-center gap-2 bg-muted/40 rounded-lg px-2.5 py-2">
                    <span className="font-mono text-[11px] truncate flex-1 text-foreground/80">{pairAddress}</span>
                    <button onClick={copyPair} data-testid="button-copy-pair" className="text-muted-foreground hover:text-primary flex-shrink-0">
                      {copiedPair ? <Check className="w-3 h-3 text-primary" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </div>
                </div>
              )}

              {(pair || factoryToken) && (
                <>
                  <StatRow label="Chain" value={chainId === "robinhood" ? "Robinhood Chain" : String(chainId).charAt(0).toUpperCase() + String(chainId).slice(1)} />
                  {pair?.dexId && <StatRow label="DEX" value={pair.dexId.charAt(0).toUpperCase() + pair.dexId.slice(1)} />}
                  {isFeatherLaunch && !pair?.dexId && <StatRow label="Launchpad" value="Feather App" />}
                </>
              )}

              {validListing && listing!.expiresAt && (
                <StatRow label="Listing expires" value={new Date(listing!.expiresAt).toLocaleDateString()} />
              )}
              {tokenStat?.isPaid && (
                <StatRow label="DEX paid" value={tokenStat.paidAt ? new Date(tokenStat.paidAt).toLocaleDateString() : "Yes"} highlight />
              )}
            </div>

            {displayDescription && (
              <div className="bg-card border border-border/60 rounded-xl px-4 py-3">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">About</div>
                <p className="text-sm text-muted-foreground leading-relaxed">{displayDescription}</p>
              </div>
            )}

            {listing?.tags && (
              <div className="flex flex-wrap gap-1.5">
                {listing.tags.split(",").map((t) => t.trim()).filter(Boolean).map((tag) => (
                  <Badge key={tag} variant="outline" className="text-[10px]">{tag}</Badge>
                ))}
              </div>
            )}

          </div>
        </div>

      </main>

      <BoostModal open={showBoost} onClose={() => setShowBoost(false)} mintAddress={mintAddress!} />
      <ClaimModal
        open={showClaim}
        onClose={() => setShowClaim(false)}
        mintAddress={mintAddress!}
        tokenName={displayName}
        tokenSymbol={displayTicker}
        claimFeeUsd={settings.claimFeeUsd}
        onSuccess={() => { refetchStat(); setShowClaim(false); }}
      />
    </AppShell>
  );
}
