import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useWalletConnect } from "@/hooks/use-wallet-connect";
import { useSocialAuth } from "@/hooks/use-social-auth";

// Pages that require a wallet to be connected (disconnect → go home)
const WALLET_REQUIRED_ROUTES = [
  "/dex", "/market", "/dashboard", "/community", "/leaderboards",
  "/bounties", "/vip", "/inbox", "/profile", "/u/", "/admin",
];

// Pages that require a full profile to exist (no profile → go to setup)
// Intentionally narrower — feed/screener/etc. are viewable without a profile
const PROFILE_REQUIRED_ROUTES = [
  "/dashboard", "/inbox", "/vip", "/admin",
];

const SETUP_ROUTES = ["/profile/setup"];

function requiresWallet(location: string): boolean {
  return WALLET_REQUIRED_ROUTES.some(
    (r) => location === r || location.startsWith(r + "/") || location.startsWith(r)
  );
}

function requiresProfile(location: string): boolean {
  return PROFILE_REQUIRED_ROUTES.some(
    (r) => location === r || location.startsWith(r + "/") || location.startsWith(r)
  );
}

function isSetupPage(location: string): boolean {
  return SETUP_ROUTES.some((r) => location === r || location.startsWith(r));
}

export function WalletGate() {
  const wallet = useWalletConnect();
  const { signOut, token, profile, profileFetched, loading } = useSocialAuth();
  const [location, navigate] = useLocation();
  const wasConnectedRef = useRef(false);

  // Sign out and redirect home when wallet disconnects from a protected page
  useEffect(() => {
    if (wallet.connected) {
      wasConnectedRef.current = true;
      return;
    }
    if (!wallet.connected && wasConnectedRef.current) {
      wasConnectedRef.current = false;
      signOut();
      if (requiresWallet(location)) {
        navigate("/");
      }
    }
  }, [wallet.connected]); // eslint-disable-line react-hooks/exhaustive-deps

  // Redirect to profile setup only for pages that truly need a profile
  useEffect(() => {
    if (!token || loading || !profileFetched) return;
    if (profile === null && requiresProfile(location) && !isSetupPage(location)) {
      navigate("/profile/setup");
    }
  }, [token, profile, profileFetched, loading, location]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
