import { useState, useRef, useEffect, useCallback } from "react";
import { Link, useLocation } from "wouter";
import { FEATHER_TOKEN_ADDRESS } from "@shared/chain";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { SponsoredSidebar } from "@/components/SponsoredSidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useWalletConnect } from "@/hooks/use-wallet-connect";
import { useToast } from "@/hooks/use-toast";
import {
  prepareLaunch,
  launchTokenWithWallet,
  recordLaunch,
  buildLaunchSuccess,
} from "@/lib/bags-launch";
import {
  Rocket, CheckCircle2, Loader2, ExternalLink, Copy, Check,
  ArrowLeft, ArrowRight, ImagePlus, Wallet, Globe, Twitter, Send,
  Zap, BadgeCheck, TrendingUp, Plus, Trash2, Upload, Link as LinkIcon,
  AlertCircle, Lock, ShoppingBag,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface FeeRecipient {
  wallet: string;
  pct: number;
}

interface LaunchForm {
  name: string;
  symbol: string;
  description: string;
  imageMode: "upload" | "url";
  imageFile: File | null;
  imagePreview: string;
  imageUrl: string;
  website: string;
  twitter: string;
  telegram: string;
  feeRecipients: FeeRecipient[];
  initialBuyEth: string;
}

type Step = "form" | "review" | "launching" | "success";

interface LaunchResult {
  mintAddress: string;
  bagsUrl: string;
  txSignature: string;
  explorerUrl?: string;
}

function makeFeeRecipients(walletPk: string): FeeRecipient[] {
  return [{ wallet: walletPk, pct: 100 }];
}

function makeEmptyForm(walletPk: string): LaunchForm {
  return {
    name: "", symbol: "", description: "",
    imageMode: "upload", imageFile: null, imagePreview: "", imageUrl: "",
    website: "", twitter: "", telegram: "",
    feeRecipients: makeFeeRecipients(walletPk),
    initialBuyEth: "",
  };
}

function pctToBps(pct: number) { return Math.round(pct * 100); }

// ── Step Indicators ───────────────────────────────────────────────────────────

function StepDot({ n, current, label }: { n: number; current: number; label: string }) {
  const done = n < current;
  const active = n === current;
  return (
    <div className="flex flex-col items-center gap-1">
      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
        done ? "bg-emerald-500 text-white" :
        active ? "bg-primary text-primary-foreground shadow-[0_0_12px_rgba(139,92,246,0.4)]" :
        "bg-muted text-muted-foreground"
      }`}>
        {done ? <CheckCircle2 className="w-4 h-4" /> : n}
      </div>
      <span className={`text-[10px] font-medium ${active ? "text-foreground" : "text-muted-foreground"}`}>{label}</span>
    </div>
  );
}

function StepLine({ done }: { done: boolean }) {
  return <div className={`flex-1 h-0.5 mb-4 transition-all ${done ? "bg-emerald-500" : "bg-border"}`} />;
}

// ── Image Section ─────────────────────────────────────────────────────────────

function ImageSection({ form, onChange }: { form: LaunchForm; onChange: (f: LaunchForm) => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file", description: "Please select an image file", variant: "destructive" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "File too large", description: "Image must be under 10 MB", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => onChange({ ...form, imageFile: file, imagePreview: ev.target?.result as string });
    reader.readAsDataURL(file);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileChange({ target: { files: [file] } } as any);
  }, [form]);

  const preview = form.imageMode === "upload" ? form.imagePreview : form.imageUrl;

  return (
    <div className="space-y-2">
      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Token Image *</label>
      <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit">
        <button type="button" onClick={() => onChange({ ...form, imageMode: "upload" })}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
            form.imageMode === "upload" ? "bg-card shadow text-foreground" : "text-muted-foreground hover:text-foreground"
          }`}>
          <Upload className="w-3 h-3" /> Upload File
        </button>
        <button type="button" onClick={() => onChange({ ...form, imageMode: "url" })}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
            form.imageMode === "url" ? "bg-card shadow text-foreground" : "text-muted-foreground hover:text-foreground"
          }`}>
          <LinkIcon className="w-3 h-3" /> Paste URL
        </button>
      </div>

      <div className="flex gap-3 items-start">
        <div className="w-20 h-20 rounded-xl border border-border bg-muted flex items-center justify-center shrink-0 overflow-hidden ring-2 ring-primary/10">
          {preview ? (
            <img src={preview} alt="Token preview" className="w-full h-full object-cover"
              onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
          ) : (
            <ImagePlus className="w-7 h-7 text-muted-foreground" />
          )}
        </div>
        <div className="flex-1">
          {form.imageMode === "upload" ? (
            <div
              className="border-2 border-dashed border-border rounded-xl p-4 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all"
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="w-5 h-5 mx-auto text-muted-foreground mb-1" />
              {form.imageFile ? (
                <p className="text-xs font-medium text-foreground">{form.imageFile.name}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Click or drag to upload<br />
                  <span className="text-[10px]">PNG, JPG, GIF, WebP — max 10 MB</span>
                </p>
              )}
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
                onChange={handleFileChange} data-testid="input-image-file" />
            </div>
          ) : (
            <div className="space-y-1">
              <Input data-testid="input-image-url" placeholder="https://example.com/token.png"
                value={form.imageUrl} onChange={(e) => onChange({ ...form, imageUrl: e.target.value })} />
              <p className="text-[10px] text-muted-foreground">Direct image URL (PNG, JPG, GIF, WebP)</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Fee Recipients ────────────────────────────────────────────────────────────

function FeeRecipientsSection({ form, onChange, connectedWallet }: {
  form: LaunchForm; onChange: (f: LaunchForm) => void; connectedWallet: string;
}) {
  const recipients = form.feeRecipients;
  const total = recipients.reduce((s, r) => s + r.pct, 0);
  const isValid = Math.abs(total - 100) < 0.01;

  const update = (idx: number, patch: Partial<FeeRecipient>) => {
    onChange({ ...form, feeRecipients: recipients.map((r, i) => i === idx ? { ...r, ...patch } : r) });
  };
  const add = () => onChange({ ...form, feeRecipients: [...recipients, { wallet: "", pct: 0 }] });
  const remove = (idx: number) => onChange({ ...form, feeRecipients: recipients.filter((_, i) => i !== idx) });

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Fee Recipients</label>
        <button type="button" onClick={add} disabled={recipients.length >= 5}
          className="flex items-center gap-1 text-[11px] text-primary hover:underline disabled:opacity-40 disabled:cursor-not-allowed"
          data-testid="button-add-recipient">
          <Plus className="w-3 h-3" /> Add recipient
        </button>
      </div>
      <div className="space-y-2">
        {recipients.map((r, idx) => (
          <div key={idx} className="flex gap-2 items-center">
            <div className="flex-1 relative">
              <Input data-testid={`input-recipient-wallet-${idx}`} placeholder="EVM wallet address (0x…)"
                value={r.wallet} onChange={(e) => update(idx, { wallet: e.target.value })}
                className="font-mono text-xs pr-16" />
              {r.wallet === connectedWallet && (
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] bg-primary/20 text-primary px-1 py-0.5 rounded font-semibold">YOU</span>
              )}
            </div>
            <div className="w-20 relative">
              <Input data-testid={`input-recipient-pct-${idx}`} type="number" min={0} max={100} step={0.01}
                placeholder="0" value={r.pct === 0 ? "" : r.pct}
                onChange={(e) => { const v = parseFloat(e.target.value); update(idx, { pct: isNaN(v) ? 0 : Math.min(100, Math.max(0, v)) }); }}
                className="pr-5 text-xs" />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">%</span>
            </div>
            <button type="button" onClick={() => remove(idx)} disabled={recipients.length === 1}
              className="p-1.5 rounded-lg border border-border hover:bg-destructive/10 hover:border-destructive/40 hover:text-destructive transition-colors disabled:opacity-30 shrink-0"
              data-testid={`button-remove-recipient-${idx}`}>
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
      <div className={`flex items-center gap-1.5 text-[11px] px-2 py-1.5 rounded-lg ${
        isValid ? "bg-emerald-500/10 text-emerald-400" :
        total > 100 ? "bg-red-500/10 text-red-400" : "bg-yellow-500/10 text-yellow-400"
      }`}>
        {isValid ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
        <span>Total: <strong>{total.toFixed(total % 1 === 0 ? 0 : 2)}%</strong>{!isValid && " — must equal 100%"}</span>
      </div>
    </div>
  );
}

// ── Form Step ─────────────────────────────────────────────────────────────────

function FormStep({ form, onChange, onNext, connectedWallet }: {
  form: LaunchForm; onChange: (f: LaunchForm) => void; onNext: () => void; connectedWallet: string;
}) {
  const set = (key: keyof LaunchForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    onChange({ ...form, [key]: e.target.value });

  const hasImage = form.imageMode === "upload" ? !!form.imageFile : !!form.imageUrl.trim();
  const totalPct = form.feeRecipients.reduce((s, r) => s + r.pct, 0);
  const feesValid = Math.abs(totalPct - 100) < 0.01 && form.feeRecipients.every(r => r.wallet.trim().length > 0);
  const canNext = form.name.trim() && form.symbol.trim() && hasImage && feesValid;

  return (
    <div className="space-y-6">
      <ImageSection form={form} onChange={onChange} />

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Token Name *</label>
          <Input data-testid="input-name" placeholder="My Token" value={form.name} onChange={set("name")} maxLength={32} />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Symbol *</label>
          <Input data-testid="input-symbol" placeholder="MTK" value={form.symbol}
            onChange={(e) => onChange({ ...form, symbol: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10) })}
            maxLength={10} />
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Description</label>
        <Textarea data-testid="input-description" placeholder="Tell the world about your token…"
          value={form.description} onChange={set("description")} rows={3} maxLength={500} className="resize-none" />
        <p className="text-[10px] text-muted-foreground text-right">{form.description.length}/500</p>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Socials (optional)</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground flex items-center gap-1"><Globe className="w-3 h-3" /> Website</label>
            <Input data-testid="input-website" placeholder="https://…" value={form.website} onChange={set("website")} />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground flex items-center gap-1"><Twitter className="w-3 h-3" /> Twitter / X</label>
            <Input data-testid="input-twitter" placeholder="@handle or URL" value={form.twitter} onChange={set("twitter")} />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground flex items-center gap-1"><Send className="w-3 h-3" /> Telegram</label>
            <Input data-testid="input-telegram" placeholder="https://t.me/…" value={form.telegram} onChange={set("telegram")} />
          </div>
        </div>
      </div>

      <FeeRecipientsSection form={form} onChange={onChange} connectedWallet={connectedWallet} />

      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Initial Buy (optional)
        </label>
        <Input
          data-testid="input-initial-buy"
          placeholder="0.0"
          value={form.initialBuyEth}
          onChange={(e) => {
            const v = e.target.value.replace(/[^0-9.]/g, "");
            onChange({ ...form, initialBuyEth: v });
          }}
          inputMode="decimal"
        />
        <p className="text-[10px] text-muted-foreground">
          ETH spent as an atomic first buy in the same launch transaction. Leave blank to skip.
        </p>
      </div>

      <Button data-testid="button-next" className="w-full font-semibold gap-2" disabled={!canNext} onClick={onNext}
        size="lg">
        Review Token <ArrowRight className="w-4 h-4" />
      </Button>

      <div className="p-4 rounded-xl bg-primary/5 border border-primary/15 text-[11px] text-muted-foreground space-y-1">
        <p className="font-semibold text-foreground flex items-center gap-1.5"><Zap className="w-3.5 h-3.5 text-yellow-400" /> How it works</p>
        <p>Your wallet signs the launch on Robinhood Chain. Fee recipients earn 1% of trading volume as creator fees — claimable anytime from the token page.</p>
      </div>
    </div>
  );
}

// ── Review Step ───────────────────────────────────────────────────────────────

function ReviewStep({ form, onBack, onLaunch }: { form: LaunchForm; onBack: () => void; onLaunch: () => void }) {
  const preview = form.imageMode === "upload" ? form.imagePreview : form.imageUrl;
  const multiSplit = form.feeRecipients.length > 1;

  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-xl p-4 flex items-start gap-3">
        {preview && (
          <img src={preview} alt={form.name}
            className="w-16 h-16 rounded-xl object-cover border border-border shrink-0"
            onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="font-bold text-xl leading-tight">{form.name}</span>
            <span className="text-sm font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded-lg">${form.symbol}</span>
          </div>
          {form.description && <p className="text-sm text-muted-foreground line-clamp-2">{form.description}</p>}
          <div className="flex flex-wrap gap-2 mt-1.5">
            {form.website && <a href={form.website} target="_blank" rel="noreferrer" className="text-[11px] text-primary flex items-center gap-1 hover:underline"><Globe className="w-3 h-3" />{form.website.replace(/^https?:\/\//, "")}</a>}
            {form.twitter && <span className="text-[11px] text-muted-foreground flex items-center gap-1"><Twitter className="w-3 h-3" />{form.twitter.replace(/^@/, "")}</span>}
            {form.telegram && <span className="text-[11px] text-muted-foreground flex items-center gap-1"><Send className="w-3 h-3" />{form.telegram.replace("https://t.me/", "")}</span>}
          </div>
        </div>
      </div>

      <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 space-y-2">
        <div className="flex items-center gap-2 mb-1">
          <Wallet className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold">{multiSplit ? `Fee Split (${form.feeRecipients.length} recipients)` : "Fee Recipient"}</span>
        </div>
        <p className="text-xs text-muted-foreground mb-2">
          {multiSplit ? "Creator fees will be split between these wallets." : "This wallet receives 100% of creator trading fees."}
        </p>
        <div className="space-y-1.5">
          {form.feeRecipients.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <code className="font-mono text-[11px] bg-muted px-2 py-1 rounded-lg border border-border flex-1 truncate text-foreground">{r.wallet}</code>
              <span className="text-xs font-bold text-primary shrink-0 w-12 text-right">{r.pct}%</span>
            </div>
          ))}
        </div>
        {form.initialBuyEth && Number(form.initialBuyEth) > 0 && (
          <p className="text-xs text-muted-foreground pt-1">
            Initial buy: <span className="font-semibold text-foreground">{form.initialBuyEth} ETH</span>
          </p>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
        {[
          { icon: <Zap className="w-3.5 h-3.5 text-yellow-400" />, label: "Instant launch", desc: "Live in ~60s" },
          { icon: <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />, label: "Fee revenue", desc: "All trading fees" },
          { icon: <BadgeCheck className="w-3.5 h-3.5 text-primary" />, label: "Feather verified", desc: "Via Feather" },
        ].map(({ icon, label, desc }) => (
          <div key={label} className="bg-muted/50 border border-border rounded-xl p-3 flex flex-col items-center gap-1">
            {icon}
            <span className="font-semibold text-foreground">{label}</span>
            <span className="text-muted-foreground">{desc}</span>
          </div>
        ))}
      </div>

      <div className="flex gap-3">
        <Button data-testid="button-back" variant="outline" className="flex-1" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Back
        </Button>
        <Button data-testid="button-launch" className="flex-1 gap-2 font-semibold" onClick={onLaunch} size="lg">
          <Rocket className="w-4 h-4" /> Launch Token
        </Button>
      </div>
    </div>
  );
}

// ── Launching Step ────────────────────────────────────────────────────────────

const STATUS_ICONS: [string, string][] = [
  ["Processing", "🖼️"], ["Downloading", "⬇️"], ["Uploading", "📤"],
  ["Setting", "⚙️"], ["Submitting", "📡"], ["Resolving", "🔍"],
  ["Confirming", "✅"], ["Verifying", "🔍"],
];
function getStatusIcon(msg: string) {
  for (const [key, icon] of STATUS_ICONS) if (msg.includes(key)) return icon;
  return "⏳";
}

function LaunchingStep({ statusLog }: { statusLog: string[] }) {
  return (
    <div className="py-12 flex flex-col items-center gap-6">
      <div className="w-20 h-20 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center animate-pulse-glow">
        <Rocket className="w-10 h-10 text-primary animate-bounce" />
      </div>
      <div className="text-center">
        <h3 className="font-bold text-xl mb-1">Launching your token…</h3>
        <p className="text-sm text-muted-foreground">This takes up to 2 minutes. Don't close this tab.</p>
      </div>
      <div className="w-full max-w-sm space-y-2">
        {statusLog.map((msg, i) => (
          <div key={i} className={`flex items-center gap-2.5 text-sm px-3 py-2 rounded-xl transition-all ${
            i === statusLog.length - 1
              ? "bg-primary/10 border border-primary/20 text-foreground"
              : "bg-muted/40 text-muted-foreground"
          }`}>
            <span>{getStatusIcon(msg)}</span>
            <span className="flex-1 truncate">{msg.replace(/^⏳\s*/, "")}</span>
            {i === statusLog.length - 1 && <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0 text-primary" />}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Success Step ──────────────────────────────────────────────────────────────

function SuccessStep({ result, form }: { result: LaunchResult; form: LaunchForm }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(result.mintAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="py-6 flex flex-col items-center gap-5 text-center">
      <div className="w-20 h-20 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
        <CheckCircle2 className="w-10 h-10 text-emerald-500" />
      </div>
      <div>
        <h3 className="font-bold text-2xl mb-1">Token Launched! 🎉</h3>
        <p className="text-sm text-muted-foreground">
          <span className="text-foreground font-semibold">${form.symbol}</span> is live on Robinhood Chain
        </p>
      </div>

      <div className="w-full bg-card border border-border rounded-xl p-4 space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Token Address</p>
        <div className="flex items-center gap-2">
          <code className="flex-1 font-mono text-xs text-foreground bg-muted px-2 py-1.5 rounded-lg truncate">
            {result.mintAddress}
          </code>
          <button data-testid="button-copy-mint" onClick={copy}
            className="p-1.5 rounded-lg border border-border hover:bg-muted transition-colors shrink-0">
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5 text-muted-foreground" />}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 w-full">
        <Link href={`/dex/${result.mintAddress}`} data-testid="link-view-dex"
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-all">
          <TrendingUp className="w-4 h-4" /> Open Token Page
        </Link>
      </div>

      <a href={result.explorerUrl || `https://robinhoodchain.blockscout.com/tx/${result.txSignature}`} target="_blank" rel="noopener noreferrer"
        className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
        <ExternalLink className="w-3 h-3" /> View transaction on Blockscout
      </a>

      <p className="text-xs text-muted-foreground">Redirecting to your token page…</p>
    </div>
  );
}

// ── Gate Locked ───────────────────────────────────────────────────────────────

function GateLocked({ threshold, balance }: { threshold: number; balance: number }) {
  const pct = Math.min(100, (balance / threshold) * 100);
  const needed = threshold - balance;
  const fmt = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : n >= 1000 ? `${(n / 1000).toFixed(0)}K` : n.toLocaleString();

  return (
    <div className="flex flex-col items-center gap-6 py-12 text-center px-4">
      <div className="w-20 h-20 rounded-2xl bg-muted border border-border flex items-center justify-center">
        <Lock className="w-9 h-9 text-muted-foreground" />
      </div>
      <div>
        <h2 className="text-2xl font-bold mb-2">$FEATHER Required</h2>
        <p className="text-sm text-muted-foreground max-w-sm">
          You need at least <span className="font-bold text-foreground">{fmt(threshold)} $FEATHER</span> to access the token launcher.
        </p>
      </div>
      <div className="w-full max-w-xs space-y-2">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Your balance</span>
          <span className="font-mono font-semibold text-foreground">{fmt(balance)} / {fmt(threshold)}</span>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-[11px] text-muted-foreground">
          {needed > 0 ? <>Need <span className="font-semibold text-foreground">{fmt(needed)} more $FEATHER</span></> : "You have enough!"}
        </p>
      </div>
      <div className="flex flex-col gap-2 w-full max-w-xs">
        <a href="https://app.uniswap.org"
          target="_blank" rel="noopener noreferrer" data-testid="link-buy-feather"
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors">
          <ShoppingBag className="w-4 h-4" /> Buy $FEATHER on Uniswap
        </a>
        <Link href={`/dex/${FEATHER_TOKEN_ADDRESS}`}
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-border bg-card text-sm font-semibold hover:bg-muted transition-colors">
          <TrendingUp className="w-4 h-4" /> View $FEATHER Chart
        </Link>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Launch() {
  const wallet = useWalletConnect();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<Step>("form");
  const [form, setForm] = useState<LaunchForm | null>(null);
  const [statusLog, setStatusLog] = useState<string[]>([]);
  const [result, setResult] = useState<LaunchResult | null>(null);
  const abortRef = useRef<(() => void) | null>(null);

  // Auto-redirect to the token's DEX page after a successful launch
  useEffect(() => {
    if (step === "success" && result?.mintAddress) {
      const timer = setTimeout(() => {
        setLocation(`/dex/${result.mintAddress}`);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [step, result, setLocation]);

  const { data: gateData, isLoading: gateLoading } = useQuery<{
    threshold: number; balance: number; hasAccess: boolean; isAdmin?: boolean;
  }>({
    queryKey: ["/api/bags/gate", wallet.publicKey],
    queryFn: () => fetch(`/api/bags/gate?wallet=${wallet.publicKey ?? ""}`).then((r) => r.json()),
    enabled: !!wallet.connected && !!wallet.publicKey,
    refetchInterval: 30_000,
    staleTime: 20_000,
  });

  const hasAccess = gateData?.hasAccess ?? false;

  useEffect(() => {
    if (wallet.connected && wallet.publicKey && !form) {
      setForm(makeEmptyForm(wallet.publicKey));
    }
  }, [wallet.connected, wallet.publicKey]);

  useEffect(() => () => abortRef.current?.(), []);

  async function launch() {
    if (!form) return;
    if (!wallet.connected || !wallet.publicKey) {
      toast({ title: "Connect wallet", description: "Connect your wallet to launch.", variant: "destructive" });
      return;
    }

    setStep("launching");
    setStatusLog(["Preparing token metadata…"]);

    try {
      let imagePayload: { imageData: string; mimeType: string } | { imageUrl: string };
      if (form.imageMode === "upload" && form.imageFile && form.imagePreview) {
        const base64 = form.imagePreview.split(",")[1];
        imagePayload = { imageData: base64, mimeType: form.imageFile.type };
      } else {
        imagePayload = { imageUrl: form.imageUrl.trim() };
      }

      const feeRecipients = form.feeRecipients.map((r) => ({
        wallet: r.wallet.trim(),
        basisPoints: pctToBps(r.pct),
      }));

      const prepared = await prepareLaunch({
        name: form.name.trim(),
        symbol: form.symbol.trim(),
        description: form.description.trim() || undefined,
        website: form.website.trim() || undefined,
        twitter: form.twitter.trim() || undefined,
        telegram: form.telegram.trim() || undefined,
        feeRecipients,
        ...imagePayload,
      });

      setStatusLog((prev) => [...prev, "Metadata ready — confirm in your wallet…"]);

      const { txHash, created } = await launchTokenWithWallet({
        name: form.name.trim(),
        symbol: form.symbol.trim(),
        metadataURI: prepared.metadataURI,
        claimers: feeRecipients.map((r) => ({ address: r.wallet, bps: r.basisPoints })),
        creationFeeWei: BigInt(prepared.creationFeeWei),
        initialBuyEth: form.initialBuyEth.trim() || undefined,
        partner: prepared.partner,
        partnerBps: prepared.partnerBps,
        sendTransaction: wallet.sendTransaction,
        onStatus: (msg) => setStatusLog((prev) => [...prev, msg]),
      });

      setStatusLog((prev) => [...prev, "Token created — saving…"]);

      await recordLaunch({
        name: form.name.trim(),
        symbol: form.symbol.trim(),
        description: form.description.trim() || undefined,
        website: form.website.trim() || undefined,
        twitter: form.twitter.trim() || undefined,
        telegram: form.telegram.trim() || undefined,
        imageUrl: prepared.imageUrl,
        mintAddress: created.token,
        txHash,
        feeShare: created.feeShare,
        curve: created.curve,
        poolId: created.poolId,
        creatorWallet: wallet.publicKey,
        feeRecipients,
      });

      const success = buildLaunchSuccess(txHash, created, prepared.imageUrl);
      setResult({
        mintAddress: success.mintAddress,
        bagsUrl: success.bagsUrl,
        txSignature: success.txSignature,
        explorerUrl: success.explorerUrl,
      });
      setStep("success");
      // Immediate navigation — success screen is brief
      setTimeout(() => setLocation(`/dex/${success.mintAddress}`), 800);
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      toast({ title: "Launch failed", description: err?.message ?? "Unknown error", variant: "destructive" });
      setStep("review");
    }
  }

  const stepNum = step === "form" ? 1 : step === "review" ? 2 : step === "launching" ? 3 : 4;

  return (
    <AppShell>
      {/* Header */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-md border-b border-border">
        <div className="flex items-center gap-3 px-5 py-4 max-w-2xl mx-auto">
          <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
            <Rocket className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-[17px] font-bold leading-tight">Launch Token</h1>
            <p className="text-[11px] text-muted-foreground">Robinhood Chain · Feather App</p>
          </div>
          <span className="ml-auto text-[10px] bg-primary/10 text-primary border border-primary/20 px-2 py-1 rounded-full font-semibold uppercase tracking-wide">RH CHAIN</span>
        </div>
      </div>

      <div className="px-5 py-6 max-w-2xl mx-auto">
        {/* Not connected */}
        {!wallet.connected && (
          <div className="flex flex-col items-center gap-6 py-20 text-center">
            <div className="w-20 h-20 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Wallet className="w-10 h-10 text-primary" />
            </div>
            <div>
              <h2 className="text-2xl font-bold mb-2">Connect Your Wallet</h2>
              <p className="text-sm text-muted-foreground max-w-xs">Connect MetaMask, Rabby, or Robinhood Wallet to launch on Uniswap (Robinhood Chain) and earn trading fees.</p>
            </div>
            <Button data-testid="button-connect" onClick={() => wallet.connect()} disabled={wallet.connecting}
              className="gap-2 px-8" size="lg">
              {wallet.connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wallet className="w-4 h-4" />}
              {wallet.connecting ? "Connecting…" : "Connect Wallet"}
            </Button>
          </div>
        )}

        {/* Gate loading */}
        {wallet.connected && gateLoading && (
          <div className="flex flex-col items-center gap-3 py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Checking $FEATHER balance…</p>
          </div>
        )}

        {/* Gate locked */}
        {wallet.connected && !gateLoading && !hasAccess && gateData && (
          <GateLocked threshold={gateData.threshold} balance={gateData.balance} />
        )}

        {/* Launch form */}
        {wallet.connected && !gateLoading && hasAccess && form && (
          <>
            {step !== "success" && (
              <div className="flex items-center mb-8">
                <StepDot n={1} current={stepNum} label="Details" />
                <StepLine done={stepNum > 1} />
                <StepDot n={2} current={stepNum} label="Review" />
                <StepLine done={stepNum > 2} />
                <StepDot n={3} current={stepNum} label="Launch" />
              </div>
            )}

            {step === "form" && <FormStep form={form} onChange={setForm} onNext={() => setStep("review")} connectedWallet={wallet.publicKey!} />}
            {step === "review" && <ReviewStep form={form} onBack={() => setStep("form")} onLaunch={launch} />}
            {step === "launching" && <LaunchingStep statusLog={statusLog} />}
            {step === "success" && result && <SuccessStep result={result} form={form} />}
          </>
        )}
      </div>
    </AppShell>
  );
}
