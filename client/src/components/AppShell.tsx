import { ReactNode, useEffect } from "react";
import { useLocation } from "wouter";
import { AppSidebar } from "@/components/AppSidebar";
import { Navbar } from "@/components/Navbar";
import { useSocialAuth } from "@/hooks/use-social-auth";

interface AppShellProps {
  children: ReactNode;
  rightSidebar?: ReactNode;
  onPostClick?: () => void;
}

// Paths that belong to the social section — these get the left sidebar
const SOCIAL_PATHS = [
  "/community",
  "/communities",
  "/notifications",
  "/inbox",
  "/leaderboards",
  "/bounties",
  "/vip",
  "/trenchy-ai",
  "/feather-ai",
  "/swap",
  "/dashboard",
  "/social",
  "/profile",
];

function isSocialRoute(path: string): boolean {
  return (
    SOCIAL_PATHS.some((p) => path === p || path.startsWith(p + "/")) ||
    path.startsWith("/u/")
  );
}

export function AppShell({ children, rightSidebar, onPostClick }: AppShellProps) {
  const { profile, token, profileFetched } = useSocialAuth();
  const [location, navigate] = useLocation();

  // Redirect to profile setup when signed in but no profile yet
  const skipRedirectPaths = ["/profile/setup", "/profile", "/settings"];
  const shouldSkip = skipRedirectPaths.some((p) => location === p || location.startsWith(p + "/"));
  useEffect(() => {
    if (profileFetched && token && !profile && !shouldSkip) {
      navigate("/profile/setup");
    }
  }, [profileFetched, token, profile, shouldSkip]); // eslint-disable-line react-hooks/exhaustive-deps

  const showSidebar = isSocialRoute(location);
  const isWideRoute =
    location === "/feather-ai" ||
    location === "/trenchy-ai" ||
    location.startsWith("/feather-ai/") ||
    location === "/swap";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Unified top navbar on every page */}
      <Navbar />

      {showSidebar ? (
        // ── Social pages: X.com-style centered layout ─────────────────────────
        <div className={`flex flex-1 w-full mx-auto ${isWideRoute ? "max-w-[1400px]" : "max-w-[1265px]"}`}>
          {/* Left navigation sidebar */}
          <AppSidebar profile={profile} onPostClick={onPostClick} />

          {/* Center column — AI / Swap get full remaining width; feed stays ~600px */}
          <div
            className={`flex-1 min-w-0 border-r border-border flex flex-col min-h-screen ${
              isWideRoute ? "" : "max-w-[600px]"
            }`}
          >
            <main className="flex-1 min-w-0">{children}</main>
          </div>

          {/* Right sidebar — xl only; never on wide routes (needs the space) */}
          {!isWideRoute && rightSidebar && (
            <div className="hidden xl:block w-[350px] shrink-0 px-4 py-4">
              {rightSidebar}
            </div>
          )}
        </div>
      ) : (
        // ── Non-social pages: full-width content ────────────────────────────────
        <main className="flex-1">{children}</main>
      )}
    </div>
  );
}
