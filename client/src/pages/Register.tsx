import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { useLocation } from "wouter";
import { Zap } from "lucide-react";

export default function Register() {
  const { isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

  // If already authenticated, redirect to dashboard
  if (isAuthenticated) {
    setLocation("/dashboard");
    return null;
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <Card className="hud-frame bg-card/50 backdrop-blur max-w-md w-full p-8 space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center gap-2">
            <Zap className="w-8 h-8 text-accent" />
            <h1 className="text-3xl font-bold neon-pink">SHIRT CHANGER</h1>
          </div>
          <p className="text-muted-foreground">Virtual Try-On System</p>
        </div>

        {/* Register Section */}
        <div className="space-y-6">
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold neon-cyan">CREATE ACCOUNT</h2>
            <p className="text-sm text-muted-foreground">
              Sign up to get started with 5 free credits
            </p>
          </div>

          {/* Register Button */}
          <Button
            onClick={() => startLogin()}
            className="w-full px-6 py-4 bg-secondary text-background font-bold border-2 border-secondary text-lg"
          >
            SIGN UP WITH MANUS
          </Button>

          {/* Info Section */}
          <div className="space-y-3 pt-4 border-t-2 border-accent/30">
            <div className="bg-background/50 p-4 rounded border-2 border-accent/30 space-y-2">
              <p className="text-xs text-muted-foreground font-bold">WELCOME BONUS</p>
              <p className="text-sm neon-pink">5 FREE CREDITS included</p>
            </div>

            <div className="bg-background/50 p-4 rounded border-2 border-accent/30 space-y-2">
              <p className="text-xs text-muted-foreground font-bold">HOW IT WORKS</p>
              <ul className="text-sm space-y-1">
                <li>✓ Upload your photo</li>
                <li>✓ Select a shirt style</li>
                <li>✓ See yourself in the new shirt</li>
              </ul>
            </div>
          </div>

          {/* Footer */}
          <p className="text-xs text-muted-foreground text-center">
            By signing up, you agree to our Terms of Service
          </p>
        </div>
      </Card>
    </div>
  );
}
