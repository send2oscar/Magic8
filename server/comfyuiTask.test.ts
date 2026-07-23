import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  addCredits: vi.fn(),
  deductCredits: vi.fn(),
  getComfyUiTaskMetadata: vi.fn(),
  getUserCredits: vi.fn(),
  getUserPhotos: vi.fn(),
  getUserTryOnTask: vi.fn(),
  saveTryOnHistory: vi.fn(),
  updateTryOnHistory: vi.fn(),
  updateTryOnTaskStages: vi.fn(),
  checkComfyUiConnection: vi.fn(),
  downloadApprovedQwenOutput: vi.fn(),
  getApprovedQwenOutput: vi.fn(),
  getApprovedQwenTaskProgress: vi.fn(),
  submitApprovedQwenEdit: vi.fn(),
  storagePut: vi.fn(),
}));

vi.mock("./db", () => ({
  addCredits: mocks.addCredits,
  deductCredits: mocks.deductCredits,
  getComfyUiTaskMetadata: mocks.getComfyUiTaskMetadata,
  getUserCredits: mocks.getUserCredits,
  getUserPhotos: mocks.getUserPhotos,
  getUserTryOnTask: mocks.getUserTryOnTask,
  saveTryOnHistory: mocks.saveTryOnHistory,
  updateTryOnHistory: mocks.updateTryOnHistory,
  updateTryOnTaskStages: mocks.updateTryOnTaskStages,
}));

vi.mock("./comfyui", () => ({
  ComfyUiConfigurationError: class ComfyUiConfigurationError extends Error {},
  ComfyUiRemoteError: class ComfyUiRemoteError extends Error {},
  checkComfyUiConnection: mocks.checkComfyUiConnection,
  downloadApprovedQwenOutput: mocks.downloadApprovedQwenOutput,
  getApprovedQwenOutput: mocks.getApprovedQwenOutput,
  getApprovedQwenTaskProgress: mocks.getApprovedQwenTaskProgress,
  submitApprovedQwenEdit: mocks.submitApprovedQwenEdit,
}));

vi.mock("./storage", () => ({ storagePut: mocks.storagePut }));

import { refreshApprovedQwenTask, startApprovedQwenTask } from "./comfyuiTask";

describe("durable direct ComfyUI XXX tasks", () => {
  const taskMetadata = {
    kind: "qwen-image-edit-rapid" as const,
    promptId: "direct-prompt-1",
    uploadedFilename: "shirt-changer-source.jpg",
    queuedAt: Date.now(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUserCredits.mockResolvedValue(15);
    mocks.getUserPhotos.mockResolvedValue([{ id: 7, photoKey: "photos/17/input.jpg" }]);
    mocks.saveTryOnHistory.mockResolvedValue({ insertId: 801 });
    mocks.deductCredits.mockResolvedValue(true);
    mocks.addCredits.mockResolvedValue(true);
    mocks.updateTryOnHistory.mockResolvedValue(true);
    mocks.updateTryOnTaskStages.mockResolvedValue(true);
    mocks.checkComfyUiConnection.mockResolvedValue(undefined);
    mocks.submitApprovedQwenEdit.mockResolvedValue({ promptId: "direct-prompt-1", uploadedFilename: "shirt-changer-source.jpg" });
    mocks.getApprovedQwenTaskProgress.mockResolvedValue({ phase: "unavailable", queueRemaining: null, estimatedSecondsRemaining: null });
  });

  it("uses direct ComfyUI, reserves exactly ten credits, and forwards the exact Dashboard prompt", async () => {
    const prompt = "Keep this prompt exactly as typed — no extra safety preface, filtering, or substitution.";

    await expect(startApprovedQwenTask(17, 7, prompt)).resolves.toMatchObject({
      taskId: 801,
      status: "pending",
      creditsRemaining: 5,
      shirtApplied: "XXX",
    });

    expect(mocks.deductCredits).toHaveBeenCalledWith(17, 10);
    expect(mocks.checkComfyUiConnection).toHaveBeenCalledTimes(1);
    expect(mocks.submitApprovedQwenEdit).toHaveBeenCalledWith("photos/17/input.jpg", prompt);
    expect(mocks.updateTryOnTaskStages).toHaveBeenLastCalledWith(
      801,
      expect.any(Array),
      expect.objectContaining({ promptId: "direct-prompt-1", positivePrompt: prompt }),
    );
  });

  it("stores a direct ComfyUI result in Gallery without a Bridge and keeps the ten-credit charge", async () => {
    mocks.getUserTryOnTask.mockResolvedValue({ shirtStyle: "qwen-image-edit-rapid", status: "pending", bubbleApiResponse: "{}" });
    mocks.getComfyUiTaskMetadata.mockReturnValue(taskMetadata);
    mocks.getApprovedQwenOutput.mockResolvedValue({ filename: "result.png", subfolder: "", type: "output" });
    mocks.downloadApprovedQwenOutput.mockResolvedValue({ data: Buffer.from("generated"), contentType: "image/png" });
    mocks.storagePut.mockResolvedValue({ key: "comfyui-results/17/801.png", url: "https://storage.example/result.png" });

    await expect(refreshApprovedQwenTask(17, 801)).resolves.toMatchObject({
      status: "success",
      resultImageUrl: "https://storage.example/result.png",
    });

    expect(mocks.storagePut).toHaveBeenCalledWith("comfyui-results/17/801.png", Buffer.from("generated"), "image/png");
    expect(mocks.updateTryOnHistory).toHaveBeenCalledWith(801, expect.objectContaining({ status: "success", creditsDeducted: 10 }));
    expect(mocks.addCredits).not.toHaveBeenCalled();
  });

  it("returns persisted direct-ComfyUI execution stages and only exposes an ETA when ComfyUI provides one", async () => {
    mocks.getUserTryOnTask.mockResolvedValue({ shirtStyle: "qwen-image-edit-rapid", status: "pending", bubbleApiResponse: "{}" });
    mocks.getComfyUiTaskMetadata.mockReturnValue(taskMetadata);
    mocks.getApprovedQwenOutput.mockResolvedValue(null);
    mocks.getApprovedQwenTaskProgress.mockResolvedValue({ phase: "executing", queueRemaining: 0, estimatedSecondsRemaining: null });

    await expect(refreshApprovedQwenTask(17, 801)).resolves.toMatchObject({
      status: "pending",
      queueRemaining: 0,
      estimatedSecondsRemaining: null,
      stages: [expect.objectContaining({ key: "qwen_executing", state: "active" })],
    });
    expect(mocks.updateTryOnTaskStages).toHaveBeenCalledWith(
      801,
      expect.arrayContaining([expect.objectContaining({ key: "qwen_executing", label: "Qwen is executing the image edit" })]),
      taskMetadata,
    );
  });

  it("returns the full direct-ComfyUI connection failure and refunds exactly ten credits", async () => {
    const fullError = `ComfyUI request failed:\n${"direct diagnostic detail ".repeat(500)}END-OF-FULL-ERROR`;
    mocks.submitApprovedQwenEdit.mockRejectedValue(new Error(fullError));

    await expect(startApprovedQwenTask(17, 7, "prompt")).rejects.toMatchObject({
      message: expect.stringContaining("END-OF-FULL-ERROR"),
    });

    expect(mocks.addCredits).toHaveBeenCalledWith(17, 10);
    expect(mocks.updateTryOnHistory).toHaveBeenCalledWith(801, { status: "failed", creditsDeducted: 0 });
  });
});
