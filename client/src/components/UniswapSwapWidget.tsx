import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWalletConnect } from "@/hooks/use-wallet-connect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createPublicClient,
  http,
  encodeFunctionData,
  parseEther,
  formatEther,
  formatUnits,
  parseUnits,
  type Address,
} from "viem";
import {
  DEFAULT_RPC_URL,
  DEXSCREENER_CHAIN_ID,
  EXPLORER_TX_URL,
  ROBINHOOD_CHAIN,
  ROBINHOOD_LAUNCHPAD,
  isEvmAddress,
} from "@shared/chain";
import { bagsBondingCurveAbi, bagsLensAbi } from "@shared/bags";
import {
  ArrowDownUp,
  ArrowLeftRight,
  ExternalLink,
  Loader2,
  Wallet,
} from "lucide-react";
import { formatTokenAmount } from "@/lib/format";

const NATIVE_ETH = "0x0000000000000000000000000000000000000000";

const publicClient = createPublicClient({
  chain: {
    id: ROBINHOOD_CHAIN.id,
    name: ROBINHOOD_CHAIN.name,
    nativeCurrency: ROBINHOOD_CHAIN.nativeCurrency,
    rpcUrls: { default: { http: [DEFAULT_RPC_URL] } },
  },
  transport: http(DEFAULT_RPC_URL),
});

const erc20Abi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

type SwapMode = "buy" | "sell";

interface UniswapSwapWidgetProps {
  defaultTokenAddress?: string | null;
  defaultTokenSymbol?: string | null;
  className?: string;
}

function uniswapUrl(token: string, mode: SwapMode): string {
  const params = new URLSearchParams();
  params.set("chain", DEXSCREENER_CHAIN_ID);
  if (mode === "buy") {
    params.set("inputCurrency", "NATIVE");
    params.set("outputCurrency", token);
  } else {
    params.set("inputCurrency", token);
    params.set("outputCurrency", "NATIVE");
  }
  return `https://app.uniswap.org/swap?${params.toString()}`;
}

/**
 * Swap UI for Robinhood Chain.
 * - Feather bonding-curve tokens: on-site via curve contract
 * - Migrated / DEX tokens: Uniswap Trading API (v2/v3/v4 quotes + Universal Router tx)
 */
export function UniswapSwapWidget({
  defaultTokenAddress,
  defaultTokenSymbol,
  className = "",
}: UniswapSwapWidgetProps) {
  const wallet = useWalletConnect();
  const token =
    defaultTokenAddress && isEvmAddress(defaultTokenAddress)
      ? defaultTokenAddress
      : null;
  const symbol = defaultTokenSymbol || "TOKEN";

  const [mode, setMode] = useState<SwapMode>("buy");
  const [amount, setAmount] = useState("");
  const [quoting, setQuoting] = useState(false);
  const [quoteOut, setQuoteOut] = useState<string | null>(null);
  const [routing, setRouting] = useState<string | null>(null);
  const [gasFeeUSD, setGasFeeUSD] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [swapping, setSwapping] = useState(false);
  const [ethBal, setEthBal] = useState<string | null>(null);
  const [tokenBal, setTokenBal] = useState<string | null>(null);

  const { data: curveInfo, isLoading: curveLoading } = useQuery({
    queryKey: ["swap-curve-info", token],
    enabled: !!token,
    staleTime: 20_000,
    retry: 1,
    queryFn: async () => {
      try {
        const state = (await publicClient.readContract({
          address: ROBINHOOD_LAUNCHPAD.lens as Address,
          abi: bagsLensAbi,
          functionName: "getTokenState",
          args: [token as Address],
        })) as { exists: boolean; migrated: boolean; curve: Address };
        if (state?.exists && !state.migrated && state.curve) {
          return { onCurve: true as const, curve: state.curve };
        }
      } catch {
        // Non-factory / unknown tokens — treat as DEX
      }
      return { onCurve: false as const, curve: null as Address | null };
    },
  });

  const { data: tradeStatus, isLoading: tradeStatusLoading } = useQuery({
    queryKey: ["/api/swap/status"],
    staleTime: 30_000,
    queryFn: async () => {
      const res = await fetch("/api/swap/status");
      if (!res.ok) return { configured: false as const };
      return res.json() as Promise<{ configured: boolean }>;
    },
  });

  const onCurve = curveInfo?.onCurve === true;
  const curve = curveInfo?.curve ?? null;
  const tradeApiReady = tradeStatus?.configured === true;
  const uniHref = useMemo(
    () => (token ? uniswapUrl(token, mode) : "https://app.uniswap.org/swap?chain=robinhood"),
    [token, mode]
  );

  useEffect(() => {
    if (!wallet.publicKey) {
      setEthBal(null);
      setTokenBal(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const eth = await publicClient.getBalance({ address: wallet.publicKey as Address });
        if (!cancelled) setEthBal(formatEther(eth));
        if (token) {
          const bal = (await publicClient.readContract({
            address: token as Address,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [wallet.publicKey as Address],
          })) as bigint;
          if (!cancelled) setTokenBal(formatUnits(bal, 18));
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [wallet.publicKey, token, txHash]);

  // Reset quote when inputs change
  useEffect(() => {
    setQuoteOut(null);
    setRouting(null);
    setGasFeeUSD(null);
    setError(null);
  }, [token, mode, amount, onCurve]);

  // Bonding-curve quotes
  useEffect(() => {
    if (!token || !onCurve || !curve || !amount || Number(amount) <= 0) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      setQuoting(true);
      setError(null);
      try {
        if (mode === "buy") {
          const quoteIn = parseEther(amount);
          const result = (await publicClient.readContract({
            address: curve,
            abi: bagsBondingCurveAbi,
            functionName: "quoteBuy",
            args: [quoteIn],
          })) as readonly [bigint, bigint, bigint, bigint, bigint];
          if (!cancelled) {
            setQuoteOut(formatUnits(result[0], 18));
          }
        } else {
          const tokensIn = parseUnits(amount, 18);
          const result = (await publicClient.readContract({
            address: curve,
            abi: bagsBondingCurveAbi,
            functionName: "quoteSell",
            args: [tokensIn],
          })) as readonly [bigint, bigint, bigint];
          if (!cancelled) {
            setQuoteOut(formatEther(result[0]));
          }
        }
      } catch (e: any) {
        if (!cancelled) {
          setQuoteOut(null);
          setError(e?.shortMessage || e?.message || "Quote failed");
        }
      } finally {
        if (!cancelled) setQuoting(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [token, onCurve, curve, amount, mode]);

  // Uniswap Trading API quotes (migrated / DEX)
  useEffect(() => {
    if (!token || onCurve || !tradeApiReady || !amount || Number(amount) <= 0) return;
    // Prefer connected wallet; Uniswap rejects the zero address as swapper
    const swapper =
      wallet.publicKey || "0x1111111111111111111111111111111111111111";
    let cancelled = false;
    const t = setTimeout(async () => {
      setQuoting(true);
      setError(null);
      try {
        const amountWei = parseUnits(amount, 18).toString();
        const tokenIn = mode === "buy" ? NATIVE_ETH : token;
        const tokenOut = mode === "buy" ? token : NATIVE_ETH;
        const res = await fetch("/api/swap/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            swapper,
            tokenIn,
            tokenOut,
            amount: amountWei,
            type: "EXACT_INPUT",
            slippageTolerance: 1,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Quote failed");
        if (cancelled) return;
        if (!data.amountOut) {
          throw new Error("No route found for this pair");
        }
        setQuoteOut(formatUnits(BigInt(data.amountOut), 18));
        setRouting(data.routing || null);
        setGasFeeUSD(data.gasFeeUSD || null);
      } catch (e: any) {
        if (!cancelled) {
          setQuoteOut(null);
          setRouting(null);
          setGasFeeUSD(null);
          setError(e?.message || "Quote failed");
        }
      } finally {
        if (!cancelled) setQuoting(false);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [token, onCurve, tradeApiReady, amount, mode, wallet.publicKey]);

  async function executeCurveSwap() {
    if (!token || !curve || !wallet.publicKey || !amount) return;
    setSwapping(true);
    setError(null);
    setStatus("Confirm in your wallet…");
    setTxHash(null);
    try {
      if (mode === "buy") {
        const quoteIn = parseEther(amount);
        const result = (await publicClient.readContract({
          address: curve,
          abi: bagsBondingCurveAbi,
          functionName: "quoteBuy",
          args: [quoteIn],
        })) as readonly [bigint, bigint, bigint, bigint, bigint];
        const minOut = (result[0] * BigInt(99)) / BigInt(100);
        const data = encodeFunctionData({
          abi: bagsBondingCurveAbi,
          functionName: "buy",
          args: [minOut],
        });
        const hash = await wallet.sendTransaction({
          to: curve,
          value: `0x${quoteIn.toString(16)}`,
          data,
        });
        setTxHash(hash);
      } else {
        const tokensIn = parseUnits(amount, 18);
        const allowance = (await publicClient.readContract({
          address: token as Address,
          abi: erc20Abi,
          functionName: "allowance",
          args: [wallet.publicKey as Address, curve],
        })) as bigint;
        if (allowance < tokensIn) {
          setStatus("Approve token spend…");
          const approveData = encodeFunctionData({
            abi: erc20Abi,
            functionName: "approve",
            args: [curve, tokensIn * BigInt(2)],
          });
          await wallet.sendTransaction({ to: token, data: approveData });
        }
        const result = (await publicClient.readContract({
          address: curve,
          abi: bagsBondingCurveAbi,
          functionName: "quoteSell",
          args: [tokensIn],
        })) as readonly [bigint, bigint, bigint];
        const minOut = (result[0] * BigInt(99)) / BigInt(100);
        setStatus("Confirm sell…");
        const data = encodeFunctionData({
          abi: bagsBondingCurveAbi,
          functionName: "sell",
          args: [tokensIn, minOut],
        });
        const hash = await wallet.sendTransaction({ to: curve, data });
        setTxHash(hash);
      }
      setStatus("Submitted");
      setAmount("");
      setQuoteOut(null);
    } catch (e: any) {
      setError(e?.shortMessage || e?.message || "Swap failed");
      setStatus(null);
    } finally {
      setSwapping(false);
    }
  }

  async function executeUniswapSwap() {
    if (!token || !wallet.publicKey || !amount) return;
    setSwapping(true);
    setError(null);
    setTxHash(null);
    try {
      await wallet.switchToRobinhoodChain();

      const amountWei = parseUnits(amount, 18).toString();
      const tokenIn = mode === "buy" ? NATIVE_ETH : token;
      const tokenOut = mode === "buy" ? token : NATIVE_ETH;

      // Fresh quote with connected wallet as swapper
      setStatus("Getting quote…");
      const quoteRes = await fetch("/api/swap/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          swapper: wallet.publicKey,
          tokenIn,
          tokenOut,
          amount: amountWei,
          type: "EXACT_INPUT",
          slippageTolerance: 1,
        }),
      });
      const quoteData = await quoteRes.json();
      if (!quoteRes.ok) throw new Error(quoteData.error || "Quote failed");
      const quoteResponse = quoteData.quoteResponse;
      setQuoteOut(quoteData.amountOut ? formatUnits(BigInt(quoteData.amountOut), 18) : null);
      setRouting(quoteData.routing || null);

      // ERC-20 approval via Trading API (Permit2 / Universal Router)
      if (tokenIn.toLowerCase() !== NATIVE_ETH.toLowerCase()) {
        setStatus("Checking allowance…");
        const approvalRes = await fetch("/api/swap/check-approval", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            walletAddress: wallet.publicKey,
            token: tokenIn,
            amount: amountWei,
          }),
        });
        const approvalData = await approvalRes.json();
        if (!approvalRes.ok) throw new Error(approvalData.error || "Approval check failed");
        if (approvalData.approval?.to && approvalData.approval?.data) {
          setStatus("Approve token in wallet…");
          await wallet.sendTransaction({
            to: approvalData.approval.to,
            data: approvalData.approval.data,
            value: approvalData.approval.value || "0x0",
            gas: approvalData.approval.gasLimit || approvalData.approval.gas,
          });
        }
      }

      // Sign Permit2 / UniswapX typed data when required
      let signature: string | null = null;
      const permitData = quoteData.permitData || quoteResponse?.permitData;
      if (permitData && typeof permitData === "object") {
        setStatus("Sign Permit2…");
        signature = await wallet.signTypedData(permitData);
      }

      setStatus("Building swap…");
      const swapRes = await fetch("/api/swap/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quoteResponse, signature }),
      });
      const swapData = await swapRes.json();
      if (!swapRes.ok) throw new Error(swapData.error || "Failed to build swap");

      const swap = swapData.swap;
      if (!swap?.to || !swap?.data) throw new Error("Empty swap transaction");

      setStatus("Confirm swap in wallet…");
      const hash = await wallet.sendTransaction({
        to: swap.to,
        data: swap.data,
        value: swap.value || "0x0",
        gas: swap.gasLimit || swap.gas,
      });
      setTxHash(hash);
      setStatus("Submitted");
      setAmount("");
      setQuoteOut(null);
    } catch (e: any) {
      setError(e?.shortMessage || e?.message || "Swap failed");
      setStatus(null);
    } finally {
      setSwapping(false);
    }
  }

  if (!token) {
    return (
      <div
        className={`rounded-xl border border-border/60 bg-card p-6 text-center ${className}`}
        data-testid="uniswap-swap-widget"
      >
        <ArrowLeftRight className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">Select a token to trade</p>
      </div>
    );
  }

  if (curveLoading || curveInfo === undefined || (!onCurve && tradeStatusLoading)) {
    return (
      <div
        className={`rounded-xl border border-border/60 bg-card p-8 text-center ${className}`}
        data-testid="uniswap-swap-widget"
      >
        <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Checking liquidity path…</p>
      </div>
    );
  }

  // Migrated / DEX without Trading API key → deep link fallback
  if (!onCurve && !tradeApiReady) {
    return (
      <div
        className={`rounded-xl border border-border/60 bg-card overflow-hidden ${className}`}
        data-testid="uniswap-swap-widget"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/60 bg-muted/30">
          <div className="flex items-center gap-2">
            <ArrowLeftRight className="w-4 h-4 text-pink-400" />
            <div>
              <div className="text-sm font-bold">Swap on Uniswap</div>
              <div className="text-[10px] text-muted-foreground">Robinhood Chain · ${symbol}</div>
            </div>
          </div>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-xs text-muted-foreground leading-relaxed">
            On-site quotes need a real <code className="text-foreground">UNISWAP_API_KEY</code> in
            the server <code className="text-foreground">.env</code> (not a placeholder), then{" "}
            <code className="text-foreground">pm2 restart feather-app --update-env</code>.
          </p>
          <div className="flex gap-1 rounded-lg bg-muted/60 p-0.5 w-fit">
            <button
              type="button"
              onClick={() => setMode("buy")}
              className={`px-3 py-1 rounded-md text-xs font-semibold ${
                mode === "buy" ? "bg-emerald-500/20 text-emerald-300" : "text-muted-foreground"
              }`}
            >
              Buy
            </button>
            <button
              type="button"
              onClick={() => setMode("sell")}
              className={`px-3 py-1 rounded-md text-xs font-semibold ${
                mode === "sell" ? "bg-red-500/20 text-red-300" : "text-muted-foreground"
              }`}
            >
              Sell
            </button>
          </div>
          <a href={uniHref} target="_blank" rel="noopener noreferrer">
            <Button className="w-full gap-2 h-11 font-bold" style={{ background: "#FF007A" }}>
              <ExternalLink className="w-4 h-4" />
              {mode === "buy" ? `Buy $${symbol} on Uniswap` : `Sell $${symbol} on Uniswap`}
            </Button>
          </a>
        </div>
      </div>
    );
  }

  const isDex = !onCurve;
  const title = onCurve ? "Swap" : "Swap";
  const subtitle = onCurve
    ? `Feather bonding curve · $${symbol}`
    : `Uniswap · Robinhood · $${symbol}`;

  return (
    <div
      className={`rounded-xl border border-border/60 bg-card overflow-hidden ${className}`}
      data-testid="uniswap-swap-widget"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/60 bg-muted/30">
        <div className="flex items-center gap-2">
          <ArrowLeftRight className={`w-4 h-4 ${isDex ? "text-pink-400" : "text-primary"}`} />
          <div>
            <div className="text-sm font-bold">{title}</div>
            <div className="text-[10px] text-muted-foreground">{subtitle}</div>
          </div>
        </div>
        <div className="flex items-center gap-1 rounded-lg bg-muted/60 p-0.5">
          <button
            type="button"
            onClick={() => setMode("buy")}
            className={`px-3 py-1 rounded-md text-xs font-semibold ${
              mode === "buy" ? "bg-emerald-500/20 text-emerald-300" : "text-muted-foreground"
            }`}
            data-testid="swap-mode-buy"
          >
            Buy
          </button>
          <button
            type="button"
            onClick={() => setMode("sell")}
            className={`px-3 py-1 rounded-md text-xs font-semibold ${
              mode === "sell" ? "bg-red-500/20 text-red-300" : "text-muted-foreground"
            }`}
            data-testid="swap-mode-sell"
          >
            Sell
          </button>
        </div>
      </div>

      <div className="p-4 space-y-3">
        <div className="rounded-xl border border-border/50 bg-muted/20 p-3 space-y-2">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>{mode === "buy" ? "You pay (ETH)" : `You sell ($${symbol})`}</span>
            {wallet.publicKey && (
              <button
                type="button"
                className="hover:text-foreground"
                onClick={() => {
                  const bal = mode === "buy" ? ethBal : tokenBal;
                  if (bal && Number(bal) > 0) setAmount((Number(bal) * 0.99).toFixed(6));
                }}
              >
                Bal:{" "}
                {mode === "buy"
                  ? ethBal != null
                    ? `${Number(ethBal).toFixed(4)} ETH`
                    : "…"
                  : tokenBal != null
                    ? formatTokenAmount(tokenBal)
                    : "…"}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Input
              data-testid="input-swap-amount"
              type="number"
              min="0"
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.0"
              className="text-lg font-mono border-0 bg-transparent px-0 h-10 focus-visible:ring-0"
            />
            <span className="text-sm font-bold shrink-0">{mode === "buy" ? "ETH" : symbol}</span>
          </div>
        </div>

        <div className="flex justify-center -my-1">
          <button
            type="button"
            onClick={() => setMode((m) => (m === "buy" ? "sell" : "buy"))}
            className="p-1.5 rounded-full border border-border/60 bg-card hover:bg-muted"
            aria-label="Flip"
          >
            <ArrowDownUp className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        </div>

        <div className="rounded-xl border border-border/50 bg-muted/20 p-3">
          <div className="text-[11px] text-muted-foreground mb-1">
            {mode === "buy" ? `You receive ($${symbol})` : "You receive (ETH)"}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-lg font-mono font-semibold" data-testid="swap-quote-out">
              {quoting ? "…" : quoteOut != null ? formatTokenAmount(quoteOut) : "—"}
            </span>
            <span className="text-sm font-bold">{mode === "buy" ? symbol : "ETH"}</span>
          </div>
          {isDex && (routing || gasFeeUSD) && (
            <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-muted-foreground">
              {routing && <span>Route {routing}</span>}
              {gasFeeUSD && <span>~${Number(gasFeeUSD).toFixed(4)} gas</span>}
            </div>
          )}
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}
        {status && !error && <p className="text-xs text-emerald-400">{status}</p>}
        {txHash && (
          <a
            href={EXPLORER_TX_URL(txHash)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-primary hover:underline"
          >
            View tx {txHash.slice(0, 10)}… <ExternalLink className="w-3 h-3" />
          </a>
        )}

        {!wallet.connected ? (
          <Button className="w-full gap-2 h-11" onClick={() => wallet.connect()} disabled={wallet.connecting}>
            <Wallet className="w-4 h-4" />
            {wallet.connecting ? "Connecting…" : "Connect wallet to swap"}
          </Button>
        ) : (
          <Button
            className="w-full gap-2 h-11 font-bold"
            style={{
              background: isDex ? "#FF007A" : mode === "buy" ? "#059669" : "#dc2626",
            }}
            onClick={onCurve ? executeCurveSwap : executeUniswapSwap}
            disabled={
              swapping ||
              quoting ||
              !amount ||
              Number(amount) <= 0 ||
              (onCurve && !curve) ||
              (isDex && !quoteOut && !quoting)
            }
            data-testid="button-swap-execute"
          >
            {swapping ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> {status || "Confirm in wallet…"}
              </>
            ) : mode === "buy" ? (
              `Buy $${symbol}`
            ) : (
              `Sell $${symbol}`
            )}
          </Button>
        )}

        {isDex && (
          <a
            href={uniHref}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            Open on Uniswap <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>

      <div className="px-4 py-2.5 text-[10px] text-muted-foreground border-t border-border/40">
        {onCurve
          ? "On-site bonding-curve trade · 1% slippage · After migration, uses Uniswap Trading API"
          : "Quotes via Uniswap Trading API (v2/v3/v4) · executed through Universal Router"}
      </div>
    </div>
  );
}
