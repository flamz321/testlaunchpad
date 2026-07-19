/**
 * Discover Feather App launches from the on-chain factory registry.
 * Product UI brands these as Feather App — never "Bags".
 */
import {
  createPublicClient,
  http,
  formatEther,
  type Address,
} from "viem";
import {
  DEFAULT_RPC_URL,
  ROBINHOOD_CHAIN,
  ROBINHOOD_LAUNCHPAD,
  normalizeWallet,
} from "@shared/chain";
import {
  bagsFactoryAbi,
  bagsLensAbi,
  bagsTokenAbi,
  FEATHER_LAUNCHPAD_ID,
} from "@shared/bags";
import { getEthPriceUsd } from "./dex";

const publicClient = createPublicClient({
  chain: {
    id: ROBINHOOD_CHAIN.id,
    name: ROBINHOOD_CHAIN.name,
    nativeCurrency: ROBINHOOD_CHAIN.nativeCurrency,
    rpcUrls: { default: { http: [DEFAULT_RPC_URL] } },
  },
  transport: http(DEFAULT_RPC_URL, { batch: true }),
  batch: { multicall: true },
  pollingInterval: 500,
});

export interface FeatherFactoryToken {
  tokenAddress: string;
  pairAddress: string;
  dexId: string;
  symbol: string;
  name: string;
  icon: string | null;
  priceUsd: number | null;
  priceEth: number | null;
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
  allDexIds: string[];
  pairsCount: number;
  isPaid: boolean;
  boostTier: number;
  launchpad: typeof FEATHER_LAUNCHPAD_ID;
  chainId: string;
  migrated: boolean;
  bondingProgressPct: number;
  feeShare: string;
  curve: string;
  source: "factory";
}

interface TokenMeta {
  name: string;
  symbol: string;
  image: string | null;
  ts: number;
}

const META_TTL_MS = 10 * 60_000;
const LIST_TTL_MS = 45_000;
const metaCache = new Map<string, TokenMeta>();
let listCache: { tokens: FeatherFactoryToken[]; addressSet: Set<string>; ts: number } | null = null;

const NEWEST_LIMIT = 80;

async function readTokenMeta(token: Address): Promise<{ name: string; symbol: string; image: string | null }> {
  const key = normalizeWallet(token);
  const cached = metaCache.get(key);
  if (cached && Date.now() - cached.ts < META_TTL_MS) {
    return { name: cached.name, symbol: cached.symbol, image: cached.image };
  }

  const [name, symbol, metadataURI] = await Promise.all([
    publicClient.readContract({ address: token, abi: bagsTokenAbi, functionName: "name" }).catch(() => ""),
    publicClient.readContract({ address: token, abi: bagsTokenAbi, functionName: "symbol" }).catch(() => ""),
    publicClient
      .readContract({ address: token, abi: bagsTokenAbi, functionName: "metadataURI" })
      .catch(() => ""),
  ]);

  let image: string | null = null;
  const uri = String(metadataURI || "");
  if (uri) {
    try {
      const url = uri.startsWith("ipfs://")
        ? `https://gateway.pinata.cloud/ipfs/${uri.slice(7)}`
        : uri;
      const res = await fetch(url, { signal: AbortSignal.timeout(6_000) });
      if (res.ok) {
        const json: any = await res.json();
        const rawImg =
          json?.image ||
          json?.imageUrl ||
          json?.image_url ||
          json?.logo ||
          json?.icon ||
          json?.properties?.image ||
          (Array.isArray(json?.properties?.files) ? json.properties.files[0]?.uri : null) ||
          null;
        if (typeof rawImg === "string" && rawImg.trim()) {
          image = rawImg.startsWith("ipfs://")
            ? `https://gateway.pinata.cloud/ipfs/${rawImg.slice(7)}`
            : rawImg.trim();
        }
      }
    } catch {
      /* ignore metadata fetch failures */
    }
  }

  const meta = {
    name: String(name || "Unknown"),
    symbol: String(symbol || "???"),
    image,
    ts: Date.now(),
  };
  metaCache.set(key, meta);
  return meta;
}

/** Optional DB enrichment passed from routes (avoids hard DB dependency here). */
export type FactoryDbLaunch = {
  mintAddress: string | null;
  coinName: string;
  ticker: string;
  imageUrl: string | null;
  createdAt: Date | null;
};

function priceEthFromWeiPerToken(priceQuotePerToken: bigint): number | null {
  if (priceQuotePerToken <= BigInt(0)) return null;
  const eth = Number(formatEther(priceQuotePerToken));
  return eth > 0 && Number.isFinite(eth) ? eth : null;
}

/** Newest Feather factory launches with live lens state (cached). */
export async function getFeatherFactoryTokens(
  limit = NEWEST_LIMIT,
  dbLaunches: FactoryDbLaunch[] = []
): Promise<{
  tokens: FeatherFactoryToken[];
  addressSet: Set<string>;
}> {
  if (listCache && Date.now() - listCache.ts < LIST_TTL_MS) {
    return { tokens: listCache.tokens, addressSet: listCache.addressSet };
  }

  try {
    const total = Number(
      await publicClient.readContract({
        address: ROBINHOOD_LAUNCHPAD.factory as Address,
        abi: bagsFactoryAbi,
        functionName: "allTokensLength",
      })
    );
    if (!total) {
      listCache = { tokens: [], addressSet: new Set(), ts: Date.now() };
      return listCache;
    }

    const count = Math.min(limit, total);
    const offset = BigInt(total - count);
    const tokens = (await publicClient.readContract({
      address: ROBINHOOD_LAUNCHPAD.factory as Address,
      abi: bagsFactoryAbi,
      functionName: "getTokens",
      args: [offset, BigInt(count)],
    })) as Address[];

    const states = (await publicClient.readContract({
      address: ROBINHOOD_LAUNCHPAD.lens as Address,
      abi: bagsLensAbi,
      functionName: "getTokenStates",
      args: [tokens],
    })) as Array<{
      exists: boolean;
      migrated: boolean;
      curve: Address;
      feeShare: Address;
      poolId: `0x${string}`;
      priceQuotePerToken: bigint;
      bondingProgressPct: bigint;
      realQuoteReserves: bigint;
      totalRaised: bigint;
    }>;

    const ethUsd = await getEthPriceUsd().catch(() => null);

    const dbByMint = new Map(
      dbLaunches
        .filter((l) => l.mintAddress)
        .map((l) => [normalizeWallet(l.mintAddress!), l])
    );

    const rows: FeatherFactoryToken[] = [];
    // Newest first (tail of registry)
    for (let i = tokens.length - 1; i >= 0; i--) {
      const token = tokens[i];
      const state = states[i];
      if (!state?.exists) continue;

      const addr = normalizeWallet(token);
      const db = dbByMint.get(addr);
      let meta = { name: db?.coinName || "", symbol: db?.ticker || "", image: db?.imageUrl || null };
      if (!meta.name || !meta.symbol || !meta.image) {
        const onchain = await readTokenMeta(token);
        meta = {
          name: meta.name || onchain.name,
          symbol: meta.symbol || onchain.symbol,
          image: meta.image || onchain.image,
        };
      }

      const priceEth = state.migrated ? null : priceEthFromWeiPerToken(state.priceQuotePerToken);
      const priceUsd =
        priceEth != null && ethUsd != null && ethUsd > 0 ? priceEth * ethUsd : null;
      const supply = 1_000_000_000; // fixed 1e9
      const fdv = priceUsd != null ? priceUsd * supply : null;
      const liqEth = Number(formatEther(state.realQuoteReserves ?? BigInt(0)));
      const liquidity =
        !state.migrated && ethUsd != null && liqEth > 0 ? liqEth * ethUsd : null;

      rows.push({
        tokenAddress: token,
        pairAddress: state.curve || token,
        dexId: FEATHER_LAUNCHPAD_ID,
        symbol: meta.symbol,
        name: meta.name,
        icon: meta.image,
        priceUsd,
        priceEth,
        priceChangeM5: null,
        priceChangeH1: null,
        priceChangeH6: null,
        priceChangeH24: null,
        volumeM5: null,
        volumeH1: null,
        volumeH6: null,
        volumeH24: null,
        buysH24: 0,
        sellsH24: 0,
        txnsH24: 0,
        liquidity,
        fdv,
        marketCap: fdv,
        createdAt: db?.createdAt ? new Date(db.createdAt).getTime() : null,
        allDexIds: [FEATHER_LAUNCHPAD_ID],
        pairsCount: 1,
        isPaid: false,
        boostTier: 0,
        launchpad: FEATHER_LAUNCHPAD_ID,
        chainId: "robinhood",
        migrated: state.migrated,
        bondingProgressPct: Number(state.bondingProgressPct),
        feeShare: state.feeShare,
        curve: state.curve,
        source: "factory",
      });
    }

    const addressSet = new Set(rows.map((r) => normalizeWallet(r.tokenAddress)));
    listCache = { tokens: rows, addressSet, ts: Date.now() };
    return { tokens: rows, addressSet };
  } catch (err) {
    console.error("[factoryTokens]", err);
    return listCache ?? { tokens: [], addressSet: new Set() };
  }
}

/** Invalidate list cache after a new launch is recorded */
export function invalidateFactoryTokenCache() {
  listCache = null;
}

/** Single-token lookup for /dex/:address pages (BagsLens + metadata). */
export async function getFeatherFactoryTokenDetail(
  tokenAddress: string,
  dbLaunch?: FactoryDbLaunch | null
): Promise<FeatherFactoryToken | null> {
  if (!/^0x[a-fA-F0-9]{40}$/.test(tokenAddress)) return null;

  // Prefer list cache hit
  if (listCache && Date.now() - listCache.ts < LIST_TTL_MS) {
    const hit = listCache.tokens.find(
      (t) => normalizeWallet(t.tokenAddress) === normalizeWallet(tokenAddress)
    );
    if (hit) return hit;
  }

  try {
    const token = tokenAddress as Address;
    const state = (await publicClient.readContract({
      address: ROBINHOOD_LAUNCHPAD.lens as Address,
      abi: bagsLensAbi,
      functionName: "getTokenState",
      args: [token],
    })) as {
      exists: boolean;
      migrated: boolean;
      curve: Address;
      feeShare: Address;
      poolId: `0x${string}`;
      priceQuotePerToken: bigint;
      bondingProgressPct: bigint;
      realQuoteReserves: bigint;
      totalRaised: bigint;
    };

    if (!state?.exists) return null;

    const ethUsd = await getEthPriceUsd().catch(() => null);
    let meta = {
      name: dbLaunch?.coinName || "",
      symbol: dbLaunch?.ticker || "",
      image: dbLaunch?.imageUrl || null,
    };
    if (!meta.name || !meta.symbol || !meta.image) {
      const onchain = await readTokenMeta(token);
      meta = {
        name: meta.name || onchain.name,
        symbol: meta.symbol || onchain.symbol,
        image: meta.image || onchain.image,
      };
    }

    const priceEth = state.migrated ? null : priceEthFromWeiPerToken(state.priceQuotePerToken);
    const priceUsd =
      priceEth != null && ethUsd != null && ethUsd > 0 ? priceEth * ethUsd : null;
    const supply = 1_000_000_000;
    const fdv = priceUsd != null ? priceUsd * supply : null;
    const liqEth = Number(formatEther(state.realQuoteReserves ?? BigInt(0)));
    const liquidity =
      !state.migrated && ethUsd != null && liqEth > 0 ? liqEth * ethUsd : null;

    return {
      tokenAddress: token,
      pairAddress: state.curve || token,
      dexId: FEATHER_LAUNCHPAD_ID,
      symbol: meta.symbol,
      name: meta.name,
      icon: meta.image,
      priceUsd,
      priceEth,
      priceChangeM5: null,
      priceChangeH1: null,
      priceChangeH6: null,
      priceChangeH24: null,
      volumeM5: null,
      volumeH1: null,
      volumeH6: null,
      volumeH24: null,
      buysH24: 0,
      sellsH24: 0,
      txnsH24: 0,
      liquidity,
      fdv,
      marketCap: fdv,
      createdAt: dbLaunch?.createdAt ? new Date(dbLaunch.createdAt).getTime() : null,
      allDexIds: [FEATHER_LAUNCHPAD_ID],
      pairsCount: 1,
      isPaid: false,
      boostTier: 0,
      launchpad: FEATHER_LAUNCHPAD_ID,
      chainId: "robinhood",
      migrated: state.migrated,
      bondingProgressPct: Number(state.bondingProgressPct),
      feeShare: state.feeShare,
      curve: state.curve,
      source: "factory",
    };
  } catch (err) {
    console.error("[factoryTokenDetail]", err);
    return null;
  }
}

export { FEATHER_LAUNCHPAD_ID };
