/** Compact token / USD amount formatting (avoids scientific notation). */

export function formatTokenAmount(value: number | string | null | undefined, opts?: {
  maxFrac?: number;
}): string {
  if (value == null || value === "") return "—";
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  const maxFrac = opts?.maxFrac ?? 2;

  if (abs === 0) return "0";
  if (abs >= 1_000_000_000) return `${sign}${(abs / 1_000_000_000).toFixed(maxFrac)}B`;
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(maxFrac)}M`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(maxFrac)}K`;
  if (abs >= 1) {
    const fixed = abs >= 100 ? abs.toFixed(2) : abs.toFixed(4);
    return `${sign}${fixed.replace(/\.?0+$/, "")}`;
  }
  if (abs >= 0.0001) return `${sign}${abs.toFixed(6).replace(/\.?0+$/, "")}`;
  return `${sign}${abs.toExponential(2)}`;
}

export function formatUsdCompact(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(2)}K`;
  if (abs >= 1) return `${sign}$${abs.toFixed(2)}`;
  if (abs >= 0.0001) return `${sign}$${abs.toFixed(4)}`;
  if (abs === 0) return "$0";
  return `${sign}$${abs.toExponential(2)}`;
}
