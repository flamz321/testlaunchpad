import { useState, useRef, useEffect } from "react";
import { Send, TrendingUp, BookOpen, Menu, X, ChevronDown, Wallet, LogOut, Copy, Check, BarChart2, Bot, Shield, Rocket, Trophy, Briefcase, Crown, Globe, Mail, MessageCircle, Bell, LayoutDashboard, User, Users, Sparkles, ArrowLeftRight, UserPlus, LogIn, Activity, Sun, Moon, Microscope, ShieldQuestion, Radio } from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";
import { motion, AnimatePresence } from "framer-motion";
import { SiX, SiDiscord } from "react-icons/si";
import { Link, useLocation } from "wouter";
import { useWalletConnect } from "@/hooks/use-wallet-connect";
import { useSocialAuth, socialAuthHeaders } from "@/hooks/use-social-auth";
import { useQuery } from "@tanstack/react-query";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { profilePath } from "@/lib/profileUrl";

const shovelLogo = "/feather_logo.png";

const BOT_USERNAME = import.meta.env.VITE_TELEGRAM_BOT_USERNAME || "FeatherAppBot";
const DISCORD_INVITE_URL = import.meta.env.VITE_DISCORD_INVITE_URL || "https://discord.com/oauth2/authorize?client_id=1481865866151989409&permissions=101376&integration_type=0&scope=bot+applications.commands";
const ADMIN_WALLET = "0x752C3b6CB472D426AD0438f202A46dFa7D58aF34";

const WALLET_ROUTES = ["/dex", "/intel", "/wallet-check", "/scan-token", "/swap", "/dashboard", "/admin", "/social", "/launches", "/launch-feed", "/community", "/leaderboards", "/bounties", "/vip", "/inbox", "/profile", "/u/", "/feather-ai", "/trenchy-ai", "/bags-launch"];

function truncatePk(pk: string) {
  return `${pk.slice(0, 4)}...${pk.slice(-4)}`;
}

function NotificationBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center leading-none z-10">
      {count > 99 ? "99+" : count}
    </span>
  );
}

function WalletButton() {
  const wallet = useWalletConnect();
  const { token, signOut, profile } = useSocialAuth();
  const { openAuthModal } = useAuthModal();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [, navigate] = useLocation();

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  const { data: notifData } = useQuery<{ unreadDMs: number; newReplies: number; total: number }>({
    queryKey: ["/api/notifications/count"],
    queryFn: () =>
      fetch("/api/notifications/count", { headers: socialAuthHeaders(token) }).then(async (r) => {
        if (!r.ok) return { unreadDMs: 0, newReplies: 0, total: 0 };
        return r.json();
      }),
    enabled: !!token && wallet.connected,
    refetchInterval: 5 * 60 * 1000,
    staleTime: 4 * 60 * 1000,
  });

  const totalNotifs = notifData?.total ?? 0;

  const copyKey = () => {
    if (!wallet.publicKey) return;
    navigator.clipboard.writeText(wallet.publicKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (!token || !wallet.publicKey) {
    return (
      <div className="flex items-center gap-2">
        <button
          data-testid="button-nav-login"
          onClick={() => openAuthModal("login")}
          className="flex items-center gap-1.5 px-3 py-2 rounded-full font-semibold text-sm
                     text-muted-foreground hover:text-foreground border border-border hover:border-border
                     transition-all duration-200"
        >
          <LogIn className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Log In</span>
        </button>
        <button
          data-testid="button-nav-signup"
          onClick={() => openAuthModal("signup")}
          className="flex items-center gap-1.5 px-3 py-2 rounded-full font-semibold text-sm
                     bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30
                     transition-all duration-200"
        >
          <UserPlus className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Sign Up</span>
        </button>
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        data-testid="button-wallet-connected"
        onClick={() => setOpen((o) => !o)}
        className="relative flex items-center gap-2 px-3 py-2 rounded-full font-semibold text-sm
                   bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30
                   transition-all duration-200"
      >
        <NotificationBadge count={totalNotifs} />
        <Wallet className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">{truncatePk(wallet.publicKey!)}</span>
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 mt-2 w-52 rounded-xl bg-black border border-border shadow-2xl z-50 p-2"
          >
            <div className="px-3 py-2 text-xs text-muted-foreground border-b border-border mb-1">
              <span className="font-medium text-foreground">{wallet.walletName}</span>
              <br />
              <span className="font-mono opacity-70">{truncatePk(wallet.publicKey!)}</span>
            </div>

            {/* Admin Dashboard — admin wallet only */}
            {wallet.publicKey?.toLowerCase() === ADMIN_WALLET.toLowerCase() && (
              <button
                data-testid="button-wallet-admin"
                onClick={() => { navigate("/admin"); setOpen(false); }}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-yellow-400 rounded-lg hover:bg-yellow-500/10 transition-colors"
              >
                <Shield className="w-3.5 h-3.5" />
                Admin Dashboard
              </button>
            )}

            {/* User Dashboard */}
            <button
              data-testid="button-wallet-dashboard"
              onClick={() => { navigate("/dashboard"); setOpen(false); }}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm rounded-lg hover:bg-muted transition-colors"
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              My Dashboard
            </button>

            {/* Own Profile */}
            <button
              data-testid="button-wallet-profile"
              onClick={() => {
                navigate(profilePath({ username: profile?.username, walletAddress: wallet.publicKey }));
                setOpen(false);
              }}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm rounded-lg hover:bg-muted transition-colors"
            >
              <User className="w-3.5 h-3.5" />
              My Profile
            </button>

            {/* DM Inbox with unread badge */}
            <button
              data-testid="button-wallet-inbox"
              onClick={() => { navigate("/inbox"); setOpen(false); }}
              className="relative flex items-center gap-2 w-full px-3 py-2 text-sm rounded-lg hover:bg-muted transition-colors"
            >
              <Mail className="w-3.5 h-3.5" />
              DM Inbox
              {(notifData?.unreadDMs ?? 0) > 0 && (
                <span className="ml-auto min-w-[18px] px-1.5 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                  {notifData!.unreadDMs}
                </span>
              )}
            </button>

            {/* New Replies — only visible when there are unseen replies */}
            {(notifData?.newReplies ?? 0) > 0 && (
              <button
                data-testid="button-wallet-replies"
                onClick={() => { navigate("/community"); setOpen(false); }}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm rounded-lg hover:bg-muted transition-colors"
              >
                <Bell className="w-3.5 h-3.5" />
                New Replies
                <span className="ml-auto min-w-[18px] px-1.5 rounded-full bg-primary/80 text-white text-[9px] font-bold flex items-center justify-center">
                  {notifData!.newReplies}
                </span>
              </button>
            )}

            <div className="border-t border-border my-1" />

            <button
              onClick={copyKey}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm rounded-lg hover:bg-muted transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? "Copied!" : "Copy address"}
            </button>
            <button
              onClick={() => { wallet.disconnect(); signOut(); setOpen(false); }}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-400 rounded-lg hover:bg-red-500/10 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              Disconnect
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function CommunityDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [location] = useLocation();

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  const communityLinks = [
    { href: "/community", label: "Social Feed", icon: <Globe className="w-3.5 h-3.5" />, desc: "The pulse of the market" },
    { href: "/communities", label: "Communities", icon: <Users className="w-3.5 h-3.5" />, desc: "Join & create communities" },
    { href: "/leaderboards", label: "Leaderboards", icon: <Trophy className="w-3.5 h-3.5" />, desc: "Top launchers & traders" },
    { href: "/bounties", label: "Bounty Board", icon: <Briefcase className="w-3.5 h-3.5" />, desc: "Collaborate & earn" },
    { href: "/vip", label: "VIP Lounge", icon: <Crown className="w-3.5 h-3.5" />, desc: "1M+ $FEATHER exclusive" },
    { href: "/inbox", label: "DM Inbox", icon: <Mail className="w-3.5 h-3.5" />, desc: "Your direct messages" },
  ];

  const isActive = communityLinks.some((l) => location === l.href || location.startsWith(l.href + "/"));

  return (
    <div ref={ref} className="relative">
      <button
        data-testid="button-community-dropdown"
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 text-sm font-medium transition-colors ${
          isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <MessageCircle className="w-3.5 h-3.5" />
        Community
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute left-0 mt-2 w-56 rounded-xl bg-black border border-border shadow-2xl z-50 p-2"
          >
            <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Feather Community
            </div>
            {communityLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                data-testid={`link-community-${link.label.toLowerCase().replace(/\s/g, "-")}`}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-2.5 w-full px-3 py-2.5 text-sm rounded-lg hover:bg-muted transition-colors ${
                  location === link.href ? "text-primary" : "text-foreground"
                }`}
              >
                <span className="text-muted-foreground">{link.icon}</span>
                <div>
                  <div className="font-semibold text-xs">{link.label}</div>
                  <div className="text-[10px] text-muted-foreground">{link.desc}</div>
                </div>
              </Link>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function IntelDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [location] = useLocation();

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  const intelLinks = [
    { href: "/intel", label: "Intel Analytics", icon: <Radio className="w-3.5 h-3.5" />, desc: "Live Robinhood Chain pulse", color: "text-primary" },
    { href: "/wallet-check", label: "Check Wallet", icon: <ShieldQuestion className="w-3.5 h-3.5" />, desc: "Behavioral profile & risk score", color: "text-primary" },
    { href: "/scan-token", label: "Scan Token", icon: <Microscope className="w-3.5 h-3.5" />, desc: "Holders, bundles & supply map", color: "text-emerald-400" },
  ];

  const isActive = intelLinks.some(l => location === l.href || location.startsWith(l.href + "/"));

  return (
    <div ref={ref} className="relative">
      <button
        data-testid="button-intel-dropdown"
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1.5 text-sm font-medium transition-colors ${
          isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <ShieldQuestion className="w-3.5 h-3.5" />
        Intel
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute left-0 mt-2 w-56 rounded-xl bg-black border border-border shadow-2xl z-50 p-2"
          >
            <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Chain Intelligence
            </div>
            {intelLinks.map(link => (
              <Link
                key={link.href}
                href={link.href}
                data-testid={`link-intel-${link.label.toLowerCase().replace(/\s/g, "-")}`}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-2.5 w-full px-3 py-2.5 text-sm rounded-lg hover:bg-muted transition-colors ${
                  location === link.href ? "text-primary" : "text-foreground"
                }`}
              >
                <span className={link.color}>{link.icon}</span>
                <div>
                  <div className="font-semibold text-xs">{link.label}</div>
                  <div className="text-[10px] text-muted-foreground">{link.desc}</div>
                </div>
              </Link>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function BotsDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        data-testid="button-bots-dropdown"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <Bot className="w-3.5 h-3.5" />
        Feather Bots
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute left-0 mt-2 w-52 rounded-xl bg-black border border-border shadow-2xl z-50 p-2"
          >
            <Link
              href="/bots"
              data-testid="link-bots-stats-page"
              className="flex items-center gap-2.5 w-full px-3 py-2.5 text-sm rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
              onClick={() => setOpen(false)}
            >
              <Activity className="w-4 h-4 text-primary" />
              <div>
                <div className="font-semibold text-foreground">Bot Stats & Deployments</div>
                <div className="text-[10px] text-muted-foreground">Live stats, recent launches</div>
              </div>
            </Link>
            <div className="my-1 border-t border-white/8" />
            <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Launch Token With
            </div>
            <a
              href={`https://t.me/${BOT_USERNAME}`}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="link-bots-telegram"
              className="flex items-center gap-2.5 w-full px-3 py-2.5 text-sm rounded-lg hover:bg-muted transition-colors text-[#26A5E4]"
              onClick={() => setOpen(false)}
            >
              <Send className="w-4 h-4" />
              <div>
                <div className="font-semibold">Telegram Bot</div>
                <div className="text-[10px] text-muted-foreground">@{BOT_USERNAME}</div>
              </div>
            </a>
            <a
              href={DISCORD_INVITE_URL}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="link-bots-discord"
              className="flex items-center gap-2.5 w-full px-3 py-2.5 text-sm rounded-lg hover:bg-muted transition-colors text-[#5865F2]"
              onClick={() => setOpen(false)}
            >
              <SiDiscord className="w-4 h-4" />
              <div>
                <div className="font-semibold">Discord Bot</div>
                <div className="text-[10px] text-muted-foreground">Add to your server</div>
              </div>
            </a>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [location] = useLocation();
  const { theme, toggle: toggleTheme } = useTheme();

  useEffect(() => { setMobileOpen(false); }, [location]);


  const navLinks = [
    { href: "/", label: "Home" },
    { href: "/launchpad", label: "Launchpad", icon: <Rocket className="w-3.5 h-3.5" /> },
    { href: "/dex", label: "DEX", icon: <BarChart2 className="w-3.5 h-3.5" /> },
    { href: "/swap", label: "Swap", icon: <ArrowLeftRight className="w-3.5 h-3.5" /> },
    { href: "/docs", label: "Docs", icon: <BookOpen className="w-3.5 h-3.5" /> },
  ];

  const communityMobileLinks = [
    { href: "/community", label: "Social Feed", icon: <Globe className="w-3.5 h-3.5" /> },
    { href: "/communities", label: "Communities", icon: <Users className="w-3.5 h-3.5" /> },
    { href: "/leaderboards", label: "Leaderboards", icon: <Trophy className="w-3.5 h-3.5" /> },
    { href: "/bounties", label: "Bounty Board", icon: <Briefcase className="w-3.5 h-3.5" /> },
    { href: "/vip", label: "VIP Lounge", icon: <Crown className="w-3.5 h-3.5" /> },
  ];

  return (
    <>
      <motion.nav
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="sticky top-0 z-50 bg-background/90 backdrop-blur-md border-b border-border px-4 sm:px-6 py-2.5"
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">

          {/* Logo */}
          <a href="/" className="flex items-center gap-2.5 group cursor-pointer shrink-0">
            <img src={shovelLogo} alt="Feather App" className="w-8 h-8 rounded-lg object-cover" />
            <span className="font-display text-xl font-bold tracking-wider">
              FEATHER <span className="text-primary">APP</span>
            </span>
          </a>

          {/* Desktop nav links */}
          <div className="hidden lg:flex items-center gap-5">
            {navLinks.map((link) => {
              const isActive = link.href === "/"
                ? location === "/"
                : location.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`relative flex items-center gap-1.5 text-sm font-medium transition-colors pb-0.5 ${
                    isActive
                      ? "text-foreground after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:rounded-full after:bg-primary"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  data-testid={`link-nav-${link.label.toLowerCase().replace(/\s/g, "-")}`}
                >
                  {link.icon}
                  {link.label}
                </Link>
              );
            })}
            <CommunityDropdown />
            <IntelDropdown />
            <Link
              href="/feather-ai"
              data-testid="link-nav-feather-ai"
              className={`flex items-center gap-1.5 text-sm font-semibold transition-colors px-2.5 py-1 rounded-full border ${
                location === "/feather-ai" || location === "/trenchy-ai"
                  ? "text-primary border-primary/40 bg-primary/10"
                  : "text-primary/80 border-primary/20 hover:border-primary/40 hover:text-primary hover:bg-primary/5"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              AI
            </Link>
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-2">
            <WalletButton />

            <button
              data-testid="button-theme-toggle"
              onClick={toggleTheme}
              aria-label="Toggle light/dark mode"
              className="p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted border border-border transition-all duration-200"
            >
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <button
              data-testid="button-mobile-menu"
              onClick={() => setMobileOpen((o) => !o)}
              className="lg:hidden p-2 rounded-lg hover:bg-muted transition-colors"
              aria-label="Toggle menu"
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile drawer */}
        <AnimatePresence>
          {mobileOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="lg:hidden overflow-hidden"
            >
              <div className="border-t border-border mt-3 pt-3 pb-2 flex flex-col gap-1">
                {navLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  >
                    {link.icon}
                    {link.label}
                  </Link>
                ))}

                <div className="border-t border-border mt-2 pt-2 flex flex-col gap-1">
                  <div className="px-3 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Community</div>
                  {communityMobileLinks.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    >
                      {link.icon}
                      {link.label}
                    </Link>
                  ))}
                  <Link
                    href="/inbox"
                    className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    DM Inbox
                  </Link>
                </div>
                <div className="border-t border-border mt-2 pt-2 flex flex-col gap-1">
                  <div className="px-3 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Intel</div>
                  <Link href="/intel" className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" onClick={() => setMobileOpen(false)}>
                    <Radio className="w-3.5 h-3.5 text-primary" />Intel Analytics
                  </Link>
                  <Link href="/wallet-check" className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" onClick={() => setMobileOpen(false)}>
                    <ShieldQuestion className="w-3.5 h-3.5 text-primary" />Check Wallet
                  </Link>
                  <Link href="/scan-token" className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" onClick={() => setMobileOpen(false)}>
                    <Microscope className="w-3.5 h-3.5 text-violet-400" />Scan Token
                  </Link>
                </div>
                <div className="border-t border-border mt-2 pt-2 flex flex-col gap-1">
                  <Link
                    href="/feather-ai"
                    data-testid="link-mobile-feather-ai"
                    className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-semibold text-primary hover:bg-primary/10 transition-colors"
                    onClick={() => setMobileOpen(false)}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Feather AI
                    <span className="ml-auto text-[9px] bg-primary/20 px-1.5 py-0.5 rounded font-semibold">BETA</span>
                  </Link>
                </div>
                <div className="border-t border-border mt-2 pt-2 flex flex-col gap-1">
                  <a
                    href="https://x.com/featherapp"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  >
                    <SiX className="w-4 h-4" />
                    Follow on X
                  </a>
                  <div className="mt-2">
                    <WalletButton />
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.nav>

      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}
    </>
  );
}
