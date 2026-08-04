import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, Home } from "lucide-react";
import { useLocation } from "wouter";

export default function NotFound() {
  const [, setLocation] = useLocation();

  const handleGoHome = () => {
    setLocation("/");
  };

  return (
    <div className="neon-luxe-page flex min-h-screen w-full items-center justify-center bg-background px-4">
      <Card className="hud-frame w-full max-w-lg bg-card/60 backdrop-blur-xl">
        <CardContent className="pt-8 pb-8 text-center">
          <div className="flex justify-center mb-6">
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-accent/15 blur-xl" />
              <AlertCircle className="relative h-16 w-16 text-accent" />
            </div>
          </div>

          <p className="neon-luxe-eyebrow mb-2">Navigation exception</p>
          <h1 className="mb-2 text-5xl font-bold neon-pink">404</h1>

          <h2 className="mb-4 text-xl font-semibold text-foreground">
            Page Not Found
          </h2>

          <p className="mb-8 leading-relaxed text-muted-foreground">
            Sorry, the page you are looking for doesn't exist.
            <br />
            It may have been moved or deleted.
          </p>

          <div
            id="not-found-button-group"
            className="flex flex-col sm:flex-row gap-3 justify-center"
          >
            <Button
              onClick={handleGoHome}
              className="border border-accent bg-accent px-6 py-2.5 text-accent-foreground shadow-[0_0_28px_oklch(0.73_0.27_342_/_0.25)]"
            >
              <Home className="w-4 h-4 mr-2" />
              Go Home
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
