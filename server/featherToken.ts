/**
 * Resolve the live $FEATHER contract address.
 * Admin can override via site_settings.featherTokenAddress; env is the fallback.
 */
import { FEATHER_TOKEN_ADDRESS, isEvmAddress, normalizeWallet } from "@shared/chain";
import { storage } from "./storage";

const ZERO = "0x0000000000000000000000000000000000000000";

let cachedMint: { address: string; ts: number } | null = null;
const CACHE_MS = 15_000;

export function envFeatherTokenAddress(): string {
  const fromEnv = (FEATHER_TOKEN_ADDRESS || "").trim();
  return isEvmAddress(fromEnv) ? normalizeWallet(fromEnv) : ZERO;
}

export async function resolveFeatherTokenAddress(): Promise<string> {
  const now = Date.now();
  if (cachedMint && now - cachedMint.ts < CACHE_MS) {
    return cachedMint.address;
  }
  try {
    const settings = await storage.getSiteSettings();
    const fromDb = (settings.featherTokenAddress || "").trim();
    if (isEvmAddress(fromDb) && normalizeWallet(fromDb) !== ZERO) {
      cachedMint = { address: normalizeWallet(fromDb), ts: now };
      return cachedMint.address;
    }
  } catch {
    /* fall through to env */
  }
  const fallback = envFeatherTokenAddress();
  cachedMint = { address: fallback, ts: now };
  return fallback;
}

/** Clear cache after admin updates the CA */
export function invalidateFeatherTokenCache(): void {
  cachedMint = null;
}

export function isFeatherTokenConfigured(address: string): boolean {
  return isEvmAddress(address) && normalizeWallet(address) !== ZERO;
}
