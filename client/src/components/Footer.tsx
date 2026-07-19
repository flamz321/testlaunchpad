import { Bot } from "lucide-react";
import { Link } from "wouter";
import { SiX } from "react-icons/si";

export function Footer() {
  return (
    <footer className="border-t border-border bg-background py-8 px-4 relative z-20">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
          {/* Brand */}
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
              <Bot className="w-4 h-4" />
            </div>
            <span className="font-display font-bold tracking-wider text-base">
              FEATHER <span className="text-primary">APP</span>
            </span>
          </div>

          {/* Follow CTA */}
          <a
            href="https://x.com/featherappfun"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-xs bg-muted/50 border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
            data-testid="link-footer-follow-x"
          >
            <SiX className="w-3.5 h-3.5" />
            Follow @featherappfun for live updates
          </a>

          {/* Links */}
          <div className="flex items-center gap-5">
            <a href="#" className="text-muted-foreground hover:text-foreground transition-colors text-xs">Terms</a>
            <a href="#" className="text-muted-foreground hover:text-foreground transition-colors text-xs">Privacy</a>
            <Link href="/docs" className="text-muted-foreground hover:text-foreground transition-colors text-xs">Docs</Link>
          </div>
        </div>

        <div className="mt-6 pt-5 border-t border-border/50 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-muted-foreground/60 text-xs">
            © {new Date().getFullYear()} Feather App · Not financial advice · Trade responsibly
          </p>
          <p className="text-muted-foreground/40 text-xs italic">
            Built for Robinhood Chain
          </p>
        </div>
      </div>
    </footer>
  );
}
