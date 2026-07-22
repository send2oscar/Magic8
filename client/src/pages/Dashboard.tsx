import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Zap, Upload, LogOut, Shirt } from "lucide-react";
import { toast } from "sonner";

const DEMO_PHOTO_URL = '/manus-storage/37218434_10205116407305634_1373258317643644928_n_869f9052.jpg';

export default function Dashboard() {
  const { user, logout, isAuthenticated, loading } = useAuth();
  const [, setLocation] = useLocation();
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(DEMO_PHOTO_URL);
  const [selectedShirt, setSelectedShirt] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isTryingOn, setIsTryingOn] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [resultData, setResultData] = useState<any>(null);

  const creditsQuery = trpc.credits.getBalance.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const photosQuery = trpc.photos.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const shirtsQuery = trpc.shirts.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const uploadPhotoMutation = trpc.photos.upload.useMutation();
  const tryOnMutation = trpc.tryOn.process.useMutation();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin mb-4">
            <Zap className="w-8 h-8 text-accent" />
          </div>
          <p className="text-foreground neon-pink">INITIALIZING DASHBOARD...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    setLocation("/");
    return null;
  }

  const handleLogout = async () => {
    await logout();
    setLocation("/");
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      // If no file selected, keep the demo photo
      setSelectedPhoto(DEMO_PHOTO_URL);
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File too large. Maximum size is 5MB.');
      return;
    }

    setIsUploading(true);
    try {
      // Convert file to base64 string for transmission
      const reader = new FileReader();
      const base64Data = await new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          const base64 = result.split(',')[1] || result;
          resolve(base64);
        };
        reader.onerror = reject;
      });
      
      reader.readAsDataURL(file);
      
      // Use direct /api/upload endpoint instead of tRPC
      const response = await fetch('/api/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          file: base64Data,
          filename: file.name,
        }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Upload failed');
      }
      
      const result = await response.json();
      setSelectedPhoto(result.photoUrl);
      toast.success("Photo uploaded successfully!");
      photosQuery.refetch();
    } catch (error) {
      toast.error("Failed to upload photo");
      console.error(error);
    } finally {
      setIsUploading(false);
    }
  };

  const handleTryOn = async () => {
    if (!selectedPhoto || !selectedShirt) {
      toast.error("Please select both a photo and a shirt style");
      return;
    }

    if ((creditsQuery.data?.balance || 0) < 1) {
      toast.error("Insufficient credits. You need at least 1 credit to try on a shirt.");
      return;
    }

    setIsTryingOn(true);
    try {
      const photos = photosQuery.data || [];
      const photoId = photos.find(p => p.photoUrl === selectedPhoto)?.id || 1;

      const result = await tryOnMutation.mutateAsync({
        photoId,
        photoUrl: selectedPhoto,
        shirtStyle: selectedShirt,
      });

      toast.success("Try-on completed!");
      creditsQuery.refetch();
      
      // Show result modal
      setResultData(result);
      setShowResult(true);
    } catch (error: any) {
      toast.error(error?.message || "Failed to process try-on");
      console.error(error);
    } finally {
      setIsTryingOn(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Result Modal */}
      <Dialog open={showResult} onOpenChange={setShowResult}>
        <DialogContent className="max-w-2xl bg-card border-2 border-accent">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold neon-pink">TRY-ON RESULT</DialogTitle>
          </DialogHeader>
          
          {resultData && (
            <div className="space-y-4">
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">SHIRT APPLIED:</p>
                <p className="text-xl font-bold neon-cyan">{resultData.shirtApplied || 'Unknown'}</p>
              </div>
              
              <div className="border-2 border-accent rounded overflow-hidden">
                <img 
                  src={resultData.resultImageUrl} 
                  alt="Try-on result" 
                  className="w-full h-auto"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">CREDITS REMAINING</p>
                  <p className="text-2xl font-bold neon-cyan">{resultData.creditsRemaining}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">CREDITS USED</p>
                  <p className="text-2xl font-bold neon-pink">1</p>
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

      {/* Header */}
      <div className="border-b-2 border-accent bg-card/50 backdrop-blur sticky top-0 z-50">
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
                    <img src={selectedPhoto} alt="Selected" className="w-full h-64 object-cover rounded" />
                    <p className="text-sm text-muted-foreground">Photo selected</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <Upload className="w-12 h-12 mx-auto text-secondary" />
                    <p className="text-foreground">Click to upload your photo</p>
                    <p className="text-xs text-muted-foreground">PNG, JPG up to 10MB</p>
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
                          ? "border-secondary bg-secondary/10"
                          : "border-accent hover:border-secondary"
                      }`}
                    >
                      <Shirt className="w-6 h-6 mx-auto mb-2" />
                      <p className="text-sm font-mono">{shirt.name}</p>
                    </button>
                  ))}
                </div>
              </div>
            </Card>

            {/* Try-On Button */}
            <Card className="hud-frame bg-card/50 backdrop-blur">
              <div className="space-y-4">
                <h2 className="text-2xl font-bold neon-pink">TRY-ON</h2>
                
                <div className="space-y-3 text-sm text-muted-foreground">
                  <p>✓ Photo selected: {selectedPhoto ? "YES" : "NO"}</p>
                  <p>✓ Shirt selected: {selectedShirt ? "YES" : "NO"}</p>
                  <p>✓ Credits available: {creditsQuery.data?.balance || 0}</p>
                </div>

                <Button
                  onClick={handleTryOn}
                  disabled={!selectedPhoto || !selectedShirt || isTryingOn || (creditsQuery.data?.balance || 0) < 1}
                  className="w-full px-6 py-3 bg-accent text-accent-foreground font-bold border-2 border-accent disabled:opacity-50"
                >
                  {isTryingOn ? "PROCESSING..." : "TRY ON NOW"}
                </Button>

                {(creditsQuery.data?.balance || 0) < 1 && (
                  <p className="text-destructive text-center font-bold">NO CREDITS AVAILABLE</p>
                )}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
