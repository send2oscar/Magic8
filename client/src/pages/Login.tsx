import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { useLocation } from "wouter";
import { Zap } from "lucide-react";

export default function Login() {
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

        {/* Login Section */}
        <div className="space-y-6">
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold neon-cyan">SIGN IN</h2>
            <p className="text-sm text-muted-foreground">
              Use your Manus account to access the app
            </p>
          </div>

          {/* Login Button */}
          <Button
            onClick={() => startLogin()}
            className="w-full px-6 py-4 bg-accent text-background font-bold border-2 border-accent text-lg"
          >
            LOGIN WITH MANUS
          </Button>

          {/* Info Section */}
          <div className="space-y-3 pt-4 border-t-2 border-accent/30">
            <div className="bg-background/50 p-4 rounded border-2 border-accent/30 space-y-2">
              <p className="text-xs text-muted-foreground font-bold">NEW USERS</p>
              <p className="text-sm neon-cyan">Receive 5 FREE CREDITS on signup</p>
            </div>

            <div className="bg-background/50 p-4 rounded border-2 border-accent/30 space-y-2">
              <p className="text-xs text-muted-foreground font-bold">CREDIT SYSTEM</p>
              <p className="text-sm">1 Credit = 1 Virtual Try-On</p>
            </div>
          </div>

          {/* Footer */}
          <p className="text-xs text-muted-foreground text-center">
            By logging in, you agree to our Terms of Service
          </p>
        </div>
      </Card>
    </div>
  );
}
