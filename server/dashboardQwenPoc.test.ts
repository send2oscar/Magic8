import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  addCredits: vi.fn(),
  deductCredits: vi.fn(),
  getUserCredits: vi.fn(),
  getUserPhotos: vi.fn(),
  saveTryOnHistory: vi.fn(),
  updateTryOnHistory: vi.fn(),
  updateTryOnTaskStages: vi.fn(),
  runComfyUIPOC: vi.fn(),
  isSafeRemotePrompt: vi.fn(),
  createComfyUiPocLiveStatus: vi.fn(),
  updateComfyUiPocLiveStatus: vi.fn(),
  storageGetSignedUrl: vi.fn(),
  storagePut: vi.fn(),
}));

vi.mock("./db", () => ({
  addCredits: mocks.addCredits,
  deductCredits: mocks.deductCredits,
  getUserCredits: mocks.getUserCredits,
  getUserPhotos: mocks.getUserPhotos,
  saveTryOnHistory: mocks.saveTryOnHistory,
  updateTryOnHistory: mocks.updateTryOnHistory,
  updateTryOnTaskStages: mocks.updateTryOnTaskStages,
}));

vi.mock("./comfyuiPoc", () => ({
  ComfyUiPocError: class ComfyUiPocError extends Error {},
  runComfyUIPOC: mocks.runComfyUIPOC,
}));

vi.mock("./comfyuiPocDefaultPrompt", () => ({ isSafeRemotePrompt: mocks.isSafeRemotePrompt }));
vi.mock("./comfyuiPocLiveStatus", () => ({
  createComfyUiPocLiveStatus: mocks.createComfyUiPocLiveStatus,
  updateComfyUiPocLiveStatus: mocks.updateComfyUiPocLiveStatus,
}));
vi.mock("./storage", () => ({
  storageGetSignedUrl: mocks.storageGetSignedUrl,
  storagePut: mocks.storagePut,
}));

import { processDashboardQwenPoc } from "./dashboardQwenPoc";

const task = {
  userId: 8,
  photoId: 34,
  taskId: "00000000-0000-4000-8000-000000000034",
  positivePrompt: "Change the shirt to yellow; keep the person and background unchanged.",
};

describe("Dashboard XXX Qwen POC", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isSafeRemotePrompt.mockReturnValue(true);
    mocks.getUserCredits.mockResolvedValue(3);
    mocks.getUserPhotos.mockResolvedValue([{ id: task.photoId, photoKey: "uploads/user-8/source.jpg" }]);
    mocks.saveTryOnHistory.mockResolvedValue({ insertId: 71 });
    mocks.updateTryOnHistory.mockResolvedValue(true);
    mocks.updateTryOnTaskStages.mockResolvedValue(true);
    mocks.storageGetSignedUrl.mockResolvedValue("https://storage.example/source.jpg");
    mocks.storagePut.mockResolvedValue({ key: "comfyui-results/8/71.png", url: "/manus-storage/comfyui-results/8/71.png" });
    mocks.deductCredits.mockResolvedValue(true);
    mocks.addCredits.mockResolvedValue(true);
    mocks.runComfyUIPOC.mockResolvedValue({
      outputBuffer: Buffer.from("edited-image"),
      outputMimeType: "image/png",
      diagnostics: [],
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(Buffer.from("source-image"), {
      status: 200,
      headers: { "content-length": "12" },
    })));
  });

  it("persists the completed result before charging one credit and returns the gallery URL", async () => {
    const result = await processDashboardQwenPoc(task);

    expect(result).toMatchObject({
      success: true,
      resultImageUrl: "/manus-storage/comfyui-results/8/71.png",
      galleryHistoryId: 71,
      creditsRemaining: 2,
    });
    expect(mocks.runComfyUIPOC).toHaveBeenCalledWith(
      Buffer.from("source-image"),
      "source.jpg",
      task.positivePrompt,
      expect.objectContaining({ clientId: task.taskId }),
    );
    expect(mocks.storagePut).toHaveBeenCalledWith(
      "comfyui-results/8/71.png",
      Buffer.from("edited-image"),
      "image/png",
    );
    expect(mocks.storagePut.mock.invocationCallOrder[0]).toBeLessThan(mocks.deductCredits.mock.invocationCallOrder[0]);
    expect(mocks.updateTryOnHistory).toHaveBeenCalledWith(71, expect.objectContaining({
      status: "success",
      resultImageUrl: "/manus-storage/comfyui-results/8/71.png",
      creditsDeducted: 1,
    }));
  });

  it("rejects an unsafe prompt before creating a task or contacting the ComfyUI runner", async () => {
    mocks.isSafeRemotePrompt.mockReturnValue(false);

    await expect(processDashboardQwenPoc(task)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.saveTryOnHistory).not.toHaveBeenCalled();
    expect(mocks.runComfyUIPOC).not.toHaveBeenCalled();
    expect(mocks.deductCredits).not.toHaveBeenCalled();
  });

  it("does not charge a credit when ComfyUI fails before a managed result is saved", async () => {
    mocks.runComfyUIPOC.mockRejectedValue(new Error("ComfyUI unavailable"));

    await expect(processDashboardQwenPoc(task)).resolves.toMatchObject({ success: false, message: "ComfyUI unavailable" });
    expect(mocks.storagePut).not.toHaveBeenCalled();
    expect(mocks.deductCredits).not.toHaveBeenCalled();
  });

  it("refunds the credit when the stored result cannot be finalized in the gallery", async () => {
    mocks.updateTryOnHistory.mockResolvedValueOnce(false).mockResolvedValue(true);

    await expect(processDashboardQwenPoc(task)).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    expect(mocks.deductCredits).toHaveBeenCalledWith(task.userId, 1);
    expect(mocks.addCredits).toHaveBeenCalledWith(task.userId, 1);
  });
});
