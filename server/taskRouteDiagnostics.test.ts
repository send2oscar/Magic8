import { describe, expect, it } from "vitest";
import { getStoredTaskRouteDiagnostic } from "./taskRouteDiagnostics";

describe("persisted task route diagnostics", () => {
  it("returns the newest selected processing route and preserves its full detail", () => {
    const serialized = JSON.stringify({
      version: 1,
      taskStages: [
        { key: "route_selected", detail: "route=standard-image-generation; shirtStyle=classic-white" },
        { key: "route_selected", detail: "route=local-comfyui-qwen; shirtStyle=qwen-image-edit-rapid" },
      ],
    });

    expect(getStoredTaskRouteDiagnostic(serialized)).toEqual({
      processingRoute: "local-comfyui-qwen",
      detail: "route=local-comfyui-qwen; shirtStyle=qwen-image-edit-rapid",
    });
  });

  it.each([null, "", "not-json", JSON.stringify({ taskStages: [] }), JSON.stringify({ taskStages: [{ key: "route_selected", detail: "shirtStyle=classic-white" }] })])(
    "returns null when no authoritative route is stored",
    serialized => expect(getStoredTaskRouteDiagnostic(serialized)).toBeNull(),
  );
});
