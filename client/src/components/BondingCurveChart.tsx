import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatTokenAmount } from "@/lib/format";

type ChartPoint = {
  t: number;
  priceUsd: number | null;
  priceEth: number | null;
  bondingProgressPct: number | null;
};

/**
 * Live bonding-curve price chart (samples collected while the token is viewed).
 * TradingView cannot chart unlisted curve tokens — this is our pre-migration chart.
 * After migration, DexToken switches to the DexScreener embed.
 */
export function BondingCurveChart({
  tokenAddress,
  currentPriceUsd,
  symbol,
}: {
  tokenAddress: string;
  currentPriceUsd?: number | null;
  symbol?: string;
}) {
  const { data, isLoading } = useQuery<{ points: ChartPoint[] }>({
    queryKey: ["/api/factory-token", tokenAddress, "chart"],
    queryFn: async () => {
      const res = await fetch(`/api/factory-token/${tokenAddress}/chart`);
      if (!res.ok) throw new Error("Chart unavailable");
      return res.json();
    },
    enabled: Boolean(tokenAddress),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const points = (data?.points ?? []).filter((p) => p.priceUsd != null && Number.isFinite(p.priceUsd));
  const series =
    points.length > 0
      ? points
      : currentPriceUsd != null
        ? [{ t: Date.now(), priceUsd: currentPriceUsd, priceEth: null, bondingProgressPct: null }]
        : [];

  const chartData = series.map((p) => ({
    ...p,
    label: new Date(p.t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
  }));

  return (
    <div
      className="bg-card border border-border/60 rounded-xl overflow-hidden"
      data-testid="bonding-curve-chart"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
        <div>
          <div className="text-sm font-semibold">Bonding curve price</div>
          <div className="text-[10px] text-muted-foreground">
            Live samples while on curve · switches to DexScreener after migration
          </div>
        </div>
        {currentPriceUsd != null && (
          <div className="text-right">
            <div className="text-sm font-mono font-semibold">
              ${formatTokenAmount(currentPriceUsd, { maxFrac: 4 })}
            </div>
            {symbol && <div className="text-[10px] text-muted-foreground">${symbol}</div>}
          </div>
        )}
      </div>

      <div className="h-[320px] w-full px-2 py-3">
        {isLoading && chartData.length === 0 ? (
          <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
            Loading chart…
          </div>
        ) : chartData.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-2 text-center px-6">
            <p className="text-sm text-muted-foreground">Collecting price samples…</p>
            <p className="text-[11px] text-muted-foreground/70">
              Keep this page open — the curve chart builds as trades happen.
            </p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="bondingFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(203,87%,53%)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="hsl(203,87%,53%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: "hsl(204,5%,46%)" }}
                axisLine={false}
                tickLine={false}
                minTickGap={32}
              />
              <YAxis
                dataKey="priceUsd"
                domain={["auto", "auto"]}
                width={56}
                tick={{ fontSize: 10, fill: "hsl(204,5%,46%)" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `$${formatTokenAmount(Number(v), { maxFrac: 2 })}`}
              />
              <Tooltip
                contentStyle={{
                  background: "hsl(0,0%,8%)",
                  border: "1px solid hsl(0,0%,18%)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(value: number) => [`$${Number(value).toPrecision(6)}`, "Price"]}
                labelFormatter={(label) => String(label)}
              />
              <Area
                type="monotone"
                dataKey="priceUsd"
                stroke="hsl(203,87%,53%)"
                fill="url(#bondingFill)"
                strokeWidth={2}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
