import { useState, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useWalletConnect } from "@/hooks/use-wallet-connect";
import {
  CheckCircle2, Upload, Loader2, Wallet, ArrowRight, ArrowLeft,
  Globe, Github, Copy, Check, ExternalLink, Image as ImageIcon,
} from "lucide-react";
import { SiDiscord } from "react-icons/si";
import { apiRequest } from "@/lib/queryClient";
import { ERC20_ABI, EXPLORER_TX_URL, USDC_ADDRESS, FEATHER_TOKEN_ADDRESS } from "@shared/chain";
import { encodeFunctionData } from "viem";

// ── helpers ───────────────────────────────────────────────────────────────────

type PayCurrency = "eth" | "usdc" | "feather";

function truncatePk(pk: string) {
  return `${pk.slice(0, 6)}…${pk.slice(-4)}`;
}

/** Map legacy sol→eth, trenchy→feather when reading payment-info payloads */
function resolvePaySlot(paymentInfo: any, currency: PayCurrency) {
  if (!paymentInfo) return null;
  if (paymentInfo[currency]) return paymentInfo[currency];
  if (currency === "eth") return paymentInfo.sol ?? null;
  if (currency === "feather") return paymentInfo.trenchy ?? null;
  return null;
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function uploadImage(base64: string, type: "logo" | "banner"): Promise<{ cid: string; url: string }> {
  const res = await fetch("/api/ipfs/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageBase64: base64, type }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message ?? "Upload failed");
  }
  return res.json();
}

async function sendEvmPayment(
  sendTransaction: (tx: { to: string; value?: string; data?: string }) => Promise<string>,
  botWallet: string,
  currency: PayCurrency,
  amountRaw: string,
  tokenAddress: string,
): Promise<string> {
  const amount = BigInt(amountRaw);

  if (currency === "eth") {
    return sendTransaction({
      to: botWallet,
      value: `0x${amount.toString(16)}`,
    });
  }

  const data = encodeFunctionData({
    abi: ERC20_ABI,
    functionName: "transfer",
    args: [botWallet as `0x${string}`, amount],
  });

  return sendTransaction({
    to: tokenAddress,
    data,
  });
}

// ── Step indicator ────────────────────────────────────────────────────────────

const STEPS = ["Info", "Socials", "Pay"];

function StepIndicator({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-2 mb-6">
      {STEPS.map((label, i) => (
        <div key={label} className="flex items-center gap-2">
          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${
            i < step ? "bg-emerald-500 border-emerald-500 text-white" :
            i === step ? "border-primary text-primary" :
            "border-border/60 text-muted-foreground"
          }`}>
            {i < step ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
          </div>
          <span className={`text-xs font-medium ${i === step ? "text-foreground" : "text-muted-foreground"}`}>{label}</span>
          {i < STEPS.length - 1 && <div className="w-6 h-px bg-border/60" />}
        </div>
      ))}
    </div>
  );
}

// ── Image upload widget ────────────────────────────────────────────────────────

interface ImageUploadProps {
  label: string;
  hint: string;
  maxMB?: number;
  aspectHint?: string;
  value: { cid: string; url: string } | null;
  onChange: (result: { cid: string; url: string } | null) => void;
  testId?: string;
}

function ImageUpload({ label, hint, maxMB = 5, value, onChange, testId, aspectHint }: ImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const type = label.toLowerCase().includes("logo") ? "logo" : "banner";
  const { toast } = useToast();

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    if (file.size > maxMB * 1_048_576) {
      setError(`Max size is ${maxMB}MB`);
      return;
    }
    setUploading(true);
    try {
      const base64 = await fileToBase64(file);
      const result = await uploadImage(base64, type as "logo" | "banner");
      onChange(result);
    } catch (e: any) {
      setError(e.message);
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }, [type, maxMB, onChange, toast]);

  return (
    <div>
      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">{label}</label>
      {aspectHint && <p className="text-[11px] text-muted-foreground mb-2">{aspectHint}</p>}
      <div
        data-testid={testId}
        onClick={() => !uploading && inputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-xl transition-all cursor-pointer overflow-hidden
          ${value ? "border-emerald-500/40 bg-emerald-500/5" : "border-border/60 hover:border-primary/40 bg-muted/20"}
          ${type === "logo" ? "h-32 w-32" : "h-28 w-full"}`}
      >
        {uploading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : value ? (
          <>
            <img src={value.url} alt={label} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/50 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center">
              <span className="text-white text-xs font-semibold">Change</span>
            </div>
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-muted-foreground">
            <Upload className="w-6 h-6" />
            <span className="text-xs">{hint}</span>
            <span className="text-[10px]">Max {maxMB}MB</span>
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />
      </div>
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

interface ClaimModalProps {
  open: boolean;
  onClose: () => void;
  mintAddress: string;
  tokenName?: string;
  tokenSymbol?: string;
  onSuccess?: () => void;
  claimFeeUsd?: string;
}

interface FormState {
  tokenName: string;
  tokenSymbol: string;
  description: string;
  logo: { cid: string; url: string } | null;
  banner: { cid: string; url: string } | null;
  twitter: string;
  discord: string;
  website: string;
  github: string;
  currency: PayCurrency;
}

type ModalStep = "info" | "socials" | "payment" | "processing" | "success";

export function ClaimModal({ open, onClose, mintAddress, tokenName = "", tokenSymbol = "", onSuccess, claimFeeUsd = "50" }: ClaimModalProps) {
  const wallet = useWalletConnect();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<ModalStep>("info");
  const [form, setForm] = useState<FormState>({
    tokenName,
    tokenSymbol,
    description: "",
    logo: null,
    banner: null,
    twitter: "",
    discord: "",
    website: "",
    github: "",
    currency: "eth",
  });
  const [paymentInfo, setPaymentInfo] = useState<any>(null);
  const [payInfoLoading, setPayInfoLoading] = useState(false);
  const [processingMsg, setProcessingMsg] = useState("Processing payment…");
  const [successData, setSuccessData] = useState<any>(null);
  const [copied, setCopied] = useState(false);

  const update = (field: keyof FormState) => (val: any) =>
    setForm((f) => ({ ...f, [field]: val }));

  const fetchPaymentInfo = async () => {
    setPayInfoLoading(true);
    try {
      const res = await fetch(`/api/dex/payment-info?usd=${claimFeeUsd}`);
      const data = await res.json();
      setPaymentInfo(data);
    } catch {
      toast({ title: "Could not fetch payment info", variant: "destructive" });
    } finally {
      setPayInfoLoading(false);
    }
  };

  const goToPayment = () => {
    setStep("payment");
    fetchPaymentInfo();
  };

  const handlePay = async () => {
    if (!wallet.connected || !wallet.publicKey) {
      await wallet.connect();
      return;
    }

    const info = resolvePaySlot(paymentInfo, form.currency);
    const amountRaw = info?.amountRaw ?? info?.raw;
    if (!amountRaw || !paymentInfo?.botWallet) {
      toast({ title: "Payment info not available", description: "Try again.", variant: "destructive" });
      return;
    }

    const tokenAddress =
      form.currency === "usdc"
        ? (paymentInfo.usdcMint || USDC_ADDRESS)
        : form.currency === "feather"
        ? (paymentInfo.featherMint || paymentInfo.trenchyMint || FEATHER_TOKEN_ADDRESS)
        : "";

    if (form.currency !== "eth" && (!tokenAddress || tokenAddress === "0x0000000000000000000000000000000000000000")) {
      toast({
        title: "Token address not configured",
        description: `Cannot pay with ${form.currency.toUpperCase()} yet.`,
        variant: "destructive",
      });
      return;
    }

    setStep("processing");
    setProcessingMsg("Waiting for wallet approval…");

    try {
      const signature = await sendEvmPayment(
        wallet.sendTransaction,
        paymentInfo.botWallet,
        form.currency,
        String(amountRaw),
        tokenAddress,
      );
      setProcessingMsg("Confirming payment on-chain…");

      setProcessingMsg("Uploading metadata to IPFS…");
      const claimRes = await apiRequest("POST", "/api/claim", {
        tokenAddress: mintAddress,
        paymentTxSignature: signature,
        paymentCurrency: form.currency,
        walletAddress: wallet.publicKey,
        tokenName: form.tokenName,
        tokenSymbol: form.tokenSymbol,
        description: form.description,
        logoCid: form.logo?.cid ?? "",
        bannerCid: form.banner?.cid ?? "",
        twitter: form.twitter,
        discord: form.discord,
        website: form.website,
        github: form.github,
      });

      const data = await claimRes.json();
      setSuccessData({ ...data, txSig: signature });
      setStep("success");
      queryClient.invalidateQueries({ queryKey: ["/api/status", mintAddress] });
      queryClient.invalidateQueries({ queryKey: ["/api/chain-tokens"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard", wallet.publicKey] });
      onSuccess?.();
    } catch (e: any) {
      console.error("[ClaimModal] pay error", e);
      setStep("payment");
      toast({
        title: "Payment failed",
        description: e.message ?? "Unknown error",
        variant: "destructive",
      });
    }
  };

  const copyTx = () => {
    if (successData?.txSig) {
      navigator.clipboard.writeText(successData.txSig);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleClose = () => {
    if (step === "processing") return;
    onClose();
    setTimeout(() => {
      setStep("info");
      setForm({ tokenName, tokenSymbol, description: "", logo: null, banner: null, twitter: "", discord: "", website: "", github: "", currency: "eth" });
      setPaymentInfo(null);
      setSuccessData(null);
    }, 300);
  };

  const payAmount = resolvePaySlot(paymentInfo, form.currency)?.display ?? "…";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-lg bg-card border-border max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-xl flex items-center gap-2">
            {step === "success" ? (
              <><CheckCircle2 className="w-5 h-5 text-emerald-400" /> Token Claimed!</>
            ) : (
              <><ImageIcon className="w-5 h-5 text-primary" /> Claim Your Token</>
            )}
          </DialogTitle>
          <DialogDescription>
            {step === "success"
              ? "Your token is now listed on Feather DEX"
              : `Pay once ($${claimFeeUsd}) to unlock your token profile on Feather DEX`}
          </DialogDescription>
        </DialogHeader>

        {!wallet.connected && step !== "success" && (
          <div className="flex flex-col items-center gap-4 py-8">
            <Wallet className="w-12 h-12 text-muted-foreground" />
            <p className="text-center text-sm text-muted-foreground">Connect your wallet to claim this token on Robinhood Chain.</p>
            <Button data-testid="button-claim-connect-wallet" onClick={() => wallet.connect()} disabled={wallet.connecting} className="gap-2">
              {wallet.connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wallet className="w-4 h-4" />}
              {wallet.connecting ? "Connecting…" : "Connect Wallet"}
            </Button>
          </div>
        )}

        {wallet.connected && step === "info" && (
          <div className="space-y-4">
            <StepIndicator step={0} />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Token Name</label>
                <Input
                  data-testid="input-claim-name"
                  placeholder="My Token"
                  value={form.tokenName}
                  onChange={(e) => update("tokenName")(e.target.value)}
                  maxLength={80}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Symbol</label>
                <Input
                  data-testid="input-claim-symbol"
                  placeholder="MTK"
                  value={form.tokenSymbol}
                  onChange={(e) => update("tokenSymbol")(e.target.value.toUpperCase())}
                  maxLength={20}
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Description</label>
              <Textarea
                data-testid="input-claim-description"
                placeholder="Tell people about your token…"
                value={form.description}
                onChange={(e) => update("description")(e.target.value)}
                rows={3}
                maxLength={1000}
                className="resize-none"
              />
              <p className="text-[10px] text-muted-foreground mt-1 text-right">{form.description.length}/1000</p>
            </div>

            <div className="flex gap-4 items-start">
              <ImageUpload
                label="Logo"
                hint="Upload logo"
                aspectHint="1:1 square, max 5MB"
                maxMB={5}
                value={form.logo}
                onChange={update("logo")}
                testId="upload-claim-logo"
              />
              <div className="flex-1">
                <ImageUpload
                  label="Banner"
                  hint="Upload banner"
                  aspectHint="1500×500 recommended, max 5MB"
                  maxMB={5}
                  value={form.banner}
                  onChange={update("banner")}
                  testId="upload-claim-banner"
                />
              </div>
            </div>

            <Button
              data-testid="button-claim-next-socials"
              className="w-full gap-2"
              onClick={() => setStep("socials")}
            >
              Next: Social Links <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        )}

        {wallet.connected && step === "socials" && (
          <div className="space-y-4">
            <StepIndicator step={1} />

            <p className="text-sm text-muted-foreground">Add links so people can find your community (all optional).</p>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1 flex items-center gap-1.5">
                  <span>𝕏</span> Twitter / X
                </label>
                <Input
                  data-testid="input-claim-twitter"
                  placeholder="https://x.com/yourtoken"
                  value={form.twitter}
                  onChange={(e) => update("twitter")(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1 flex items-center gap-1.5">
                  <SiDiscord className="w-3.5 h-3.5" /> Discord
                </label>
                <Input
                  data-testid="input-claim-discord"
                  placeholder="https://discord.gg/invite"
                  value={form.discord}
                  onChange={(e) => update("discord")(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1 flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5" /> Website
                </label>
                <Input
                  data-testid="input-claim-website"
                  placeholder="https://yourtoken.io"
                  value={form.website}
                  onChange={(e) => update("website")(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1 flex items-center gap-1.5">
                  <Github className="w-3.5 h-3.5" /> GitHub
                </label>
                <Input
                  data-testid="input-claim-github"
                  placeholder="https://github.com/yourtoken"
                  value={form.github}
                  onChange={(e) => update("github")(e.target.value)}
                />
              </div>
            </div>

            <div className="flex gap-2">
              <Button data-testid="button-claim-back-info" variant="outline" className="flex-1 gap-2" onClick={() => setStep("info")}>
                <ArrowLeft className="w-4 h-4" /> Back
              </Button>
              <Button data-testid="button-claim-next-payment" className="flex-1 gap-2" onClick={goToPayment}>
                Next: Pay <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {wallet.connected && step === "payment" && (
          <div className="space-y-4">
            <StepIndicator step={2} />

            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold font-display text-emerald-400">${claimFeeUsd}</p>
              <p className="text-sm text-muted-foreground mt-0.5">One-time DEX listing fee · 90-day listing</p>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2">Pay with</label>
              <div className="grid grid-cols-3 gap-2">
                {(["eth", "usdc", "feather"] as const).map((c) => (
                  <button
                    key={c}
                    data-testid={`button-currency-${c}`}
                    onClick={() => update("currency")(c)}
                    className={`rounded-xl border p-3 text-center transition-all ${
                      form.currency === c ? "border-primary bg-primary/10 text-primary" : "border-border/60 hover:border-primary/40 text-muted-foreground"
                    }`}
                  >
                    <div className="font-bold text-sm">{c === "feather" ? "FEATHER" : c.toUpperCase()}</div>
                    <div className="text-xs mt-0.5">
                      {payInfoLoading ? "…" : resolvePaySlot(paymentInfo, c)?.display ?? "—"}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-muted/40 border border-border/60 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">You pay</span>
                <span className="font-bold font-display text-primary">{payInfoLoading ? "…" : payAmount}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">To wallet</span>
                <span className="font-mono text-xs text-muted-foreground">{paymentInfo?.botWallet ? `${paymentInfo.botWallet.slice(0, 6)}…${paymentInfo.botWallet.slice(-6)}` : "…"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Your wallet</span>
                <span className="font-mono text-xs text-emerald-400">{wallet.publicKey ? truncatePk(wallet.publicKey) : "—"}</span>
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground text-center">
              Your wallet will prompt you to approve the transaction on Robinhood Chain. Payment is verified on-chain before your token is listed.
            </p>

            <div className="flex gap-2">
              <Button data-testid="button-claim-back-socials" variant="outline" className="flex-1 gap-2" onClick={() => setStep("socials")}>
                <ArrowLeft className="w-4 h-4" /> Back
              </Button>
              <Button
                data-testid="button-pay-dex"
                className="flex-1 gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                disabled={payInfoLoading || !paymentInfo}
                onClick={handlePay}
              >
                <Wallet className="w-4 h-4" />
                PAY DEX
              </Button>
            </div>
          </div>
        )}

        {step === "processing" && (
          <div className="flex flex-col items-center gap-6 py-10">
            <div className="relative">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            </div>
            <div className="text-center">
              <p className="font-semibold text-foreground">{processingMsg}</p>
              <p className="text-sm text-muted-foreground mt-1">Please don't close this window</p>
            </div>
          </div>
        )}

        {step === "success" && (
          <div className="space-y-4">
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <CheckCircle2 className="w-9 h-9 text-emerald-400" />
              </div>
              <div className="text-center">
                <p className="font-bold text-lg">
                  {form.tokenName || tokenName || "Token"} is now live on Feather DEX!
                </p>
                <p className="text-sm text-muted-foreground mt-1">Your DEX IS PAID badge is now active.</p>
              </div>
            </div>

            {successData?.txSig && (
              <div className="bg-muted/40 border border-border/60 rounded-xl p-3 space-y-2">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Receipt</div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Amount paid</span>
                  <span className="text-xs font-bold text-emerald-400">{successData.amountPaid ?? `$${claimFeeUsd}`}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Token</span>
                  <span className="font-mono text-xs">{mintAddress.slice(0, 8)}…{mintAddress.slice(-6)}</span>
                </div>
                <div className="flex items-center gap-2 bg-background/60 border border-border rounded-lg px-2.5 py-2">
                  <span className="font-mono text-[10px] truncate flex-1 text-muted-foreground">{successData.txSig}</span>
                  <button onClick={copyTx} className="text-muted-foreground hover:text-primary flex-shrink-0">
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                  <a
                    href={EXPLORER_TX_URL(successData.txSig)}
                    target="_blank" rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-primary flex-shrink-0"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <Button
                data-testid="button-claim-success-dashboard"
                variant="outline"
                className="gap-2"
                onClick={() => { handleClose(); window.location.href = `/dashboard`; }}
              >
                My Dashboard
              </Button>
              <Button
                data-testid="button-claim-success-close"
                className="gap-2 bg-emerald-600 hover:bg-emerald-500"
                onClick={handleClose}
              >
                <CheckCircle2 className="w-4 h-4" /> Done
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
