/**
 * Robinhood Chain launchpad helpers (Bags protocol contracts).
 * Product UI should not mention Bags — this is the on-chain launch/fee layer.
 */
import {
  encodeFunctionData,
  decodeEventLog,
  type Address,
  type Hex,
  type Abi,
  zeroAddress,
  getAddress,
  isAddress,
} from "viem";
import { ROBINHOOD_LAUNCHPAD } from "./chain";

import bagsFactoryJson from "./bags-abi/BagsFactory.json";
import bagsFeeShareJson from "./bags-abi/BagsFeeShare.json";
import bagsLensJson from "./bags-abi/BagsLens.json";
import bagsTokenJson from "./bags-abi/BagsToken.json";
import bagsBondingCurveJson from "./bags-abi/BagsBondingCurve.json";

export const bagsFactoryAbi = bagsFactoryJson as Abi;
export const bagsFeeShareAbi = bagsFeeShareJson as Abi;
export const bagsLensAbi = bagsLensJson as Abi;
export const bagsTokenAbi = bagsTokenJson as Abi;
export const bagsBondingCurveAbi = bagsBondingCurveJson as Abi;

/** Product launchpad id — never expose "bags" in UI */
export const FEATHER_LAUNCHPAD_ID = "feather";

export const TOTAL_BPS = 10_000;
export const MAX_CLAIMERS = 100;

export interface ClaimerAllocation {
  address: string;
  bps: number;
}

export interface LaunchTxResult {
  token: Address;
  curve: Address;
  creator: Address;
  feeShare: Address;
  poolId: Hex;
  name: string;
  symbol: string;
  metadataURI: string;
}

/** Client-side mirror of factory claimer rules. Returns error string or null. */
export function validateClaimers(
  claimers: ClaimerAllocation[],
  partner?: string
): string | null {
  if (claimers.length === 0) return "Add at least one fee recipient.";
  if (claimers.length > MAX_CLAIMERS) return `At most ${MAX_CLAIMERS} fee recipients.`;

  const partnerKey =
    partner && partner.toLowerCase() !== zeroAddress.toLowerCase()
      ? partner.toLowerCase()
      : null;

  const seen = new Set<string>();
  for (const c of claimers) {
    if (!isAddress(c.address)) return `"${c.address}" is not a valid address.`;
    const key = c.address.toLowerCase();
    if (key === zeroAddress.toLowerCase()) return "The zero address cannot receive fees.";
    if (partnerKey && key === partnerKey) return "Partner cannot also be a fee recipient.";
    if (seen.has(key)) return "Fee recipient addresses must be unique.";
    seen.add(key);
    if (!Number.isInteger(c.bps) || c.bps < 1 || c.bps > TOTAL_BPS) {
      return "Each recipient needs a whole basis-point share between 1 and 10000.";
    }
  }
  const total = claimers.reduce((sum, c) => sum + c.bps, 0);
  if (total !== TOTAL_BPS) {
    return `Fee shares must sum to exactly 10000 bps (currently ${total}).`;
  }
  return null;
}

/** Encode factory.create / createAndBuy calldata for wallet eth_sendTransaction */
export function encodeLaunchCalldata(params: {
  name: string;
  symbol: string;
  metadataURI: string;
  claimers: ClaimerAllocation[];
  partner?: string;
  partnerBps?: number;
  initialBuyWei?: bigint;
}): { to: Address; data: Hex; functionName: "create" | "createAndBuy" } {
  const claimersError = validateClaimers(params.claimers, params.partner);
  if (claimersError) throw new Error(claimersError);

  const partner = (params.partner ? getAddress(params.partner) : zeroAddress) as Address;
  const partnerBps = params.partnerBps ?? 0;
  const initialBuyWei = params.initialBuyWei ?? BigInt(0);
  const functionName = initialBuyWei > BigInt(0) ? "createAndBuy" : "create";

  const data = encodeFunctionData({
    abi: bagsFactoryAbi,
    functionName,
    args: [
      params.name,
      params.symbol,
      params.metadataURI,
      partner,
      partnerBps,
      params.claimers.map((c) => getAddress(c.address)),
      params.claimers.map((c) => c.bps),
    ],
  });

  return {
    to: ROBINHOOD_LAUNCHPAD.factory as Address,
    data,
    functionName,
  };
}

/** Parse TokenCreated from a transaction receipt's logs */
export function parseTokenCreatedFromLogs(
  logs: Array<{ address: string; topics: Hex[]; data: Hex }>
): LaunchTxResult | null {
  for (const log of logs) {
    try {
      const decoded = decodeEventLog({
        abi: bagsFactoryAbi,
        data: log.data,
        topics: log.topics as [Hex, ...Hex[]],
      });
      if (decoded.eventName !== "TokenCreated") continue;
      const args = decoded.args as unknown as {
        token: Address;
        curve: Address;
        creator: Address;
        feeShare: Address;
        poolId: Hex;
        name: string;
        symbol: string;
        metadataURI: string;
      };
      return {
        token: args.token,
        curve: args.curve,
        creator: args.creator,
        feeShare: args.feeShare,
        poolId: args.poolId,
        name: args.name,
        symbol: args.symbol,
        metadataURI: args.metadataURI,
      };
    } catch {
      /* not this event */
    }
  }
  return null;
}

export function encodeClaimFeesCalldata(unwrap = true): Hex {
  return encodeFunctionData({
    abi: bagsFeeShareAbi,
    functionName: "claim",
    args: [unwrap],
  });
}
