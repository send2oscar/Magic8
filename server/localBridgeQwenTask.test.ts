import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  addCredits: vi.fn(),
  getCreditCostForRoute: vi.fn(),
  getUserCredits: vi.fn(),
  getUserPhotos: vi.fn(),
  getUserTryOnTask: vi.fn(),
  saveTryOnHistory: vi.fn(),
  updateTryOnHistory: vi.fn(),
  updateTryOnTaskStages: vi.fn(),
  createQueuedBridgeTask: vi.fn(),
  getActiveBridgeDevice: vi.fn(),
  getBridgeTaskByHistoryId: vi.fn(),
  requeueExpiredBridgeTask: vi.fn(),
}));

vi.mock("./db", () => ({
  addCredits: mocks.addCredits,
  getCreditCostForRoute: mocks.getCreditCostForRoute,
  getUserCredits: mocks.getUserCredits,
  getUserPhotos: mocks.getUserPhotos,
  getUserTryOnTask: mocks.getUserTryOnTask,
  saveTryOnHistory: mocks.saveTryOnHistory,
  updateTryOnHistory: mocks.updateTryOnHistory,
  updateTryOnTaskStages: mocks.updateTryOnTaskStages,
}));

vi.mock("./bridgeDb", () => ({
  createQueuedBridgeTask: mocks.createQueuedBridgeTask,
  getActiveBridgeDevice: mocks.getActiveBridgeDevice,
  getBridgeTaskByHistoryId: mocks.getBridgeTaskByHistoryId,
  requeueExpiredBridgeTask: mocks.requeueExpiredBridgeTask,
}));

import { refreshLocalBridgeQwenTask, startLocalBridgeQwenTask } from "./localBridgeQwenTask";

describe("durable local Bridge XXX task accounting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getActiveBridgeDevice.mockResolvedValue({ id: 41, online: true });
    mocks.getUserCredits.mockResolvedValue(15);
    mocks.getUserPhotos.mockResolvedValue([{ id: 7, photoKey: "photos/17/input.jpg" }]);
    mocks.saveTryOnHistory.mockResolvedValue({ insertId: 801 });
    mocks.getCreditCostForRoute.mockResolvedValue(10);
    mocks.createQueuedBridgeTask.mockResolvedValue(901);
    mocks.addCredits.mockResolvedValue(true);
    mocks.updateTryOnHistory.mockResolvedValue(true);
    mocks.updateTryOnTaskStages.mockResolvedValue(true);
  });

  it("does not charge while queuing and sends the exact Dashboard prompt to the durable Bridge job", async () => {
    const prompt = "Keep this prompt exactly as typed — no extra safety preface, filtering, or substitution.";

    await expect(startLocalBridgeQwenTask(17, 7, prompt)).resolves.toMatchObject({
      taskId: 801,
      status: "pending",
      creditsRemaining: 15,
      shirtApplied: "XXX",
    });

    expect(mocks.addCredits).not.toHaveBeenCalled();
    expect(mocks.createQueuedBridgeTask).toHaveBeenCalledWith({
      historyId: 801,
      userId: 17,
      photoId: 7,
      deviceId: 41,
      workflowId: "qwen-image-edit-rapid",
      positivePrompt: prompt,
    });
  });

  it("does not create or charge an XXX task if the paired workstation is offline", async () => {
    mocks.getActiveBridgeDevice.mockResolvedValue({ id: 41, online: false });

    await expect(startLocalBridgeQwenTask(17, 7, "prompt")).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(mocks.addCredits).not.toHaveBeenCalled();
    expect(mocks.saveTryOnHistory).not.toHaveBeenCalled();
  });

  it("returns the full Bridge failure message without charging credits", async () => {
    const fullError = `ComfyUI traceback:\n${"diagnostic detail ".repeat(500)}END-OF-FULL-ERROR`;
    mocks.getUserTryOnTask.mockResolvedValue({
      shirtStyle: "qwen-image-edit-rapid",
      status: "pending",
      bubbleApiResponse: JSON.stringify({ taskStages: [{ key: "qwen_processing", label: "Qwen image edit is in progress", state: "active", timestamp: 1 }] }),
    });
    mocks.getBridgeTaskByHistoryId.mockResolvedValue({ id: 901, status: "failed", lastError: fullError });

    await expect(refreshLocalBridgeQwenTask(17, 801)).resolves.toEqual({ status: "failed", message: fullError });
    expect(mocks.addCredits).not.toHaveBeenCalled();
    expect(mocks.updateTryOnHistory).toHaveBeenCalledWith(801, { status: "failed", creditsDeducted: 0 });
  });
});
