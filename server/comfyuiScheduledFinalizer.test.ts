import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  getPendingDirectComfyUiTasks: vi.fn(),
  refreshApprovedQwenTask: vi.fn(),
}));

vi.mock("./_core/sdk", () => ({ sdk: { authenticateRequest: mocks.authenticateRequest } }));
vi.mock("./db", () => ({ getPendingDirectComfyUiTasks: mocks.getPendingDirectComfyUiTasks }));
vi.mock("./comfyuiTask", () => ({ refreshApprovedQwenTask: mocks.refreshApprovedQwenTask }));

import { finalizePendingComfyUiTasks } from "./comfyuiScheduledFinalizer";

function createResponse() {
  const response = {
    status: vi.fn(),
    json: vi.fn(),
  };
  response.status.mockReturnValue(response);
  response.json.mockReturnValue(response);
  return response;
}

describe("direct ComfyUI scheduled finalizer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects a regular authenticated caller", async () => {
    mocks.authenticateRequest.mockResolvedValue({ id: 17, isCron: false });
    const response = createResponse();

    await finalizePendingComfyUiTasks({} as never, response as never);

    expect(response.status).toHaveBeenCalledWith(403);
    expect(response.json).toHaveBeenCalledWith({ error: "cron-only" });
    expect(mocks.getPendingDirectComfyUiTasks).not.toHaveBeenCalled();
  });

  it("refreshes a bounded direct-ComfyUI task batch for a verified scheduled caller", async () => {
    mocks.authenticateRequest.mockResolvedValue({ id: -1, isCron: true, taskUid: "heartbeat-task" });
    mocks.getPendingDirectComfyUiTasks.mockResolvedValue([{ id: 801, userId: 17 }, { id: 802, userId: 18 }]);
    mocks.refreshApprovedQwenTask
      .mockResolvedValueOnce({ status: "success" })
      .mockResolvedValueOnce({ status: "pending" });
    const response = createResponse();

    await finalizePendingComfyUiTasks({} as never, response as never);

    expect(mocks.getPendingDirectComfyUiTasks).toHaveBeenCalledWith(5);
    expect(mocks.refreshApprovedQwenTask).toHaveBeenCalledWith(17, 801);
    expect(mocks.refreshApprovedQwenTask).toHaveBeenCalledWith(18, 802);
    expect(response.json).toHaveBeenCalledWith({ ok: true, checked: 2, finalized: 1, errors: 0 });
  });
});
