import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useLocation } from "wouter";
import { Zap, Upload, Shirt } from "lucide-react";

export default function Home() {
  const { user, loading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin mb-4">
            <Zap className="w-8 h-8 text-accent" />
          </div>
          <p className="text-foreground neon-pink">INITIALIZING SYSTEM...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background overflow-hidden">
        {/* Animated background grid */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0" style={{
            backgroundImage: 'linear-gradient(0deg, transparent 24%, rgba(255, 0, 110, 0.05) 25%, rgba(255, 0, 110, 0.05) 26%, transparent 27%, transparent 74%, rgba(255, 0, 110, 0.05) 75%, rgba(255, 0, 110, 0.05) 76%, transparent 77%, transparent), linear-gradient(90deg, transparent 24%, rgba(0, 217, 255, 0.05) 25%, rgba(0, 217, 255, 0.05) 26%, transparent 27%, transparent 74%, rgba(0, 217, 255, 0.05) 75%, rgba(0, 217, 255, 0.05) 76%, transparent 77%, transparent)',
            backgroundSize: '50px 50px'
          }} />
        </div>

        <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-4">
          <div className="max-w-2xl w-full space-y-8">
            {/* Title */}
            <div className="text-center space-y-4">
              <h1 className="text-5xl md:text-6xl font-bold neon-pink mb-2">
                SHIRT CHANGER
              </h1>
              <p className="text-xl md:text-2xl neon-cyan">
                VIRTUAL TRY-ON SYSTEM
              </p>
              <div className="h-1 w-32 mx-auto bg-gradient-to-r from-accent via-secondary to-accent" />
            </div>

            {/* Feature cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="hud-frame bg-card/50 backdrop-blur border-accent">
                <div className="flex flex-col items-center text-center space-y-2">
                  <Upload className="w-6 h-6 text-secondary" />
                  <p className="text-sm font-mono text-foreground">UPLOAD PHOTO</p>
                </div>
              </Card>

              <Card className="hud-frame bg-card/50 backdrop-blur border-secondary">
                <div className="flex flex-col items-center text-center space-y-2">
                  <Shirt className="w-6 h-6 text-accent" />
                  <p className="text-sm font-mono text-foreground">SELECT STYLE</p>
                </div>
              </Card>

              <Card className="hud-frame bg-card/50 backdrop-blur border-accent">
                <div className="flex flex-col items-center text-center space-y-2">
                  <Zap className="w-6 h-6 text-secondary" />
                  <p className="text-sm font-mono text-foreground">TRY ON</p>
                </div>
              </Card>
            </div>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button
                onClick={() => startLogin()}
                className="px-8 py-3 bg-accent text-accent-foreground font-bold text-lg hover:shadow-lg hover:shadow-accent/50 border-2 border-accent"
              >
                LOGIN
              </Button>
              <Button
                onClick={() => setLocation("/register")}
                className="px-8 py-3 bg-transparent text-secondary font-bold text-lg border-2 border-secondary hover:shadow-lg hover:shadow-secondary/50"
              >
                REGISTER
              </Button>
            </div>

            {/* Info text */}
            <div className="text-center space-y-2 text-sm text-muted-foreground">
              <p>» NEW USERS RECEIVE 5 CREDITS «</p>
              <p>» 1 CREDIT = 1 TRY-ON «</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b-2 border-accent bg-card/50 backdrop-blur">
        <div className="container py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="w-6 h-6 text-accent" />
            <h1 className="text-2xl font-bold neon-pink">SHIRT CHANGER</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-xs text-muted-foreground">CREDITS</p>
              <p className="text-2xl font-bold neon-cyan">{user?.credits || 0}</p>
            </div>
            <Button
              onClick={() => setLocation("/dashboard")}
              className="px-4 py-2 bg-accent text-accent-foreground font-bold border-2 border-accent"
            >
              DASHBOARD
            </Button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="container py-12">
        <div className="max-w-4xl mx-auto">
          <Card className="hud-frame bg-card/50 backdrop-blur">
            <div className="text-center space-y-6">
              <h2 className="text-3xl font-bold neon-cyan">WELCOME, {user?.name?.toUpperCase()}</h2>
              <p className="text-foreground">Navigate to your dashboard to start the virtual try-on experience</p>
              <Button
                onClick={() => setLocation("/dashboard")}
                className="px-8 py-3 bg-secondary text-background font-bold text-lg hover:shadow-lg hover:shadow-secondary/50 border-2 border-secondary"
              >
                ENTER DASHBOARD
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
