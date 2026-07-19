import { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  Menu, X, Home, Bell, BarChart2, Users, Trophy, Megaphone,
  Star, Repeat2, Sparkles, Bot, LayoutDashboard, User, Zap,
} from "lucide-react";
import { useSocialAuth } from "@/hooks/use-social-auth";
import { useWalletConnect } from "@/hooks/use-wallet-connect";

function FeatherLogo({ className }: { className?: string }) {
  return (
    <img
      src="/feather_logo.png"
      alt="Feather"
      className={`rounded-lg object-cover ${className ?? ""}`}
    />
  );
}

function BagsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M6.5 2a1 1 0 0 0-.894.553L4 6H3a1 1 0 0 0-1 1v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a1 1 0 0 0-1-1h-1l-1.606-3.447A1 1 0 0 0 17.5 2h-11zm.882 2h9.236l1.2 2H6.182l1.2-2zM4 8h16v11H4V8zm5 3a3 3 0 1 0 6 0h-2a1 1 0 1 1-2 0H9z" />
    </svg>
  );
}

const mobileNav = [
  { href: "/", label: "Home", icon: <Home className="w-5 h-5" /> },
  { href: "/launch", label: "Launch", icon: <BagsIcon className="w-5 h-5" /> },
  { href: "/dex", label: "DEX", icon: <BarChart2 className="w-5 h-5" /> },
  { href: "/community", label: "Social", icon: <Zap className="w-5 h-5" /> },
  { href: "/communities", label: "Communities", icon: <Users className="w-5 h-5" /> },
  { href: "/notifications", label: "Notifications", icon: <Bell className="w-5 h-5" /> },
  { href: "/leaderboards", label: "Leaderboards", icon: <Trophy className="w-5 h-5" /> },
  { href: "/bounties", label: "Bounties", icon: <Megaphone className="w-5 h-5" /> },
  { href: "/vip", label: "VIP Lounge", icon: <Star className="w-5 h-5" /> },
  { href: "/swap", label: "Swap", icon: <Repeat2 className="w-5 h-5" /> },
  { href: "/feather-ai", label: "Feather AI", icon: <Sparkles className="w-5 h-5" /> },
  { href: "/bots", label: "Bots", icon: <Bot className="w-5 h-5" /> },
  { href: "/dashboard", label: "Dashboard", icon: <LayoutDashboard className="w-5 h-5" /> },
];

export function AppTopbar() {
  const [open, setOpen] = useState(false);
  const [location] = useLocation();
  const { profile } = useSocialAuth();
  const { connected, publicKey, connect, disconnect } = useWalletConnect();

  const shortKey = publicKey
    ? `${publicKey.slice(0, 4)}…${publicKey.slice(-4)}`
    : null;

  return (
    <>
      {/* Mobile topbar — only visible below lg */}
      <header className="lg:hidden sticky top-0 z-40 flex items-center justify-between px-4 h-14 bg-background/90 backdrop-blur-md border-b border-border">
        <Link href="/">
          <div className="flex items-center gap-2 cursor-pointer">
            <FeatherLogo className="w-7 h-7" />
            <span className="font-bold text-base tracking-tight">
              Feather<span className="text-primary"> App</span>
            </span>
          </div>
        </Link>

        <div className="flex items-center gap-2">
          {connected ? (
            <button
              onClick={disconnect}
              className="text-xs px-3 py-1.5 rounded-lg bg-primary/10 text-primary border border-primary/20 font-medium"
            >
              {shortKey}
            </button>
          ) : (
            <button
              onClick={() => connect()}
              className="text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-semibold"
            >
              Connect
            </button>
          )}
          <button
            onClick={() => setOpen(true)}
            className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Mobile drawer */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <nav className="relative ml-auto w-72 h-full bg-card border-l border-border flex flex-col animate-slide-up overflow-y-auto">
            <div className="flex items-center justify-between px-4 py-4 border-b border-border">
              <span className="font-bold text-base">Menu</span>
              <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex flex-col gap-0.5 p-3 flex-1">
              {mobileNav.map((item) => {
                const isActive = item.href === "/" ? location === "/" : location.startsWith(item.href);
                return (
                  <Link key={item.href} href={item.href}>
                    <button
                      onClick={() => setOpen(false)}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl w-full text-left text-sm transition-colors
                        ${isActive ? "bg-primary/10 text-primary font-semibold" : "text-muted-foreground hover:text-foreground hover:bg-muted/60"}`}
                    >
                      {item.icon}
                      {item.label}
                    </button>
                  </Link>
                );
              })}
            </div>
            {profile && (
              <div className="p-4 border-t border-border">
                <Link href={`/u/${profile.username ?? profile.walletAddress}`}>
                  <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-muted transition-colors cursor-pointer" onClick={() => setOpen(false)}>
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                      {profile.username ? profile.username.slice(0, 2).toUpperCase() : "??"}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{profile.username ?? `${profile.walletAddress.slice(0, 6)}…`}</p>
                      <p className="text-xs text-muted-foreground truncate">@{profile.username ?? profile.walletAddress.slice(0, 8)}</p>
                    </div>
                  </div>
                </Link>
              </div>
            )}
          </nav>
        </div>
      )}
    </>
  );
}
