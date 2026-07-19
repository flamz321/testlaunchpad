import { useState } from "react";
import { Info, X } from "lucide-react";

export function SocialBanner() {
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem("feather_banner_dismissed") === "1"; } catch { return false; }
  });

  if (dismissed) return null;

  return (
    <div
      className="w-full bg-primary/10 border-b border-primary/20 px-4 py-2 flex items-center justify-between gap-3 text-xs"
      data-testid="banner-social-disclaimer"
    >
      <div className="flex items-center gap-2 text-primary/90">
        <Info className="w-3.5 h-3.5 shrink-0" />
        <span>
          <strong>DYOR</strong> — Feather App never takes fees. All tokens are community-launched and carry inherent risk.
          Not financial advice.
        </span>
      </div>
      <button
        onClick={() => {
          try { sessionStorage.setItem("feather_banner_dismissed", "1"); } catch {}
          setDismissed(true);
        }}
        className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
        aria-label="Dismiss"
        data-testid="button-dismiss-banner"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
