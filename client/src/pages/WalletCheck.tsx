import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { SocialLayout } from "@/components/SocialLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Wallet, ShieldCheck, ShieldAlert, ShieldX, Shield, ShieldQuestion,
  Clock, Coins, Layers, Activity, Link2, AlertTriangle, CheckCircle,
  ExternalLink, Copy, Check, XCircle, Loader2,
} from "lucide-react";

interface WalletProfile {
  address: string;
  ethBalance?: number;
  /** @deprecated API compat — same as ethBalance */
  solBalance: number;
  tokenCount: number;
  nftCount: number;
  totalTransactions: number;
  firstActivity: string | null;
  lastActivity: string | null;
  fundingSource: string | null;
  riskScore: number;
  riskLabel: "Safe" | "Low" | "Medium" | "High" | "Critical";
  flags: string[];
  verdict: string;
  topTokens: { mint: string; symbol: string; uiAmount: number }[];
  recentTxSignatures: string[];
}

function trunc(s: string, n = 8) {
  return `${s.slice(0, n)}...${s.slice(-4)}`;
}

function RiskGauge({ score, label }: { score: number; label: string }) {
  const color =
    score >= 75 ? "bg-red-500" :
    score >= 55 ? "bg-orange-500" :
    score >= 35 ? "bg-amber-500" :
    score >= 15 ? "bg-lime-500" :
    "bg-emerald-500";
  const textColor =
    score >= 75 ? "text-red-400" :
    score >= 55 ? "text-orange-400" :
    score >= 35 ? "text-amber-400" :
    score >= 15 ? "text-lime-400" : "text-emerald-400";
  const Icon = score >= 75 ? ShieldX : score >= 35 ? ShieldAlert : ShieldCheck;

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Risk Score</span>
        <Icon className={`w-5 h-5 ${textColor}`} />
      </div>
      <div className={`text-4xl font-black mb-1 ${textColor}`}>{score}<span className="text-xl font-medium text-muted-foreground">/100</span></div>
      <div className={`text-sm font-bold mb-3 ${textColor}`}>{label}</div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${score}%` }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className={`h-full ${color} rounded-full`}
        />
      </div>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="text-muted-foreground hover:text-foreground transition-colors"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

function InfoRow({ icon: Icon, label, value, mono = false }: { icon: any; label: string; value: string | number | null; mono?: boolean }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-border/50 last:border-0">
      <Icon className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-xs text-muted-foreground mb-0.5">{label}</div>
        <div className={`text-sm font-medium break-all ${mono ? "font-mono" : ""}`}>{String(value)}</div>
      </div>
    </div>
  );
}

export default function WalletCheck() {
  const [input, setInput] = useState("");
  const [queried, setQueried] = useState<string | null>(null);
  const [cache, setCache] = useState<Record<string, WalletProfile>>({});
  const inputRef = useRef<HTMLInputElement>(null);

  const isValid = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(input.trim());

  const { data, isLoading, isError, error } = useQuery<WalletProfile>({
    queryKey: ["/api/intel/wallet", queried],
    queryFn: async () => {
      if (!queried) throw new Error("No address");
      if (cache[queried]) return cache[queried];
      const res = await fetch(`/api/intel/wallet/${queried}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error ?? "Failed to fetch wallet");
      }
      const data = await res.json() as WalletProfile;
      setCache(prev => ({ ...prev, [queried]: data }));
      return data;
    },
    enabled: !!queried,
    staleTime: 5 * 60_000,
  });

  function handleSearch() {
    const addr = input.trim();
    if (!isValid) return;
    setQueried(addr);
  }

  const riskColor = !data ? "" :
    data.riskScore >= 75 ? "border-red-500/30 bg-red-500/5" :
    data.riskScore >= 55 ? "border-orange-500/30 bg-orange-500/5" :
    data.riskScore >= 35 ? "border-amber-500/30 bg-amber-500/5" :
    "border-emerald-500/30 bg-emerald-500/5";

  return (
    <SocialLayout>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">

          {/* Header */}
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="py-6 border-b border-border/50 mb-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold uppercase tracking-widest mb-2">
              <Shield className="w-3.5 h-3.5" />Check Wallet
            </div>
            <h1 className="text-2xl md:text-3xl font-black">Wallet Intelligence</h1>
            <p className="text-sm text-muted-foreground mt-1">Full behavioral profile — risk score, funding chain, flags, and verdict · Robinhood Chain</p>
          </motion.div>

          {/* Search */}
          <div className="flex gap-2 mb-6">
            <Input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSearch()}
              placeholder="Paste a Robinhood Chain wallet address..."
              className="font-mono text-sm h-10"
              data-testid="input-wallet-address"
            />
            <Button
              onClick={handleSearch}
              disabled={!isValid || isLoading}
              className="gap-1.5 shrink-0 font-bold"
              data-testid="button-wallet-search"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              Check
            </Button>
          </div>

          {/* Example wallets */}
          {!queried && (
            <div className="text-xs text-muted-foreground mb-6">
              Try any Robinhood Chain address — results are cached for instant re-opens.
            </div>
          )}

          {/* Error */}
          {isError && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-5 flex items-start gap-3">
              <XCircle className="w-5 h-5 text-red-400 mt-0.5 shrink-0" />
              <div>
                <div className="font-semibold text-sm text-red-300">Lookup failed</div>
                <div className="text-xs text-muted-foreground mt-0.5">{(error as Error)?.message ?? "Unknown error"}</div>
              </div>
            </div>
          )}

          {/* Loading */}
          {isLoading && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="bg-card border border-border rounded-xl p-5 animate-pulse">
                    <div className="h-3 bg-muted rounded w-20 mb-4" /><div className="h-6 bg-muted rounded w-28" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Results */}
          <AnimatePresence mode="wait">
            {data && !isLoading && (
              <motion.div key={data.address} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">

                {/* Verdict banner */}
                <div className={`rounded-xl p-4 border flex items-start gap-3 ${riskColor}`}>
                  {data.riskScore >= 55
                    ? <ShieldX className="w-5 h-5 text-red-400 mt-0.5 shrink-0" />
                    : data.riskScore >= 35
                    ? <ShieldAlert className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
                    : <ShieldCheck className="w-5 h-5 text-emerald-400 mt-0.5 shrink-0" />}
                  <div>
                    <div className="text-sm font-bold">{data.verdict}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="font-mono text-xs text-muted-foreground">{trunc(data.address, 10)}</span>
                      <CopyButton text={data.address} />
                      <a href={`https://robinhoodchain.blockscout.com/address/${data.address}`} target="_blank" rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-primary transition-colors">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>
                </div>

                {/* Top row: risk + stats */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <RiskGauge score={data.riskScore} label={data.riskLabel} />
                  <div className="bg-card border border-border rounded-xl p-5 space-y-0">
                    <InfoRow icon={Coins} label="ETH Balance" value={`${(data.ethBalance ?? data.solBalance).toFixed(4)} ETH`} />
                    <InfoRow icon={Layers} label="Tokens Held" value={data.tokenCount} />
                    <InfoRow icon={Layers} label="NFTs" value={data.nftCount} />
                    <InfoRow icon={Activity} label="Transactions Loaded" value={data.totalTransactions} />
                  </div>
                </div>

                {/* Timeline + funding */}
                <div className="bg-card border border-border rounded-xl p-5 space-y-0">
                  <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Activity Timeline</h3>
                  <InfoRow icon={Clock} label="First Activity" value={data.firstActivity ? new Date(data.firstActivity).toLocaleString() : "Unknown"} />
                  <InfoRow icon={Clock} label="Last Activity" value={data.lastActivity ? new Date(data.lastActivity).toLocaleString() : "Unknown"} />
                  <InfoRow icon={Link2} label="Funding Source" value={data.fundingSource ?? "Unknown"} mono />
                  {data.fundingSource && (
                    <div className="pt-1">
                      <a
                        href={`https://robinhoodchain.blockscout.com/address/${data.fundingSource}`}
                        target="_blank" rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline flex items-center gap-1"
                      >
                        View funder on Blockscout <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  )}
                </div>

                {/* Flags */}
                {data.flags.length > 0 && (
                  <div className="bg-card border border-border rounded-xl p-5">
                    <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />Behavioral Flags
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {data.flags.map(f => (
                        <span key={f} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-medium">
                          <AlertTriangle className="w-3 h-3" />{f}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {data.flags.length === 0 && (
                  <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4 flex items-center gap-2 text-emerald-400 text-sm">
                    <CheckCircle className="w-4 h-4 shrink-0" />No behavioral flags detected
                  </div>
                )}

                {/* Top tokens */}
                {data.topTokens.length > 0 && (
                  <div className="bg-card border border-border rounded-xl p-5">
                    <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Top Token Holdings</h3>
                    <div className="space-y-2">
                      {data.topTokens.slice(0, 8).map(t => (
                        <div key={t.mint} className="flex items-center justify-between py-1.5 border-b border-border/40 last:border-0">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-[9px] font-bold text-primary">
                              {t.symbol.slice(0, 3)}
                            </div>
                            <div>
                              <div className="text-xs font-mono text-muted-foreground">{trunc(t.mint, 6)}</div>
                            </div>
                          </div>
                          <div className="text-sm font-semibold">{t.uiAmount > 1e6 ? `${(t.uiAmount / 1e6).toFixed(2)}M` : t.uiAmount > 1e3 ? `${(t.uiAmount / 1e3).toFixed(1)}K` : t.uiAmount.toFixed(2)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Recent transactions */}
                {data.recentTxSignatures.length > 0 && (
                  <div className="bg-card border border-border rounded-xl p-5">
                    <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Recent Transactions</h3>
                    <div className="space-y-1.5">
                      {data.recentTxSignatures.map(sig => (
                        <div key={sig} className="flex items-center justify-between">
                          <span className="font-mono text-xs text-muted-foreground">{trunc(sig, 12)}</span>
                          <a href={`https://robinhoodchain.blockscout.com/tx/${sig}`} target="_blank" rel="noopener noreferrer"
                            className="text-xs text-primary hover:underline flex items-center gap-1">
                            View <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="text-center text-[11px] text-muted-foreground/50">
                  Powered by Robinhood Chain · Results cached for 5 minutes per address
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
    </SocialLayout>
  );
}
