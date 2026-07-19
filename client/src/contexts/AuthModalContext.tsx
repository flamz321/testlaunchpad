import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, X, Users, ArrowRight, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSocialAuth } from "@/hooks/use-social-auth";
import { useWalletConnect } from "@/hooks/use-wallet-connect";
import { ALL_SUPPORTED_WALLETS } from "@/contexts/WalletContext";
import type { WalletName } from "@/contexts/WalletContext";

type AuthMode = "signup" | "login";
type AuthStep = "idle" | "connecting" | "signing" | "checking" | "done";

interface AuthModalContextValue {
  openAuthModal: (mode?: AuthMode) => void;
  closeAuthModal: () => void;
}

const AuthModalContext = createContext<AuthModalContextValue | null>(null);

export function useAuthModal() {
  const ctx = useContext(AuthModalContext);
  if (!ctx) throw new Error("useAuthModal must be used inside <AuthModalProvider>");
  return ctx;
}

// ── Auth modal inner ────────────────────────────────────────────────────────────

function AuthModalInner({ mode, onClose }: { mode: AuthMode; onClose: () => void }) {
  const wallet = useWalletConnect();
  const { signIn, token, refetchProfile } = useSocialAuth();
  const [, navigate] = useLocation();
  const [step, setStep] = useState<AuthStep>("idle");
  const [selectedWallet, setSelectedWallet] = useState<WalletName | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasRouted, setHasRouted] = useState(false);

  // After picking a wallet and calling connect(), watch for connection to complete
  useEffect(() => {
    if (step === "connecting" && wallet.connected && wallet.publicKey) {
      handleSign();
    }
  }, [step, wallet.connected, wallet.publicKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // After signing, route based on whether the user has a profile
  useEffect(() => {
    if (step !== "checking" || hasRouted || !token) return;
    let cancelled = false;
    async function routeUser() {
      try {
        const res = await fetch("/api/social/me", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (cancelled) return;
        await refetchProfile();
        setHasRouted(true);
        setStep("done");
        onClose();
        navigate(res.ok ? "/community" : "/profile/setup");
      } catch {
        if (!cancelled) { setStep("done"); onClose(); navigate("/profile/setup"); }
      }
    }
    routeUser();
    return () => { cancelled = true; };
  }, [step, token, hasRouted]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSign() {
    setError(null);
    setStep("signing");
    try {
      await signIn();
      setStep("checking");
    } catch (err: any) {
      setError(err.message ?? "Sign-in cancelled or rejected");
      setStep("idle");
    }
  }

  async function handlePickWallet(name: WalletName) {
    setError(null);
    setSelectedWallet(name);

    // If the correct wallet is already connected, go straight to sign
    if (wallet.connected && wallet.publicKey && wallet.walletName === name) {
      await handleSign();
      return;
    }

    // If a *different* wallet is connected, disconnect it first
    if (wallet.connected) {
      await wallet.disconnect().catch(() => {});
    }

    setStep("connecting");
    try {
      await wallet.connect(name);
      // useEffect above fires handleSign() once wallet.connected flips true
    } catch (err: any) {
      setError(err.message ?? "Wallet connection cancelled");
      setStep("idle");
      setSelectedWallet(null);
    }
  }

  const isBusy = step !== "idle";

  // ── Wallet picker (always shown at idle) ──────────────────────────────────

  if (step === "idle") {
    const detectedNames = new Set(wallet.availableWallets.map((w) => w.name));

    return (
      <ModalShell onClose={onClose} isBusy={false} mode={mode}>
        {error && <ErrorBanner error={error} onClear={() => setError(null)} />}

        <p className="text-xs text-muted-foreground text-center mb-3">
          Select your wallet to continue
        </p>

        <div className="flex flex-col gap-2">
          {ALL_SUPPORTED_WALLETS.map((entry) => {
            const isInstalled = detectedNames.has(entry.name);
            const isActive = wallet.walletName === entry.name && wallet.connected;
            return (
              <div key={entry.name} className="relative">
                {isInstalled ? (
                  <button
                    data-testid={`button-wallet-pick-${entry.name.toLowerCase()}`}
                    onClick={() => handlePickWallet(entry.name)}
                    className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl border transition-all text-sm font-medium group ${
                      isActive
                        ? "border-primary/50 bg-primary/8"
                        : "border-white/10 hover:border-primary/40 hover:bg-primary/5"
                    }`}
                  >
                    <span className="text-xl">{entry.icon}</span>
                    <span className="flex-1 text-left">{entry.name}</span>
                    <span className={`text-[10px] font-normal mr-1 ${isActive ? "text-primary" : "text-primary/70"}`}>
                      {isActive ? "Connected" : "Detected"}
                    </span>
                    <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  </button>
                ) : (
                  <a
                    href={entry.installUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid={`link-wallet-install-${entry.name.toLowerCase()}`}
                    className="flex items-center gap-3 w-full px-4 py-3 rounded-xl border border-white/5 hover:border-white/15 hover:bg-white/3 transition-all text-sm group opacity-60 hover:opacity-80"
                  >
                    <span className="text-xl">{entry.icon}</span>
                    <span className="flex-1 text-left text-muted-foreground">{entry.name}</span>
                    <span className="text-[10px] text-muted-foreground/60 font-normal mr-1">Install</span>
                    <ExternalLink className="w-3.5 h-3.5 text-muted-foreground/60" />
                  </a>
                )}
              </div>
            );
          })}
        </div>

        {wallet.availableWallets.length === 0 && (
          <p className="text-center text-[11px] text-muted-foreground mt-3">
            No wallet detected — click Install to get one, then refresh.
          </p>
        )}

        <p className="text-center text-[11px] text-muted-foreground mt-3">
          No gas fees · No email required · MetaMask, Rabby & Robinhood Wallet
        </p>
      </ModalShell>
    );
  }

  // ── Connecting / signing / checking ──────────────────────────────────────

  const stepLabels: Record<AuthStep, string> = {
    idle: "",
    connecting: `Opening ${selectedWallet ?? "wallet"}…`,
    signing: "Approve the sign-in message in your wallet…",
    checking: "Verifying your profile…",
    done: "Redirecting…",
  };

  const progressMap: Record<AuthStep, number> = {
    idle: 0, connecting: 1, signing: 2, checking: 3, done: 3,
  };

  return (
    <ModalShell onClose={onClose} isBusy={isBusy} mode={mode}>
      <div className="flex gap-1.5 mb-3">
        {[1, 2, 3].map((n) => (
          <div key={n} className="flex-1 h-1 rounded-full overflow-hidden bg-white/10">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                progressMap[step] >= n ? "bg-primary w-full" : "w-0"
              }`}
            />
          </div>
        ))}
      </div>

      <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
        <span>{stepLabels[step]}</span>
      </div>

      {error && (
        <ErrorBanner
          error={error}
          onClear={() => { setError(null); setStep("idle"); setSelectedWallet(null); }}
        />
      )}

      {!isBusy && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => { setStep("idle"); setError(null); setSelectedWallet(null); }}
          className="w-full mt-2"
        >
          ← Choose a different wallet
        </Button>
      )}

      <p className="text-center text-[11px] text-muted-foreground mt-3">
        No gas fees · No email required · MetaMask, Rabby & Robinhood Wallet
      </p>
    </ModalShell>
  );
}

// ── Shared shell ───────────────────────────────────────────────────────────────

function ModalShell({
  children, onClose, isBusy, mode,
}: {
  children: React.ReactNode;
  onClose: () => void;
  isBusy: boolean;
  mode: AuthMode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/75"
        onClick={!isBusy ? onClose : undefined}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative z-10 glass-panel rounded-2xl p-6 w-full max-w-sm shadow-2xl border border-white/10"
      >
        {!isBusy && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
            data-testid="button-auth-modal-close"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        <div className="text-center mb-5">
          <div className="w-12 h-12 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-3">
            <Users className="w-5 h-5 text-primary" />
          </div>
          <h2 className="text-lg font-bold mb-1">
            {mode === "signup" ? "Join Feather Social" : "Welcome Back"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {mode === "signup"
              ? "Create your Feather profile and connect with the community."
              : "Sign in with your wallet to continue."}
          </p>
        </div>

        {children}
      </motion.div>
    </div>
  );
}

function ErrorBanner({ error, onClear }: { error: string; onClear: () => void }) {
  return (
    <div className="mb-4 p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-xs text-destructive flex items-start justify-between gap-2">
      <span>{error}</span>
      <button className="underline shrink-0" onClick={onClear}>Try again</button>
    </div>
  );
}

// ── Provider ───────────────────────────────────────────────────────────────────

export function AuthModalProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<AuthMode | null>(null);

  const openAuthModal = useCallback((m: AuthMode = "signup") => setMode(m), []);
  const closeAuthModal = useCallback(() => setMode(null), []);

  return (
    <AuthModalContext.Provider value={{ openAuthModal, closeAuthModal }}>
      {children}
      <AnimatePresence>
        {mode && (
          <AuthModalInner key={mode} mode={mode} onClose={closeAuthModal} />
        )}
      </AnimatePresence>
    </AuthModalContext.Provider>
  );
}
