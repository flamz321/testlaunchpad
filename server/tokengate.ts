import {
  createPublicClient,
  http,
  formatUnits,
  type Address,
} from "viem";
import { storage } from "./storage";
import {
  DEFAULT_RPC_URL,
  ROBINHOOD_CHAIN,
  FEATHER_TOKEN_ADDRESS,
  ERC20_ABI,
  isEvmAddress,
  isTxHash,
  EXPLORER_TX_URL,
} from "@shared/chain";
import { resolveFeatherTokenAddress, isFeatherTokenConfigured } from "./featherToken";

/** Sync env fallback — prefer resolveFeatherTokenAddress() for live admin CA */
export const FEATHER_MINT = FEATHER_TOKEN_ADDRESS;
/** @deprecated */
export const TRENCHY_MINT = FEATHER_MINT;

export const BOT_WALLET =
  process.env.BOT_WALLET_ADDRESS ||
  process.env.ADMIN_WALLET ||
  "0x752C3b6CB472D426AD0438f202A46dFa7D58aF34";

export const TX_MAX_AGE_MS = 5 * 60 * 1000;
export const VERIFICATION_EXPIRY_MS = 24 * 60 * 60 * 1000;

const publicClient = createPublicClient({
  chain: {
    id: ROBINHOOD_CHAIN.id,
    name: ROBINHOOD_CHAIN.name,
    nativeCurrency: ROBINHOOD_CHAIN.nativeCurrency,
    rpcUrls: ROBINHOOD_CHAIN.rpcUrls,
  },
  transport: http(DEFAULT_RPC_URL),
});

export interface TierInfo {
  name: string;
  dailyLimit: number;
  hourlyLimit: number | null;
  minBalance: number;
}

export const TIERS: TierInfo[] = [
  { name: "Free",        dailyLimit: 1,  hourlyLimit: 1,    minBalance: 0 },
  { name: "Holder",     dailyLimit: 8,  hourlyLimit: null, minBalance: 250_000 },
  { name: "Whale",      dailyLimit: 24, hourlyLimit: null, minBalance: 1_000_000 },
];

export function getTier(balance: number): TierInfo {
  if (balance >= 1_000_000) return TIERS[2];
  if (balance >= 250_000)   return TIERS[1];
  return TIERS[0];
}

export function formatBalance(balance: number): string {
  if (balance >= 1_000_000) return `${(balance / 1_000_000).toFixed(2)}M`;
  if (balance >= 1_000)     return `${(balance / 1_000).toFixed(1)}K`;
  return balance.toFixed(0);
}

function extractTxHash(input: string): string {
  const trimmed = input.trim();
  const urlMatch = trimmed.match(/\/tx\/(0x[a-fA-F0-9]{64})/);
  if (urlMatch) return urlMatch[1];
  if (isTxHash(trimmed)) return trimmed;
  throw new Error(
    "Invalid transaction hash or link. Please paste the full TX hash or a Blockscout explorer link."
  );
}

/** ERC-20 $FEATHER balance for an EVM wallet (Robinhood Chain) */
export async function getFeatherBalance(walletAddress: string): Promise<number> {
  if (!isEvmAddress(walletAddress)) return 0;
  const mint = await resolveFeatherTokenAddress();
  if (!isFeatherTokenConfigured(mint)) return 0;
  try {
    const [raw, decimals] = await Promise.all([
      publicClient.readContract({
        address: mint as Address,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [walletAddress as Address],
      }) as Promise<bigint>,
      publicClient.readContract({
        address: mint as Address,
        abi: ERC20_ABI,
        functionName: "decimals",
      }) as Promise<number>,
    ]);
    return Number(formatUnits(raw, decimals));
  } catch {
    return 0;
  }
}

/** @deprecated use getFeatherBalance */
export async function getTrenchyBalance(walletAddress: string): Promise<number> {
  return getFeatherBalance(walletAddress);
}

export async function verifyOwnershipTransaction(
  txInput: string,
  claimedWallet: string
): Promise<{ valid: boolean; error?: string }> {
  let hash: string;
  try {
    hash = extractTxHash(txInput);
  } catch (err: any) {
    return { valid: false, error: err.message };
  }

  if (!isEvmAddress(claimedWallet)) {
    return { valid: false, error: "Invalid EVM wallet address." };
  }

  if (await storage.isSignatureUsed(hash)) {
    return {
      valid: false,
      error:
        "This transaction has already been used for verification. Please send a fresh transaction to the bot wallet.",
    };
  }

  let tx: Awaited<ReturnType<typeof publicClient.getTransaction>>;
  let receipt: Awaited<ReturnType<typeof publicClient.getTransactionReceipt>>;
  try {
    [tx, receipt] = await Promise.all([
      publicClient.getTransaction({ hash: hash as `0x${string}` }),
      publicClient.getTransactionReceipt({ hash: hash as `0x${string}` }),
    ]);
  } catch {
    return {
      valid: false,
      error: "Could not fetch this transaction from the network. Please check the hash and try again.",
    };
  }

  if (!tx || !receipt) {
    return {
      valid: false,
      error:
        "Transaction not found or not yet confirmed. Please wait a few seconds and try again.",
    };
  }

  if (receipt.status !== "success") {
    return { valid: false, error: "Transaction failed on-chain." };
  }

  const block = await publicClient.getBlock({ blockNumber: receipt.blockNumber });
  const ageMs = Date.now() - Number(block.timestamp) * 1000;
  if (ageMs > TX_MAX_AGE_MS) {
    const mins = Math.floor(ageMs / 60_000);
    return {
      valid: false,
      error: `This transaction is ${mins} minute(s) old — it must be within 5 minutes. Please send a new transaction.`,
    };
  }

  if (tx.from.toLowerCase() !== claimedWallet.toLowerCase()) {
    return {
      valid: false,
      error:
        "This transaction was not sent by the wallet you provided. Please make sure you send from the correct address.",
    };
  }

  if (!tx.to || tx.to.toLowerCase() !== BOT_WALLET.toLowerCase()) {
    return {
      valid: false,
      error: `The transaction must be sent TO our bot wallet:\n\`${BOT_WALLET}\`\n\nExplorer: ${EXPLORER_TX_URL(hash)}\n\nPlease try again.`,
    };
  }

  await storage.markSignatureUsed(hash);
  return { valid: true };
}
