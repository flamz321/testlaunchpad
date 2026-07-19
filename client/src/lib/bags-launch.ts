/**
 * Client-side token launch on Robinhood Chain via the on-chain factory.
 */
import {
  createPublicClient,
  http,
  parseEther,
  type Address,
  type Hex,
} from "viem";
import {
  DEFAULT_RPC_URL,
  ROBINHOOD_CHAIN,
  EXPLORER_TX_URL,
} from "@shared/chain";
import {
  encodeLaunchCalldata,
  parseTokenCreatedFromLogs,
  type ClaimerAllocation,
  type LaunchTxResult,
} from "@shared/bags";

const RPC_URL = (import.meta.env.VITE_RPC_URL as string | undefined) || DEFAULT_RPC_URL;

const publicClient = createPublicClient({
  chain: {
    id: ROBINHOOD_CHAIN.id,
    name: ROBINHOOD_CHAIN.name,
    nativeCurrency: ROBINHOOD_CHAIN.nativeCurrency,
    rpcUrls: { default: { http: [RPC_URL] } },
  },
  transport: http(RPC_URL, { batch: true }),
  pollingInterval: 500,
});

export interface PrepareLaunchResponse {
  metadataURI: string;
  imageUrl: string;
  creationFeeWei: string;
  factory: string;
  feeRecipients: { wallet: string; basisPoints: number }[];
  partner?: string | null;
  partnerBps?: number;
  partnerConfigured?: boolean;
}

export interface LaunchSuccess {
  mintAddress: string;
  txSignature: string;
  feeShare: string;
  curve: string;
  poolId: string;
  imageUrl: string;
  bagsUrl: string;
  explorerUrl: string;
  created: LaunchTxResult;
}

function toHexValue(wei: bigint): string {
  return `0x${wei.toString(16)}`;
}

export async function prepareLaunch(body: Record<string, unknown>): Promise<PrepareLaunchResponse> {
  const res = await fetch("/api/bags/prepare", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to prepare launch");
  return data as PrepareLaunchResponse;
}

export async function launchTokenWithWallet(params: {
  name: string;
  symbol: string;
  metadataURI: string;
  claimers: ClaimerAllocation[];
  creationFeeWei: bigint;
  initialBuyEth?: string;
  partner?: string | null;
  partnerBps?: number;
  sendTransaction: (tx: { to: string; value?: string; data?: string }) => Promise<string>;
  onStatus?: (msg: string) => void;
}): Promise<{ txHash: string; created: LaunchTxResult }> {
  const initialBuyWei = params.initialBuyEth && Number(params.initialBuyEth) > 0
    ? parseEther(params.initialBuyEth)
    : BigInt(0);

  const { to, data, functionName } = encodeLaunchCalldata({
    name: params.name,
    symbol: params.symbol,
    metadataURI: params.metadataURI,
    claimers: params.claimers,
    partner: params.partner || undefined,
    partnerBps: params.partnerBps ?? 0,
    initialBuyWei,
  });

  const value = params.creationFeeWei + initialBuyWei;
  params.onStatus?.(
    initialBuyWei > BigInt(0)
      ? `Confirm ${functionName} in your wallet (includes initial buy)…`
      : "Confirm launch transaction in your wallet…"
  );

  const txHash = await params.sendTransaction({
    to,
    data,
    value: toHexValue(value),
  });

  params.onStatus?.("Waiting for confirmation…");
  const receipt = await publicClient.waitForTransactionReceipt({
    hash: txHash as Hex,
    confirmations: 1,
  });

  if (receipt.status !== "success") {
    throw new Error("Launch transaction reverted on-chain. No token was created.");
  }

  const created = parseTokenCreatedFromLogs(
    receipt.logs.map((l) => ({
      address: l.address,
      topics: l.topics as Hex[],
      data: l.data,
    }))
  );
  if (!created) {
    throw new Error("Launch confirmed but token address was not found in the receipt.");
  }

  return { txHash, created };
}

export async function recordLaunch(body: Record<string, unknown>): Promise<void> {
  try {
    await fetch("/api/bags/record", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    /* non-fatal */
  }
}

export function buildLaunchSuccess(
  txHash: string,
  created: LaunchTxResult,
  imageUrl: string
): LaunchSuccess {
  return {
    mintAddress: created.token,
    txSignature: txHash,
    feeShare: created.feeShare,
    curve: created.curve,
    poolId: created.poolId,
    imageUrl,
    bagsUrl: `/dex/${created.token}`,
    explorerUrl: EXPLORER_TX_URL(txHash),
    created,
  };
}

export { publicClient as launchPublicClient };
