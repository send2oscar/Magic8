import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CreditPurchasePanel } from "@/components/CreditPurchasePanel";
import { ImagePreviewMagnifier } from "@/components/ImagePreviewMagnifier";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { advanceTryOnProgress, getTryOnProgressLabel } from "@/lib/tryOnProgress";
import React, { useEffect, useRef, useState } from "react";
import { Zap, Upload, LogOut, Shirt } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";

function formatEstimatedTime(seconds: number) {
  if (seconds < 60) return `about ${seconds}s`;
  return `about ${Math.ceil(seconds / 60)} min`;
}

const DEMO_PHOTO_URL = '/manus-storage/demo_person_31d5a68a.jpg';
const QWEN_EDIT_STYLE_ID = "qwen-image-edit-rapid";
const IDLE_QWEN_TASK_ID = 1;
type QwenLoraId = "lora_1" | "lora_2" | "lora_3";
type QwenLoraWeights = Record<QwenLoraId, number>;
const QWEN_LORA_UI_LABELS: Record<QwenLoraId, string> = {
  lora_1: "External BB — primary",
  lora_2: "Vagina Fine Tune (The smaller, the tighter)",
  lora_3: "Breast Fine Tune (The smaller value, the smaller breast)",
};
const DEFAULT_QWEN_LORA_WEIGHTS: QwenLoraWeights = { lora_1: 0.6, lora_2: 0.5, lora_3: 0.5 };
const SHIRT_PROMPTS: Record<string, string> = {
  "classic-white": "Change the current shirt to a crisp classic white crew-neck T-shirt. Preserve the person's face, pose, hands, body proportions, and background.",
  "neon-pink": "Change the current shirt to a vivid neon pink T-shirt with realistic fabric texture and lighting. Preserve the person's face, pose, hands, body proportions, and background.",
  "electric-cyan": "Change the current shirt to an electric cyan T-shirt with realistic fabric texture and lighting. Preserve the person's face, pose, hands, body proportions, and background.",
  "dark-black": "Change the current shirt to a sleek dark black T-shirt with realistic fabric texture and lighting. Preserve the person's face, pose, hands, body proportions, and background.",
  holographic: "Change the current shirt to a holographic top with iridescent cyan, magenta, and violet reflections. Preserve the person's face, pose, hands, body proportions, and background.",
  [QWEN_EDIT_STYLE_ID]: "undress the girl, make her completely nude, small to medium breasts, dark pink nipples, others remain unchanged, natural.",
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
  const [qwenLoraWeights, setQwenLoraWeights] = useState<QwenLoraWeights>(DEFAULT_QWEN_LORA_WEIGHTS);
  const [activeQwenTaskId, setActiveQwenTaskId] = useState<number | null>(null);
  const [backgroundQwenError, setBackgroundQwenError] = useState<string | null>(null);
  const [hasTaskSubmissionStarted, setHasTaskSubmissionStarted] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const notifiedTerminalQwenTaskId = useRef<number | null>(null);
  const submissionEpoch = useRef(0);

  // tRPC queries and mutations
  const creditsQuery = trpc.credits.getBalance.useQuery();
  const creditPolicyQuery = trpc.credits.policy.useQuery();
  const photosQuery = trpc.photos.list.useQuery();
  const shirtsQuery = trpc.shirts.list.useQuery();
  const tryOnMutation = trpc.tryOn.process.useMutation();
  const qwenWorkflowQuery = trpc.comfyui.workflowConfig.useQuery(undefined, { refetchOnWindowFocus: false });
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
    const taskStatus = qwenEditStatusQuery.data;
    if (
      activeQwenTaskId === null ||
      !taskStatus ||
      (taskStatus.status !== "success" && taskStatus.status !== "failed") ||
      notifiedTerminalQwenTaskId.current === activeQwenTaskId
    ) return;

    notifiedTerminalQwenTaskId.current = activeQwenTaskId;
    setActiveQwenTaskId(null);
    setHasTaskSubmissionStarted(false);
    setLocalTaskStages([]);
    void creditsQuery.refetch();
    void photosQuery.refetch();

    if (taskStatus.status === "success") {
      setBackgroundQwenError(null);
      toast.success("Your photo is ready. Please view in the Gallery.");
      return;
    }

    const message = taskStatus.message || "The XXX edit was not completed. No credits were charged.";
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

  const handleUseAnotherPhoto = () => {
    setShowResetConfirm(true);
  };

  const confirmReset = () => {
    setShowResetConfirm(false);
    submissionEpoch.current += 1;
    setSelectedPhoto(null);
    setSelectedShirt(null);
    setPositivePrompt("");
    setHasTaskSubmissionStarted(false);
    setResultData(null);
    setShowResult(false);
    setIsTryingOn(false);
    setLocalTaskStages([]);
    setActiveQwenTaskId(null);
    setBackgroundQwenError(null);
    notifiedTerminalQwenTaskId.current = null;
    tryOnInFlight.current = false;
  };

  const isPhotoSelectionLocked = hasTaskSubmissionStarted || isTryingOn || activeQwenTaskId !== null;

  const handleShirtSelection = (shirtId: string) => {
    setSelectedShirt(shirtId);
    setPositivePrompt(SHIRT_PROMPTS[shirtId] ?? "");
  };

  const handleLoraWeightChange = (id: QwenLoraId, rawValue: string) => {
    const value = Number.parseFloat(rawValue);
    if (!Number.isFinite(value)) return;
    const min = qwenWorkflowQuery.data?.strengthMin ?? 0;
    const max = qwenWorkflowQuery.data?.strengthMax ?? 2;
    setQwenLoraWeights(current => ({ ...current, [id]: Math.min(max, Math.max(min, value)) }));
  };

  const resetLoraWeights = () => {
    const configured = qwenWorkflowQuery.data?.loras;
    if (!configured?.length) {
      setQwenLoraWeights(DEFAULT_QWEN_LORA_WEIGHTS);
      return;
    }
    setQwenLoraWeights(Object.fromEntries(configured.map(lora => [lora.id, lora.defaultStrength])) as QwenLoraWeights);
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

    const isQwenEdit = selectedShirt === QWEN_EDIT_STYLE_ID;
    const policy = creditPolicyQuery.data;
    if (!policy) {
      toast.error("The administrator credit policy is still loading. Please try again in a moment.");
      return;
    }
    const requiredCredits = isQwenEdit ? policy.xxxTryOnCredits : policy.standardTryOnCredits;
    const requestEpoch = submissionEpoch.current;

    if ((creditsQuery.data?.balance || 0) < requiredCredits) {
      toast.error(`Insufficient credits. You need at least ${requiredCredits} credits to try on ${isQwenEdit ? "XXX" : "a shirt"}.`);
      return;
    }

    if (isQwenEdit && activeQwenTaskId !== null) {
      toast.error("An XXX task is already processing in the background. You may continue with the other shirt styles.");
      return;
    }

    // Lock the current workspace as soon as a valid request is submitted and
    // expose the same reset action for every shirt workflow.
    setHasTaskSubmissionStarted(true);
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
          loraWeights: qwenLoraWeights,
        });
        if (requestEpoch !== submissionEpoch.current) {
          await creditsQuery.refetch();
          return;
        }
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

      if (requestEpoch !== submissionEpoch.current) {
        await creditsQuery.refetch();
        return;
      }

      setTryOnProgress(100);
      await new Promise(resolve => window.setTimeout(resolve, 180));
      toast.success("Try-on completed!");
      creditsQuery.refetch();

      setResultData(result);
      setShowResult(true);
    } catch (error: any) {
      if (requestEpoch === submissionEpoch.current) {
        toast.error(error?.message || "Failed to process try-on");
        console.error(error);
        if (isQwenEdit) setHasTaskSubmissionStarted(false);
      }
    } finally {
      if (requestEpoch === submissionEpoch.current) {
        setIsTryingOn(false);
        if (!isQwenEdit) {
          setLocalTaskStages([]);
          setHasTaskSubmissionStarted(false);
        }
        tryOnInFlight.current = false;
      }
    }
  };

  const isBackgroundQwenTask = activeQwenTaskId !== null;
  const shouldOfferAnotherPhoto = hasTaskSubmissionStarted;
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
  const selectedShirtName = selectedShirt === QWEN_EDIT_STYLE_ID
    ? "XXX"
    : shirtsQuery.data?.find(shirt => shirt.id === selectedShirt)?.name ?? null;
  const standardCreditCost = creditPolicyQuery.data?.standardTryOnCredits;
  const xxxCreditCost = creditPolicyQuery.data?.xxxTryOnCredits;
  const formatCreditCost = (amount: number | undefined) => amount === undefined
    ? "… Credits"
    : `${amount} ${amount === 1 ? "Credit" : "Credits"}`;
  const processingRouteLabel = selectedShirt === QWEN_EDIT_STYLE_ID
    ? "LOCAL COMFYUI (QWEN)"
    : selectedShirt
      ? "STANDARD CLOUD IMAGE GENERATION"
      : "NO ROUTE SELECTED";

  return (
    <div className="neon-luxe-page min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-40 border-b border-accent/30 bg-background/80 backdrop-blur-xl">
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
              className="flex items-center gap-2 border border-secondary/70 bg-secondary px-4 py-2 font-bold text-secondary-foreground shadow-[0_0_22px_oklch(0.77_0.09_337_/_0.18)]"
            >
              <Shirt className="w-4 h-4" />
              GALLERY
            </Button>
            <Button
              onClick={handleLogout}
              className="flex items-center gap-2 border border-destructive/80 bg-destructive px-4 py-2 font-bold text-destructive-foreground"
            >
              <LogOut className="w-4 h-4" />
              LOGOUT
            </Button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="container py-12">
        <div className="mb-8">
          <CreditPurchasePanel onCreditsChanged={() => creditsQuery.refetch()} />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left: Photo Upload */}
          <Card className="hud-frame bg-card/50 backdrop-blur-xl">
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
            </div>
          </Card>

          {/* Right: Shirt Selection & Try-On */}
          <div className="space-y-6">
            {/* Shirt Selection */}
            <Card className="hud-frame bg-card/50 backdrop-blur-xl">
              <div className="space-y-4">
                <h2 className="text-2xl font-bold neon-cyan">SELECT SHIRT</h2>

                <div className="grid grid-cols-2 gap-3">
                  {shirtsQuery.data?.map((shirt) => (
                    <button
                      key={shirt.id}
                      type="button"
                      aria-pressed={selectedShirt === shirt.id}
                      onClick={() => handleShirtSelection(shirt.id)}
                      className={`p-4 rounded border-2 transition text-center ${
                        selectedShirt === shirt.id
                          ? "border-secondary bg-secondary/20"
                          : "border-accent/50 hover:border-accent"
                      }`}
                    >
                      <Shirt className="w-6 h-6 mx-auto mb-2" style={{ color: shirt.color }} />
                      <p className="text-sm font-bold">{shirt.name} ({formatCreditCost(standardCreditCost)})</p>
                    </button>
                  ))}
                  <button
                    key={QWEN_EDIT_STYLE_ID}
                    type="button"
                    aria-pressed={selectedShirt === QWEN_EDIT_STYLE_ID}
                    onClick={() => handleShirtSelection(QWEN_EDIT_STYLE_ID)}
                    className={`xxx-button-attention p-4 rounded border-2 transition text-center ${
                      selectedShirt === QWEN_EDIT_STYLE_ID
                        ? "border-secondary bg-secondary/20"
                        : "border-accent/50 hover:border-accent"
                    }`}
                  >
                    <Shirt className="w-6 h-6 mx-auto mb-2" />
                    <p className="text-sm font-bold">XXX ({formatCreditCost(xxxCreditCost)})</p>
                    <p className="mt-1 text-xs text-muted-foreground">Qwen edit</p>
                  </button>
                </div>
                <div className="space-y-2 border-t border-accent/20 pt-4">
                  <label htmlFor="positive-prompt" className="text-sm font-bold text-foreground">POSITIVE PROMPT <span className="text-muted-foreground">(OPTIONAL)</span></label>
                  <Textarea
                    id="positive-prompt"
                    value={positivePrompt}
                    onChange={(event) => setPositivePrompt(event.target.value)}
                    disabled={!selectedShirt || isPhotoSelectionLocked}
                    placeholder="e.g. Change the shirt to yellow; keep the person and background unchanged."
                    className="min-h-24 resize-y border-accent/40 bg-background/50 text-foreground focus-visible:ring-secondary"
                  />
                  <p className="text-xs text-muted-foreground">Selecting a shirt fills its suggested prompt. The value is submitted only for the XXX Qwen ComfyUI edit.</p>
                </div>
                {selectedShirt === QWEN_EDIT_STYLE_ID && (
                <div className="space-y-4 rounded border border-secondary/40 bg-background/40 p-4" aria-labelledby="qwen-lora-editor-title">
                    <div className="space-y-1">
                      <h3 id="qwen-lora-editor-title" className="text-sm font-bold text-secondary">QWEN WORKFLOW CONFIGURATION</h3>
                      <p className="text-xs text-muted-foreground">{qwenWorkflowQuery.data?.fileName ?? "Approved Qwen workflow"}</p>
                    </div>
                    <div className="grid gap-3">
                      {(qwenWorkflowQuery.data?.loras ?? [
                        { id: "lora_1", label: QWEN_LORA_UI_LABELS.lora_1, filename: "external_bb-v1.220.safetensors", defaultStrength: 0.6},
                        { id: "lora_2", label: QWEN_LORA_UI_LABELS.lora_2, filename: "external_VSizeSlider.safetensors", defaultStrength: 0.5 },
                        { id: "lora_3", label: QWEN_LORA_UI_LABELS.lora_3, filename: "external_bslider_qwen_v1.safetensors", defaultStrength: 0.5 },
                      ]).filter(lora => lora.id !== "lora_1").map(lora => {
                        const displayLabel = QWEN_LORA_UI_LABELS[lora.id as QwenLoraId] ?? lora.label;
                        return (
                          <label key={lora.id} className="grid gap-1 sm:grid-cols-[minmax(0,1fr)_7rem] sm:items-center">
                            <span className="min-w-0">
                              <span className="block text-sm font-semibold text-foreground">{displayLabel}</span>
                              <span className="block truncate text-xs text-muted-foreground" title={lora.filename}>{lora.filename}</span>
                            </span>
                            <input
                              type="number"
                              aria-label={`${displayLabel} weight`}
                              min={qwenWorkflowQuery.data?.strengthMin ?? 0}
                              max={qwenWorkflowQuery.data?.strengthMax ?? 2}
                              step="0.05"
                              value={qwenLoraWeights[lora.id as QwenLoraId]}
                              onChange={event => handleLoraWeightChange(lora.id as QwenLoraId, event.target.value)}
                              disabled={isPhotoSelectionLocked}
                              className="h-10 w-full rounded border border-accent/40 bg-background px-3 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-secondary disabled:cursor-not-allowed disabled:opacity-60"
                            />
                          </label>
                        );
                      })}
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-xs text-muted-foreground">Used only for Qwen edit. Allowed range: {qwenWorkflowQuery.data?.strengthMin ?? 0}–{qwenWorkflowQuery.data?.strengthMax ?? 2}. A weight of 0 disables that approved LoRA for this task.</p>
                      <Button type="button" variant="outline" size="sm" onClick={resetLoraWeights} disabled={isPhotoSelectionLocked} className="border-secondary/60 text-secondary">
                        RESET WEIGHTS
                      </Button>
                    </div>
                </div>
                )}
              </div>
            </Card>

            {/* Try-On Button */}
            <Card className="hud-frame bg-card/50 backdrop-blur-xl">
              <div className="space-y-4">
                <h2 className="text-2xl font-bold neon-pink">TRY ON</h2>
                <div className="rounded border border-accent/40 bg-background/40 px-4 py-3" role="status" aria-label="Selected processing route">
                  <p className="text-xs font-bold tracking-[0.18em] text-muted-foreground">PROCESSING ROUTE</p>
                  <p className="mt-1 text-sm font-bold text-accent">{processingRouteLabel}</p>
                </div>
                <Button
                  onClick={shouldOfferAnotherPhoto ? handleUseAnotherPhoto : handleTryOn}
                  disabled={!shouldOfferAnotherPhoto && (!selectedPhoto?.id || !selectedShirt || isUploading || isTryingOn)}
                  aria-busy={isTryingOn && !shouldOfferAnotherPhoto}
                  aria-label={shouldOfferAnotherPhoto ? "Use another photo" : (isTryingOn ? `${liveProgressLabel}: ${liveProgress}% complete` : "Try on now")}
                  className="relative w-full overflow-hidden px-6 py-4 bg-accent text-background font-bold border-2 border-accent text-lg"
                >
                  {isTryingOn && !isBackgroundQwenTask && (
                    <span
                      aria-hidden="true"
                      className="absolute inset-y-0 left-0 bg-background/20 transition-[width] duration-1000 ease-out"
                      style={{ width: `${liveProgress}%` }}
                    />
                  )}
                  <span
                    className="relative z-10"
                  >
                    {shouldOfferAnotherPhoto
                      ? "USE ANOTHER PHOTO"
                      : isTryingOn
                        ? `${liveProgressLabel} • ${liveProgress}%`
                        : selectedShirt === QWEN_EDIT_STYLE_ID
                          ? "SEND XXX TO LOCAL COMFYUI"
                          : selectedShirtName
                            ? `TRY ON ${selectedShirtName.toUpperCase()}`
                            : "SELECT A SHIRT STYLE"}
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

      <AlertDialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
        <AlertDialogContent className="neon-luxe-shell border-accent/60 bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-bold neon-cyan">USE ANOTHER PHOTO</AlertDialogTitle>
            <AlertDialogDescription className="text-foreground">
              No worry. Your processing photo is still running in the background. Please check your gallery.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={confirmReset} className="bg-accent text-background hover:bg-accent/90">OK</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Result Dialog */}
      <Dialog open={showResult} onOpenChange={setShowResult}>
        <DialogContent className="neon-luxe-shell max-w-3xl border border-accent/60 bg-card p-0">
          <DialogHeader className="p-6 pb-0">
            <DialogTitle className="text-2xl font-bold neon-cyan">TRY-ON RESULT</DialogTitle>
          </DialogHeader>
          <div className="p-6">
            {resultData?.resultImageUrl ? (
              <div className="space-y-4 p-4">
                <ImagePreviewMagnifier
                  src={resultData.resultImageUrl}
                  alt="Try-on result"
                  className="w-full rounded-lg"
                  imageClassName="h-auto w-full rounded-lg border border-accent/50"
                />
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
