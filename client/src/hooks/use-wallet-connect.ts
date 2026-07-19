// Re-export everything from the global WalletContext so all existing imports
// continue to work unchanged. The real implementation lives in WalletContext.tsx.
export {
  useWalletConnect,
  type WalletState,
  type WalletName,
  type DetectedWallet,
  type Eip1193Provider,
} from "@/contexts/WalletContext";
