/**
 * Username helpers for Feather App social profiles.
 * Usernames are always stored lowercase; wallets are compared via normalizeWallet.
 */

const ADJECTIVES = [
  "swift", "bright", "quiet", "bold", "keen", "calm", "wild", "cool",
  "fast", "lucky", "noble", "sharp", "sonic", "prime", "nova", "apex",
];
const NOUNS = [
  "feather", "trader", "whale", "fox", "hawk", "wolf", "spark", "comet",
  "pulse", "token", "chain", "orbit", "mint", "vault", "alpha", "signal",
];

/** Generate a random available-looking username (caller must verify uniqueness). */
export function generateRandomUsername(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const n = Math.floor(Math.random() * 9000) + 1000;
  const candidate = `${adj}_${noun}${n}`.slice(0, 15);
  return candidate.toLowerCase().replace(/[^a-z0-9_]/g, "_");
}

export function isValidUsername(username: string): boolean {
  return /^[a-z0-9_]{1,15}$/.test(username);
}

/** Canonical public profile path — prefers username over wallet. */
export function profilePath(profile: {
  username?: string | null;
  walletAddress?: string | null;
} | null | undefined): string {
  if (!profile) return "/community";
  const u = profile.username?.trim();
  if (u) return `/u/${u.toLowerCase()}`;
  if (profile.walletAddress) return `/u/${profile.walletAddress}`;
  return "/community";
}

/** True when param looks like an EVM address (any casing). */
export function looksLikeWalletAddress(param: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(param.trim());
}
