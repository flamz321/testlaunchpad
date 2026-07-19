import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSocialAuth, socialAuthHeaders } from "@/hooks/use-social-auth";
import { useWalletConnect } from "@/hooks/use-wallet-connect";
import { useToast } from "@/hooks/use-toast";
import { SocialLayout } from "@/components/SocialLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  User, ImagePlus, Loader2, ArrowLeft, Shield, Globe, Github,
  Instagram, ExternalLink, CheckCircle2, Eye, Lock, Coins, Pencil
} from "lucide-react";
import { SiX } from "react-icons/si";
import trenchyLogo from "@assets/shovel_logo_1773942108763.jpg";
import { profilePath } from "@/lib/profileUrl";

interface GatingSettings {
  minFeatherToPost: number;
  minFeatherToUsername: number;
}

export default function ProfileEdit() {
  const [, navigate] = useLocation();
  const wallet = useWalletConnect();
  const { token, profile, signIn, loading: authLoading, refetchProfile } = useSocialAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: gating } = useQuery<GatingSettings>({
    queryKey: ["/api/social/gating-settings"],
    staleTime: 60_000,
  });

  const minForUsername = gating?.minFeatherToUsername ?? 250_000;

  const [username, setUsername] = useState("");
  const [usernameEditing, setUsernameEditing] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState<"idle" | "checking" | "available" | "taken">("idle");
  const [usernameTimer, setUsernameTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  const [bio, setBio] = useState("");
  const [twitterLink, setTwitterLink] = useState("");
  const [websiteLink, setWebsiteLink] = useState("");
  const [githubLink, setGithubLink] = useState("");
  const [instagramLink, setInstagramLink] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (profile) {
      setUsername(profile.username ?? "");
      setBio(profile.bio ?? "");
      setTwitterLink(profile.twitterLink ?? "");
      setWebsiteLink(profile.websiteLink ?? "");
      setGithubLink(profile.githubLink ?? "");
      setInstagramLink(profile.instagramLink ?? "");
    }
  }, [profile?.walletAddress]);

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

  function handleUsernameChange(val: string) {
    const clean = val.slice(0, 15).replace(/[^a-zA-Z0-9_]/g, "");
    setUsername(clean);
    setUsernameStatus("idle");
    if (usernameTimer) clearTimeout(usernameTimer);
    if (clean.length < 1 || clean === (profile?.username ?? "")) return;
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
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(avatarFile);
    });
    const res = await fetch("/api/ipfs/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageBase64: dataUrl, type: "profile" }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || "Avatar upload failed");
    }
    const { cid } = await res.json();
    return cid;
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    if (usernameStatus === "taken") {
      toast({ title: "Fix username", description: "That username is already taken", variant: "destructive" });
      return;
    }
    setSaving(true);
    setSaved(false);
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
      if (usernameEditing) body.username = username.trim();

      const res = await fetch("/api/social/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...socialAuthHeaders(token) },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      await refetchProfile();
      qc.invalidateQueries({ queryKey: ["/api/social/profile"] });
      qc.invalidateQueries({ queryKey: ["/api/social/feed"] });
      qc.invalidateQueries({ queryKey: ["/api/social/newest-profiles"] });
      setAvatarFile(null);
      setAvatarPreview(null);
      setUsernameEditing(false);
      setSaved(true);
      toast({ title: "Profile updated!", description: usernameEditing ? "Your new username is live across Feather App." : undefined });
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  if (!wallet.connected) {
    return (
      <SocialLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-5 px-4">
          <div className="glass-panel rounded-2xl p-10 text-center max-w-md w-full">
            <img src={trenchyLogo} alt="Feather App" className="w-14 h-14 rounded-xl mx-auto mb-4 object-cover" />
            <h1 className="text-xl font-bold mb-2">Connect your wallet</h1>
            <p className="text-sm text-muted-foreground mb-6">You need a connected wallet to edit your profile.</p>
            <Button onClick={() => wallet.connect()} className="w-full">Connect Wallet</Button>
          </div>
        </div>
      </SocialLayout>
    );
  }

  if (!token) {
    return (
      <SocialLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-5 px-4">
          <div className="glass-panel rounded-2xl p-10 text-center max-w-md w-full">
            <img src={trenchyLogo} alt="Feather App" className="w-14 h-14 rounded-xl mx-auto mb-4 object-cover" />
            <h1 className="text-xl font-bold mb-2">Sign in</h1>
            <p className="text-sm text-muted-foreground mb-6">Sign a message with your wallet to access your profile settings.</p>
            <Button onClick={signIn} disabled={authLoading} className="w-full">
              {authLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Sign In
            </Button>
          </div>
        </div>
      </SocialLayout>
    );
  }

  if (!profile) {
    return (
      <SocialLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-5 px-4">
          <div className="glass-panel rounded-2xl p-10 text-center max-w-md w-full">
            <User className="w-12 h-12 text-muted-foreground opacity-30 mx-auto mb-4" />
            <h1 className="text-xl font-bold mb-2">No profile yet</h1>
            <p className="text-sm text-muted-foreground mb-6">Create your Feather Social profile to get started.</p>
            <Button onClick={() => navigate("/profile/setup")} className="w-full">Create Profile</Button>
          </div>
        </div>
      </SocialLayout>
    );
  }

  const currentAvatarSrc = profile.profileImageIpfsCid
    ? `https://gateway.pinata.cloud/ipfs/${profile.profileImageIpfsCid}`
    : null;
  const displayAvatar = avatarPreview ?? currentAvatarSrc;
  const displayName = profile.username ?? profile.walletAddress.slice(0, 8) + "…";

  return (
    <SocialLayout>
      <div className="max-w-2xl mx-auto px-4 py-6">

        <div className="flex items-center gap-3 mb-6">
          <Link href={profilePath(profile)}>
            <button className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-4 h-4" />
              View public profile
            </button>
          </Link>
        </div>

        <div className="glass-panel rounded-2xl p-6 mb-5">
          <div className="flex items-center gap-3 mb-6">
            <User className="w-6 h-6 text-primary" />
            <div>
              <h1 className="text-xl font-bold">Edit Profile</h1>
              <p className="text-sm text-muted-foreground">{profile.username ? `@${profile.username}` : profile.walletAddress.slice(0, 8) + "…"}</p>
            </div>
          </div>

          <form onSubmit={handleSave} className="space-y-5">

            {/* Avatar */}
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 rounded-full border-2 border-primary/20 overflow-hidden bg-primary/10 flex items-center justify-center shrink-0">
                {displayAvatar
                  ? <img src={displayAvatar} alt="avatar" className="w-full h-full object-cover" />
                  : <span className="text-2xl font-bold text-primary">{displayName.slice(0, 2).toUpperCase()}</span>
                }
              </div>
              <div>
                <Label className="text-sm font-medium mb-1 block">Profile Photo</Label>
                <label
                  data-testid="input-avatar-upload"
                  htmlFor="avatar-edit-upload"
                  className="flex items-center gap-2 cursor-pointer px-3 py-2 rounded-lg border border-border bg-muted/50 hover:bg-muted text-sm transition-colors w-fit"
                >
                  <ImagePlus className="w-4 h-4" />
                  {avatarFile ? avatarFile.name.slice(0, 20) : "Change photo"}
                </label>
                <input id="avatar-edit-upload" type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
                <p className="text-[10px] text-muted-foreground mt-1">PNG, JPG, GIF · max 5MB · stored on IPFS</p>
              </div>
            </div>

            {/* Username */}
            <div>
              <Label className="text-sm font-medium mb-1.5 flex items-center gap-2">
                Username
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal">Optional</Badge>
                {minForUsername > 0 && !usernameEditing && (
                  <span className="flex items-center gap-1 text-[10px] text-amber-400/80">
                    <Lock className="w-3 h-3" />
                    Needs {(minForUsername / 1000).toFixed(0)}k $FEATHER
                  </span>
                )}
              </Label>
              {!usernameEditing ? (
                <div className="flex items-center gap-2">
                  <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-muted/50 text-sm">
                    <span className="text-muted-foreground">@</span>
                    <span className="font-mono">{profile.username ?? <span className="text-muted-foreground italic">none</span>}</span>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-xs shrink-0"
                    onClick={() => setUsernameEditing(true)}
                  >
                    <Pencil className="w-3 h-3" />
                    {profile.username ? "Change" : "Set Username"}
                  </Button>
                </div>
              ) : (
                <div>
                  {minForUsername > 0 && (
                    <div className="mb-2 flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-2.5 text-xs text-amber-300/80">
                      <Coins className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-400" />
                      Setting a username requires {minForUsername.toLocaleString()} $FEATHER in your wallet.
                    </div>
                  )}
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">@</span>
                    <Input
                      data-testid="input-username"
                      value={username}
                      onChange={(e) => handleUsernameChange(e.target.value)}
                      placeholder="your_handle"
                      className="pl-7 pr-8"
                      maxLength={15}
                    />
                    {usernameStatus === "available" && username !== (profile.username ?? "") && (
                      <CheckCircle2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-400" />
                    )}
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <p className={`text-[11px] ${
                      usernameStatus === "taken" ? "text-destructive" :
                      usernameStatus === "available" ? "text-emerald-400" :
                      "text-muted-foreground"
                    }`}>
                      {usernameStatus === "taken" ? "Username already taken" :
                       usernameStatus === "available" && username !== (profile.username ?? "") ? "Username available" :
                       usernameStatus === "checking" ? "Checking..." :
                       "1–15 chars: letters, numbers, underscores"}
                    </p>
                    <button
                      type="button"
                      onClick={() => { setUsernameEditing(false); setUsername(profile.username ?? ""); setUsernameStatus("idle"); }}
                      className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
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
                className="resize-none h-24"
                maxLength={160}
              />
              <p className="text-[11px] text-muted-foreground mt-1 text-right">{bio.length}/160</p>
            </div>

            {/* Social links */}
            <div>
              <Label className="text-sm font-medium mb-3 block">Social Links</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1"><SiX className="w-3 h-3" />X / Twitter</div>
                  <Input data-testid="input-twitter" value={twitterLink} onChange={(e) => setTwitterLink(e.target.value)} placeholder="https://x.com/..." className="text-sm" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1"><Globe className="w-3 h-3" />Website</div>
                  <Input data-testid="input-website" value={websiteLink} onChange={(e) => setWebsiteLink(e.target.value)} placeholder="https://..." className="text-sm" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1"><Github className="w-3 h-3" />GitHub</div>
                  <Input data-testid="input-github" value={githubLink} onChange={(e) => setGithubLink(e.target.value)} placeholder="https://github.com/..." className="text-sm" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1"><Instagram className="w-3 h-3" />Instagram</div>
                  <Input data-testid="input-instagram" value={instagramLink} onChange={(e) => setInstagramLink(e.target.value)} placeholder="https://instagram.com/..." className="text-sm" />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-1">
              <Button
                type="submit"
                data-testid="button-save-profile"
                disabled={saving || usernameStatus === "taken"}
                className="flex-1 sm:flex-none"
              >
                {saving
                  ? <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  : saved
                    ? <CheckCircle2 className="w-4 h-4 mr-2 text-emerald-400" />
                    : null}
                {saving ? "Saving..." : saved ? "Saved!" : "Save Changes"}
              </Button>
              <Link href={profilePath(profile)}>
                <Button type="button" variant="outline" size="sm" className="flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5" />
                  View Profile
                </Button>
              </Link>
            </div>
          </form>
        </div>

        <div className="glass-panel rounded-xl p-4 flex flex-wrap gap-3">
          <Link href="/social/settings">
            <button className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <Shield className="w-3.5 h-3.5" />
              2FA & Security
            </button>
          </Link>
          <Link href="/social">
            <button className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <ExternalLink className="w-3.5 h-3.5" />
              Community Feed
            </button>
          </Link>
        </div>
      </div>
    </SocialLayout>
  );
}
