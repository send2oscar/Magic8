import { describe, expect, it } from "vitest";
import {
  createComfyUiPocLiveStatus,
  getComfyUiPocLiveStatus,
  updateComfyUiPocLiveStatus,
} from "./comfyuiPocLiveStatus";

const taskId = "11111111-1111-4111-8111-111111111111";

describe("ComfyUI POC live status", () => {
  it("shares only the requesting user's safe task progress", () => {
    createComfyUiPocLiveStatus(taskId, 101);
    updateComfyUiPocLiveStatus(taskId, 101, {
      phase: "executing",
      label: "Generating the edited image: 2 of 8 sampler steps complete.",
      progressValue: 2,
      progressMax: 8,
      percent: 25,
      estimatedSecondsRemaining: 18,
      queueRemaining: 0,
    });

    expect(getComfyUiPocLiveStatus(taskId, 999)).toBeNull();
    expect(getComfyUiPocLiveStatus(taskId, 101)).toMatchObject({
      phase: "executing",
      progressValue: 2,
      progressMax: 8,
      percent: 25,
      estimatedSecondsRemaining: 18,
      queueRemaining: 0,
    });
    expect(getComfyUiPocLiveStatus(taskId, 101)?.events.map((event) => event.label)).toEqual([
      "Connecting to ComfyUI for live task progress.",
      "Generating the edited image: 2 of 8 sampler steps complete.",
    ]);
  });
});
