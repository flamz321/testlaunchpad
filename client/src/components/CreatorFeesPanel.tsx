import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatEther, type Hex } from "viem";
import { useWalletConnect } from "@/hooks/use-wallet-connect";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Coins, Loader2, Wallet, ExternalLink } from "lucide-react";
import { launchPublicClient } from "@/lib/bags-launch";

interface CreatorFeesData {
  exists: boolean;
  migrated?: boolean;
  bondingProgressPct?: number;
  feeShare: string | null;
  claimable: string;
  claimers: { address: string; bps: number }[];
  isClaimer: boolean;
  userBps: number;
  claimCalldata?: string;
}

export function CreatorFeesPanel({ tokenAddress }: { tokenAddress: string }) {
  const wallet = useWalletConnect();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [claiming, setClaiming] = useState(false);

  const { data, isLoading, refetch } = useQuery<CreatorFeesData>({
    queryKey: ["/api/token/creator-fees", tokenAddress, wallet.publicKey],
    queryFn: () =>
      fetch(
        `/api/token/${tokenAddress}/creator-fees?wallet=${wallet.publicKey ?? ""}`
      ).then((r) => r.json()),
    enabled: !!tokenAddress,
    refetchInterval: 20_000,
  });

  if (isLoading) {
    return (
      <div className="bg-card border border-border/60 rounded-xl px-4 py-4 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading creator fees…
      </div>
    );
  }

  if (!data?.exists || !data.feeShare) return null;

  const ZERO = BigInt(0);
  const claimableWei = BigInt(data.claimable || "0");
  const claimableEth = Number(formatEther(claimableWei));
  const claimableLabel =
    claimableWei === ZERO
      ? "0 ETH"
      : claimableEth < 0.000001
        ? `${claimableWei.toString()} wei`
        : `${claimableEth.toFixed(6)} ETH`;

  async function handleClaim() {
    if (!wallet.connected || !wallet.publicKey) {
      wallet.connect();
      return;
    }
    if (!data?.feeShare || !data.claimCalldata) return;
    if (claimableWei <= ZERO) {
      toast({ title: "Nothing to claim", description: "No accrued creator fees yet.", variant: "destructive" });
      return;
    }

    setClaiming(true);
    try {
      const txHash = await wallet.sendTransaction({
        to: data.feeShare,
        data: data.claimCalldata,
      });
      toast({ title: "Claim submitted", description: "Waiting for confirmation…" });
      await launchPublicClient.waitForTransactionReceipt({ hash: txHash as Hex });
      toast({
        title: "Fees claimed",
        description: `Tx: ${txHash.slice(0, 10)}…`,
      });
      await refetch();
      qc.invalidateQueries({ queryKey: ["/api/token/creator-fees", tokenAddress] });
    } catch (err: any) {
      toast({
        title: "Claim failed",
        description: err?.message ?? "Transaction rejected or reverted",
        variant: "destructive",
      });
    } finally {
      setClaiming(false);
    }
  }

  const showClaim = data.isClaimer || claimableWei > ZERO;

  return (
    <div className="bg-card border border-border/60 rounded-xl px-4 py-4 space-y-3" data-testid="panel-creator-fees">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Coins className="w-4 h-4 text-primary" />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Creator Fees
          </span>
        </div>
        {typeof data.bondingProgressPct === "number" && (
          <span className="text-[10px] text-muted-foreground">
            {data.migrated ? "Graduated" : `${data.bondingProgressPct}% bonded`}
          </span>
        )}
      </div>

      {data.claimers.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Fee recipients</p>
          {data.claimers.map((c) => (
            <div key={c.address} className="flex items-center justify-between text-xs gap-2">
              <code className="font-mono truncate text-foreground/80">{c.address}</code>
              <span className="text-primary font-semibold shrink-0">{(c.bps / 100).toFixed(c.bps % 100 === 0 ? 0 : 2)}%</span>
            </div>
          ))}
        </div>
      )}

      {wallet.connected ? (
        showClaim ? (
          <div className="space-y-2 pt-1 border-t border-border/50">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Your claimable</span>
              <span className="font-mono font-semibold text-foreground">{claimableLabel}</span>
            </div>
            {data.userBps > 0 && (
              <p className="text-[10px] text-muted-foreground">
                Your share: {(data.userBps / 100).toFixed(2)}% of creator fees
              </p>
            )}
            <Button
              data-testid="button-claim-creator-fees"
              onClick={handleClaim}
              disabled={claiming || claimableWei <= ZERO}
              className="w-full gap-2 font-semibold"
            >
              {claiming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Coins className="w-4 h-4" />}
              {claimableWei <= ZERO ? "No fees to claim yet" : claiming ? "Claiming…" : "Claim Fees (ETH)"}
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground pt-1 border-t border-border/50">
            Connected wallet is not a fee recipient for this token.
          </p>
        )
      ) : (
        <Button
          variant="outline"
          className="w-full gap-2"
          onClick={() => wallet.connect()}
          data-testid="button-connect-claim-fees"
        >
          <Wallet className="w-4 h-4" /> Connect to claim fees
        </Button>
      )}

      {data.feeShare && (
        <a
          href={`https://robinhoodchain.blockscout.com/address/${data.feeShare}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
        >
          <ExternalLink className="w-3 h-3" /> Fee share contract
        </a>
      )}
    </div>
  );
}
