import { useEffect } from "react";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";

/** Legacy route — token launches live at /launch */
export default function BagsLaunch() {
  const [, setLocation] = useLocation();
  useEffect(() => {
    setLocation("/launch");
  }, [setLocation]);

  return (
    <div className="flex items-center justify-center min-h-[50vh] gap-2 text-muted-foreground">
      <Loader2 className="w-5 h-5 animate-spin" />
      Redirecting to launcher…
    </div>
  );
}
