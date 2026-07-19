import { useQuery } from "@tanstack/react-query";
import { FEATHER_TOKEN_ADDRESS, isEvmAddress, normalizeWallet } from "@shared/chain";
import { useSettings } from "@/hooks/use-settings";

const ZERO = "0x0000000000000000000000000000000000000000";

function pickAddress(raw: string | undefined | null): string {
  const v = (raw || "").trim();
  if (isEvmAddress(v) && normalizeWallet(v) !== ZERO) return v;
  const env = (FEATHER_TOKEN_ADDRESS || "").trim();
  if (isEvmAddress(env) && normalizeWallet(env) !== ZERO) return env;
  return ZERO;
}

/** Live $FEATHER CA from admin settings (falls back to env). */
export function useFeatherToken() {
  const { settings, isLoading } = useSettings();
  const address = pickAddress((settings as any).featherTokenAddress);
  const configured = address !== ZERO;

  return {
    address,
    configured,
    isLoading,
    explorerUrl: configured
      ? `https://robinhoodchain.blockscout.com/token/${address}`
      : null,
    swapUrl: configured
      ? `/swap?token=${address}`
      : "/swap",
    dexUrl: configured ? `/dex/${address}` : "/dex",
  };
}

/** Connected wallet's $FEATHER balance on Robinhood Chain */
export function useFeatherBalance(walletAddress: string | null | undefined) {
  const { address: mint, configured } = useFeatherToken();
  return useQuery({
    queryKey: ["/api/wallet/feather-balance", walletAddress, mint],
    enabled: Boolean(walletAddress && configured && isEvmAddress(walletAddress)),
    staleTime: 20_000,
    refetchInterval: 45_000,
    queryFn: async () => {
      const res = await fetch(`/api/wallet/${walletAddress}/feather-balance`);
      if (!res.ok) throw new Error("Failed to load $FEATHER balance");
      return res.json() as Promise<{ balance: number; address: string; mint: string }>;
    },
  });
}
