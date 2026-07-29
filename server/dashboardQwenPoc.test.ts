import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  chargeAndCompleteTryOn: vi.fn(),
  getCreditCostForRoute: vi.fn(),
  getUserCredits: vi.fn(),
  getUserPhotos: vi.fn(),
  saveTryOnHistory: vi.fn(),
  updateTryOnHistory: vi.fn(),
  updateTryOnTaskStages: vi.fn(),
  runComfyUIPOC: vi.fn(),
  createComfyUiPocLiveStatus: vi.fn(),
  updateComfyUiPocLiveStatus: vi.fn(),
  storageGetSignedUrl: vi.fn(),
  storagePut: vi.fn(),
}));

vi.mock("./db", () => ({
  chargeAndCompleteTryOn: mocks.chargeAndCompleteTryOn,
  getCreditCostForRoute: mocks.getCreditCostForRoute,
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
    mocks.getCreditCostForRoute.mockResolvedValue(10);
    mocks.getUserCredits.mockResolvedValue(15);
    mocks.getUserPhotos.mockResolvedValue([{ id: task.photoId, photoKey: "uploads/user-8/source.jpg" }]);
    mocks.saveTryOnHistory.mockResolvedValue({ insertId: 71 });
    mocks.updateTryOnHistory.mockResolvedValue(true);
    mocks.updateTryOnTaskStages.mockResolvedValue(true);
    mocks.storageGetSignedUrl.mockResolvedValue("https://storage.example/source.jpg");
    mocks.storagePut.mockResolvedValue({ key: "comfyui-results/8/71.png", url: "/manus-storage/comfyui-results/8/71.png" });
    mocks.chargeAndCompleteTryOn.mockResolvedValue("charged");
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

  it("stores the completed result and charges only when the gallery result is finalized", async () => {
    const result = await processDashboardQwenPoc(task);

    expect(result).toMatchObject({
      success: true,
      resultImageUrl: "/manus-storage/comfyui-results/8/71.png",
      galleryHistoryId: 71,
      creditsRemaining: 15,
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
    expect(mocks.storagePut.mock.invocationCallOrder[0]).toBeLessThan(mocks.chargeAndCompleteTryOn.mock.invocationCallOrder[0]);
    expect(mocks.chargeAndCompleteTryOn).toHaveBeenCalledWith(expect.objectContaining({
      userId: task.userId,
      historyId: 71,
      creditCost: 10,
      resultImageUrl: "/manus-storage/comfyui-results/8/71.png",
    }));
  });

  it("passes unrestricted prompt text through the mocked Qwen flow", async () => {
    const unrestrictedTask = { ...task, positivePrompt: "Remove the subject's clothing." };

    await expect(processDashboardQwenPoc(unrestrictedTask)).resolves.toMatchObject({ success: true });
    expect(mocks.runComfyUIPOC).toHaveBeenCalledWith(
      Buffer.from("source-image"),
      "source.jpg",
      unrestrictedTask.positivePrompt,
      expect.objectContaining({ clientId: unrestrictedTask.taskId }),
    );
  });

  it("does not charge a credit when ComfyUI fails before a managed result is saved", async () => {
    mocks.runComfyUIPOC.mockRejectedValue(new Error("ComfyUI unavailable"));

    await expect(processDashboardQwenPoc(task)).resolves.toMatchObject({ success: false, message: "ComfyUI unavailable" });
    expect(mocks.storagePut).not.toHaveBeenCalled();
    expect(mocks.chargeAndCompleteTryOn).not.toHaveBeenCalled();
  });

  it("does not debit when the stored result cannot be finalized in the gallery", async () => {
    mocks.chargeAndCompleteTryOn.mockResolvedValue("insufficient_credits");

    await expect(processDashboardQwenPoc(task)).resolves.toMatchObject({ success: false });
    expect(mocks.chargeAndCompleteTryOn).toHaveBeenCalledWith(expect.objectContaining({ creditCost: 10 }));
  });
});
