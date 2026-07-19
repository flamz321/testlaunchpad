/**
 * Uniswap Trading API client (server-side only).
 * Docs: https://developers.uniswap.org/docs/trading/swapping-api/getting-started
 *
 * API key stays in env — never expose to the client.
 */
import { ROBINHOOD_CHAIN_ID, isEvmAddress } from "@shared/chain";

const TRADE_API_BASE = "https://trade-api.gateway.uniswap.org/v1";

/**
 * Robinhood Chain only deploys Universal Router v2.1.1.
 * Sending "2.0" causes Trading API to return 404 "No quotes available"
 * even when Uniswap.app can quote the same pair.
 */
const UNIVERSAL_ROUTER_VERSION = "2.1.1";

/** Native ETH sentinel for Trading API quotes */
export const NATIVE_ETH = "0x0000000000000000000000000000000000000000";
export const WETH_ROBINHOOD = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73";

export function getUniswapApiKey(): string | null {
  const key =
    process.env.UNISWAP_API_KEY?.trim() ||
    process.env.UNISWAP_TRADING_API_KEY?.trim() ||
    "";
  if (!key) return null;
  // Reject common placeholders so we don't pretend quoting works
  const lowered = key.toLowerCase();
  if (
    lowered === "your_key_here" ||
    lowered === "your_uniswap_api_key_here" ||
    lowered.includes("your_") ||
    lowered === "changeme" ||
    lowered === "xxx"
  ) {
    return null;
  }
  return key;
}

export function isUniswapTradeConfigured(): boolean {
  return Boolean(getUniswapApiKey());
}

type TradeApiResult =
  | { ok: true; status: number; data: any }
  | { ok: false; status: number; error: string; data?: any };

async function tradeApiFetch(
  path: string,
  body: Record<string, unknown>
): Promise<TradeApiResult> {
  const apiKey = getUniswapApiKey();
  if (!apiKey) {
    return { ok: false, status: 503, error: "Uniswap Trading API key is not configured" };
  }

  const res = await fetch(`${TRADE_API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "x-universal-router-version": UNIVERSAL_ROUTER_VERSION,
    },
    body: JSON.stringify(body),
  });

  let data: any = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const detail =
      (typeof data?.detail === "string" && data.detail) ||
      (Array.isArray(data?.detail) && data.detail.map((d: any) => d?.msg || d).join("; ")) ||
      data?.message ||
      data?.error ||
      (typeof data === "string" ? data : null) ||
      `Uniswap API error (${res.status})`;
    console.error(`[uniswap-trade] ${path} failed:`, res.status, detail);
    return { ok: false, status: res.status, error: String(detail), data };
  }

  return { ok: true, status: res.status, data };
}

function assertAddress(label: string, value: string) {
  if (!isEvmAddress(value)) {
    throw new Error(`Invalid ${label}`);
  }
}

function assertAmount(amount: string) {
  if (!/^[0-9]+$/.test(amount) || amount === "0") {
    throw new Error("Amount must be a positive integer in base units (wei)");
  }
}

export async function checkApproval(params: {
  walletAddress: string;
  token: string;
  amount: string;
  chainId?: number;
}) {
  assertAddress("walletAddress", params.walletAddress);
  assertAddress("token", params.token);
  assertAmount(params.amount);
  return tradeApiFetch("/check_approval", {
    walletAddress: params.walletAddress,
    token: params.token,
    amount: params.amount,
    chainId: params.chainId ?? ROBINHOOD_CHAIN_ID,
  });
}

export async function getQuote(params: {
  swapper: string;
  tokenIn: string;
  tokenOut: string;
  amount: string;
  type?: "EXACT_INPUT" | "EXACT_OUTPUT";
  slippageTolerance?: number;
  chainId?: number;
}) {
  assertAddress("swapper", params.swapper);
  assertAddress("tokenIn", params.tokenIn);
  assertAddress("tokenOut", params.tokenOut);
  assertAmount(params.amount);

  const chainId = params.chainId ?? ROBINHOOD_CHAIN_ID;
  // Prefer on-chain AMM routes (v2/v3/v4) so we get Universal Router calldata.
  // Fall back without protocols if the first request is rejected.
  const baseBody = {
    swapper: params.swapper,
    tokenIn: params.tokenIn,
    tokenOut: params.tokenOut,
    tokenInChainId: chainId,
    tokenOutChainId: chainId,
    amount: params.amount,
    type: params.type || "EXACT_INPUT",
    slippageTolerance: params.slippageTolerance ?? 1,
    routingPreference: "BEST_PRICE",
  };

  const withProtocols = await tradeApiFetch("/quote", {
    ...baseBody,
    protocols: ["V2", "V3", "V4"],
  });
  if (withProtocols.ok) return withProtocols;

  // Retry without protocols (lets Uniswap pick, including UniswapX on Robinhood)
  const withoutProtocols = await tradeApiFetch("/quote", baseBody);
  if (withoutProtocols.ok) return withoutProtocols;

  // Last resort: try WETH address instead of native zero-address for ETH legs
  const zero = NATIVE_ETH;
  const tokenIn =
    params.tokenIn.toLowerCase() === zero.toLowerCase() ? WETH_ROBINHOOD : params.tokenIn;
  const tokenOut =
    params.tokenOut.toLowerCase() === zero.toLowerCase() ? WETH_ROBINHOOD : params.tokenOut;
  if (tokenIn !== params.tokenIn || tokenOut !== params.tokenOut) {
    return tradeApiFetch("/quote", {
      ...baseBody,
      tokenIn,
      tokenOut,
      protocols: ["V2", "V3", "V4"],
    });
  }

  return withProtocols;
}

/**
 * Build /swap request from a quote response.
 * Spreads quote fields; handles Permit2 / UniswapX rules.
 */
export function prepareSwapRequest(
  quoteResponse: Record<string, any>,
  signature?: string | null
): Record<string, unknown> {
  const { permitData, permitTransaction, ...cleanQuote } = quoteResponse;
  const request: Record<string, unknown> = { ...cleanQuote };

  const routing = String(quoteResponse.routing || "");
  const isUniswapX =
    routing === "DUTCH_V2" || routing === "DUTCH_V3" || routing === "PRIORITY";

  if (isUniswapX) {
    if (signature) request.signature = signature;
  } else if (signature && permitData && typeof permitData === "object") {
    request.signature = signature;
    request.permitData = permitData;
  }

  return request;
}

export async function getSwapTransaction(
  quoteResponse: Record<string, any>,
  signature?: string | null
) {
  const body = prepareSwapRequest(quoteResponse, signature);
  return tradeApiFetch("/swap", body);
}

/** Extract human-readable output amount (base units) from a quote response */
export function extractQuoteAmounts(quoteResponse: any): {
  amountIn: string | null;
  amountOut: string | null;
  routing: string | null;
  gasFeeUSD: string | null;
} {
  const routing = quoteResponse?.routing ? String(quoteResponse.routing) : null;
  const q = quoteResponse?.quote;

  if (!q) {
    return { amountIn: null, amountOut: null, routing, gasFeeUSD: null };
  }

  // CLASSIC / WRAP / UNWRAP
  if (q.output?.amount != null || q.input?.amount != null) {
    return {
      amountIn: q.input?.amount != null ? String(q.input.amount) : null,
      amountOut: q.output?.amount != null ? String(q.output.amount) : null,
      routing,
      gasFeeUSD: q.gasFeeUSD != null ? String(q.gasFeeUSD) : null,
    };
  }

  // UniswapX
  const out = q.orderInfo?.outputs?.[0]?.startAmount;
  const inn = q.orderInfo?.input?.startAmount;
  return {
    amountIn: inn != null ? String(inn) : null,
    amountOut: out != null ? String(out) : null,
    routing,
    gasFeeUSD: null,
  };
}
