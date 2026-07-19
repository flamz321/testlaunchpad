import { useState } from "react";
import { useLocation } from "wouter";
import { useSocialAuth } from "@/hooks/use-social-auth";
import { useWalletConnect } from "@/hooks/use-wallet-connect";
import { useToast } from "@/hooks/use-toast";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { User, ImagePlus, Loader2, CheckCircle2, Info } from "lucide-react";
import trenchyLogo from "@assets/shovel_logo_1773942108763.jpg";

export default function ProfileSetup() {
  const [, navigate] = useLocation();
  const wallet = useWalletConnect();
  const { token, signIn, loading: authLoading, refetchProfile } = useSocialAuth();
  const { toast } = useToast();

  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [twitterLink, setTwitterLink] = useState("");
  const [websiteLink, setWebsiteLink] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState<"idle" | "checking" | "available" | "taken">("idle");
  const [usernameTimer, setUsernameTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File too large", description: "Avatar must be under 5MB", variant: "destructive" });
      return;
    }
    setAvatarFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setAvatarPreview(reader.result as string);
    reader.readAsDataURL(file);
  }

  function handleUsernameChange(val: string) {
    const clean = val.slice(0, 15).replace(/[^a-zA-Z0-9_]/g, "");
    setUsername(clean);
    setUsernameStatus("idle");
    if (usernameTimer) clearTimeout(usernameTimer);
    if (clean.length < 1) return;
    const t = setTimeout(async () => {
      setUsernameStatus("checking");
      try {
        const res = await fetch(`/api/social/check-username/${encodeURIComponent(clean)}`);
        const data = await res.json();
        setUsernameStatus(data.available ? "available" : "taken");
      } catch {
        setUsernameStatus("idle");
      }
    }, 500);
    setUsernameTimer(t);
  }

  async function uploadAvatar(): Promise<string | undefined> {
    if (!avatarFile) return undefined;
    setUploading(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          resolve(result.split(",")[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(avatarFile);
      });
      const res = await fetch("/api/ipfs/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: `data:${avatarFile.type};base64,${base64}`, type: "profile" }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Upload failed");
      }
      const { cid } = await res.json();
      return cid;
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) {
      await signIn();
      return;
    }
    if (username && usernameStatus === "taken") {
      toast({ title: "Fix username", description: "That username is already taken", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const profileImageIpfsCid = await uploadAvatar();
      const res = await fetch("/api/social/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          username: username.trim() || undefined,
          bio: bio.trim() || undefined,
          twitterLink: twitterLink.trim() || undefined,
          websiteLink: websiteLink.trim() || undefined,
          profileImageIpfsCid,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to create profile");
      }
      const created = await res.json();
      await refetchProfile();
      const assigned = created?.username || username.trim() || null;
      const label = assigned ? `@${assigned}` : "trader";
      toast({
        title: "Profile created!",
        description: username.trim()
          ? `Welcome to Feather App, ${label}!`
          : `Welcome! Your username is ${label} — you can change it anytime in settings.`,
      });
      try {
        const refCode = localStorage.getItem("feather_ref") ?? localStorage.getItem("trenchy_ref");
        if (refCode && token) {
          await fetch("/api/points/claim-referral", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ code: refCode }),
          });
          localStorage.removeItem("feather_ref");
          localStorage.removeItem("trenchy_ref");
        }
      } catch {}
      navigate("/community");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = !submitting && !uploading && usernameStatus !== "taken" && usernameStatus !== "checking";

  const ConnectScreen = (
    <div className="flex flex-col items-center justify-center min-h-screen gap-6 px-4">
      <div className="glass-panel rounded-2xl p-10 text-center max-w-md w-full">
        <img src={trenchyLogo} alt="Feather App" className="w-16 h-16 rounded-xl mx-auto mb-4 object-cover" />
        <h1 className="text-2xl font-bold mb-2">Create Your Profile</h1>
        <p className="text-muted-foreground mb-6">Connect MetaMask, Rabby, or Robinhood Wallet to get started on Feather App.</p>
        <Button data-testid="button-connect-wallet-setup" onClick={() => wallet.connect()} className="w-full">
          Connect Wallet
        </Button>
      </div>
    </div>
  );

  const SignInScreen = (
    <div className="flex flex-col items-center justify-center min-h-screen gap-6 px-4">
      <div className="glass-panel rounded-2xl p-10 text-center max-w-md w-full">
        <img src={trenchyLogo} alt="Feather App" className="w-16 h-16 rounded-xl mx-auto mb-4 object-cover" />
        <h1 className="text-2xl font-bold mb-2">Verify Your Wallet</h1>
        <p className="text-muted-foreground mb-6">Sign a message to confirm your wallet and create your account.</p>
        <Button data-testid="button-sign-in-setup" onClick={signIn} disabled={authLoading} className="w-full">
          {authLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          Sign & Continue
        </Button>
      </div>
    </div>
  );

  if (!wallet.connected) return <AppShell>{ConnectScreen}</AppShell>;
  if (!token) return <AppShell>{SignInScreen}</AppShell>;

  return (
    <AppShell>
      <div className="flex flex-col items-center justify-center py-12 px-4">
        <div className="glass-panel rounded-2xl p-8 max-w-lg w-full">
          <div className="flex items-center gap-3 mb-6">
            <User className="w-7 h-7 text-primary" />
            <div>
              <h1 className="text-xl font-bold">Create Your Profile</h1>
              <p className="text-sm text-muted-foreground">Set up your Feather App identity — just connect and go</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Avatar */}
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center overflow-hidden shrink-0">
                {avatarPreview
                  ? <img src={avatarPreview} alt="avatar preview" className="w-full h-full object-cover" />
                  : <span className="text-2xl font-bold text-primary">{username ? username.slice(0, 2).toUpperCase() : "?"}</span>
                }
              </div>
              <div>
                <Label className="text-sm font-medium mb-1 block">Profile Photo</Label>
                <label
                  data-testid="input-avatar-upload"
                  htmlFor="avatar-upload"
                  className="flex items-center gap-2 cursor-pointer px-3 py-2 rounded-lg border border-border bg-muted/50 hover:bg-muted text-sm transition-colors"
                >
                  <ImagePlus className="w-4 h-4" />
                  {avatarFile ? avatarFile.name.slice(0, 20) : "Upload image"}
                </label>
                <input id="avatar-upload" type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
                <p className="text-[10px] text-muted-foreground mt-1">PNG, JPG, GIF · max 5MB · stored on IPFS</p>
              </div>
            </div>

            {/* Username */}
            <div>
              <Label htmlFor="username" className="text-sm font-medium mb-1.5 flex items-center gap-2">
                Username
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal">Optional</Badge>
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">@</span>
                <Input
                  id="username"
                  data-testid="input-username"
                  value={username}
                  onChange={(e) => handleUsernameChange(e.target.value)}
                  placeholder="your_handle (or leave blank)"
                  className="pl-7 pr-8"
                  maxLength={15}
                />
                {usernameStatus === "available" && (
                  <CheckCircle2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-400" />
                )}
              </div>
              <p className={`text-[11px] mt-1 ${
                usernameStatus === "taken" ? "text-destructive" :
                usernameStatus === "available" ? "text-emerald-400" :
                "text-muted-foreground"
              }`}>
                {usernameStatus === "taken" ? "Username already taken" :
                 usernameStatus === "available" ? "Username available" :
                 usernameStatus === "checking" ? "Checking..." :
                 "Leave blank and we'll assign a random username you can change anytime"}
              </p>
            </div>

            {/* Bio */}
            <div>
              <Label htmlFor="bio" className="text-sm font-medium mb-1.5 block">Bio</Label>
              <Textarea
                id="bio"
                data-testid="input-bio"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Tell the markets about yourself..."
                className="resize-none h-20"
                maxLength={160}
              />
              <p className="text-[11px] text-muted-foreground mt-1 text-right">{bio.length}/160</p>
            </div>

            {/* Social links */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="twitter" className="text-xs text-muted-foreground mb-1 block">X / Twitter</Label>
                <Input id="twitter" data-testid="input-twitter" value={twitterLink} onChange={(e) => setTwitterLink(e.target.value)} placeholder="https://x.com/..." className="text-sm" />
              </div>
              <div>
                <Label htmlFor="website" className="text-xs text-muted-foreground mb-1 block">Website</Label>
                <Input id="website" data-testid="input-website" value={websiteLink} onChange={(e) => setWebsiteLink(e.target.value)} placeholder="https://..." className="text-sm" />
              </div>
            </div>

            <Button
              type="submit"
              data-testid="button-create-profile"
              disabled={!canSubmit}
              className="w-full"
            >
              {(submitting || uploading) ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {uploading ? "Uploading avatar..." : submitting ? "Creating profile..." : "Create Profile"}
            </Button>

            <p className="text-center text-[11px] text-muted-foreground flex items-center justify-center gap-1">
              <Info className="w-3 h-3" />
              Your wallet address identifies you on-chain. A username is always assigned — pick one now or get a random handle you can change later.
            </p>
          </form>
        </div>
      </div>
    </AppShell>
  );
}
