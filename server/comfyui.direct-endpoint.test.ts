import axios from "axios";
import { describe, expect, it } from "vitest";

describe("configured direct ComfyUI endpoint", () => {
  it("responds to the lightweight system_stats health request", async () => {
    const configuredUrl = process.env.COMFYUI_SERVER_URL;
    expect(configuredUrl).toBeTruthy();
    const baseUrl = new URL(configuredUrl!);
    const response = await axios.get(new URL("/system_stats", baseUrl).toString(), {
      timeout: 20_000,
      responseType: "json",
    });

    expect(response.status).toBe(200);
    expect((response.data as { system?: unknown }).system).toBeTruthy();
  }, 25_000);
});
