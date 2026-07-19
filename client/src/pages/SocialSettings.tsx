import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useSocialAuth, socialAuthHeaders } from "@/hooks/use-social-auth";
import { useWalletConnect } from "@/hooks/use-wallet-connect";
import { useToast } from "@/hooks/use-toast";
import { SocialLayout } from "@/components/SocialLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Settings, Shield, ShieldCheck, ShieldOff, Loader2, KeyRound,
  User, ImagePlus, ExternalLink, AlertTriangle, CheckCircle2, RefreshCw
} from "lucide-react";

export default function SocialSettings() {
  const [, navigate] = useLocation();
  const wallet = useWalletConnect();
  const { token, profile, signIn, loading: authLoading, refetchProfile } = useSocialAuth();
  const { toast } = useToast();

  // Profile edit state
  const [bio, setBio] = useState(profile?.bio ?? "");
  const [twitterLink, setTwitterLink] = useState(profile?.twitterLink ?? "");
  const [websiteLink, setWebsiteLink] = useState(profile?.websiteLink ?? "");
  const [githubLink, setGithubLink] = useState(profile?.githubLink ?? "");
  const [instagramLink, setInstagramLink] = useState(profile?.instagramLink ?? "");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  // 2FA state
  const [totpSetup, setTotpSetup] = useState<{ secret: string; qrCodeDataUrl: string; otpAuthUrl: string } | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [totpLoading, setTotpLoading] = useState(false);
  const [totpAction, setTotpAction] = useState<"enable" | "disable" | null>(null);

  // Balance state
  const [balanceRefreshing, setBalanceRefreshing] = useState(false);

  const { data: balance, refetch: refetchBalance } = useQuery<{ balance: number; fromCache: boolean }>({
    queryKey: ["/api/social/balance"],
    queryFn: () => fetch("/api/social/balance", { headers: socialAuthHeaders(token) }).then((r) => r.json()),
    enabled: !!token,
  });

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File too large", description: "Max 5MB", variant: "destructive" });
      return;
    }
    setAvatarFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setAvatarPreview(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function uploadAvatar(): Promise<string | undefined> {
    if (!avatarFile) return undefined;
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve((reader.result as string).split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(avatarFile);
    });
    const res = await fetch("/api/ipfs/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: base64, mimeType: avatarFile.type, filename: avatarFile.name }),
    });
    if (!res.ok) throw new Error("Avatar upload failed");
    const { cid } = await res.json();
    return cid;
  }

  async function saveProfile() {
    if (!token) return;
    setSavingProfile(true);
    try {
      const profileImageIpfsCid = await uploadAvatar();
      const body: Record<string, string | undefined> = {
        bio: bio.trim() || undefined,
        twitterLink: twitterLink.trim() || undefined,
        websiteLink: websiteLink.trim() || undefined,
        githubLink: githubLink.trim() || undefined,
        instagramLink: instagramLink.trim() || undefined,
      };
      if (profileImageIpfsCid) body.profileImageIpfsCid = profileImageIpfsCid;
      const res = await fetch("/api/social/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...socialAuthHeaders(token) },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      await refetchProfile();
      setAvatarFile(null);
      setAvatarPreview(null);
      toast({ title: "Profile updated!" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSavingProfile(false);
    }
  }

  async function setup2FA() {
    if (!token) return;
    setTotpLoading(true);
    try {
      const res = await fetch("/api/social/2fa/setup", { headers: socialAuthHeaders(token) });
      if (!res.ok) throw new Error((await res.json()).error);
      const data = await res.json();
      setTotpSetup(data);
      setTotpAction("enable");
      setTotpCode("");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setTotpLoading(false);
    }
  }

  async function confirmTotp() {
    if (!token || !totpCode || !totpAction) return;
    setTotpLoading(true);
    try {
      const endpoint = totpAction === "enable" ? "/api/social/2fa/enable" : "/api/social/2fa/disable";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...socialAuthHeaders(token) },
        body: JSON.stringify({ code: totpCode }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      await refetchProfile();
      setTotpSetup(null);
      setTotpCode("");
      setTotpAction(null);
      toast({ title: totpAction === "enable" ? "2FA enabled!" : "2FA disabled", description: totpAction === "enable" ? "Your account is now secured with 2FA." : "Two-factor authentication removed." });
    } catch (err: any) {
      toast({ title: "Invalid code", description: err.message, variant: "destructive" });
    } finally {
      setTotpLoading(false);
    }
  }

  async function refreshBalance() {
    if (!token) return;
    setBalanceRefreshing(true);
    try {
      const res = await fetch("/api/social/balance?refresh=1", { headers: socialAuthHeaders(token) });
      if (!res.ok) throw new Error((await res.json()).error);
      await refetchBalance();
      toast({ title: "Balance refreshed" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setBalanceRefreshing(false);
    }
  }

  if (!wallet.connected) {
    return (
      <SocialLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-4">
          <Settings className="w-10 h-10 text-muted-foreground opacity-30" />
          <p className="text-muted-foreground">Connect your wallet to access settings</p>
          <Button onClick={() => wallet.connect()}>Connect Wallet</Button>
        </div>
      </SocialLayout>
    );
  }

  if (!token) {
    return (
      <SocialLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-4">
          <Settings className="w-10 h-10 text-muted-foreground opacity-30" />
          <p className="text-muted-foreground">Sign in to access settings</p>
          <Button onClick={signIn} disabled={authLoading}>
            {authLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Sign In
          </Button>
        </div>
      </SocialLayout>
    );
  }

  if (!profile) {
    return (
      <SocialLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-4">
          <User className="w-10 h-10 text-muted-foreground opacity-30" />
          <p className="text-muted-foreground">You need a profile first</p>
          <Button onClick={() => navigate("/profile/setup")}>Create Profile</Button>
        </div>
      </SocialLayout>
    );
  }

  const currentAvatar = profile.profileImageIpfsCid ? `https://gateway.pinata.cloud/ipfs/${profile.profileImageIpfsCid}` : null;

  return (
    <SocialLayout>
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <Settings className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-xl font-bold">Profile Settings</h1>
            <p className="text-sm text-muted-foreground">@{profile.username}</p>
          </div>
        </div>

        {/* ── Edit Profile ─────────────────────────────────────────────────────── */}
        <div className="glass-panel rounded-2xl p-6 mb-5">
          <h2 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-2">
            <User className="w-4 h-4" />
            Edit Profile
          </h2>

          <div className="flex items-center gap-4 mb-4">
            <div className="w-16 h-16 rounded-full overflow-hidden bg-primary/10 flex items-center justify-center shrink-0">
              {(avatarPreview || currentAvatar)
                ? <img src={avatarPreview ?? currentAvatar!} alt="avatar" className="w-full h-full object-cover" />
                : <span className="text-lg font-bold text-primary">{profile.username.slice(0, 2).toUpperCase()}</span>
              }
            </div>
            <div>
              <label
                data-testid="input-avatar-upload-settings"
                htmlFor="avatar-settings-upload"
                className="flex items-center gap-2 cursor-pointer px-3 py-2 rounded-lg border border-border bg-muted/50 hover:bg-muted text-sm transition-colors"
              >
                <ImagePlus className="w-4 h-4" />
                Change photo
              </label>
              <input id="avatar-settings-upload" type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
              <p className="text-[10px] text-muted-foreground mt-1">PNG, JPG, GIF · max 5MB</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Bio</Label>
              <Textarea
                data-testid="input-settings-bio"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Tell the markets about yourself..."
                className="resize-none h-20 text-sm"
                maxLength={160}
              />
              <p className="text-[11px] text-muted-foreground mt-1 text-right">{bio.length}/160</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">X / Twitter</Label>
                <Input data-testid="input-settings-twitter" value={twitterLink} onChange={(e) => setTwitterLink(e.target.value)} placeholder="https://x.com/..." className="text-sm" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Website</Label>
                <Input data-testid="input-settings-website" value={websiteLink} onChange={(e) => setWebsiteLink(e.target.value)} placeholder="https://..." className="text-sm" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">GitHub</Label>
                <Input data-testid="input-settings-github" value={githubLink} onChange={(e) => setGithubLink(e.target.value)} placeholder="https://github.com/..." className="text-sm" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Instagram</Label>
                <Input data-testid="input-settings-instagram" value={instagramLink} onChange={(e) => setInstagramLink(e.target.value)} placeholder="https://instagram.com/..." className="text-sm" />
              </div>
            </div>
            <Button
              data-testid="button-save-profile"
              onClick={saveProfile}
              disabled={savingProfile}
              className="w-full"
            >
              {savingProfile ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Save Changes
            </Button>
          </div>
        </div>

        {/* ── 2FA ─────────────────────────────────────────────────────────────── */}
        <div className="glass-panel rounded-2xl p-6 mb-5">
          <h2 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-2">
            <Shield className="w-4 h-4" />
            Two-Factor Authentication
          </h2>

          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              {profile.totpEnabled
                ? <ShieldCheck className="w-8 h-8 text-emerald-400" />
                : <ShieldOff className="w-8 h-8 text-muted-foreground" />
              }
              <div>
                <p className="font-medium text-sm">{profile.totpEnabled ? "2FA is enabled" : "2FA is disabled"}</p>
                <p className="text-xs text-muted-foreground">
                  {profile.totpEnabled ? "Your account is protected with Google Authenticator / Authy." : "Add an extra layer of security to your account."}
                </p>
              </div>
            </div>
            {!totpAction && (
              profile.totpEnabled ? (
                <Button
                  data-testid="button-disable-2fa"
                  variant="outline"
                  size="sm"
                  onClick={() => { setTotpAction("disable"); setTotpCode(""); }}
                >
                  <ShieldOff className="w-3.5 h-3.5 mr-1.5" />
                  Disable
                </Button>
              ) : (
                <Button
                  data-testid="button-enable-2fa"
                  size="sm"
                  onClick={setup2FA}
                  disabled={totpLoading}
                >
                  {totpLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <ShieldCheck className="w-3.5 h-3.5 mr-1.5" />}
                  Enable 2FA
                </Button>
              )
            )}
          </div>

          {/* QR code setup */}
          {totpAction === "enable" && totpSetup && (
            <div className="border border-border rounded-xl p-4 bg-muted/50">
              <p className="text-sm font-medium mb-3 flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-primary" />
                Scan with Google Authenticator or Authy
              </p>
              <div className="flex flex-col sm:flex-row gap-4 items-start">
                <img
                  src={totpSetup.qrCodeDataUrl}
                  alt="2FA QR code"
                  className="w-40 h-40 rounded-lg border border-border"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground mb-2">Or enter the secret manually:</p>
                  <code className="text-xs bg-muted px-3 py-2 rounded-lg block font-mono break-all">{totpSetup.secret}</code>
                  <a
                    href={totpSetup.otpAuthUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs text-primary mt-2 hover:underline"
                  >
                    <ExternalLink className="w-3 h-3" />
                    Open in authenticator app
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* Code entry */}
          {totpAction && (
            <div className="mt-4 flex gap-2 items-end">
              <div className="flex-1">
                <Label className="text-xs text-muted-foreground mb-1.5 block">
                  {totpAction === "enable" ? "Enter the 6-digit code from your app to confirm" : "Enter the 6-digit code to disable 2FA"}
                </Label>
                <Input
                  data-testid="input-totp-code"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  className="font-mono tracking-widest text-center text-lg"
                  maxLength={6}
                />
              </div>
              <Button
                data-testid="button-confirm-totp"
                onClick={confirmTotp}
                disabled={totpLoading || totpCode.length < 6}
              >
                {totpLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              </Button>
              <Button variant="ghost" onClick={() => { setTotpAction(null); setTotpSetup(null); setTotpCode(""); }}>Cancel</Button>
            </div>
          )}
        </div>

        {/* ── FEATHER Balance ──────────────────────────────────────────────────── */}
        <div className="glass-panel rounded-2xl p-6 mb-5">
          <h2 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-2">
            <KeyRound className="w-4 h-4" />
            FEATHER Balance
          </h2>
          <div className="flex items-center justify-between">
            <div>
              <p data-testid="text-feather-balance" className="text-2xl font-bold">
                {balance?.balance?.toLocaleString(undefined, { maximumFractionDigits: 0 }) ?? "0"}
              </p>
              <p className="text-xs text-muted-foreground">FEATHER tokens in your wallet</p>
              {balance?.fromCache && (
                <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  Cached — click refresh to update
                </p>
              )}
            </div>
            <Button
              data-testid="button-refresh-balance"
              variant="outline"
              size="sm"
              onClick={refreshBalance}
              disabled={balanceRefreshing}
            >
              {balanceRefreshing ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
              Refresh
            </Button>
          </div>
        </div>

        {/* ── View public profile ──────────────────────────────────────────────── */}
        <div className="text-center">
          <Link href={`/social/profile/${profile.walletAddress}`}>
            <Button variant="outline" size="sm">
              <User className="w-3.5 h-3.5 mr-1.5" />
              View public profile
            </Button>
          </Link>
        </div>
      </div>
    </SocialLayout>
  );
}
