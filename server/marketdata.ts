import { storage } from "./storage";
import { WETH_ADDRESS, DEXSCREENER_CHAIN_ID } from "@shared/chain";

// ── ETH price cache ────────────────────────────────────────────────────────────
let ethPriceCache: { usd: number; fetchedAt: number } | null = null;
const ETH_PRICE_TTL_MS = 5 * 60 * 1000;
const USER_AGENT = "FeatherApp/1.0";

export async function getEthPriceUsd(): Promise<number> {
  if (ethPriceCache && Date.now() - ethPriceCache.fetchedAt < ETH_PRICE_TTL_MS) {
    return ethPriceCache.usd;
  }
  try {
    // Prefer DexScreener WETH on Robinhood Chain
    const dexRes = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${WETH_ADDRESS}`,
      {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(5_000),
      }
    );
    if (dexRes.ok) {
      const data = (await dexRes.json()) as any;
      const pair = (data.pairs ?? []).find(
        (p: any) => p.chainId === DEXSCREENER_CHAIN_ID && p.priceUsd
      );
      if (pair?.priceUsd) {
        const usd = Number(pair.priceUsd);
        ethPriceCache = { usd, fetchedAt: Date.now() };
        return usd;
      }
    }
  } catch {
    // fall through
  }

  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd",
      { signal: AbortSignal.timeout(5_000) }
    );
    const data = (await res.json()) as { ethereum?: { usd?: number } };
    const usd = data?.ethereum?.usd ?? 2500;
    ethPriceCache = { usd, fetchedAt: Date.now() };
    return usd;
  } catch {
    return ethPriceCache?.usd ?? 2500;
  }
}

/** @deprecated use getEthPriceUsd */
export async function getSolPriceUsd(): Promise<number> {
  return getEthPriceUsd();
}

// ── DexScreener Robinhood pair types ───────────────────────────────────────────
interface DexPair {
  chainId: string;
  dexId: string;
  pairAddress: string;
  baseToken: { address: string; name: string; symbol: string };
  priceUsd?: string;
  marketCap?: number;
  fdv?: number;
  volume?: { h24?: number };
  liquidity?: { usd?: number };
  pairCreatedAt?: number;
  txns?: { h24?: { buys?: number; sells?: number } };
}

async function fetchRobinhoodPairs(): Promise<DexPair[]> {
  const pairs: DexPair[] = [];
  const seen = new Set<string>();

  // Latest token profiles filtered to robinhood
  try {
    const profRes = await fetch(
      "https://api.dexscreener.com/token-profiles/latest/v1",
      {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(10_000),
      }
    );
    if (profRes.ok) {
      const profiles: any[] = await profRes.json();
      const rh = profiles
        .filter((p) => p.chainId === DEXSCREENER_CHAIN_ID)
        .slice(0, 40);
      const addrs = rh.map((p) => p.tokenAddress).filter(Boolean);
      for (let i = 0; i < addrs.length; i += 30) {
        const chunk = addrs.slice(i, i + 30);
        const r = await fetch(
          `https://api.dexscreener.com/latest/dex/tokens/${chunk.join(",")}`,
          {
            headers: { "User-Agent": USER_AGENT },
            signal: AbortSignal.timeout(10_000),
          }
        );
        if (!r.ok) continue;
        const data = (await r.json()) as any;
        for (const p of data.pairs ?? []) {
          if (p.chainId !== DEXSCREENER_CHAIN_ID) continue;
          const key = p.pairAddress?.toLowerCase();
          if (!key || seen.has(key)) continue;
          seen.add(key);
          pairs.push(p);
        }
      }
    }
  } catch (err: any) {
    console.warn("[marketdata] profile fetch failed:", err.message);
  }

  // Search enrichment for common terms on Robinhood Chain
  const searchTerms = ["eth", "feather", "robinhood", "meme", "ai", "pepe", "dog"];
  try {
    const results = await Promise.allSettled(
      searchTerms.map((q) =>
        fetch(
          `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(q)}`,
          {
            headers: { "User-Agent": USER_AGENT },
            signal: AbortSignal.timeout(7_000),
          }
        ).then((r) => (r.ok ? r.json() : { pairs: [] }))
      )
    );
    for (const res of results) {
      if (res.status !== "fulfilled") continue;
      for (const p of res.value.pairs ?? []) {
        if (p.chainId !== DEXSCREENER_CHAIN_ID) continue;
        const key = p.pairAddress?.toLowerCase();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        pairs.push(p);
      }
    }
  } catch (err: any) {
    console.warn("[marketdata] search enrich failed:", err.message);
  }

  return pairs;
}

// ── Market stats ───────────────────────────────────────────────────────────────
export interface MarketStats {
  totalLaunches: number;
  estimatedDailyLaunches: number;
  actualWindowMinutes: number;
  graduatedCount: number; // pairs with meaningful liquidity
  hits100k: number;
  hits1m: number;
  hits10m: number;
  solPriceUsd: number; // ETH price (compat)
  ethPriceUsd: number;
  windowHours: number;
  source: "dexscreener" | "unavailable";
  fetchedAt: number;
}

let marketStatsCache: MarketStats | null = null;
const MARKET_STATS_TTL_MS = 15 * 60 * 1000;

let lastSnapshotTime = 0;
const SNAPSHOT_INTERVAL_MS = 60 * 60 * 1000;
let fetchInProgress = false;

async function doFetchAndCache(): Promise<void> {
  const ethPriceUsd = await getEthPriceUsd();

  try {
    const pairs = await fetchRobinhoodPairs();
    const now = Date.now();
    const DAY_MS = 24 * 60 * 60 * 1000;

    // Prefer pairs created in last 24h; if none, use all known pairs
    const recent = pairs.filter(
      (p) => p.pairCreatedAt && now - p.pairCreatedAt < DAY_MS
    );
    const cohort = recent.length > 0 ? recent : pairs;

    const timestamps = cohort
      .map((p) => p.pairCreatedAt)
      .filter((t): t is number => typeof t === "number");
    const oldestTs = timestamps.length ? Math.min(...timestamps) : now;
    const newestTs = timestamps.length ? Math.max(...timestamps) : now;
    const actualWindowMinutes =
      timestamps.length < 2
        ? 1440
        : Math.max(1, Math.round((newestTs - oldestTs) / 60_000));

    const graduatedCount = cohort.filter(
      (p) => (p.liquidity?.usd ?? 0) >= 5_000
    ).length;
    const mcapOf = (p: DexPair) => p.marketCap ?? p.fdv ?? 0;
    const hits100k = cohort.filter((p) => mcapOf(p) >= 100_000).length;
    const hits1m = cohort.filter((p) => mcapOf(p) >= 1_000_000).length;
    const hits10m = cohort.filter((p) => mcapOf(p) >= 10_000_000).length;

    const dailyMultiplier = 1440 / Math.max(actualWindowMinutes, 1);
    const estimatedDailyLaunches =
      recent.length > 0
        ? recent.length
        : Math.round(cohort.length * dailyMultiplier);
    const windowHours = Math.round((actualWindowMinutes / 60) * 10) / 10;

    const stats: MarketStats = {
      totalLaunches: cohort.length,
      estimatedDailyLaunches,
      actualWindowMinutes,
      graduatedCount,
      hits100k,
      hits1m,
      hits10m,
      solPriceUsd: ethPriceUsd,
      ethPriceUsd,
      windowHours,
      source: "dexscreener",
      fetchedAt: Date.now(),
    };

    console.log(
      `[marketdata] ${cohort.length} Robinhood pairs | ` +
        `est. ${estimatedDailyLaunches}/day | ${graduatedCount} with $5k+ liq | $100K+: ${hits100k}`
    );

    marketStatsCache = stats;

    if (Date.now() - lastSnapshotTime > SNAPSHOT_INTERVAL_MS) {
      lastSnapshotTime = Date.now();
      storage
        .addMarketSnapshot({
          totalLaunches: stats.estimatedDailyLaunches,
          graduatedCount: stats.graduatedCount,
          hits100k: stats.hits100k,
          hits1m: stats.hits1m,
          hits10m: stats.hits10m,
          solPriceUsd: stats.ethPriceUsd,
        })
        .catch((err) =>
          console.error("[marketdata] Snapshot save failed:", err.message)
        );
    }
  } catch (err: any) {
    console.error("[marketdata] DexScreener unavailable:", err.message);
    if (!marketStatsCache) {
      marketStatsCache = {
        totalLaunches: 0,
        estimatedDailyLaunches: 0,
        actualWindowMinutes: 0,
        graduatedCount: 0,
        hits100k: 0,
        hits1m: 0,
        hits10m: 0,
        solPriceUsd: ethPriceUsd,
        ethPriceUsd,
        windowHours: 0,
        source: "unavailable",
        fetchedAt: Date.now(),
      };
    } else {
      marketStatsCache = {
        ...marketStatsCache,
        source: "unavailable",
        fetchedAt: Date.now(),
      };
    }
  }
}

function refreshCacheInBackground(): void {
  if (fetchInProgress) return;
  fetchInProgress = true;
  doFetchAndCache().finally(() => {
    fetchInProgress = false;
  });
}

export async function getMarketStats(forceRefresh = false): Promise<MarketStats> {
  const cacheAge = marketStatsCache
    ? Date.now() - marketStatsCache.fetchedAt
    : Infinity;
  const cacheStale = cacheAge > MARKET_STATS_TTL_MS;

  if (!forceRefresh && marketStatsCache && !cacheStale) {
    return marketStatsCache;
  }

  if (!forceRefresh && marketStatsCache && cacheStale) {
    refreshCacheInBackground();
    return marketStatsCache;
  }

  if (!fetchInProgress) {
    fetchInProgress = true;
    await doFetchAndCache().finally(() => {
      fetchInProgress = false;
    });
  } else {
    while (fetchInProgress) await new Promise((r) => setTimeout(r, 200));
  }

  return marketStatsCache!;
}

// ── Signal generation ──────────────────────────────────────────────────────────
export interface SignalReading {
  score: "hot" | "warm" | "cold";
  emoji: string;
  headline: string;
  details: string;
  stats: {
    totalLaunches: number;
    graduatedCount: number;
    hits100k: number;
    hits1m: number;
    hits10m: number;
    graduationRate: string;
    windowHours: number;
  };
}

export function generateSignal(stats: MarketStats): SignalReading {
  const total = stats.totalLaunches;
  const windowMin = stats.actualWindowMinutes;
  const windowLabel =
    windowMin >= 60
      ? `last ${Math.round(windowMin / 6) / 10}h`
      : `last ${windowMin}min`;

  const gradRate = total > 0 ? (stats.graduatedCount / total) * 100 : 0;
  const launchesPerHour = windowMin > 0 ? (total / windowMin) * 60 : 0;

  let score: "hot" | "warm" | "cold";
  let emoji: string;
  let headline: string;

  if (
    gradRate >= 40 ||
    stats.hits1m >= 2 ||
    stats.hits100k >= 5 ||
    launchesPerHour >= 10
  ) {
    score = "hot";
    emoji = "🟢";
    headline = "HOT MARKET";
  } else if (
    gradRate >= 15 ||
    stats.hits1m >= 1 ||
    stats.hits100k >= 2 ||
    launchesPerHour >= 3
  ) {
    score = "warm";
    emoji = "🟡";
    headline = "WARM MARKET";
  } else {
    score = "cold";
    emoji = "🔴";
    headline = "COLD MARKET";
  }

  const ethPx = stats.ethPriceUsd ?? stats.solPriceUsd;
  const details =
    `${total.toLocaleString()} pairs tracked • ` +
    `${stats.graduatedCount.toLocaleString()} with $5k+ liquidity • ` +
    `${stats.hits100k.toLocaleString()} hit $100K\n` +
    `${stats.hits1m.toLocaleString()} hit $1M • ETH $${ethPx.toFixed(0)} (${windowLabel})`;

  return {
    score,
    emoji,
    headline,
    details,
    stats: {
      totalLaunches: total,
      graduatedCount: stats.graduatedCount,
      hits100k: stats.hits100k,
      hits1m: stats.hits1m,
      hits10m: stats.hits10m,
      graduationRate: `${gradRate.toFixed(2)}% liquid pairs (${windowLabel} sample)`,
      windowHours: stats.windowHours,
    },
  };
}

export function formatSignalMessage(signal: SignalReading): string {
  return (
    `${signal.emoji} *Robinhood Chain Market Signal*\n\n` +
    `*${signal.headline}*\n\n` +
    `📊 ${signal.details}\n\n` +
    `📈 ${signal.stats.graduationRate}\n\n` +
    `_Stats from DexScreener Robinhood Chain pairs._\n\n` +
    `_Ready to launch? Use the Feather App launchpad at feather.app._`
  );
}

export function formatSignalMessageDiscord(signal: SignalReading): string {
  return (
    `${signal.emoji} **Robinhood Chain Market Signal**\n\n` +
    `**${signal.headline}**\n\n` +
    `📊 ${signal.details}\n\n` +
    `📈 ${signal.stats.graduationRate}\n\n` +
    `-# Stats from DexScreener Robinhood Chain pairs.\n\n` +
    `*Ready to launch? Use the Feather App launchpad at feather.app.*`
  );
}
