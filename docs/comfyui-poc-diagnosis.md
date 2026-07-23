# ComfyUI POC 400 Diagnosis

## Confirmed remote instance behaviour

The POC targets `http://oscarngan.ddns.net:8188`. A `GET /system_stats` response on 2026-07-23 confirmed that the remote instance is reachable and runs ComfyUI `0.25.1` on Windows with a CUDA device.

Submitting the user-supplied `QwenImageEditRapidv1.0(External).json` unchanged to `POST /prompt` succeeded with HTTP 200 and a prompt ID. The workflow itself is therefore accepted by the remote ComfyUI instance.

## Confirmed cause of HTTP 400

The POC previously wrote the browser upload to the web application's local filesystem and injected that web-server path into LoadImage node `78`. That path does not exist in the remote Windows ComfyUI input directory.

Reproducing a nonexistent filename returned HTTP 400 with this validation detail:

> `image - Invalid image file: __poc_missing_input__.jpg`

## Required correction

The server must first send the source image to the remote ComfyUI `POST /upload/image` endpoint, then use the returned ComfyUI-managed filename in node `78` before submitting the fixed Qwen workflow to `POST /prompt`.

The POC should surface safe milestone logs for upload, prompt validation, queueing, polling, output discovery, and download. It must not expose the full remote response or filesystem paths to end users.

## Verified correction

The POC now uploads the source bytes as a fixed-length `multipart/form-data` request to `POST /upload/image`. It inserts only the filename returned by ComfyUI into Qwen `LoadImage` node `78`, submits the fixed workflow to `POST /prompt`, polls `GET /history/{prompt_id}`, and downloads the resulting named image through `GET /view`.

The imported template's `Image Saver Simple` metadata branch also expected GUI-only `extra_pnginfo.workflow` data. For API requests, the POC replaces that output branch with ComfyUI's standard `SaveImage` node. This avoids the unrelated `WidgetToString` execution failure while preserving the Qwen model, image input, prompt nodes, sampler, and decoded output path.

On 2026-07-23, a normal 256×256 PNG completed successfully against the configured remote instance. The test verified upload, validation, queueing, polling, a returned output node, and a downloaded PNG result (1,032,035 bytes).

## POC boundaries

This is an intentionally temporary direct-HTTP POC. It does **not** establish the production security model: the configured ComfyUI endpoint remains a publicly reachable HTTP service without a verified access-control boundary. Before launch, use HTTPS and an authenticated/restricted path, or replace direct access with the planned workstation-initiated bridge.

## Endpoint boundary check — 2026-07-23

The direct POC endpoint is reachable over plain HTTP. Unauthenticated requests to the root path, `/system_stats`, and `/object_info/LoadImage` each returned HTTP 200 from the public Internet. HTTPS on the same host and port did not negotiate TLS (`wrong version number`), which confirms that the current port serves HTTP rather than HTTPS.

> This configuration is suitable only for the temporary POC. It must not be used for a launch or for users’ private images without placing ComfyUI behind an authenticated HTTPS boundary or moving to the planned workstation-initiated bridge.
