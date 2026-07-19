import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import { Link } from "wouter";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background">
      <Card className="w-full max-w-md mx-4 border-border bg-card">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2 items-center">
            <AlertCircle className="h-8 w-8 text-red-500 shrink-0" />
            <h1 className="text-2xl font-bold text-foreground">404 Page Not Found</h1>
          </div>

          <p className="mt-4 text-sm text-muted-foreground">
            This page doesn&apos;t exist. Head back to the home page to keep exploring Feather App.
          </p>

          <Link href="/" className="inline-block mt-6 text-sm font-semibold text-primary hover:underline">
            ← Back to Feather App
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
