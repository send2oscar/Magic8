# Direct ComfyUI Host Diagnostics

**Host:** `http://oscarngan.ddns.net:8188`  
**Captured:** 2026-07-23

The direct ComfyUI host responded successfully to `GET /system_stats` and `GET /queue`. The queue was empty at the time of inspection.

The host reported the required Qwen workflow components through `GET /object_info`, including `TextEncodeQwenImageEdit`, `TextEncodeQwenImageEditPlus`, `Image Saver Simple`, `Power Lora Loader (rgthree)`, `ClownsharKSampler_Beta`, and the `Qwen-Rapid-AIO-v11.4.safetensors` checkpoint.

Recent entries returned by `GET /history?max_items=30` showed two execution failures at node `104` (`WidgetToString`) with the message:

> `'NoneType' object is not subscriptable`

The `Image Saver Simple` object schema declares its `metadata` input as optional with a default of `null`. The approved server-owned workflow therefore removes the optional `WidgetToString` and `Image Saver Metadata` chain, plus the dependent metadata binding, while retaining the fixed Qwen edit path and output image saving.

## Post-repair verification

After the workflow repair, a live direct-ComfyUI task ran with no `104` or `106` workflow nodes. The host recorded the task as `success` and returned one saved image from output node `102`, confirming that the previous `WidgetToString` execution error no longer blocks the fixed Qwen workflow.
