import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { advanceTryOnProgress, getTryOnProgressLabel } from "@/lib/tryOnProgress";
import React, { useEffect, useRef, useState } from "react";
import { Zap, Upload, LogOut, Shirt } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";

const DEMO_PHOTO_URL = '/manus-storage/demo_person_31d5a68a.jpg';

type SelectedPhoto = {
  id: number;
  url: string;
};

export default function Dashboard() {
  const { user, logout, isAuthenticated, loading } = useAuth();
  const [, setLocation] = useLocation();
  const [selectedPhoto, setSelectedPhoto] = useState<SelectedPhoto | null>(null);
  const [selectedShirt, setSelectedShirt] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isTryingOn, setIsTryingOn] = useState(false);
  const [tryOnProgress, setTryOnProgress] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [resultData, setResultData] = useState<any>(null);
  const tryOnInFlight = useRef(false);

  // tRPC queries and mutations
  const creditsQuery = trpc.credits.getBalance.useQuery();
  const photosQuery = trpc.photos.list.useQuery();
  const shirtsQuery = trpc.shirts.list.useQuery();
  const tryOnMutation = trpc.tryOn.process.useMutation();

  useEffect(() => {
    if (!isTryingOn) {
      setTryOnProgress(0);
      return;
    }

    setTryOnProgress(8);
    const progressTimer = window.setInterval(() => {
      setTryOnProgress(currentProgress => advanceTryOnProgress(currentProgress));
    }, 650);

    return () => window.clearInterval(progressTimer);
  }, [isTryingOn]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="text-2xl font-bold neon-cyan mb-4">INITIALIZING...</div>
          <div className="w-12 h-12 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto"></div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="text-2xl font-bold neon-pink mb-4">NOT AUTHENTICATED</div>
          <Button onClick={() => setLocation("/")} className="bg-accent text-background">
            RETURN HOME
          </Button>
        </div>
      </div>
    );
  }

  const handleLogout = async () => {
    await logout();
    setLocation("/");
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('File too large. Maximum size is 5MB.');
      return;
    }

    setIsUploading(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      const binaryString = Array.from(uint8Array).map(byte => String.fromCharCode(byte)).join('');
      const base64String = btoa(binaryString);

      // Get the JWT token from localStorage (set by the auth system)
      const token = localStorage.getItem('auth_token');
      
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      // Add Authorization header if token exists
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      const response = await fetch('/api/upload', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          file: base64String,
          filename: file.name,
        }),
      });
    

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Upload failed with status ${response.status}`);
      }

      const result = await response.json();
      const refreshedPhotos = await photosQuery.refetch();
      const savedPhoto = refreshedPhotos.data?.find(photo => photo.photoKey === result.photoKey);
      if (!savedPhoto) {
        throw new Error("Your photo was uploaded, but could not be selected. Please try again.");
      }

      setSelectedPhoto({ id: savedPhoto.id, url: savedPhoto.photoUrl });
      toast.success("Photo uploaded successfully!");
    } catch (error: any) {
      toast.error(error?.message || "Failed to upload photo");
      console.error('Upload error:', error);
    } finally {
      setIsUploading(false);
    }
  };

  const handleTryOn = async () => {
    if (!selectedPhoto || !selectedShirt) {
      toast.error("Upload a photo and select a shirt style before trying it on.");
      return;
    }

    if (tryOnInFlight.current) return;

    if ((creditsQuery.data?.balance || 0) < 1) {
      toast.error("Insufficient credits. You need at least 1 credit to try on a shirt.");
      return;
    }

    tryOnInFlight.current = true;
    setIsTryingOn(true);
    try {
      const result = await tryOnMutation.mutateAsync({
        photoId: selectedPhoto.id,
        shirtStyle: selectedShirt,
      });

      setTryOnProgress(100);
      await new Promise(resolve => window.setTimeout(resolve, 180));
      toast.success("Try-on completed!");
      creditsQuery.refetch();

      setResultData(result);
      setShowResult(true);
    } catch (error: any) {
      toast.error(error?.message || "Failed to process try-on");
      console.error(error);
    } finally {
      setIsTryingOn(false);
      tryOnInFlight.current = false;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b-2 border-accent/30 bg-background/50 backdrop-blur sticky top-0 z-40">
        <div className="container py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="w-6 h-6 text-accent" />
            <h1 className="text-2xl font-bold neon-pink">SHIRT CHANGER</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-xs text-muted-foreground">CREDITS</p>
              <p className="text-2xl font-bold neon-cyan">{creditsQuery.data?.balance || 0}</p>
            </div>
            <Button
              onClick={handleLogout}
              className="px-4 py-2 bg-destructive text-destructive-foreground font-bold border-2 border-destructive flex items-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              LOGOUT
            </Button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="container py-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left: Photo Upload */}
          <Card className="hud-frame bg-card/50 backdrop-blur">
            <div className="space-y-6">
              <h2 className="text-2xl font-bold neon-pink">UPLOAD PHOTO</h2>

              <div className="border-2 border-dashed border-accent rounded p-8 text-center hover:border-secondary transition">
                {selectedPhoto ? (
                  <div className="space-y-4">
                    <img src={selectedPhoto.url} alt="Selected upload" className="w-full h-64 object-cover rounded" />
                    <p className="text-sm text-muted-foreground">Photo selected</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <img src={DEMO_PHOTO_URL} alt="Demo preview" className="w-full h-64 object-cover rounded opacity-70" />
                    <p className="text-foreground">Upload a photo to enable try-on</p>
                    <p className="text-xs text-muted-foreground">Demo preview only · PNG, JPG, or WebP up to 5MB</p>
                  </div>
                )}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  disabled={isUploading}
                  className="hidden"
                  id="photo-upload"
                />
              </div>

              <label htmlFor="photo-upload" className="block">
                <Button
                  className="w-full px-6 py-3 bg-secondary text-background font-bold border-2 border-secondary cursor-pointer"
                  disabled={isUploading}
                  onClick={(e) => {
                    e.preventDefault();
                    document.getElementById('photo-upload')?.click();
                  }}
                >
                  {isUploading ? "UPLOADING..." : "SELECT PHOTO"}
                </Button>
              </label>
            </div>
          </Card>

          {/* Right: Shirt Selection & Try-On */}
          <div className="space-y-6">
            {/* Shirt Selection */}
            <Card className="hud-frame bg-card/50 backdrop-blur">
              <div className="space-y-4">
                <h2 className="text-2xl font-bold neon-cyan">SELECT SHIRT</h2>

                <div className="grid grid-cols-2 gap-3">
                  {shirtsQuery.data?.map((shirt) => (
                    <button
                      key={shirt.id}
                      onClick={() => setSelectedShirt(shirt.id)}
                      className={`p-4 rounded border-2 transition text-center ${
                        selectedShirt === shirt.id
                          ? "border-secondary bg-secondary/20"
                          : "border-accent/50 hover:border-accent"
                      }`}
                    >
                      <Shirt className="w-6 h-6 mx-auto mb-2" style={{ color: shirt.color }} />
                      <p className="text-sm font-bold">{shirt.name}</p>
                    </button>
                  ))}
                </div>
              </div>
            </Card>

            {/* Try-On Button */}
            <Card className="hud-frame bg-card/50 backdrop-blur">
              <div className="space-y-4">
                <h2 className="text-2xl font-bold neon-pink">TRY ON</h2>
                <Button
                  onClick={handleTryOn}
                  disabled={isTryingOn || !selectedPhoto || !selectedShirt}
                  aria-busy={isTryingOn}
                  aria-label={isTryingOn ? `${getTryOnProgressLabel(tryOnProgress)}: ${tryOnProgress}% complete` : "Try on now"}
                  className="relative w-full overflow-hidden px-6 py-4 bg-accent text-background font-bold border-2 border-accent text-lg"
                >
                  {isTryingOn && (
                    <span
                      aria-hidden="true"
                      className="absolute inset-y-0 left-0 bg-background/20 transition-[width] duration-500 ease-out"
                      style={{ width: `${tryOnProgress}%` }}
                    />
                  )}
                  <span className="relative z-10">
                    {isTryingOn
                      ? `${getTryOnProgressLabel(tryOnProgress)} • ${tryOnProgress}%`
                      : "TRY ON NOW"}
                  </span>
                </Button>
                {isTryingOn && (
                  <p className="text-center text-xs text-muted-foreground" aria-live="polite">
                    Generating your edited image. If the provider cannot finish, the request will fail safely and your credit will be restored.
                  </p>
                )}
              </div>
            </Card>
          </div>
        </div>
      </div>

      {/* Result Modal */}
      <Dialog open={showResult} onOpenChange={setShowResult}>
        <DialogContent className="max-w-2xl bg-card border-2 border-accent">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold neon-cyan">TRY-ON RESULT</DialogTitle>
          </DialogHeader>

          {resultData && (
            <div className="space-y-6">
              <div className="rounded overflow-hidden border-2 border-accent">
                <img
                  src={resultData.resultImageUrl}
                  alt="Try-on result"
                  className="w-full h-auto"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-background/50 p-4 rounded border-2 border-accent/30">
                  <p className="text-xs text-muted-foreground mb-2">SHIRT APPLIED</p>
                  <p className="text-lg font-bold neon-pink">{resultData.shirtApplied}</p>
                </div>

                <div className="bg-background/50 p-4 rounded border-2 border-accent/30">
                  <p className="text-xs text-muted-foreground mb-2">CREDITS USED</p>
                  <p className="text-lg font-bold neon-cyan">1</p>
                </div>

                <div className="bg-background/50 p-4 rounded border-2 border-accent/30">
                  <p className="text-xs text-muted-foreground mb-2">CREDITS REMAINING</p>
                  <p className="text-lg font-bold neon-cyan">{resultData.creditsRemaining}</p>
                </div>

                <div className="bg-background/50 p-4 rounded border-2 border-accent/30">
                  <p className="text-xs text-muted-foreground mb-2">STATUS</p>
                  <p className="text-lg font-bold text-green-400">SUCCESS</p>
                </div>
              </div>

              <Button
                onClick={() => setShowResult(false)}
                className="w-full px-6 py-3 bg-secondary text-background font-bold border-2 border-secondary"
              >
                CLOSE
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
