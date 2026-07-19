import {
  createPublicClient,
  http,
  verifyMessage,
  parseEther,
  formatEther,
  formatUnits,
  type Hash,
  type Address,
} from "viem";
import {
  ROBINHOOD_CHAIN,
  DEFAULT_RPC_URL,
  WETH_ADDRESS,
  FEATHER_TOKEN_ADDRESS,
  USDC_ADDRESS,
  DEXSCREENER_CHAIN_ID,
  ERC20_ABI,
  isEvmAddress,
  isTxHash,
} from "@shared/chain";

// ── Constants ─────────────────────────────────────────────────────────────────

export const USDC_MINT = USDC_ADDRESS;
export const FEATHER_MINT = FEATHER_TOKEN_ADDRESS;
/** @deprecated use FEATHER_MINT */
export const TRENCHY_MINT = FEATHER_MINT;
export const LISTING_FEE_USD = 50;

export const BOOST_TIERS: Record<number, { label: string; usd: number; durationHours: number }> = {
  1: { label: "Hot",      usd: 10,  durationHours: 24  },
  2: { label: "Trending", usd: 25,  durationHours: 72  },
  3: { label: "Featured", usd: 100, durationHours: 168 },
};

export const AD_PACKAGES: Record<string, { label: string; usd: number; durationHours: number }> = {
  "24h":  { label: "24 Hours", usd: 50,  durationHours: 24  },
  "7d":   { label: "7 Days",   usd: 200, durationHours: 168 },
};

function getBotWallet(): string {
  const addr = process.env.BOT_WALLET_ADDRESS || process.env.ADMIN_WALLET || "";
  if (addr && isEvmAddress(addr)) return addr;
  return "";
}

export const BOT_WALLET = (() => {
  try { return getBotWallet(); } catch { return ""; }
})();

const publicClient = createPublicClient({
  chain: {
    id: ROBINHOOD_CHAIN.id,
    name: ROBINHOOD_CHAIN.name,
    nativeCurrency: ROBINHOOD_CHAIN.nativeCurrency,
    rpcUrls: ROBINHOOD_CHAIN.rpcUrls,
  },
  transport: http(DEFAULT_RPC_URL),
});

// ── DexScreener cache ─────────────────────────────────────────────────────────

interface CacheEntry { data: any; ts: number }
const dexCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30_000;

function filterRobinhoodPairs(json: any): any {
  if (!json) return json;
  if (Array.isArray(json)) {
    return json.filter((p: any) => p.chainId === DEXSCREENER_CHAIN_ID);
  }
  if (json.pairs) {
    return {
      ...json,
      pairs: (json.pairs as any[]).filter((p: any) => p.chainId === DEXSCREENER_CHAIN_ID),
    };
  }
  return json;
}

export async function fetchDexScreenerData(tokenAddress: string): Promise<any> {
  const cached = dexCache.get(tokenAddress);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.data;

  try {
    // Prefer chain-scoped token-pairs endpoint
    const res = await fetch(
      `https://api.dexscreener.com/token-pairs/v1/${DEXSCREENER_CHAIN_ID}/${tokenAddress}`,
      { signal: AbortSignal.timeout(8_000) }
    );
    if (res.ok) {
      const arr = await res.json();
      const data = { pairs: Array.isArray(arr) ? arr : [] };
      dexCache.set(tokenAddress, { data, ts: Date.now() });
      return data;
    }
    // Fallback to generic tokens endpoint + filter
    const res2 = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`, {
      signal: AbortSignal.timeout(8_000),
    });
    if (!res2.ok) return null;
    const json = filterRobinhoodPairs(await res2.json());
    dexCache.set(tokenAddress, { data: json, ts: Date.now() });
    return json;
  } catch {
    return null;
  }
}

export async function searchDexScreener(query: string): Promise<any> {
  const key = `search:${query}`;
  const cached = dexCache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.data;

  try {
    const res = await fetch(
      `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(query)}`,
      { signal: AbortSignal.timeout(8_000) }
    );
    if (!res.ok) return null;
    const json = filterRobinhoodPairs(await res.json());
    dexCache.set(key, { data: json, ts: Date.now() });
    return json;
  } catch {
    return null;
  }
}

// ── Price fetching via DexScreener (no Jupiter) ───────────────────────────────

interface PriceCache { price: number; ts: number }
const priceCache = new Map<string, PriceCache>();
const PRICE_TTL_MS = 60_000;

export async function getTokenPriceUsd(tokenAddress: string): Promise<number | null> {
  // Native ETH — never trust the first DexScreener pair for WETH (often a meme as base).
  if (tokenAddress === "eth" || tokenAddress === "native") {
    return getEthPriceUsd();
  }

  const id = tokenAddress;
  const cached = priceCache.get(id);
  if (cached && Date.now() - cached.ts < PRICE_TTL_MS) return cached.price;

  try {
    const data = await fetchDexScreenerData(id);
    const pairs: any[] = data?.pairs ?? [];
    // Prefer a pair where this token is the base (priceUsd is then this token's USD price)
    const pair =
      pairs.find((p) => p.baseToken?.address?.toLowerCase() === id.toLowerCase()) ??
      pairs[0];
    const price = pair?.priceUsd ? Number(pair.priceUsd) : null;
    if (price && price > 0) priceCache.set(id, { price, ts: Date.now() });
    return price && price > 0 ? price : null;
  } catch {
    return null;
  }
}

/** Reliable ETH/USD price for payment conversion */
export async function getEthPriceUsd(): Promise<number | null> {
  const cacheKey = "eth-usd";
  const cached = priceCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < PRICE_TTL_MS) return cached.price;

  // 1) CoinGecko (most reliable for ETH)
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd",
      { signal: AbortSignal.timeout(5_000) }
    );
    if (res.ok) {
      const json = await res.json();
      const usd = Number(json?.ethereum?.usd);
      if (usd > 0) {
        priceCache.set(cacheKey, { price: usd, ts: Date.now() });
        return usd;
      }
    }
  } catch {
    /* fall through */
  }

  // 2) DexScreener — find a pair where WETH is the *base* token
  try {
    const data = await fetchDexScreenerData(WETH_ADDRESS);
    const pairs: any[] = data?.pairs ?? [];
    const wethBase = pairs.find(
      (p) => p.baseToken?.address?.toLowerCase() === WETH_ADDRESS.toLowerCase() && Number(p.priceUsd) > 100
    );
    if (wethBase?.priceUsd) {
      const usd = Number(wethBase.priceUsd);
      priceCache.set(cacheKey, { price: usd, ts: Date.now() });
      return usd;
    }
    // Or derive from a liquid WETH quote pair: priceNative of base * roughly inverted
    const quoted = pairs.find(
      (p) =>
        p.quoteToken?.address?.toLowerCase() === WETH_ADDRESS.toLowerCase() &&
        Number(p.priceNative) > 0 &&
        Number(p.priceUsd) > 0
    );
    if (quoted) {
      const usd = Number(quoted.priceUsd) / Number(quoted.priceNative);
      if (usd > 100) {
        priceCache.set(cacheKey, { price: usd, ts: Date.now() });
        return usd;
      }
    }
  } catch {
    /* fall through */
  }

  return null;
}

export type PaymentCurrency = "eth" | "usdc" | "feather";

/** @deprecated legacy alias */
export type LegacyPaymentCurrency = "sol" | "usdc" | "trenchy";

function normalizeCurrency(currency: string): PaymentCurrency {
  if (currency === "sol") return "eth";
  if (currency === "trenchy") return "feather";
  if (currency === "eth" || currency === "usdc" || currency === "feather") return currency;
  return "eth";
}

export async function getRequiredPayment(
  currency: PaymentCurrency | LegacyPaymentCurrency,
  usdAmount: number
): Promise<{ amountRaw: bigint; amountDisplay: string } | null> {
  const cur = normalizeCurrency(currency);

  if (cur === "usdc") {
    const raw = BigInt(Math.ceil(usdAmount * 1_000_000));
    return { amountRaw: raw, amountDisplay: `${usdAmount} USDC` };
  }

  if (cur === "eth") {
    const price = await getTokenPriceUsd("eth");
    if (!price) return null;
    const ethAmt = usdAmount / price;
    const rawWei = parseEther(ethAmt.toFixed(18));
    return { amountRaw: rawWei, amountDisplay: `${Number(formatEther(rawWei)).toFixed(6)} ETH` };
  }

  // feather — assume 18 decimals (standard ERC-20); fall back to DexScreener price
  const price = await getTokenPriceUsd(FEATHER_MINT);
  if (!price) return null;
  const DECIMALS = 18;
  const rawUnits = BigInt(Math.ceil((usdAmount / price) * 10 ** DECIMALS));
  const displayAmt = Number(formatUnits(rawUnits, DECIMALS)).toFixed(0);
  return { amountRaw: rawUnits, amountDisplay: `${displayAmt} FEATHER` };
}

// ── Payment verification (EVM) ────────────────────────────────────────────────

export interface PaymentVerifyResult {
  ok: boolean;
  error?: string;
  amountRaw?: bigint;
}

export async function verifyPayment(
  txHash: string,
  currency: PaymentCurrency | LegacyPaymentCurrency,
  requiredAmountRaw: bigint
): Promise<PaymentVerifyResult> {
  const cur = normalizeCurrency(currency);

  if (!isTxHash(txHash)) {
    return { ok: false, error: "Invalid transaction hash. Expected 0x-prefixed 64-hex hash." };
  }

  const botWallet = BOT_WALLET;
  if (!botWallet) return { ok: false, error: "Bot wallet not configured." };

  let receipt: Awaited<ReturnType<typeof publicClient.getTransactionReceipt>>;
  try {
    receipt = await publicClient.getTransactionReceipt({ hash: txHash as Hash });
  } catch (e: any) {
    return { ok: false, error: `Could not fetch transaction: ${e.message}` };
  }

  if (!receipt) return { ok: false, error: "Transaction not found. Wait for confirmation and try again." };
  if (receipt.status !== "success") return { ok: false, error: "Transaction failed on-chain." };

  if (cur === "eth") {
    try {
      const tx = await publicClient.getTransaction({ hash: txHash as Hash });
      if (!tx.to || tx.to.toLowerCase() !== botWallet.toLowerCase()) {
        return { ok: false, error: "Transaction was not sent to the payment wallet." };
      }
      const received = tx.value;
      if (received < requiredAmountRaw) {
        return {
          ok: false,
          error: `Insufficient ETH: received ${formatEther(received)} ETH, need ${formatEther(requiredAmountRaw)} ETH.`,
        };
      }
      return { ok: true, amountRaw: received };
    } catch (e: any) {
      return { ok: false, error: `Could not read transaction: ${e.message}` };
    }
  }

  // ERC-20 Transfer event: Transfer(address,address,uint256)
  const transferTopic = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
  const expectedToken = (cur === "usdc" ? USDC_MINT : FEATHER_MINT).toLowerCase();
  const botTopic = `0x${botWallet.slice(2).toLowerCase().padStart(64, "0")}`;

  let received = BigInt(0);
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== expectedToken) continue;
    if (log.topics[0] !== transferTopic) continue;
    if ((log.topics[2] ?? "").toLowerCase() !== botTopic) continue;
    received += BigInt(log.data);
  }

  if (received < requiredAmountRaw) {
    return {
      ok: false,
      error: `Insufficient token payment: received ${received}, need ${requiredAmountRaw}.`,
    };
  }
  return { ok: true, amountRaw: received };
}

/** Verify an EIP-191 personal_sign message (EVM wallet auth) */
export async function verifyEvmSignature(
  wallet: string,
  message: string,
  signature: string
): Promise<boolean> {
  if (!isEvmAddress(wallet)) return false;
  try {
    return await verifyMessage({
      address: wallet as Address,
      message,
      signature: signature as `0x${string}`,
    });
  } catch {
    return false;
  }
}

export { publicClient, normalizeCurrency };
