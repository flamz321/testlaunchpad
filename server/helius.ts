/**
 * Robinhood Chain wallet / token intel.
 * Uses viem RPC + Blockscout explorer API (+ Alchemy when configured).
 */
import {
  createPublicClient,
  http,
  formatEther,
  formatUnits,
  type Address,
  type PublicClient,
} from "viem";
import {
  DEFAULT_RPC_URL,
  ROBINHOOD_CHAIN,
  ERC20_ABI,
  isEvmAddress,
  WETH_ADDRESS,
} from "@shared/chain";

const BLOCKSCOUT_API = "https://robinhoodchain.blockscout.com/api";
const ALCHEMY_URL = process.env.ALCHEMY_API_KEY
  ? `https://robinhood-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`
  : null;

const chainConfig = {
  id: ROBINHOOD_CHAIN.id,
  name: ROBINHOOD_CHAIN.name,
  nativeCurrency: ROBINHOOD_CHAIN.nativeCurrency,
  rpcUrls: ROBINHOOD_CHAIN.rpcUrls,
} as const;

function makeClient(rpcUrl: string): PublicClient {
  return createPublicClient({
    chain: chainConfig,
    transport: http(rpcUrl, { timeout: 8_000 }),
  }) as PublicClient;
}

const publicClient = makeClient(DEFAULT_RPC_URL);
const alchemyClient = ALCHEMY_URL ? makeClient(ALCHEMY_URL) : null;

async function withRpc<T>(fn: (c: PublicClient) => Promise<T>): Promise<T> {
  if (alchemyClient) {
    try {
      return await fn(alchemyClient);
    } catch (err: any) {
      console.warn("[intel] Alchemy RPC failed, falling back:", err?.message ?? err);
    }
  }
  return fn(publicClient);
}

async function blockscout(params: Record<string, string>): Promise<any> {
  const qs = new URLSearchParams(params);
  const r = await fetch(`${BLOCKSCOUT_API}?${qs}`, {
    headers: { Accept: "application/json", "User-Agent": "FeatherApp/1.0" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) throw new Error(`Blockscout ${r.status}`);
  return r.json();
}

// ── Wallet Profile ─────────────────────────────────────────────────────────────

export interface WalletProfile {
  address: string;
  ethBalance: number;
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

export async function getWalletProfile(address: string): Promise<WalletProfile> {
  if (!isEvmAddress(address)) {
    throw new Error("Invalid EVM wallet address");
  }

  const [balanceRes, txRes, tokenRes] = await Promise.allSettled([
    withRpc((c) => c.getBalance({ address: address as Address })),
    blockscout({
      module: "account",
      action: "txlist",
      address,
      sort: "asc",
      page: "1",
      offset: "50",
    }),
    blockscout({
      module: "account",
      action: "tokenlist",
      address,
    }),
  ]);

  const ethBalance =
    balanceRes.status === "fulfilled" ? Number(formatEther(balanceRes.value)) : 0;

  const txList: any[] =
    txRes.status === "fulfilled" && Array.isArray(txRes.value?.result)
      ? txRes.value.result
      : [];

  const tokenEntries: any[] =
    tokenRes.status === "fulfilled" && Array.isArray(tokenRes.value?.result)
      ? tokenRes.value.result
      : [];

  const tokens: { mint: string; symbol: string; uiAmount: number }[] = [];
  let nftCount = 0;
  for (const t of tokenEntries) {
    const decimals = Number(t.decimals ?? 18);
    const raw = t.balance ?? t.value ?? "0";
    let uiAmount = 0;
    try {
      uiAmount = Number(formatUnits(BigInt(raw), decimals));
    } catch {
      uiAmount = Number(raw) / 10 ** decimals;
    }
    if (decimals === 0 && uiAmount === 1) {
      nftCount++;
      continue;
    }
    if (uiAmount > 0) {
      tokens.push({
        mint: t.contractAddress ?? t.tokenAddress ?? "",
        symbol: (t.symbol || t.name || "???").slice(0, 12),
        uiAmount,
      });
    }
  }
  tokens.sort((a, b) => b.uiAmount - a.uiAmount);

  let fundingSource: string | null = null;
  let firstActivity: string | null = null;
  let lastActivity: string | null = null;

  if (txList.length > 0) {
    const first = txList[0];
    const last = txList[txList.length - 1];
    firstActivity = first?.timeStamp
      ? new Date(Number(first.timeStamp) * 1000).toISOString()
      : null;
    lastActivity = last?.timeStamp
      ? new Date(Number(last.timeStamp) * 1000).toISOString()
      : null;
    if (
      first?.from &&
      first?.to &&
      first.to.toLowerCase() === address.toLowerCase() &&
      first.from.toLowerCase() !== address.toLowerCase()
    ) {
      fundingSource = first.from;
    }
  }

  const flags: string[] = [];
  let riskScore = 0;

  if (ethBalance < 0.001) {
    flags.push("Dust wallet");
    riskScore += 10;
  }
  if (txList.length === 0) {
    flags.push("No transaction history");
    riskScore += 15;
  }
  if (txList.length > 45) {
    flags.push("Very high activity volume");
    riskScore += 10;
  }
  if (tokens.length > 30) {
    flags.push("Holds many ERC-20 tokens");
    riskScore += 5;
  }
  if (!fundingSource) {
    flags.push("Unknown funding source");
    riskScore += 20;
  }

  riskScore = Math.min(100, riskScore);
  const riskLabel: WalletProfile["riskLabel"] =
    riskScore >= 75
      ? "Critical"
      : riskScore >= 55
        ? "High"
        : riskScore >= 35
          ? "Medium"
          : riskScore >= 15
            ? "Low"
            : "Safe";

  const verdict =
    riskScore >= 75
      ? "Highly suspicious — likely a bot or sniper wallet."
      : riskScore >= 55
        ? "Elevated risk — multiple behavioral red flags detected."
        : riskScore >= 35
          ? "Moderate risk — some unusual patterns present."
          : riskScore >= 15
            ? "Low risk — mostly clean activity."
            : "Clean wallet — no significant red flags found.";

  return {
    address,
    ethBalance,
    solBalance: ethBalance,
    tokenCount: tokens.length,
    nftCount,
    totalTransactions: txList.length,
    firstActivity,
    lastActivity,
    fundingSource,
    riskScore,
    riskLabel,
    flags,
    verdict,
    topTokens: tokens.slice(0, 10),
    recentTxSignatures: txList
      .slice(-5)
      .reverse()
      .map((t: any) => t.hash)
      .filter(Boolean),
  };
}

// ── Token Scan ─────────────────────────────────────────────────────────────────

export interface HolderCluster {
  funder: string;
  funderFull?: string;
  wallets: string[];
  totalSupplyPct: number;
  label: string;
  detectionMethod: "funder_trace" | "prefix" | "amount";
}

export interface SupplyBreakdown {
  liquidityPools: number;
  lockedVesting: number;
  bundleClusters: number;
  kolNamed: number;
  circulating: number;
}

export interface WalletFunderEntry {
  wallet: string;
  funder: string | null;
  funderLabel?: string;
}

export interface TokenScan {
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

async function getTokenMeta(contract: string): Promise<{
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: bigint;
  imageUrl: string | null;
}> {
  let name = contract.slice(0, 8);
  let symbol = "???";
  let decimals = 18;
  let totalSupply = BigInt(0);
  let imageUrl: string | null = null;

  try {
    const info = await blockscout({
      module: "token",
      action: "getToken",
      contractaddress: contract,
    });
    const r = info?.result;
    if (r) {
      name = (r.name || name).replace(/\0/g, "").trim();
      symbol = (r.symbol || symbol).replace(/\0/g, "").trim();
      decimals = Number(r.decimals ?? 18);
      if (r.totalSupply) totalSupply = BigInt(r.totalSupply);
      if (typeof r.icon_url === "string") imageUrl = r.icon_url;
    }
  } catch {
    // fall through to RPC
  }

  try {
    const [rpcSymbol, rpcDecimals, rpcSupply] = await Promise.all([
      withRpc((c) =>
        c
          .readContract({
            address: contract as Address,
            abi: ERC20_ABI,
            functionName: "symbol",
          })
          .catch(() => null)
      ),
      withRpc((c) =>
        c
          .readContract({
            address: contract as Address,
            abi: ERC20_ABI,
            functionName: "decimals",
          })
          .catch(() => null)
      ),
      withRpc(async (c) => {
        try {
          return await c.readContract({
            address: contract as Address,
            abi: [
              {
                type: "function",
                name: "totalSupply",
                stateMutability: "view",
                inputs: [],
                outputs: [{ type: "uint256" }],
              },
            ] as const,
            functionName: "totalSupply",
          });
        } catch {
          return null;
        }
      }),
    ]);
    if (typeof rpcSymbol === "string" && symbol === "???") symbol = rpcSymbol;
    if (typeof rpcDecimals === "number") decimals = rpcDecimals;
    if (typeof rpcSupply === "bigint") totalSupply = rpcSupply;
  } catch {
    // keep Blockscout values
  }

  // Prefer DexScreener icon when available
  if (!imageUrl) {
    try {
      const r = await fetch(
        `https://api.dexscreener.com/latest/dex/tokens/${contract}`,
        {
          headers: { "User-Agent": "FeatherApp/1.0" },
          signal: AbortSignal.timeout(5_000),
        }
      );
      if (r.ok) {
        const data = (await r.json()) as any;
        const pair = (data.pairs ?? []).find(
          (p: any) => p.chainId === "robinhood"
        );
        if (pair?.info?.imageUrl) imageUrl = pair.info.imageUrl;
        if (pair?.baseToken?.name) name = pair.baseToken.name;
        if (pair?.baseToken?.symbol) symbol = pair.baseToken.symbol;
      }
    } catch {
      // ignore
    }
  }

  return { name, symbol, decimals, totalSupply, imageUrl };
}

export async function scanToken(mint: string): Promise<TokenScan> {
  if (!isEvmAddress(mint)) {
    throw new Error("Invalid EVM token address");
  }

  const meta = await getTokenMeta(mint);
  const supply =
    meta.totalSupply > BigInt(0)
      ? Number(formatUnits(meta.totalSupply, meta.decimals))
      : 0;

  // Holders via Blockscout
  let allHolders: { address: string; amount: number; pct: number }[] = [];
  let totalHolderCount = 0;

  try {
    const holdersRes = await blockscout({
      module: "token",
      action: "getTokenHolders",
      contractaddress: mint,
      page: "1",
      offset: "50",
    });
    const rows: any[] = Array.isArray(holdersRes?.result) ? holdersRes.result : [];
    totalHolderCount = rows.length;
    allHolders = rows
      .map((h: any) => {
        const raw = h.value ?? h.balance ?? "0";
        let amount = 0;
        try {
          amount = Number(formatUnits(BigInt(raw), meta.decimals));
        } catch {
          amount = Number(raw) / 10 ** meta.decimals;
        }
        return {
          address: h.address ?? h.holderAddress ?? "",
          amount,
          pct: supply > 0 ? (amount / supply) * 100 : 0,
        };
      })
      .filter((h) => h.address && h.amount > 0)
      .sort((a, b) => b.amount - a.amount);
  } catch (err: any) {
    console.warn("[intel] holder fetch failed:", err?.message ?? err);
  }

  // Classify WETH / known pool-ish addresses lightly
  let lpPct = 0;
  const labelMap = new Map<string, string>();
  const regularHolders = allHolders.filter((h) => {
    if (h.address.toLowerCase() === WETH_ADDRESS.toLowerCase()) {
      lpPct += h.pct;
      labelMap.set(h.address, "WETH");
      return false;
    }
    return true;
  });

  // Simple amount-based cluster heuristic (no Solana funder tracing)
  const clusterSet = new Set<string>();
  const clusters: HolderCluster[] = [];
  const amountMap = new Map<string, string[]>();
  for (const h of regularHolders) {
    if (h.amount <= 0 || h.pct >= 5) continue;
    const key = `amt_${h.amount.toFixed(4)}`;
    if (!amountMap.has(key)) amountMap.set(key, []);
    amountMap.get(key)!.push(h.address);
  }
  for (const [, wallets] of Array.from(amountMap.entries())) {
    if (wallets.length < 3) continue;
    const totalPct = wallets.reduce((s: number, w: string) => {
      const h = regularHolders.find((x) => x.address === w);
      return s + (h?.pct ?? 0);
    }, 0);
    if (totalPct < 0.1) continue;
    wallets.forEach((w: string) => clusterSet.add(w));
    clusters.push({
      funder: `same-amount (${wallets.length}w)`,
      wallets,
      totalSupplyPct: parseFloat(totalPct.toFixed(2)),
      label: "Sniper",
      detectionMethod: "amount",
    });
  }
  clusters.sort((a, b) => b.totalSupplyPct - a.totalSupplyPct);

  const bundleCount = clusters.length;
  const bundlePct = clusters.reduce((s, c) => s + c.totalSupplyPct, 0);
  const bundleWallets = clusterSet.size;
  const holdersScanned = regularHolders.slice(0, 40).length;

  const walletFunders: WalletFunderEntry[] = regularHolders
    .slice(0, 40)
    .map((h) => ({ wallet: h.address, funder: null }));

  const top10Pct = regularHolders.slice(0, 10).reduce((s, h) => s + h.pct, 0);
  const top25Pct = regularHolders.slice(0, 25).reduce((s, h) => s + h.pct, 0);
  const lockPct = 0;
  const kolPct = 0;
  const exchangeCount = 0;
  const circulatingPct = Math.max(0, 100 - lpPct - lockPct - bundlePct - kolPct);

  const supplyBreakdown: SupplyBreakdown = {
    liquidityPools: parseFloat(lpPct.toFixed(2)),
    lockedVesting: 0,
    bundleClusters: parseFloat(bundlePct.toFixed(2)),
    kolNamed: 0,
    circulating: parseFloat(circulatingPct.toFixed(2)),
  };

  let riskScore = 0;
  if (top10Pct > 50) riskScore += 30;
  else if (top10Pct > 30) riskScore += 15;
  if (bundleCount > 5) riskScore += 30;
  else if (bundleCount > 3) riskScore += 20;
  else if (bundleCount > 1) riskScore += 10;
  if (bundlePct > 20) riskScore += 20;
  else if (bundlePct > 10) riskScore += 10;
  if (lpPct < 5) riskScore += 10;
  riskScore = Math.min(100, riskScore);

  const riskLabel =
    riskScore >= 75
      ? "Critical"
      : riskScore >= 55
        ? "High"
        : riskScore >= 35
          ? "Suspicious"
          : riskScore >= 15
            ? "Low"
            : "Safe";

  const threatLevel: TokenScan["threatLevel"] =
    riskScore >= 55 ? "Dangerous" : riskScore >= 30 ? "Suspicious" : "Safe";

  const threatBullets: string[] = [];
  if (bundleCount > 0) {
    threatBullets.push(
      `${bundleCount} suspicious cluster${bundleCount > 1 ? "s" : ""} — identical-amount heuristic`
    );
  } else {
    threatBullets.push(
      `No suspicious bundle clusters detected across ${holdersScanned} scanned holders`
    );
  }
  if (top10Pct > 40) {
    threatBullets.push(
      `Top 10 holders control ${top10Pct.toFixed(1)}% of supply — high concentration risk`
    );
  }
  if (lpPct > 0) threatBullets.push(`${lpPct.toFixed(1)}% supply tagged as liquidity-related`);

  const bundleWalletSet = new Set(clusters.flatMap((c) => c.wallets));
  const topHoldersLabeled = allHolders.slice(0, 25).map((h) => ({
    ...h,
    label:
      labelMap.get(h.address) ??
      (bundleWalletSet.has(h.address) ? "Bundle" : undefined),
  }));

  return {
    mint,
    name: meta.name,
    symbol: meta.symbol,
    imageUrl: meta.imageUrl,
    supply,
    decimals: meta.decimals,
    holders: totalHolderCount,
    holdersScanned,
    scannedAt: Math.floor(Date.now() / 1000),
    topHolders: topHoldersLabeled,
    clusters: clusters.slice(0, 15),
    walletFunders,
    top10Pct: parseFloat(top10Pct.toFixed(2)),
    top25Pct: parseFloat(top25Pct.toFixed(2)),
    lpPct: parseFloat(lpPct.toFixed(2)),
    lockPct: 0,
    bundleCount,
    bundlePct: parseFloat(bundlePct.toFixed(2)),
    bundleWallets,
    kolPct: 0,
    exchangeCount,
    circulatingPct: parseFloat(circulatingPct.toFixed(2)),
    supplyBreakdown,
    threatLevel,
    threatBullets,
    riskScore,
    riskLabel,
  };
}

// ── Intel Analytics ────────────────────────────────────────────────────────────

export interface IntelStats {
  slot: number; // block number (compat field name)
  blockTime: number | null;
  tps: number; // approx tx/s from recent blocks (best-effort)
  epochProgress: number; // unused on EVM — always 0
  slotsRemaining: number; // unused on EVM — always 0
  solPrice: number; // ETH price USD (compat field name)
  ethPrice: number;
  networkHealth: "Healthy" | "Degraded" | "Stressed";
  cachedAt: number;
}

let intelCache: IntelStats | null = null;
let intelCacheAt = 0;

export async function getIntelStats(): Promise<IntelStats> {
  if (intelCache && Date.now() - intelCacheAt < 30_000) return intelCache;

  const [blockNumber, block] = await Promise.all([
    withRpc((c) => c.getBlockNumber()).catch(() => BigInt(0)),
    withRpc((c) => c.getBlock({ blockTag: "latest" })).catch(() => null),
  ]);

  const slot = Number(blockNumber);
  const blockTime = block?.timestamp ? Number(block.timestamp) : null;

  // Best-effort TPS: compare tx count in latest block vs ~12s block time
  let tps = 0;
  if (block?.transactions) {
    const txCount = Array.isArray(block.transactions)
      ? block.transactions.length
      : 0;
    tps = Math.round(txCount / 12);
  }

  let ethPrice = 0;
  try {
    const cgRes = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd",
      { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(5_000) }
    );
    const cgData = (await cgRes.json()) as any;
    ethPrice = cgData?.ethereum?.usd ?? 0;
  } catch {
    // leave 0
  }

  // Also try DexScreener WETH pair as fallback
  if (!ethPrice) {
    try {
      const r = await fetch(
        `https://api.dexscreener.com/latest/dex/tokens/${WETH_ADDRESS}`,
        { headers: { "User-Agent": "FeatherApp/1.0" }, signal: AbortSignal.timeout(5_000) }
      );
      if (r.ok) {
        const data = (await r.json()) as any;
        const pair = (data.pairs ?? []).find((p: any) => p.chainId === "robinhood");
        if (pair?.priceUsd) ethPrice = Number(pair.priceUsd);
      }
    } catch {
      // ignore
    }
  }

  const networkHealth: IntelStats["networkHealth"] =
    tps > 5 ? "Healthy" : tps > 1 ? "Degraded" : "Stressed";

  intelCache = {
    slot,
    blockTime,
    tps,
    epochProgress: 0,
    slotsRemaining: 0,
    solPrice: ethPrice,
    ethPrice,
    networkHealth,
    cachedAt: Date.now(),
  };
  intelCacheAt = Date.now();
  return intelCache;
}
