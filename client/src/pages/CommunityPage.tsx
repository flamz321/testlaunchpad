import { useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { SocialLayout } from "@/components/SocialLayout";
import { SponsoredSidebar } from "@/components/SponsoredSidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useSocialAuth, socialAuthHeaders } from "@/contexts/SocialAuthContext";
import { Users, Plus, Search, Globe, Lock, Crown, Loader2, ArrowRight, ImagePlus, X } from "lucide-react";

interface Community {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  logoIpfsCid: string | null;
  memberCount: number;
  isPublic: boolean;
  createdByWallet: string;
  createdAt: string | null;
  isMember?: boolean;
}

const IPFS_GW = "https://gateway.pinata.cloud/ipfs/";

export default function CommunityPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { profile, token, walletAddress } = useSocialAuth();

  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ name: "", description: "", isPublic: true });
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [joiningId, setJoiningId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: communities = [], isLoading } = useQuery<Community[]>({
    queryKey: ["/api/communities"],
    staleTime: 30_000,
  });

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File too large", description: "Image must be under 5MB", variant: "destructive" });
      return;
    }
    setLogoFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setLogoPreview(reader.result as string);
    reader.readAsDataURL(file);
  }

  function clearLogo() {
    setLogoFile(null);
    setLogoPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function uploadLogo(): Promise<string | undefined> {
    if (!logoFile) return undefined;
    setUploading(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve((reader.result as string).split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(logoFile);
      });
      const res = await fetch("/api/ipfs/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: `data:${logoFile.type};base64,${base64}`, type: "logo" }),
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

  async function handleCreate() {
    if (!token) {
      toast({ title: "Sign in required", description: "Connect your wallet and sign in first", variant: "destructive" });
      return;
    }
    if (!createForm.name.trim()) return;
    setSubmitting(true);
    try {
      const logoIpfsCid = await uploadLogo();
      const res = await fetch("/api/communities", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...socialAuthHeaders(token) },
        body: JSON.stringify({ ...createForm, logoIpfsCid }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create community");
      toast({ title: "Community created!" });
      queryClient.invalidateQueries({ queryKey: ["/api/communities"] });
      setShowCreate(false);
      setCreateForm({ name: "", description: "", isPublic: true });
      clearLogo();
    } catch (e: any) {
      toast({ title: e.message ?? "Failed to create community", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleJoinLeave(community: Community) {
    if (!token) {
      toast({ title: "Sign in required", variant: "destructive" });
      return;
    }
    setJoiningId(community.id);
    try {
      const action = community.isMember ? "leave" : "join";
      const res = await fetch(`/api/communities/${community.id}/${action}`, {
        method: "POST",
        headers: socialAuthHeaders(token),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Action failed");
      }
      queryClient.invalidateQueries({ queryKey: ["/api/communities"] });
    } catch (e: any) {
      toast({ title: e.message ?? "Action failed", variant: "destructive" });
    } finally {
      setJoiningId(null);
    }
  }

  const filtered = communities.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return c.name.toLowerCase().includes(q) || (c.description ?? "").toLowerCase().includes(q);
  });

  const slug = createForm.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

  return (
    <SocialLayout rightSidebar={<SponsoredSidebar placement="community" />}>
      <div className="px-4 py-6">

          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold font-display flex items-center gap-2">
                <Users className="w-6 h-6 text-primary" />
                Communities
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">Join or create communities around Robinhood Chain tokens and projects.</p>
            </div>
            <Button
              data-testid="button-create-community"
              onClick={() => setShowCreate(true)}
              className="gap-1.5"
              size="sm"
            >
              <Plus className="w-4 h-4" /> Create
            </Button>
          </div>

          {/* Search */}
          <div className="relative mb-6">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              data-testid="input-community-search"
              placeholder="Search communities…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* List */}
          {isLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-7 h-7 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16">
              <Users className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground">
                {search ? "No communities match your search" : "No communities yet — be the first to create one!"}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {filtered.map((community) => (
                <div
                  key={community.id}
                  data-testid={`card-community-${community.id}`}
                  className="bg-card border border-border/60 rounded-xl p-4 flex flex-col gap-3 hover:border-primary/30 transition-colors"
                >
                  {/* Top row */}
                  <div className="flex items-start gap-3">
                    <div className="w-11 h-11 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0 overflow-hidden">
                      {community.logoIpfsCid ? (
                        <img
                          src={`${IPFS_GW}${community.logoIpfsCid}`}
                          alt={community.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-lg font-bold text-primary">{community.name.slice(0, 1).toUpperCase()}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link href={`/communities/${community.slug}`}>
                          <span className="font-semibold text-sm hover:text-primary transition-colors cursor-pointer">
                            {community.name}
                          </span>
                        </Link>
                        {!community.isPublic && <Lock className="w-3 h-3 text-muted-foreground" />}
                        {community.isMember && (
                          <Badge className="text-[9px] px-1.5 py-0 bg-primary/20 text-primary border-primary/30">Joined</Badge>
                        )}
                        {walletAddress && community.createdByWallet === walletAddress && (
                          <Crown className="w-3 h-3 text-yellow-400" title="You own this community" />
                        )}
                      </div>
                      {community.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{community.description}</p>
                      )}
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between mt-auto flex-wrap gap-y-2">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Users className="w-3.5 h-3.5" />
                      <span>{community.memberCount.toLocaleString()} {community.memberCount === 1 ? "member" : "members"}</span>
                      <span className="mx-1 opacity-40">·</span>
                      {community.isPublic ? (
                        <span className="flex items-center gap-1"><Globe className="w-3 h-3" /> Public</span>
                      ) : (
                        <span className="flex items-center gap-1"><Lock className="w-3 h-3" /> Private</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Link href={`/communities/${community.slug}`}>
                        <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs px-2">
                          View <ArrowRight className="w-3 h-3" />
                        </Button>
                      </Link>
                      <Button
                        data-testid={`button-join-${community.id}`}
                        size="sm"
                        variant={community.isMember ? "outline" : "default"}
                        className="h-7 text-xs px-3"
                        disabled={joiningId === community.id}
                        onClick={() => handleJoinLeave(community)}
                      >
                        {joiningId === community.id ? <Loader2 className="w-3 h-3 animate-spin" /> : community.isMember ? "Leave" : "Join"}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      {/* Create Community Dialog */}
      <Dialog open={showCreate} onOpenChange={(open) => { setShowCreate(open); if (!open) clearLogo(); }}>
        <DialogContent className="max-w-sm" data-testid="dialog-create-community">
          <DialogHeader>
            <DialogTitle>Create a Community</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">

            {/* Logo upload */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Community Logo</label>
              <div className="flex items-center gap-3">
                <div className="w-16 h-16 rounded-xl bg-muted border border-border flex items-center justify-center overflow-hidden flex-shrink-0">
                  {logoPreview ? (
                    <img src={logoPreview} alt="logo preview" className="w-full h-full object-cover" />
                  ) : (
                    <ImagePlus className="w-6 h-6 text-muted-foreground" />
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="community-logo-upload"
                    data-testid="label-logo-upload"
                    className="cursor-pointer inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                  >
                    <ImagePlus className="w-3.5 h-3.5" />
                    {logoPreview ? "Change image" : "Upload image"}
                  </label>
                  <input
                    id="community-logo-upload"
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleLogoChange}
                    data-testid="input-logo-file"
                  />
                  {logoPreview && (
                    <button
                      onClick={clearLogo}
                      data-testid="button-clear-logo"
                      className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1"
                    >
                      <X className="w-3 h-3" /> Remove
                    </button>
                  )}
                  <p className="text-[10px] text-muted-foreground">PNG, JPG, GIF · max 5MB · stored on IPFS</p>
                </div>
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Name *</label>
              <Input
                data-testid="input-community-name"
                placeholder="e.g. Feather Traders"
                value={createForm.name}
                onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                maxLength={50}
              />
              {createForm.name && (
                <p className="text-[10px] text-muted-foreground mt-1">
                  Slug: /communities/{slug}
                </p>
              )}
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Description</label>
              <Input
                data-testid="input-community-description"
                placeholder="What is this community about?"
                value={createForm.description}
                onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value }))}
                maxLength={160}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Public community</p>
                <p className="text-xs text-muted-foreground">Anyone can find and join</p>
              </div>
              <button
                data-testid="toggle-community-public"
                onClick={() => setCreateForm((f) => ({ ...f, isPublic: !f.isPublic }))}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${createForm.isPublic ? "bg-primary" : "bg-muted"}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${createForm.isPublic ? "translate-x-6" : "translate-x-1"}`} />
              </button>
            </div>

            <Button
              data-testid="button-submit-create-community"
              className="w-full"
              disabled={!createForm.name.trim() || submitting || uploading}
              onClick={handleCreate}
            >
              {(submitting || uploading) ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {uploading ? "Uploading image…" : submitting ? "Creating…" : "Create Community"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </SocialLayout>
  );
}
