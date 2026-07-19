import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import {
  ROBINHOOD_CHAIN_ID,
  ROBINHOOD_CHAIN_ID_HEX,
  ROBINHOOD_WALLET_ADD_PARAMS,
} from "@shared/chain";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, handler: (...args: any[]) => void): void;
  removeListener?(event: string, handler: (...args: any[]) => void): void;
  isMetaMask?: boolean;
  isRabby?: boolean;
  isCoinbaseWallet?: boolean;
  providers?: Eip1193Provider[];
}

declare global {
  interface Window {
    ethereum?: Eip1193Provider;
    robinhood?: { ethereum?: Eip1193Provider };
  }
}

export type WalletName = "MetaMask" | "Rabby" | "Robinhood Wallet" | "Injected";

export interface DetectedWallet {
  name: WalletName;
  provider: Eip1193Provider;
  icon: string;
}

export interface WalletState {
  connected: boolean;
  connecting: boolean;
  ready: boolean;
  publicKey: string | null; // EVM address (kept name for API compatibility)
  address: string | null;
  walletName: WalletName | null;
  chainId: number | null;
  availableWallets: DetectedWallet[];
  connect(walletName?: WalletName): Promise<void>;
  disconnect(): Promise<void>;
  getProvider(): Eip1193Provider | null;
  switchToRobinhoodChain(): Promise<void>;
  signMessage(message: string): Promise<string>;
  signTypedData(typedData: {
    domain: Record<string, unknown>;
    types: Record<string, unknown>;
    primaryType?: string;
    message?: Record<string, unknown>;
    values?: Record<string, unknown>;
  }): Promise<string>;
  sendTransaction(tx: {
    to: string;
    value?: string;
    data?: string;
    gas?: string;
  }): Promise<string>;
}

export interface WalletEntry {
  name: WalletName;
  icon: string;
  installUrl: string;
}

export const ALL_SUPPORTED_WALLETS: WalletEntry[] = [
  { name: "MetaMask", icon: "🦊", installUrl: "https://metamask.io/download/" },
  { name: "Rabby", icon: "🐰", installUrl: "https://rabby.io/" },
  { name: "Robinhood Wallet", icon: "🏹", installUrl: "https://robinhood.com/us/en/crypto/" },
  { name: "Injected", icon: "🔗", installUrl: "https://ethereum.org/wallets/" },
];

const WALLET_STORAGE_KEY = "feather_wallet";

function getEthereumProviders(): Eip1193Provider[] {
  if (typeof window === "undefined") return [];
  const eth = window.ethereum;
  if (!eth) return [];
  if (Array.isArray(eth.providers) && eth.providers.length > 0) {
    return eth.providers;
  }
  return [eth];
}

function detectWallets(): DetectedWallet[] {
  const found: DetectedWallet[] = [];
  if (typeof window === "undefined") return found;

  const seen = new Set<Eip1193Provider>();

  function add(name: WalletName, provider: Eip1193Provider | null | undefined) {
    if (!provider || seen.has(provider)) return;
    const entry = ALL_SUPPORTED_WALLETS.find((w) => w.name === name);
    if (!entry) return;
    seen.add(provider);
    found.push({ name, provider, icon: entry.icon });
  }

  // Robinhood Wallet (native or injected)
  const rh = window.robinhood?.ethereum;
  if (rh) add("Robinhood Wallet", rh);

  for (const p of getEthereumProviders()) {
    const anyP = p as Eip1193Provider & { isRobinhood?: boolean };
    if ((p as any).isRabby) {
      add("Rabby", p);
    } else if (anyP.isRobinhood || (p as any).isRobinhoodWallet) {
      add("Robinhood Wallet", p);
    } else if (p.isMetaMask && !(p as any).isRabby) {
      add("MetaMask", p);
    } else {
      add("Injected", p);
    }
  }

  // If only one generic injected and nothing else labeled, keep Injected
  if (found.length === 0 && window.ethereum) {
    add("Injected", window.ethereum);
  }

  return found;
}

async function ensureRobinhoodChain(provider: Eip1193Provider): Promise<void> {
  const chainIdHex = (await provider.request({ method: "eth_chainId" })) as string;
  const chainId = parseInt(chainIdHex, 16);
  if (chainId === ROBINHOOD_CHAIN_ID) return;

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: ROBINHOOD_CHAIN_ID_HEX }],
    });
  } catch (err: any) {
    // 4902 = chain not added
    if (err?.code === 4902 || err?.code === -32603 || /Unrecognized chain/i.test(err?.message ?? "")) {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [ROBINHOOD_WALLET_ADD_PARAMS],
      });
    } else {
      throw err;
    }
  }
}

const WalletContext = createContext<WalletState | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [ready, setReady] = useState(false);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [walletName, setWalletName] = useState<WalletName | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [availableWallets, setAvailableWallets] = useState<DetectedWallet[]>([]);

  const walletsRef = useRef<DetectedWallet[]>([]);
  walletsRef.current = availableWallets;
  const providerRef = useRef<Eip1193Provider | null>(null);

  const clearSession = useCallback(() => {
    setConnected(false);
    setPublicKey(null);
    setWalletName(null);
    setChainId(null);
    providerRef.current = null;
    localStorage.removeItem(WALLET_STORAGE_KEY);
  }, []);

  useEffect(() => {
    let stopped = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    function detect() {
      if (stopped) return;
      const found = detectWallets();
      setAvailableWallets(found);
      return found.length > 0;
    }

    if (detect()) return;

    const delays = [500, 1500, 3000];
    let timerIdx = 0;

    function scheduleNext() {
      if (timerIdx >= delays.length || stopped) return;
      const t = setTimeout(() => {
        if (detect()) {
          stopped = true;
        } else {
          timerIdx++;
          scheduleNext();
        }
      }, delays[timerIdx++]);
      timers.push(t);
    }

    scheduleNext();

    return () => {
      stopped = true;
      timers.forEach(clearTimeout);
    };
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem(WALLET_STORAGE_KEY);
    if (!saved) {
      setReady(true);
      return;
    }

    let parsed: { name: WalletName };
    try {
      parsed = JSON.parse(saved);
    } catch {
      setReady(true);
      return;
    }

    const wallets = detectWallets();
    const w = wallets.find((ww) => ww.name === parsed.name) ?? wallets[0];
    if (!w) {
      setReady(true);
      return;
    }

    w.provider
      .request({ method: "eth_accounts" })
      .then(async (accounts) => {
        const list = accounts as string[];
        if (!list?.[0]) return;
        try {
          await ensureRobinhoodChain(w.provider);
        } catch {
          /* allow reconnect even if chain switch fails */
        }
        const chainHex = (await w.provider.request({ method: "eth_chainId" })) as string;
        setPublicKey(list[0]);
        setWalletName(w.name);
        setConnected(true);
        setChainId(parseInt(chainHex, 16));
        providerRef.current = w.provider;
        setAvailableWallets(detectWallets());

        const onAccounts = (accs: string[]) => {
          if (!accs?.length) clearSession();
          else setPublicKey(accs[0]);
        };
        const onChain = (hex: string) => setChainId(parseInt(hex, 16));
        w.provider.on?.("accountsChanged", onAccounts);
        w.provider.on?.("chainChanged", onChain);
      })
      .catch(() => localStorage.removeItem(WALLET_STORAGE_KEY))
      .finally(() => setReady(true));
  }, [clearSession]);

  const connect = useCallback(async (name?: WalletName) => {
    const wallets = walletsRef.current.length > 0 ? walletsRef.current : detectWallets();
    if (wallets.length === 0) {
      window.open("https://metamask.io/download/", "_blank");
      return;
    }
    const target = name
      ? (wallets.find((w) => w.name === name) ?? wallets[0])
      : wallets[0];
    setConnecting(true);
    try {
      const accounts = (await target.provider.request({
        method: "eth_requestAccounts",
      })) as string[];
      if (!accounts?.[0]) throw new Error("Wallet connected but returned no address");

      await ensureRobinhoodChain(target.provider);
      const chainHex = (await target.provider.request({ method: "eth_chainId" })) as string;

      setPublicKey(accounts[0]);
      setWalletName(target.name);
      setConnected(true);
      setChainId(parseInt(chainHex, 16));
      providerRef.current = target.provider;
      localStorage.setItem(WALLET_STORAGE_KEY, JSON.stringify({ name: target.name }));

      const onAccounts = (accs: string[]) => {
        if (!accs?.length) clearSession();
        else setPublicKey(accs[0]);
      };
      const onChain = (hex: string) => setChainId(parseInt(hex, 16));
      target.provider.on?.("accountsChanged", onAccounts);
      target.provider.on?.("chainChanged", onChain);
    } finally {
      setConnecting(false);
    }
  }, [clearSession]);

  const disconnect = useCallback(async () => {
    clearSession();
  }, [clearSession]);

  const getProvider = useCallback((): Eip1193Provider | null => {
    if (providerRef.current) return providerRef.current;
    if (!walletName) return null;
    return walletsRef.current.find((w) => w.name === walletName)?.provider ?? null;
  }, [walletName]);

  const switchToRobinhoodChain = useCallback(async () => {
    const provider = getProvider();
    if (!provider) throw new Error("No wallet connected");
    await ensureRobinhoodChain(provider);
    const chainHex = (await provider.request({ method: "eth_chainId" })) as string;
    setChainId(parseInt(chainHex, 16));
  }, [getProvider]);

  const signMessage = useCallback(async (message: string): Promise<string> => {
    const provider = getProvider();
    if (!provider || !publicKey) throw new Error("Wallet not connected");
    const signature = (await provider.request({
      method: "personal_sign",
      params: [message, publicKey],
    })) as string;
    return signature;
  }, [getProvider, publicKey]);

  const signTypedData = useCallback(async (typedData: {
    domain: Record<string, unknown>;
    types: Record<string, unknown>;
    primaryType?: string;
    message?: Record<string, unknown>;
    values?: Record<string, unknown>;
  }): Promise<string> => {
    const provider = getProvider();
    if (!provider || !publicKey) throw new Error("Wallet not connected");
    await ensureRobinhoodChain(provider);

    const message = typedData.message || typedData.values;
    if (!message) throw new Error("Typed data missing message/values");

    const types = { ...(typedData.types || {}) } as Record<string, unknown>;
    // eth_signTypedData_v4: EIP712Domain is inferred from domain; strip if present
    delete types.EIP712Domain;

    const primaryType =
      typedData.primaryType ||
      Object.keys(types).find((k) => k !== "EIP712Domain") ||
      "";

    return (await provider.request({
      method: "eth_signTypedData_v4",
      params: [
        publicKey,
        JSON.stringify({
          domain: typedData.domain,
          types,
          primaryType,
          message,
        }),
      ],
    })) as string;
  }, [getProvider, publicKey]);

  const sendTransaction = useCallback(async (tx: {
    to: string;
    value?: string;
    data?: string;
    gas?: string;
  }): Promise<string> => {
    const provider = getProvider();
    if (!provider || !publicKey) throw new Error("Wallet not connected");
    await ensureRobinhoodChain(provider);

    const toHex = (v: string | undefined, fallback = "0x0") => {
      if (v == null || v === "") return fallback;
      if (v.startsWith("0x") || v.startsWith("0X")) return v;
      try {
        return `0x${BigInt(v).toString(16)}`;
      } catch {
        return fallback;
      }
    };

    const hash = (await provider.request({
      method: "eth_sendTransaction",
      params: [{
        from: publicKey,
        to: tx.to,
        value: toHex(tx.value, "0x0"),
        ...(tx.data ? { data: tx.data } : {}),
        ...(tx.gas ? { gas: toHex(tx.gas) } : {}),
      }],
    })) as string;
    return hash;
  }, [getProvider, publicKey]);

  const value: WalletState = {
    connected,
    connecting,
    ready,
    publicKey,
    address: publicKey,
    walletName,
    chainId,
    availableWallets,
    connect,
    disconnect,
    getProvider,
    switchToRobinhoodChain,
    signMessage,
    signTypedData,
    sendTransaction,
  };

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWalletConnect(): WalletState {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWalletConnect must be used inside <WalletProvider>");
  return ctx;
}
