import { useState } from "react";
import { Flag, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { socialAuthHeaders } from "@/hooks/use-social-auth";

const REPORT_REASONS = [
  "Spam or self-promotion",
  "Scam / rug pull promotion",
  "Harassment or hate speech",
  "NSFW / explicit content",
  "Misleading information",
  "Other",
];

interface ReportModalProps {
  reportedId: number | string;
  reportedType: string;
  token: string | null;
  onClose: () => void;
  endpoint?: string;
  buildBody?: (reason: string) => Record<string, unknown>;
}

export function ReportModal({
  reportedId,
  reportedType,
  token,
  onClose,
  endpoint = "/api/social/report",
  buildBody,
}: ReportModalProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [extra, setExtra] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  async function submit() {
    if (!selected || !token) return;
    setLoading(true);
    try {
      const reason = selected === "Other" && extra.trim() ? `Other: ${extra.trim()}` : selected;
      const body = buildBody
        ? buildBody(reason)
        : { reportedId, reportedType, reason };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...socialAuthHeaders(token) },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to report");
      toast({ title: "Report submitted", description: "Our moderators will review it." });
      onClose();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="absolute inset-0 bg-black/75" onClick={onClose} />
      <div className="relative z-10 glass-panel rounded-2xl p-5 w-full max-w-sm shadow-2xl border border-border">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Flag className="w-4 h-4 text-amber-400" />
            <h3 className="font-semibold text-sm">Report {reportedType}</h3>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-muted-foreground mb-3">Why are you reporting this {reportedType}?</p>

        <div className="flex flex-col gap-2 mb-3">
          {REPORT_REASONS.map((r) => (
            <button
              key={r}
              data-testid={`button-report-reason-${r.toLowerCase().replace(/\W+/g, "-")}`}
              onClick={() => setSelected(r)}
              className={`text-left text-xs px-3 py-2 rounded-lg border transition-colors ${
                selected === r
                  ? "border-amber-400/60 bg-amber-400/10 text-amber-300"
                  : "border-border hover:border-border hover:bg-muted"
              }`}
            >
              {r}
            </button>
          ))}
        </div>

        {selected === "Other" && (
          <Textarea
            value={extra}
            onChange={(e) => setExtra(e.target.value)}
            placeholder="Describe the issue..."
            className="resize-none h-16 text-xs mb-3"
            maxLength={200}
            data-testid="textarea-report-extra"
          />
        )}

        <div className="flex gap-2 justify-end">
          <Button size="sm" variant="ghost" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={submit}
            disabled={!selected || loading}
            data-testid="button-submit-report"
            className="gap-1.5"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Flag className="w-3.5 h-3.5" />}
            Submit Report
          </Button>
        </div>
      </div>
    </div>
  );
}
