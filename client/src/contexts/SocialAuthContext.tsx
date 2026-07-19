import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { useLocation } from "wouter";
import { useWalletConnect } from "@/hooks/use-wallet-connect";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface SocialProfile {
  walletAddress: string;
  username: string | null;
  profileImageIpfsCid?: string | null;
  bio?: string | null;
  twitterLink?: string | null;
  githubLink?: string | null;
  instagramLink?: string | null;
  websiteLink?: string | null;
  totpEnabled?: boolean;
  createdAt?: string | null;
  lastActive?: string | null;
  followerCount?: number;
  followingCount?: number;
}

export interface SocialAuthState {
  token: string | null;
  walletAddress: string | null;
  profile: SocialProfile | null;
  profileFetched: boolean;
  loading: boolean;
  signIn: () => Promise<void>;
  signOut: () => void;
  avatarUrl: (cid?: string | null) => string | null;
  initials: (username: string | null | undefined) => string;
  refetchProfile: () => Promise<void>;
}

const STORAGE_KEY = "feather_social_token";

export function avatarUrl(cid?: string | null): string | null {
  if (!cid) return null;
  return `https://gateway.pinata.cloud/ipfs/${cid}`;
}

export function initials(username: string | null | undefined): string {
  if (!username) return "??";
  return username.slice(0, 2).toUpperCase();
}

function decodeJwtWallet(jwt: string): string | null {
  try {
    const payload = JSON.parse(atob(jwt.split(".")[1]));
    return payload?.wallet ?? null;
  } catch {
    return null;
  }
}

const SocialAuthContext = createContext<SocialAuthState | null>(null);

export function SocialAuthProvider({ children }: { children: ReactNode }) {
  const wallet = useWalletConnect();
  const [, navigate] = useLocation();

  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem(STORAGE_KEY)
  );
  const [profile, setProfile] = useState<SocialProfile | null>(null);
  const [profileFetched, setProfileFetched] = useState<boolean>(() => !localStorage.getItem(STORAGE_KEY));
  const [loading, setLoading] = useState(false);

  const signingInRef = useRef(false);
  const justSignedInRef = useRef(false);

  const signOut = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setToken(null);
    setProfile(null);
  }, []);

  const fetchProfile = useCallback(async (jwt: string) => {
    try {
      const res = await fetch("/api/social/me", {
        headers: { Authorization: `Bearer ${jwt}` },
      });
      if (res.ok) {
        const data = await res.json();
        setProfile(data);
        if (justSignedInRef.current) {
          justSignedInRef.current = false;
          navigate("/community");
        }
      } else if (res.status === 401 || res.status === 403) {
        localStorage.removeItem(STORAGE_KEY);
        setToken(null);
        setProfile(null);
      } else if (res.status === 404) {
        setProfile(null);
        justSignedInRef.current = false;
      }
    } catch {
      justSignedInRef.current = false;
    } finally {
      setProfileFetched(true);
    }
  }, [navigate]);

  useEffect(() => {
    if (token) fetchProfile(token);
    else setProfile(null);
  }, [token, fetchProfile]);

  useEffect(() => {
    if (wallet.ready && !wallet.connected && token) signOut();
  }, [wallet.ready, wallet.connected]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!wallet.publicKey || !token) return;
    const tokenWallet = decodeJwtWallet(token);
    if (
      tokenWallet &&
      tokenWallet.toLowerCase() !== wallet.publicKey.toLowerCase()
    ) {
      signOut();
    }
  }, [wallet.publicKey, token]); // eslint-disable-line react-hooks/exhaustive-deps

  const signIn = useCallback(async () => {
    if (!wallet.connected || !wallet.publicKey) {
      throw new Error("Wallet not connected — please connect first");
    }
    if (signingInRef.current) return;
    signingInRef.current = true;
    setLoading(true);
    try {
      const message = `Sign in to Feather App\nWallet: ${wallet.publicKey}\nTimestamp: ${Date.now()}`;
      const signature = await wallet.signMessage(message);

      const authRes = await fetch("/api/social/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet: wallet.publicKey,
          signature,
          message,
        }),
      });
      if (!authRes.ok) {
        const err = await authRes.json();
        throw new Error(err.error ?? "Auth failed");
      }
      const { token: newToken } = await authRes.json();
      localStorage.setItem(STORAGE_KEY, newToken);
      setToken(newToken);
      justSignedInRef.current = true;
      await fetchProfile(newToken);
    } finally {
      setLoading(false);
      signingInRef.current = false;
    }
  }, [wallet, fetchProfile]);

  const refetchProfile = useCallback(async () => {
    if (token) await fetchProfile(token);
  }, [token, fetchProfile]);

  const autoSignedInRef = useRef(false);

  useEffect(() => {
    if (!wallet.ready) return;
    if (!wallet.connected) {
      autoSignedInRef.current = false;
      return;
    }
    if (wallet.connected && wallet.publicKey && !token && !loading && !autoSignedInRef.current) {
      autoSignedInRef.current = true;
      signIn().catch(() => {
        autoSignedInRef.current = false;
      });
    }
  }, [wallet.ready, wallet.connected, wallet.publicKey, token, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  const walletAddress: string | null =
    profile?.walletAddress ?? (token ? decodeJwtWallet(token) : null);

  const value: SocialAuthState = {
    token,
    walletAddress,
    profile,
    profileFetched,
    loading,
    signIn,
    signOut,
    avatarUrl,
    initials,
    refetchProfile,
  };

  return (
    <SocialAuthContext.Provider value={value}>
      {children}
    </SocialAuthContext.Provider>
  );
}

export function useSocialAuth(): SocialAuthState {
  const ctx = useContext(SocialAuthContext);
  if (!ctx) throw new Error("useSocialAuth must be used inside <SocialAuthProvider>");
  return ctx;
}

export function socialAuthHeaders(token: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}
