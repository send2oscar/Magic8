import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { advanceTryOnProgress, getTryOnProgressLabel } from "@/lib/tryOnProgress";
import React, { useEffect, useRef, useState } from "react";
import { Zap, Upload, LogOut, Shirt, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";

function formatEstimatedTime(seconds: number) {
  if (seconds < 60) return `about ${seconds}s`;
  return `about ${Math.ceil(seconds / 60)} min`;
}

const DEMO_PHOTO_URL = '/manus-storage/demo_person_31d5a68a.jpg';
const QWEN_EDIT_STYLE_ID = "qwen-image-edit-rapid";
const IDLE_QWEN_TASK_ID = 1;
const SHIRT_PROMPTS: Record<string, string> = {
  "classic-white": "Change the current shirt to a crisp classic white crew-neck T-shirt. Preserve the person's face, pose, hands, body proportions, and background.",
  "neon-pink": "Change the current shirt to a vivid neon pink T-shirt with realistic fabric texture and lighting. Preserve the person's face, pose, hands, body proportions, and background.",
  "electric-cyan": "Change the current shirt to an electric cyan T-shirt with realistic fabric texture and lighting. Preserve the person's face, pose, hands, body proportions, and background.",
  "dark-black": "Change the current shirt to a sleek dark black T-shirt with realistic fabric texture and lighting. Preserve the person's face, pose, hands, body proportions, and background.",
  holographic: "Change the current shirt to a holographic top with iridescent cyan, magenta, and violet reflections. Preserve the person's face, pose, hands, body proportions, and background.",
  [QWEN_EDIT_STYLE_ID]: "undress the girl, make her completely nude, small to medium breasts, pink nipples, others remain unchanged, natural.",
};

type SelectedPhoto = {
  id: number | null;
  url: string;
  previewUrl: string;
};

type LiveTaskStage = {
  key: string;
  label: string;
  state: "active" | "completed" | "error";
  detail?: string;
  timestamp: number;
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
  const previewObjectUrl = useRef<string | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [localTaskStages, setLocalTaskStages] = useState<LiveTaskStage[]>([]);
  const [tryOnStartedAt, setTryOnStartedAt] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [positivePrompt, setPositivePrompt] = useState("");
  const [activeQwenTaskId, setActiveQwenTaskId] = useState<number | null>(null);
  const [backgroundQwenError, setBackgroundQwenError] = useState<string | null>(null);
  const [hasTaskSubmissionStarted, setHasTaskSubmissionStarted] = useState(false);
  const hasAppliedDefaultPrompt = useRef(false);
  const notifiedTerminalQwenTaskId = useRef<number | null>(null);

  // tRPC queries and mutations
  const creditsQuery = trpc.credits.getBalance.useQuery();
  const photosQuery = trpc.photos.list.useQuery();
  const shirtsQuery = trpc.shirts.list.useQuery();
  const tryOnMutation = trpc.tryOn.process.useMutation();
  const defaultPromptQuery = trpc.comfyuiPoc.defaultPrompt.useQuery(undefined, { refetchOnWindowFocus: false });
  const startQwenEditMutation = trpc.comfyui.startQwenEdit.useMutation();
  const qwenEditStatusQuery = trpc.comfyui.qwenEditStatus.useQuery(
    { taskId: activeQwenTaskId ?? IDLE_QWEN_TASK_ID },
    {
      enabled: activeQwenTaskId !== null,
      refetchInterval: activeQwenTaskId !== null ? 5_000 : false,
      refetchOnWindowFocus: false,
    },
  );

  useEffect(() => {
    if (!isTryingOn) {
      setTryOnProgress(0);
      setTryOnStartedAt(null);
      setElapsedSeconds(0);
      return;
    }

    setTryOnProgress(8);
    setTryOnStartedAt(Date.now());
    const progressTimer = window.setInterval(() => {
      setTryOnProgress(currentProgress => advanceTryOnProgress(currentProgress));
    }, 650);

    return () => window.clearInterval(progressTimer);
  }, [isTryingOn]);

  useEffect(() => {
    if (!tryOnStartedAt) return;
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - tryOnStartedAt) / 1_000)));
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [tryOnStartedAt]);

  useEffect(() => () => {
    if (previewObjectUrl.current && typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(previewObjectUrl.current);
  }, []);

  useEffect(() => {
    if (hasAppliedDefaultPrompt.current || defaultPromptQuery.isLoading || selectedShirt) return;
    hasAppliedDefaultPrompt.current = true;
    if (defaultPromptQuery.data?.prompt) setPositivePrompt(defaultPromptQuery.data.prompt);
  }, [defaultPromptQuery.data?.prompt, defaultPromptQuery.isLoading, selectedShirt]);

  useEffect(() => {
    const taskStatus = qwenEditStatusQuery.data;
    if (
      activeQwenTaskId === null ||
      !taskStatus ||
      (taskStatus.status !== "success" && taskStatus.status !== "failed") ||
      notifiedTerminalQwenTaskId.current === activeQwenTaskId
    ) return;

    notifiedTerminalQwenTaskId.current = activeQwenTaskId;
    setActiveQwenTaskId(null);
    setLocalTaskStages([]);
    void creditsQuery.refetch();
    void photosQuery.refetch();

    if (taskStatus.status === "success") {
      setBackgroundQwenError(null);
      toast.success("Your photo is ready. Please view in the Gallery.");
      return;
    }

    const message = taskStatus.message || "The XXX edit was not completed. Your 10 credits have been returned.";
    setBackgroundQwenError(message);
    toast.error(message);
  }, [activeQwenTaskId, creditsQuery, photosQuery, qwenEditStatusQuery.data]);

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

  const isPhotoSelectionLocked = hasTaskSubmissionStarted || isTryingOn || activeQwenTaskId !== null;

  const handleShirtSelection = (shirtId: string) => {
    setSelectedShirt(shirtId);
    setPositivePrompt(SHIRT_PROMPTS[shirtId] ?? "");
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isPhotoSelectionLocked) return;
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('File too large. Maximum size is 5MB.');
      return;
    }

    if (previewObjectUrl.current && typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(previewObjectUrl.current);
    const localPreviewUrl = typeof URL.createObjectURL === "function" ? URL.createObjectURL(file) : "";
    previewObjectUrl.current = localPreviewUrl || null;
    setPreviewFailed(false);
    // Render immediately from the browser's selected file. Storage remains the
    // authenticated source of truth for Try On once upload completes.
    setSelectedPhoto({ id: null, url: "", previewUrl: localPreviewUrl });

    setIsUploading(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      const binaryString = Array.from(uint8Array).map(byte => String.fromCharCode(byte)).join('');
      const base64String = btoa(binaryString);
      const previewUrl = localPreviewUrl || `data:${file.type || "image/jpeg"};base64,${base64String}`;
      if (!localPreviewUrl) {
        setSelectedPhoto({ id: null, url: "", previewUrl });
      }

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

      setSelectedPhoto({ id: savedPhoto.id, url: savedPhoto.photoUrl, previewUrl });
      toast.success("Photo uploaded successfully!");
    } catch (error: any) {
      toast.error(error?.message || "Failed to upload photo");
      console.error('Upload error:', error);
    } finally {
      setIsUploading(false);
    }
  };

  const handleTryOn = async () => {
    if (!selectedPhoto?.id || !selectedShirt) {
      toast.error("Upload a photo and select a shirt style before trying it on.");
      return;
    }

    if (tryOnInFlight.current) return;

    // Lock the current workspace as soon as the user starts a valid request.
    // This intentionally does not wait for a direct-ComfyUI acknowledgment.
    setHasTaskSubmissionStarted(true);
    const isQwenEdit = selectedShirt === QWEN_EDIT_STYLE_ID;
    const requiredCredits = isQwenEdit ? 10 : 1;

    if ((creditsQuery.data?.balance || 0) < requiredCredits) {
      toast.error(`Insufficient credits. You need at least ${requiredCredits} credits to try on ${isQwenEdit ? "XXX" : "a shirt"}.`);
      return;
    }

    if (isQwenEdit && activeQwenTaskId !== null) {
      toast.error("An XXX task is already processing in the background. You may continue with the other shirt styles.");
      return;
    }

    tryOnInFlight.current = true;
    setIsTryingOn(true);
    setLocalTaskStages([
      { key: "request_sent", label: "Try-on request sent", state: "completed", timestamp: Date.now() },
      { key: "waiting_for_server", label: "Waiting for server task", state: "active", timestamp: Date.now() },
    ]);
    try {
      if (isQwenEdit) {
        setLocalTaskStages([
          { key: "XXX request sent", label: "XXX request sent", state: "completed", timestamp: Date.now() },
          { key: "comfy_queue", label: "Sending the XXX edit to ComfyUI", state: "active", detail: "The application server is submitting the fixed Qwen workflow directly to ComfyUI.", timestamp: Date.now() },
        ]);
        const result = await startQwenEditMutation.mutateAsync({
          photoId: selectedPhoto.id,
          positivePrompt,
        });
        notifiedTerminalQwenTaskId.current = null;
        setBackgroundQwenError(null);
        setActiveQwenTaskId(result.taskId);
        await creditsQuery.refetch();
        toast.success("Your image will be ready in the Gallery. You may continue with other photo and shirt style.");
        return;
      }

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
      if (!isQwenEdit) setLocalTaskStages([]);
      tryOnInFlight.current = false;
    }
  };

  const isBackgroundQwenTask = activeQwenTaskId !== null;
  const hasVisibleTask = isTryingOn || isBackgroundQwenTask;
  const qwenTaskStatus = qwenEditStatusQuery.data;
  const qwenTaskStages = qwenTaskStatus && "stages" in qwenTaskStatus && Array.isArray(qwenTaskStatus.stages)
    ? qwenTaskStatus.stages as LiveTaskStage[]
    : undefined;
  const qwenTaskMessage = qwenTaskStatus && "message" in qwenTaskStatus ? qwenTaskStatus.message : undefined;
  const qwenEstimatedSecondsRemaining = qwenTaskStatus && "estimatedSecondsRemaining" in qwenTaskStatus
    ? qwenTaskStatus.estimatedSecondsRemaining
    : undefined;
  const qwenQueueRemaining = qwenTaskStatus && "queueRemaining" in qwenTaskStatus
    ? qwenTaskStatus.queueRemaining
    : undefined;
  const liveTaskStages: LiveTaskStage[] = isBackgroundQwenTask && qwenTaskStages?.length ? qwenTaskStages : localTaskStages;
  const liveProgress = tryOnProgress;
  const liveProgressLabel = isBackgroundQwenTask
    ? qwenEditStatusQuery.isFetching ? "Checking XXX background task" : "XXX processing in background"
    : getTryOnProgressLabel(liveProgress);

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
              onClick={() => setLocation("/gallery")}
              className="px-4 py-2 bg-secondary text-background font-bold border-2 border-secondary flex items-center gap-2"
            >
              <Shirt className="w-4 h-4" />
              GALLERY
            </Button>
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

              <div className="border-2 border-dashed border-accent rounded p-4 text-center transition hover:border-secondary sm:p-8">
                {selectedPhoto ? (
                  <div className="space-y-4">
                    <div className="mx-auto flex aspect-square w-full max-w-[500px] items-center justify-center overflow-hidden rounded border border-accent/50 bg-background/40">
                      {selectedPhoto.previewUrl && !previewFailed ? (
                        <img src={selectedPhoto.previewUrl} alt="Selected upload" className="block h-full w-full object-contain" onLoad={() => setPreviewFailed(false)} onError={() => setPreviewFailed(true)} />
                      ) : (
                        <div role="status" className="px-4 text-sm text-destructive">Preview unavailable. Choose the photo again to refresh it.</div>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{selectedPhoto.id ? "Photo selected" : "Uploading selected photo..."}</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="mx-auto flex aspect-square w-full max-w-[500px] items-center justify-center overflow-hidden rounded border border-accent/50 bg-background/40">
                      <img src={DEMO_PHOTO_URL} alt="Demo preview" className="block h-full w-full object-contain opacity-70" />
                    </div>
                    <p className="text-foreground">Upload a photo to enable try-on</p>
                    <p className="text-xs text-muted-foreground">Demo preview only · PNG, JPG, or WebP up to 5MB</p>
                  </div>
                )}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  disabled={isUploading || isPhotoSelectionLocked}
                  className="hidden"
                  id="photo-upload"
                />
              </div>

              <label htmlFor="photo-upload" className="block">
                <Button
                  className="w-full px-6 py-3 bg-secondary text-background font-bold border-2 border-secondary cursor-pointer"
                  disabled={isUploading || isPhotoSelectionLocked}
                  onClick={(e) => {
                    e.preventDefault();
                    document.getElementById('photo-upload')?.click();
                  }}
                >
                  {isUploading ? "UPLOADING..." : isPhotoSelectionLocked ? "PHOTO LOCKED WHILE TASK RUNS" : "SELECT PHOTO"}
                </Button>
              </label>
              {isPhotoSelectionLocked && (
                <div className="space-y-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full border-accent text-accent hover:bg-accent/10"
                    onClick={() => window.location.reload()}
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    USE ANOTHER PHOTO
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    This reloads the workspace for a new task. Any XXX request already accepted by the server keeps running and will be saved to Gallery when it finishes.
                  </p>
                </div>
              )}
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
                      onClick={() => handleShirtSelection(shirt.id)}
                      className={`p-4 rounded border-2 transition text-center ${
                        selectedShirt === shirt.id
                          ? "border-secondary bg-secondary/20"
                          : "border-accent/50 hover:border-accent"
                      }`}
                    >
                      <Shirt className="w-6 h-6 mx-auto mb-2" style={{ color: shirt.color }} />
                      <p className="text-sm font-bold">{shirt.name} (1 Credit)</p>
                    </button>
                  ))}
                  <button
                    key={QWEN_EDIT_STYLE_ID}
                    onClick={() => handleShirtSelection(QWEN_EDIT_STYLE_ID)}
                    className={`p-4 rounded border-2 transition text-center ${
                      selectedShirt === QWEN_EDIT_STYLE_ID
                        ? "border-secondary bg-secondary/20"
                        : "border-accent/50 hover:border-accent"
                    }`}
                  >
                    <Shirt className="w-6 h-6 mx-auto mb-2" />
                    <p className="text-sm font-bold">XXX (10 Credits)</p>
                    <p className="mt-1 text-xs text-muted-foreground">Qwen edit</p>
                  </button>
                </div>
                <div className="space-y-2 border-t border-accent/20 pt-4">
                  <label htmlFor="positive-prompt" className="text-sm font-bold text-foreground">POSITIVE PROMPT <span className="text-muted-foreground">(OPTIONAL)</span></label>
                  <Textarea
                    id="positive-prompt"
                    value={positivePrompt}
                    onChange={(event) => setPositivePrompt(event.target.value)}
                    placeholder="e.g. Change the shirt to yellow; keep the person and background unchanged."
                    className="min-h-24 resize-y border-accent/40 bg-background/50 text-foreground focus-visible:ring-secondary"
                  />
                  <p className="text-xs text-muted-foreground">Selecting a shirt fills its suggested prompt. The value is submitted only for the XXX Qwen ComfyUI edit.</p>
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
                  aria-label={isTryingOn ? `${liveProgressLabel}: ${liveProgress}% complete` : "Try on now"}
                  className="relative w-full overflow-hidden px-6 py-4 bg-accent text-background font-bold border-2 border-accent text-lg"
                >
                  {isTryingOn && (
                    <span
                      aria-hidden="true"
                      className="absolute inset-y-0 left-0 bg-background/20 transition-[width] duration-1000 ease-out"
                      style={{ width: `${liveProgress}%` }}
                    />
                  )}
                  <span
                    className="relative z-10"
                  >
                    {isTryingOn ? `${liveProgressLabel} • ${liveProgress}%` : "TRY ON NOW"}
                  </span>
                </Button>
                {hasVisibleTask && (
                  <div className="space-y-4 rounded border border-accent/40 bg-background/40 p-4" aria-live="polite">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-bold neon-cyan">LIVE TASK LOG</p>
                      {isBackgroundQwenTask ? (
                        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span>Background task #{activeQwenTaskId}</span>
                          {typeof qwenQueueRemaining === "number" && (
                            <span>Queue ahead: {qwenQueueRemaining}</span>
                          )}
                          <span>
                            Estimated remaining: {typeof qwenEstimatedSecondsRemaining === "number"
                              ? formatEstimatedTime(qwenEstimatedSecondsRemaining)
                              : "not available from ComfyUI"}
                          </span>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">{elapsedSeconds}s elapsed</p>
                      )}
                    </div>
                    <ol className="space-y-2 text-sm">
                      {liveTaskStages.map((stage) => (
                        <li key={`${stage.key}-${stage.timestamp}`} className="flex items-start gap-2">
                          <span aria-hidden="true" className={stage.state === "completed" ? "text-secondary" : stage.state === "error" ? "text-destructive" : "text-accent"}>
                            {stage.state === "completed" ? "✓" : stage.state === "error" ? "!" : "•"}
                          </span>
                          <span className={`break-words ${stage.state === "error" ? "text-destructive" : stage.state === "active" ? "text-foreground" : "text-muted-foreground"}`}>
                            {stage.label}{stage.detail ? ` — ${stage.detail}` : ""}
                          </span>
                        </li>
                      ))}
                    </ol>
                    <p className="text-xs text-muted-foreground">
                      {isBackgroundQwenTask
                        ? qwenTaskMessage ?? "Your XXX image is processing in the background. You may continue with other photo and shirt style."
                        : liveProgress >= 92
                          ? "The AI provider is still working. This request will remain open until it returns a result or a safe failure."
                          : "Preparing your edit. The current server-confirmed stage appears above."}
                    </p>
                  </div>
                )}
                {backgroundQwenError && (
                  <div role="alert" className="space-y-3 rounded border border-destructive/70 bg-destructive/10 p-4 text-destructive">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-bold">XXX TASK ERROR</p>
                      <Button type="button" variant="outline" size="sm" onClick={() => setBackgroundQwenError(null)} className="border-destructive/60 text-destructive">DISMISS</Button>
                    </div>
                    <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words font-sans text-sm">{backgroundQwenError}</pre>
                  </div>
                )}
              </div>
            </Card>
          </div>
        </div>
      </div>

      {/* Result Dialog */}
      <Dialog open={showResult} onOpenChange={setShowResult}>
        <DialogContent className="max-w-3xl p-0 border bg-card">
          <DialogHeader className="p-6 pb-0">
            <DialogTitle className="text-2xl font-bold neon-cyan">TRY-ON RESULT</DialogTitle>
          </DialogHeader>
          <div className="p-6">
            {resultData?.resultImageUrl ? (
              <div className="space-y-4 p-4">
                <img src={resultData.resultImageUrl} alt="Try-on result" className="w-full h-auto rounded-lg border border-accent/50" />
                <p className="text-sm text-muted-foreground">Shirt applied: {resultData.shirtApplied}</p>
                {resultData?.savedToGallery && <p className="text-sm text-secondary">Saved automatically to your private gallery. One credit was deducted after this result was stored.</p>}
              </div>
            ) : (
              <div className="text-center text-destructive">No result image available.</div>
            )}
          </div>
          <div className="flex justify-end gap-2 p-6 pt-0">
            <Button onClick={() => setShowResult(false)} className="bg-secondary text-background">CLOSE</Button>
            {resultData?.savedToGallery && <Button onClick={() => setLocation("/gallery")} className="bg-accent text-background">VIEW GALLERY</Button>}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
