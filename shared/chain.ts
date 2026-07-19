/**
 * Robinhood Chain (EVM) network configuration for Feather App.
 * Mainnet launched July 2026 — Chain ID 4663.
 */

export const ROBINHOOD_CHAIN_ID = 4663;
export const ROBINHOOD_CHAIN_ID_HEX = "0x1237"; // 4663
export const ROBINHOOD_TESTNET_CHAIN_ID = 46630;

export const ROBINHOOD_CHAIN = {
  id: ROBINHOOD_CHAIN_ID,
  name: "Robinhood Chain",
  network: "robinhood",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.mainnet.chain.robinhood.com"] },
    public: { http: ["https://rpc.mainnet.chain.robinhood.com"] },
  },
  blockExplorers: {
    default: {
      name: "Blockscout",
      url: "https://robinhoodchain.blockscout.com",
    },
  },
} as const;

/** DexScreener / API chain slug */
export const DEXSCREENER_CHAIN_ID = "robinhood";

/** Wrapped ETH on Robinhood Chain (from DexScreener) */
export const WETH_ADDRESS = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73";

/**
 * $FEATHER token contract — set via env in production.
 * Placeholder zero address until the token is deployed.
 */
export const FEATHER_TOKEN_ADDRESS =
  (typeof process !== "undefined" && process.env?.FEATHER_TOKEN_ADDRESS) ||
  (typeof process !== "undefined" && process.env?.VITE_FEATHER_TOKEN_ADDRESS) ||
  "0x0000000000000000000000000000000000000000";

/** USDC on Robinhood Chain — override via env when known */
export const USDC_ADDRESS =
  (typeof process !== "undefined" && process.env?.USDC_ADDRESS) ||
  (typeof process !== "undefined" && process.env?.VITE_USDC_ADDRESS) ||
  "0x0000000000000000000000000000000000000000";

export const DEFAULT_RPC_URL =
  (typeof process !== "undefined" && process.env?.RPC_URL) ||
  (typeof process !== "undefined" && process.env?.VITE_RPC_URL) ||
  ROBINHOOD_CHAIN.rpcUrls.default.http[0];

export const EXPLORER_TX_URL = (hash: string) =>
  `${ROBINHOOD_CHAIN.blockExplorers.default.url}/tx/${hash}`;

export const EXPLORER_ADDRESS_URL = (address: string) =>
  `${ROBINHOOD_CHAIN.blockExplorers.default.url}/address/${address}`;

/**
 * Bags launchpad contracts on Robinhood Chain mainnet.
 * Docs: https://docs.bags.fm/robinhood/setup
 * Do not expose "Bags" branding in product UI — these are protocol addresses only.
 */
export const ROBINHOOD_LAUNCHPAD = {
  factory: "0x46aD6f53A3C26C8027826e2104cF0595b7b24D40",
  lens: "0xcF8DA63Dd1cb58daDd2c1B350ac756ffA43EF2d4",
  hook: "0x208378dDc05eD5De1833624a30EB9C1d26f86EcC",
  vault: "0x26e421917aeA64B615A3127A2BA3AC3051C3ab80",
  universalRouter: "0x8876789976dEcBfCbBbe364623C63652db8C0904",
  v4Quoter: "0x8Dc178eFB8111BB0973Dd9d722ebeFF267c98F94",
  stateView: "0xF3334192D15450CdD385c8B70e03f9A6bD9E673b",
  poolManager: "0x8366a39CC670B4001A1121B8F6A443A643e40951",
  permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
  weth: WETH_ADDRESS,
} as const;

/** Canonical Uniswap deployments on Robinhood Chain (for on-site swaps) */
export const UNISWAP_ROBINHOOD = {
  v2Factory: "0x8bcEaA40B9AcdfAedF85AdF4FF01F5Ad6517937f",
  v2Router: "0x89e5DB8B5aA49aA85AC63f691524311AEB649eba",
  v3Factory: "0x1f7d7550B1b028f7571E69A784071F0205FD2EfA",
  v3SwapRouter: "0xCaf681a66D020601342297493863E78C959E5cb2",
} as const;

export const ROBINHOOD_DEPLOY_BLOCK = 6191492n;

export const ROBINHOOD_FEES = {
  txFeeBps: 200,
  creatorFeeBps: 100,
  bpsDenominator: 10_000,
} as const;

/** EIP-1193 wallet_addEthereumChain params */
export const ROBINHOOD_WALLET_ADD_PARAMS = {
  chainId: ROBINHOOD_CHAIN_ID_HEX,
  chainName: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: [ROBINHOOD_CHAIN.rpcUrls.default.http[0]],
  blockExplorerUrls: [ROBINHOOD_CHAIN.blockExplorers.default.url],
};

export const isEvmAddress = (addr: string): boolean =>
  /^0x[a-fA-F0-9]{40}$/.test(addr);

/** Canonical form for EVM addresses — always compare/store lowercase */
export const normalizeWallet = (addr: string): string => addr.trim().toLowerCase();

export const isTxHash = (hash: string): boolean =>
  /^0x[a-fA-F0-9]{64}$/.test(hash);

export const ERC20_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;
