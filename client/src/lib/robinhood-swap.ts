/**
 * On-site Uniswap V2 swap helpers for Robinhood Chain.
 * app.uniswap.org cannot be iframed (X-Frame-Options), so we trade via the V2 router.
 */
import {
  createPublicClient,
  http,
  encodeFunctionData,
  parseEther,
  formatEther,
  formatUnits,
  parseUnits,
  type Address,
  type Hex,
} from "viem";
import {
  DEFAULT_RPC_URL,
  ROBINHOOD_CHAIN,
  ROBINHOOD_LAUNCHPAD,
  UNISWAP_ROBINHOOD,
  WETH_ADDRESS,
  normalizeWallet,
} from "@shared/chain";
import { bagsBondingCurveAbi, bagsLensAbi } from "@shared/bags";

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
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
] as const;

const v2RouterAbi = [
  {
    type: "function",
    name: "getAmountsOut",
    stateMutability: "view",
    inputs: [
      { name: "amountIn", type: "uint256" },
      { name: "path", type: "address[]" },
    ],
    outputs: [{ name: "amounts", type: "uint256[]" }],
  },
  {
    type: "function",
    name: "swapExactETHForTokens",
    stateMutability: "payable",
    inputs: [
      { name: "amountOutMin", type: "uint256" },
      { name: "path", type: "address[]" },
      { name: "to", type: "address" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [{ name: "amounts", type: "uint256[]" }],
  },
  {
    type: "function",
    name: "swapExactTokensForETH",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amountIn", type: "uint256" },
      { name: "amountOutMin", type: "uint256" },
      { name: "path", type: "address[]" },
      { name: "to", type: "address" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [{ name: "amounts", type: "uint256[]" }],
  },
] as const;

export type SwapMode = "buy" | "sell";
export type SwapVenue = "curve" | "uniswap-v2";

export interface TokenTradeInfo {
  venue: SwapVenue;
  curve?: Address;
  migrated: boolean;
  exists: boolean;
}

export async function getTokenTradeInfo(tokenAddress: string): Promise<TokenTradeInfo> {
  try {
    const state = (await publicClient.readContract({
      address: ROBINHOOD_LAUNCHPAD.lens as Address,
      abi: bagsLensAbi,
      functionName: "getTokenState",
      args: [tokenAddress as Address],
    })) as { exists: boolean; migrated: boolean; curve: Address };

    if (state?.exists && !state.migrated && state.curve) {
      return { venue: "curve", curve: state.curve, migrated: false, exists: true };
    }
    if (state?.exists && state.migrated) {
      return { venue: "uniswap-v2", curve: state.curve, migrated: true, exists: true };
    }
  } catch {
    /* not a factory token */
  }
  return { venue: "uniswap-v2", migrated: true, exists: false };
}

function applySlippage(amount: bigint, slippageBps: number): bigint {
  return (amount * BigInt(10_000 - slippageBps)) / BigInt(10_000);
}

function applyFee(amount: bigint, feeBps: number): { net: bigint; fee: bigint } {
  if (feeBps <= 0 || amount <= BigInt(0)) return { net: amount, fee: BigInt(0) };
  const fee = (amount * BigInt(feeBps)) / BigInt(10_000);
  return { net: amount - fee, fee };
}

export async function quoteBuyEthForToken(params: {
  token: string;
  ethAmount: string;
  venue: SwapVenue;
  curve?: Address;
  feeBps?: number;
  slippageBps?: number;
}): Promise<{ tokensOut: string; feeEth: string; netEth: string; minOut: string }> {
  const ethWei = parseEther(params.ethAmount || "0");
  const { net, fee } = applyFee(ethWei, params.feeBps ?? 0);
  const slip = params.slippageBps ?? 100;

  if (net <= BigInt(0)) {
    return { tokensOut: "0", feeEth: formatEther(fee), netEth: "0", minOut: "0" };
  }

  if (params.venue === "curve" && params.curve) {
    const quote = (await publicClient.readContract({
      address: params.curve,
      abi: bagsBondingCurveAbi,
      functionName: "quoteBuy",
      args: [net],
    })) as { tokensOut?: bigint } & readonly [bigint, ...bigint[]];

    const tokensOut = Array.isArray(quote) ? quote[0] : (quote as any).tokensOut ?? BigInt(0);
    return {
      tokensOut: formatUnits(tokensOut, 18),
      feeEth: formatEther(fee),
      netEth: formatEther(net),
      minOut: formatUnits(applySlippage(tokensOut, slip), 18),
    };
  }

  const amounts = (await publicClient.readContract({
    address: UNISWAP_ROBINHOOD.v2Router as Address,
    abi: v2RouterAbi,
    functionName: "getAmountsOut",
    args: [net, [WETH_ADDRESS as Address, params.token as Address]],
  })) as bigint[];
  const tokensOut = amounts[amounts.length - 1] ?? BigInt(0);
  return {
    tokensOut: formatUnits(tokensOut, 18),
    feeEth: formatEther(fee),
    netEth: formatEther(net),
    minOut: formatUnits(applySlippage(tokensOut, slip), 18),
  };
}

export async function quoteSellTokenForEth(params: {
  token: string;
  tokenAmount: string;
  venue: SwapVenue;
  curve?: Address;
  feeBps?: number;
  slippageBps?: number;
}): Promise<{ ethOut: string; feeEth: string; netEth: string; minOut: string }> {
  const amountIn = parseUnits(params.tokenAmount || "0", 18);
  const slip = params.slippageBps ?? 100;
  if (amountIn <= BigInt(0)) {
    return { ethOut: "0", feeEth: "0", netEth: "0", minOut: "0" };
  }

  let grossOut: bigint;
  if (params.venue === "curve" && params.curve) {
    const quote = (await publicClient.readContract({
      address: params.curve,
      abi: bagsBondingCurveAbi,
      functionName: "quoteSell",
      args: [amountIn],
    })) as readonly [bigint, ...bigint[]];
    grossOut = Array.isArray(quote) ? quote[0] : BigInt(0);
  } else {
    const amounts = (await publicClient.readContract({
      address: UNISWAP_ROBINHOOD.v2Router as Address,
      abi: v2RouterAbi,
      functionName: "getAmountsOut",
      args: [amountIn, [params.token as Address, WETH_ADDRESS as Address]],
    })) as bigint[];
    grossOut = amounts[amounts.length - 1] ?? BigInt(0);
  }

  const { net, fee } = applyFee(grossOut, params.feeBps ?? 0);
  return {
    ethOut: formatEther(grossOut),
    feeEth: formatEther(fee),
    netEth: formatEther(net),
    minOut: formatEther(applySlippage(net, slip)),
  };
}

export async function getEthBalance(wallet: string): Promise<string> {
  const bal = await publicClient.getBalance({ address: wallet as Address });
  return formatEther(bal);
}

export async function getTokenBalance(token: string, wallet: string): Promise<string> {
  const bal = (await publicClient.readContract({
    address: token as Address,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [wallet as Address],
  })) as bigint;
  return formatUnits(bal, 18);
}

type SendTx = (tx: { to: string; value?: string; data?: string }) => Promise<string>;

function toHexWei(wei: bigint): string {
  return `0x${wei.toString(16)}`;
}

export async function executeBuy(params: {
  token: string;
  ethAmount: string;
  venue: SwapVenue;
  curve?: Address;
  feeBps: number;
  feeRecipient: string;
  slippageBps: number;
  recipient: string;
  sendTransaction: SendTx;
}): Promise<{ txHashes: string[] }> {
  const ethWei = parseEther(params.ethAmount);
  const { net, fee } = applyFee(ethWei, params.feeBps);
  if (net <= BigInt(0)) throw new Error("Amount too small after fee");

  const hashes: string[] = [];
  if (fee > BigInt(0) && normalizeWallet(params.feeRecipient) !== normalizeWallet(params.recipient)) {
    hashes.push(
      await params.sendTransaction({
        to: params.feeRecipient,
        value: toHexWei(fee),
      })
    );
  }

  const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 20);

  if (params.venue === "curve" && params.curve) {
    const quote = (await publicClient.readContract({
      address: params.curve,
      abi: bagsBondingCurveAbi,
      functionName: "quoteBuy",
      args: [net],
    })) as readonly [bigint, ...bigint[]];
    const tokensOut = quote[0] ?? BigInt(0);
    const minOut = applySlippage(tokensOut, params.slippageBps);
    const data = encodeFunctionData({
      abi: bagsBondingCurveAbi,
      functionName: "buy",
      args: [minOut],
    });
    hashes.push(
      await params.sendTransaction({
        to: params.curve,
        value: toHexWei(net),
        data,
      })
    );
    return { txHashes: hashes };
  }

  const amounts = (await publicClient.readContract({
    address: UNISWAP_ROBINHOOD.v2Router as Address,
    abi: v2RouterAbi,
    functionName: "getAmountsOut",
    args: [net, [WETH_ADDRESS as Address, params.token as Address]],
  })) as bigint[];
  const tokensOut = amounts[amounts.length - 1] ?? BigInt(0);
  const minOut = applySlippage(tokensOut, params.slippageBps);
  const data = encodeFunctionData({
    abi: v2RouterAbi,
    functionName: "swapExactETHForTokens",
    args: [
      minOut,
      [WETH_ADDRESS as Address, params.token as Address],
      params.recipient as Address,
      deadline,
    ],
  });
  hashes.push(
    await params.sendTransaction({
      to: UNISWAP_ROBINHOOD.v2Router,
      value: toHexWei(net),
      data,
    })
  );
  return { txHashes: hashes };
}

export async function executeSell(params: {
  token: string;
  tokenAmount: string;
  venue: SwapVenue;
  curve?: Address;
  feeBps: number;
  feeRecipient: string;
  slippageBps: number;
  recipient: string;
  sendTransaction: SendTx;
}): Promise<{ txHashes: string[] }> {
  const amountIn = parseUnits(params.tokenAmount, 18);
  if (amountIn <= BigInt(0)) throw new Error("Enter an amount");

  const hashes: string[] = [];
  const spender =
    params.venue === "curve" && params.curve
      ? params.curve
      : (UNISWAP_ROBINHOOD.v2Router as Address);

  const allowance = (await publicClient.readContract({
    address: params.token as Address,
    abi: erc20Abi,
    functionName: "allowance",
    args: [params.recipient as Address, spender],
  })) as bigint;

  if (allowance < amountIn) {
    const approveData = encodeFunctionData({
      abi: erc20Abi,
      functionName: "approve",
      args: [spender, amountIn * BigInt(2)],
    });
    hashes.push(
      await params.sendTransaction({
        to: params.token,
        data: approveData,
      })
    );
  }

  const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 20);

  if (params.venue === "curve" && params.curve) {
    const quote = (await publicClient.readContract({
      address: params.curve,
      abi: bagsBondingCurveAbi,
      functionName: "quoteSell",
      args: [amountIn],
    })) as readonly [bigint, ...bigint[]];
    const grossOut = quote[0] ?? BigInt(0);
    const { net } = applyFee(grossOut, params.feeBps);
    const minOut = applySlippage(net, params.slippageBps);
    const data = encodeFunctionData({
      abi: bagsBondingCurveAbi,
      functionName: "sell",
      args: [amountIn, minOut],
    });
    hashes.push(
      await params.sendTransaction({
        to: params.curve,
        data,
      })
    );
    // Fee taken from ETH received — send tip after sell when fee > 0
    const fee = grossOut - net;
    if (fee > BigInt(0)) {
      hashes.push(
        await params.sendTransaction({
          to: params.feeRecipient,
          value: toHexWei(fee),
        })
      );
    }
    return { txHashes: hashes };
  }

  const amounts = (await publicClient.readContract({
    address: UNISWAP_ROBINHOOD.v2Router as Address,
    abi: v2RouterAbi,
    functionName: "getAmountsOut",
    args: [amountIn, [params.token as Address, WETH_ADDRESS as Address]],
  })) as bigint[];
  const grossOut = amounts[amounts.length - 1] ?? BigInt(0);
  const { net, fee } = applyFee(grossOut, params.feeBps);
  const minOut = applySlippage(net, params.slippageBps);
  const data = encodeFunctionData({
    abi: v2RouterAbi,
    functionName: "swapExactTokensForETH",
    args: [
      amountIn,
      minOut,
      [params.token as Address, WETH_ADDRESS as Address],
      params.recipient as Address,
      deadline,
    ],
  });
  hashes.push(
    await params.sendTransaction({
      to: UNISWAP_ROBINHOOD.v2Router,
      data,
    })
  );
  if (fee > BigInt(0)) {
    hashes.push(
      await params.sendTransaction({
        to: params.feeRecipient,
        value: toHexWei(fee),
      })
    );
  }
  return { txHashes: hashes };
}

export { publicClient as swapPublicClient };
