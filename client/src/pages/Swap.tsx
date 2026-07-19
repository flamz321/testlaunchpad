import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeftRight, Search } from "lucide-react";
import { SocialLayout } from "@/components/SocialLayout";
import { UniswapSwapWidget } from "@/components/UniswapSwapWidget";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ROBINHOOD_CHAIN, isEvmAddress } from "@shared/chain";

type ChainToken = {
  pairAddress: string;
  dexId: string;
  tokenAddress: string;
  symbol: string;
  name: string;
  icon: string | null;
  priceUsd: number | null;
  priceChangeH24: number | null;
  volumeH24: number | null;
  liquidity: number | null;
};

function formatUsdCompact(n: number) {
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(2)}K`;
  if (Math.abs(n) < 0.0001) return `$${n.toExponential(2)}`;
  if (Math.abs(n) < 1) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export default function SwapPage() {
  const searchString = useSearch();
  const params = useMemo(() => new URLSearchParams(searchString), [searchString]);
  const initialToken = (params.get("token") || params.get("outputCurrency") || "").trim();

  const [selectedToken, setSelectedToken] = useState(initialToken);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query.trim(), 280);

  useEffect(() => {
    setSelectedToken(initialToken);
    if (!initialToken) setSelectedSymbol(null);
  }, [initialToken]);

  const { data: tokens = [], isFetching: searching } = useQuery<ChainToken[]>({
    queryKey: ["/api/chain-tokens", debouncedQuery],
    queryFn: async () => {
      const url = debouncedQuery
        ? `/api/chain-tokens?q=${encodeURIComponent(debouncedQuery)}`
        : `/api/chain-tokens`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Search failed");
      return res.json();
    },
    staleTime: 30_000,
  });

  const results = useMemo(() => {
    const list = Array.isArray(tokens) ? tokens : [];
    if (!debouncedQuery) return list.slice(0, 24);
    return list.slice(0, 24);
  }, [tokens, debouncedQuery]);

  const selectToken = useCallback((mint: string, symbol?: string) => {
    setSelectedToken(mint);
    setSelectedSymbol(symbol || null);
    setQuery("");
  }, []);

  // If URL has a raw address, allow it even before search picks a symbol
  useEffect(() => {
    if (initialToken && isEvmAddress(initialToken) && !selectedSymbol) {
      setSelectedToken(initialToken);
    }
  }, [initialToken, selectedSymbol]);

  return (
    <SocialLayout>
      <div className="w-full px-4 sm:px-6 py-6 space-y-6" data-testid="page-swap">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <ArrowLeftRight className="h-3.5 w-3.5" />
              Swap
            </div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Trade on Robinhood Chain
            </h1>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              Bonding-curve tokens trade on-site. Migrated pairs use Uniswap quotes (v2/v3/v4)
              and execute in your wallet.
            </p>
          </div>
          <a
            href="https://app.uniswap.org/swap?chain=robinhood"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-medium text-primary hover:underline shrink-0"
          >
            Open Uniswap →
          </a>
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0 max-w-xl mx-auto xl:mx-0 w-full">
            <UniswapSwapWidget
              defaultTokenAddress={selectedToken || undefined}
              defaultTokenSymbol={selectedSymbol || undefined}
              className="w-full max-w-none"
            />
          </div>

          <aside className="space-y-4 min-w-0">
            <div className="rounded-2xl border border-border/60 bg-card/40 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Find a token
              </p>
              <div className="relative mt-3">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search name, ticker, or 0x…"
                  className="h-10 rounded-xl border-border/60 bg-background/60 pl-9"
                  data-testid="input-swap-token-search"
                />
              </div>

              <div className="mt-3 max-h-[480px] space-y-1 overflow-y-auto">
                {searching ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-14 w-full rounded-xl" />
                  ))
                ) : results.length === 0 ? (
                  <p className="px-1 py-6 text-center text-xs text-muted-foreground">
                    {debouncedQuery ? "No tokens found." : "No tokens loaded yet."}
                  </p>
                ) : (
                  results.map((t) => {
                    const active =
                      selectedToken.toLowerCase() === t.tokenAddress.toLowerCase();
                    return (
                      <button
                        key={`${t.pairAddress}-${t.tokenAddress}`}
                        type="button"
                        onClick={() => selectToken(t.tokenAddress, t.symbol)}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors",
                          active ? "bg-primary/10 ring-1 ring-primary/30" : "hover:bg-muted/50",
                        )}
                        data-testid={`button-swap-pick-${t.tokenAddress}`}
                      >
                        {t.icon ? (
                          <img src={t.icon} alt="" className="h-9 w-9 rounded-full object-cover" />
                        ) : (
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
                            {(t.symbol || "?").slice(0, 2)}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-sm font-semibold text-foreground">
                              {t.symbol}
                            </span>
                            <span className="truncate text-[11px] text-muted-foreground">
                              {t.name}
                            </span>
                          </div>
                          <div className="mt-0.5 flex gap-2 text-[10px] text-muted-foreground">
                            {t.priceUsd != null && <span>{formatUsdCompact(t.priceUsd)}</span>}
                            {t.liquidity != null && t.liquidity > 0 && (
                              <span>Liq {formatUsdCompact(t.liquidity)}</span>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {selectedToken && (
              <div className="rounded-2xl border border-border/60 bg-card/40 p-4 text-xs text-muted-foreground">
                <p className="font-medium text-foreground">Selected token</p>
                <p className="mt-1 break-all font-mono text-[11px]">{selectedToken}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link href={`/dex/${selectedToken}`}>
                    <a className="rounded-lg border border-border/60 px-2.5 py-1.5 text-[11px] font-medium text-foreground hover:bg-muted/40">
                      Token page
                    </a>
                  </Link>
                  <a
                    href={`${ROBINHOOD_CHAIN.blockExplorers.default.url}/token/${selectedToken}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg border border-border/60 px-2.5 py-1.5 text-[11px] font-medium text-foreground hover:bg-muted/40"
                  >
                    Explorer
                  </a>
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>
    </SocialLayout>
  );
}
