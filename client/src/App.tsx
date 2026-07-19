import { Component, lazy, Suspense, useEffect, type ReactNode } from "react";
import { Switch, Route, useLocation } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { WalletGate } from "@/components/WalletGate";
import { WalletProvider } from "@/contexts/WalletContext";
import { SocialAuthProvider } from "@/contexts/SocialAuthContext";
import { AuthModalProvider } from "@/contexts/AuthModalContext";
import { ThemeProvider } from "@/components/ThemeProvider";
import { SeoHead } from "@/components/SeoHead";

// Home is eager — it's always the first page and must be fast
import Home from "@/pages/Home";

// Every other page is lazy — only loads when the user navigates there
const IntelAnalytics = lazy(() => import("@/pages/IntelAnalytics"));
const WalletCheck    = lazy(() => import("@/pages/WalletCheck"));
const ScanToken      = lazy(() => import("@/pages/ScanToken"));
const Docs         = lazy(() => import("@/pages/Docs"));
const Dex          = lazy(() => import("@/pages/Dex"));
const DexToken     = lazy(() => import("@/pages/DexToken"));
const Dashboard    = lazy(() => import("@/pages/Dashboard"));
const Admin        = lazy(() => import("@/pages/Admin"));
const LaunchFeed   = lazy(() => import("@/pages/LaunchFeed"));
const SocialFeed   = lazy(() => import("@/pages/SocialFeed"));
const SocialProfile  = lazy(() => import("@/pages/SocialProfile"));
const SocialSettings = lazy(() => import("@/pages/SocialSettings"));
const ProfileSetup = lazy(() => import("@/pages/ProfileSetup"));
const ProfileEdit  = lazy(() => import("@/pages/ProfileEdit"));
const Leaderboards = lazy(() => import("@/pages/Leaderboards"));
const Bounties     = lazy(() => import("@/pages/Bounties"));
const Vip          = lazy(() => import("@/pages/Vip"));
const Inbox        = lazy(() => import("@/pages/Inbox"));
const TrenchyAI   = lazy(() => import("@/pages/TrenchyAI"));
const Swap         = lazy(() => import("@/pages/Swap"));
const Bots         = lazy(() => import("@/pages/Bots"));
const AgentRegister    = lazy(() => import("@/pages/AgentRegister"));
const Notifications    = lazy(() => import("@/pages/Notifications"));
const BagsLaunch       = lazy(() => import("@/pages/BagsLaunch"));
const Launchpad        = lazy(() => import("@/pages/Launchpad"));
const Launch           = lazy(() => import("@/pages/Launch"));
const PitchDeck        = lazy(() => import("@/pages/PitchDeck"));
const CommunityPage       = lazy(() => import("@/pages/CommunityPage"));
const CommunityDetailPage = lazy(() => import("@/pages/CommunityDetailPage"));
const NotFound         = lazy(() => import("@/pages/not-found"));

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

// ── Minimal page-level loading skeleton ────────────────────────────────────────

function PageLoader() {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      minHeight: "100vh", background: "hsl(0,0%,0%)",
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: "50%",
        border: "3px solid hsl(203,87%,53%)", borderTopColor: "transparent",
        animation: "spin 0.7s linear infinite",
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── Error boundary ─────────────────────────────────────────────────────────────

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "hsl(0,0%,0%)", color: "hsl(204,5%,46%)", fontFamily: "system-ui, sans-serif", gap: 16, padding: 32, textAlign: "center" }}>
          <div style={{ fontSize: 40 }}>⚠️</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "hsl(210,5%,91%)", margin: 0 }}>Something went wrong</h2>
          <p style={{ margin: 0, maxWidth: 400, fontSize: 14 }}>Try refreshing the page. If the problem persists, disconnect your wallet and reconnect.</p>
          <button
            onClick={() => window.location.reload()}
            style={{ marginTop: 8, padding: "10px 24px", borderRadius: 8, background: "hsl(203,87%,53%)", color: "#fff", border: "none", cursor: "pointer", fontSize: 14, fontWeight: 600 }}
          >
            Refresh Page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Analytics ──────────────────────────────────────────────────────────────────

function usePageTracking() {
  const [location] = useLocation();
  useEffect(() => {
    if (typeof window.gtag === "function") {
      window.gtag("event", "page_view", {
        page_path: location,
        page_location: window.location.href,
      });
    }
  }, [location]);
}

// ── Referral code capture ───────────────────────────────────────────────────────
// Any page visit with ?ref=CODE stores it in localStorage so the signup flow
// can claim it when a new user creates their profile.
function useReferralCapture() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    if (ref && ref.length >= 6 && ref.length <= 32) {
      try { localStorage.setItem("feather_ref", ref); } catch {}
    }
  }, []);
}

// ── Router ─────────────────────────────────────────────────────────────────────

function Router() {
  usePageTracking();
  useReferralCapture();
  return (
    <Suspense fallback={<PageLoader />}>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/intel" component={IntelAnalytics} />
        <Route path="/wallet-check" component={WalletCheck} />
        <Route path="/scan-token" component={ScanToken} />
        <Route path="/docs" component={Docs} />
        <Route path="/dex" component={Dex} />
        <Route path="/dex/:mintAddress" component={DexToken} />
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/admin" component={Admin} />
        <Route path="/launch-feed" component={LaunchFeed} />
        <Route path="/social" component={LaunchFeed} />
        <Route path="/launches" component={LaunchFeed} />
        <Route path="/community" component={SocialFeed} />
        <Route path="/social/profile/:wallet" component={SocialProfile} />
        <Route path="/u/:wallet" component={SocialProfile} />
        <Route path="/social/settings" component={SocialSettings} />
        <Route path="/profile/setup" component={ProfileSetup} />
        <Route path="/profile" component={ProfileEdit} />
        <Route path="/leaderboards" component={Leaderboards} />
        <Route path="/bounties" component={Bounties} />
        <Route path="/vip" component={Vip} />
        <Route path="/notifications" component={Notifications} />
        <Route path="/inbox" component={Inbox} />
        <Route path="/feather-ai" component={TrenchyAI} />
        <Route path="/trenchy-ai" component={TrenchyAI} />
        <Route path="/swap" component={Swap} />
        <Route path="/bots" component={Bots} />
        <Route path="/agents/register" component={AgentRegister} />
        <Route path="/launchpad" component={Launchpad} />
        <Route path="/bags-launch" component={BagsLaunch} />
        <Route path="/launch" component={Launch} />
        <Route path="/pitchdeck" component={PitchDeck} />
        <Route path="/communities" component={CommunityPage} />
        <Route path="/communities/:slug" component={CommunityDetailPage} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

// ── App ────────────────────────────────────────────────────────────────────────

function App() {
  return (
    <ThemeProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <WalletProvider>
              <SocialAuthProvider>
                <AuthModalProvider>
                  <SeoHead />
                  <Toaster />
                  <WalletGate />
                  <Router />
                </AuthModalProvider>
              </SocialAuthProvider>
            </WalletProvider>
          </TooltipProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </ThemeProvider>
  );
}

export default App;
