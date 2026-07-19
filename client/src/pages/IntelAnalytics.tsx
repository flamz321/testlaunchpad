import { useQuery } from "@tanstack/react-query";
import { SocialLayout } from "@/components/SocialLayout";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import {
  Activity, Zap, Clock, TrendingUp, Server, Globe, RefreshCw,
  CheckCircle, AlertTriangle, XCircle, Cpu,
} from "lucide-react";

interface IntelStats {
  slot: number;
  tps: number;
  epochProgress: number;
  slotsRemaining: number;
  solPrice: number;
  networkHealth: "Healthy" | "Degraded" | "Stressed";
  cachedAt: number;
}

function HealthBadge({ health }: { health: IntelStats["networkHealth"] }) {
  if (health === "Healthy") return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-bold">
      <CheckCircle className="w-3 h-3" />{health}
    </span>
  );
  if (health === "Degraded") return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 text-xs font-bold">
      <AlertTriangle className="w-3 h-3" />{health}
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/15 border border-red-500/30 text-red-400 text-xs font-bold">
      <XCircle className="w-3 h-3" />Stressed
    </span>
  );
}

function StatCard({
  icon: Icon, label, value, sub, color = "text-primary",
}: {
  icon: any; label: string; value: string | number; sub?: string; color?: string;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center gap-2 text-muted-foreground mb-3">
        <Icon className={`w-4 h-4 ${color}`} />
        <span className="text-xs font-medium uppercase tracking-wider">{label}</span>
      </div>
      <div className={`text-2xl font-black ${color}`}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}

export default function IntelAnalytics() {
  const { data, isLoading, isError, dataUpdatedAt, refetch, isFetching } = useQuery<IntelStats>({
    queryKey: ["/api/intel/stats"],
    refetchInterval: 30_000,
    staleTime: 25_000,
  });

  const age = dataUpdatedAt ? Math.round((Date.now() - dataUpdatedAt) / 1000) : null;

  return (
    <SocialLayout>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">

          {/* Header */}
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="py-6 border-b border-border/50 mb-6">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold uppercase tracking-widest mb-2">
                  <Globe className="w-3.5 h-3.5" />Intel Analytics
                </div>
                <h1 className="text-2xl md:text-3xl font-black">Robinhood Chain Pulse</h1>
                <p className="text-sm text-muted-foreground mt-1">Live Robinhood Chain stats · auto-refreshes every 30s</p>
              </div>
              <div className="flex items-center gap-3">
                {data && <HealthBadge health={data.networkHealth} />}
                <button
                  onClick={() => refetch()}
                  disabled={isFetching}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  data-testid="button-intel-refresh"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
                  {age !== null ? `${age}s ago` : "Refresh"}
                </button>
              </div>
            </div>
          </motion.div>

          {/* Loading skeleton */}
          {isLoading && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="bg-card border border-border rounded-xl p-5 animate-pulse">
                  <div className="h-3 bg-muted rounded w-24 mb-4" />
                  <div className="h-7 bg-muted rounded w-32" />
                </div>
              ))}
            </div>
          )}

          {/* Error */}
          {isError && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 text-center">
              <XCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
              <p className="text-sm text-red-300 font-medium">Failed to fetch network stats</p>
              <p className="text-xs text-muted-foreground mt-1">Check your RPC / API key configuration</p>
              <button onClick={() => refetch()} className="mt-3 text-xs text-primary hover:underline">Try again</button>
            </div>
          )}

          {/* Stats grid */}
          {data && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-6"
            >
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <StatCard
                  icon={Zap}
                  label="Transactions per second"
                  value={data.tps.toLocaleString()}
                  sub="Recent 4-sample average"
                  color="text-primary"
                />
                <StatCard
                  icon={TrendingUp}
                  label="ETH Price"
                  value={data.solPrice > 0 ? `$${data.solPrice.toFixed(2)}` : "—"}
                  sub="Via DexScreener"
                  color="text-primary"
                />
                <StatCard
                  icon={Server}
                  label="Current Slot"
                  value={data.slot.toLocaleString()}
                  sub="Latest confirmed slot"
                  color="text-cyan-400"
                />
                <StatCard
                  icon={Activity}
                  label="Epoch Progress"
                  value={`${data.epochProgress}%`}
                  sub={`${data.slotsRemaining.toLocaleString()} slots remaining`}
                  color="text-violet-400"
                />
                <StatCard
                  icon={Cpu}
                  label="Network Health"
                  value={data.networkHealth}
                  sub={data.tps > 2000 ? "Performing well" : data.tps > 500 ? "Some congestion" : "Under stress"}
                  color={data.networkHealth === "Healthy" ? "text-emerald-400" : data.networkHealth === "Degraded" ? "text-amber-400" : "text-red-400"}
                />
                <StatCard
                  icon={Clock}
                  label="Last Updated"
                  value={new Date(data.cachedAt).toLocaleTimeString()}
                  sub="30-second cache"
                  color="text-muted-foreground"
                />
              </div>

              {/* Epoch progress bar */}
              <div className="bg-card border border-border rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold">Epoch Progress</span>
                  <span className="text-xs text-muted-foreground font-mono">{data.epochProgress}% complete</span>
                </div>
                <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${data.epochProgress}%` }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                    className="h-full bg-primary rounded-full"
                  />
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground mt-2">
                  <span>Epoch start</span>
                  <span>{data.slotsRemaining.toLocaleString()} slots left</span>
                  <span>Epoch end</span>
                </div>
              </div>

              {/* Health indicator */}
              <div className={`rounded-xl p-5 border flex items-start gap-4 ${
                data.networkHealth === "Healthy"
                  ? "bg-emerald-500/5 border-emerald-500/20"
                  : data.networkHealth === "Degraded"
                  ? "bg-amber-500/5 border-amber-500/20"
                  : "bg-red-500/5 border-red-500/20"
              }`}>
                {data.networkHealth === "Healthy"
                  ? <CheckCircle className="w-5 h-5 text-emerald-400 mt-0.5 shrink-0" />
                  : data.networkHealth === "Degraded"
                  ? <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
                  : <XCircle className="w-5 h-5 text-red-400 mt-0.5 shrink-0" />}
                <div>
                  <div className="font-semibold text-sm">
                    {data.networkHealth === "Healthy" && "Robinhood Chain is running smoothly"}
                    {data.networkHealth === "Degraded" && "Network experiencing some congestion"}
                    {data.networkHealth === "Stressed" && "Network under significant stress"}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {data.tps.toLocaleString()} TPS · Slot {data.slot.toLocaleString()} · {data.epochProgress}% through current epoch
                  </div>
                </div>
              </div>

              <div className="text-center text-[11px] text-muted-foreground/50">
                Powered by Robinhood Chain · Data refreshes automatically every 30 seconds
              </div>
            </motion.div>
          )}
        </div>
    </SocialLayout>
  );
}
