/**
 * Launch Feed Cache
 * Fetches recent Robinhood Chain token launches from DexScreener (free, no API key).
 * Caches results for 60 seconds to avoid rate-limiting.
 */

export interface ExternalLaunchItem {
  mintAddress: string;
  name: string;
  ticker: string;
  imageUrl?: string;
  description?: string;
  website?: string;
  twitter?: string;
  mcap?: number;
  volume24h?: number;
  liquidity?: number;
  priceUsd?: string;
  launchpad: "uniswap" | "unknown";
  dexUrl: string;
  pairCreatedAt?: number; // unix ms
}

interface DexProfile {
  tokenAddress: string;
  chainId: string;
  icon?: string;
  description?: string;
  links?: Array<{ type?: string; label?: string; url?: string }>;
}

interface DexPair {
  baseToken: { address: string; name: string; symbol: string };
  dexId: string;
  priceUsd?: string;
  marketCap?: number;
  volume?: { h24?: number };
  liquidity?: { usd?: number };
  pairCreatedAt?: number;
}

const CACHE_TTL_MS = 60_000;
let cache: { data: ExternalLaunchItem[]; ts: number } | null = null;

const FETCH_TIMEOUT = 10_000;
const USER_AGENT = "FeatherApp/1.0";

async function safeFetch(url: string): Promise<Response | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    return res;
  } catch {
    return null;
  }
}

export async function getExternalLaunches(): Promise<ExternalLaunchItem[]> {
  if (cache && Date.now() - cache.ts < CACHE_TTL_MS) return cache.data;

  try {
    const profRes = await safeFetch("https://api.dexscreener.com/token-profiles/latest/v1");
    if (!profRes?.ok) {
      console.warn("[LaunchFeedCache] profile fetch failed:", profRes?.status);
      return cache?.data ?? [];
    }
    const profiles: DexProfile[] = await profRes.json();
    const rhProfiles = profiles.filter((p) => p.chainId === "robinhood").slice(0, 40);
    if (!rhProfiles.length) return cache?.data ?? [];

    const chunks: string[][] = [];
    for (let i = 0; i < rhProfiles.length; i += 30) {
      chunks.push(rhProfiles.slice(i, i + 30).map((p) => p.tokenAddress));
    }

    const pairMap: Record<string, DexPair> = {};
    await Promise.all(
      chunks.map(async (chunk) => {
        const res = await safeFetch(
          `https://api.dexscreener.com/latest/dex/tokens/${chunk.join(",")}`
        );
        if (!res?.ok) return;
        const data = await res.json();
        for (const pair of (data.pairs ?? []) as DexPair[]) {
          const addr = pair.baseToken?.address?.toLowerCase();
          if (addr && !pairMap[addr]) pairMap[addr] = pair;
        }
      })
    );

    const items: ExternalLaunchItem[] = rhProfiles.map((p) => {
      const addr = p.tokenAddress.toLowerCase();
      const pd = pairMap[addr];
      const dexId = pd?.dexId?.toLowerCase() ?? "";
      const launchpad: ExternalLaunchItem["launchpad"] =
        dexId.includes("uni") || dexId.includes("uniswap") ? "uniswap" : "unknown";

      const twitterLink = p.links?.find((l) => l.type === "twitter")?.url;
      const websiteLink = p.links?.find(
        (l) => l.label?.toLowerCase() === "website" || l.type === "website"
      )?.url;

      return {
        mintAddress: p.tokenAddress,
        name: pd?.baseToken?.name ?? p.tokenAddress.slice(0, 8),
        ticker: pd?.baseToken?.symbol ?? "???",
        imageUrl: p.icon ?? undefined,
        description: p.description || undefined,
        website: websiteLink,
        twitter: twitterLink,
        mcap: pd?.marketCap ?? undefined,
        volume24h: pd?.volume?.h24 ?? undefined,
        liquidity: pd?.liquidity?.usd ?? undefined,
        priceUsd: pd?.priceUsd ?? undefined,
        launchpad,
        dexUrl: `https://dexscreener.com/robinhood/${p.tokenAddress.toLowerCase()}`,
        pairCreatedAt: pd?.pairCreatedAt ?? undefined,
      };
    });

    cache = { data: items, ts: Date.now() };
    return items;
  } catch (err) {
    console.error("[LaunchFeedCache] error:", err);
    return cache?.data ?? [];
  }
}

/** Force-invalidate the cache (call after a new Feather launch) */
export function invalidateLaunchCache() {
  cache = null;
}
