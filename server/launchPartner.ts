/**
 * Feather / Bags partner fee config for Robinhood Chain launches.
 * On EVM, partner is set in factory.create(partner, partnerBps, …) —
 * this is NOT the Solana Bags API partner-key flow (no BAGS_API_KEY needed).
 */
import { isEvmAddress, normalizeWallet } from "@shared/chain";

const ZERO = "0x0000000000000000000000000000000000000000";

export function getLaunchPartnerConfig(): {
  partner: string;
  partnerBps: number;
  configured: boolean;
} {
  const raw =
    process.env.FEATHER_PARTNER_WALLET?.trim() ||
    process.env.BAGS_PARTNER_WALLET?.trim() ||
    process.env.PARTNER_WALLET?.trim() ||
    "";

  const bpsRaw =
    process.env.FEATHER_PARTNER_BPS?.trim() ||
    process.env.BAGS_PARTNER_BPS?.trim() ||
    process.env.PARTNER_BPS?.trim() ||
    "0";

  let partnerBps = Number(bpsRaw);
  if (!Number.isFinite(partnerBps) || partnerBps < 0) partnerBps = 0;
  partnerBps = Math.min(10_000, Math.floor(partnerBps));

  if (!isEvmAddress(raw) || normalizeWallet(raw) === ZERO || partnerBps <= 0) {
    return { partner: ZERO, partnerBps: 0, configured: false };
  }

  return {
    partner: normalizeWallet(raw),
    partnerBps,
    configured: true,
  };
}
