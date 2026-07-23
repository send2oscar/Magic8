# Connecting the `XXX` Qwen Edit Button to a ComfyUI Desktop Workstation

The website now treats `XXX` as a **single, fixed Qwen image-editing experience**. It never accepts a workflow JSON, prompt, LoRA, model name, or node identifier from the browser. Instead, the server uploads the selected website photo to ComfyUI, submits a reviewed copy of the workflow, checks the prompt status, downloads the output, and stores the result in the website gallery.

> **Important:** This integration is server-to-server. Browser CORS configuration is not required for this design. The important requirements are a public **HTTPS** endpoint and a reverse proxy that authenticates the website before forwarding requests to the local ComfyUI process.

| Website responsibility | Desktop workstation responsibility |
|---|---|
| Uploads the selected user photo to ComfyUI as a temporary input file. | Runs ComfyUI privately on `127.0.0.1:8188`. |
| Submits a server-owned Qwen workflow with input node `78`, prompt node `119`, and output node `102`. | Has the approved Qwen checkpoint and all workflow custom nodes installed. |
| Retrieves the output through the ComfyUI API and persists it to project storage. | Publishes only an authenticated HTTPS reverse-proxy endpoint. |

## 1. Run ComfyUI only on the local computer

Start ComfyUI so that it listens on the loopback interface rather than being directly exposed to the internet:

```powershell
python main.py --listen 127.0.0.1 --port 8188
```

If ComfyUI Desktop starts through a shortcut or launcher, add the equivalent arguments in its launch settings. Confirm that `http://127.0.0.1:8188` opens on the workstation itself, and that the router does **not** forward port `8188` to the internet.

## 2. Confirm the required workflow components

The website sends a reviewed server-owned workflow, not the downloaded JSON verbatim. Your ComfyUI installation must nevertheless have the same model and node capabilities available. Verify that the approved non-adult checkpoint named below is installed and selectable:

```text
Qwen-Rapid-AIO-v11.4.safetensors
```

The generated workflow depends on the following node types. Install or keep the related custom-node packs enabled before testing:

| Node type | Role in the website workflow |
|---|---|
| `LoadImage` | Receives the website-uploaded input at node `78`. |
| `TextEncodeQwenImageEditPlus` | Receives the server-controlled apparel-edit prompt at node `119`. |
| `ImageScaleToTotalPixels`, `VAEEncode`, `VAEDecode` | Prepares and reconstructs the image. |
| `Power Lora Loader (rgthree)` | Remains present but the website does not enable any LoRA. |
| `ClownsharKSampler_Beta` | Runs the Qwen sampling pass. |
| `Image Saver Simple` | Emits the final image at node `102`. |

The server enforces this prompt on every request:

> Preserve the person's face, pose, body proportions, hands, and background. Replace only the current shirt or top with a stylish, fully opaque garment. Keep the person fully clothed and the result non-sexual. Use realistic fabric, lighting, shadows, and a natural fit.

## 3. Place an authenticated HTTPS reverse proxy in front of ComfyUI

Your current DDNS address is `oscarngan.ddns.net`. Do **not** publish raw HTTP on port `8188` for production use. Instead, use a reverse proxy such as Caddy on the workstation. Caddy can obtain and renew a TLS certificate automatically when the DDNS hostname resolves to your public IP and ports `80` and `443` reach the workstation.[1]

Create a strong random token and store it as the workstation environment variable `COMFYUI_API_TOKEN`. Then use a Caddyfile like the following (replace the email address):

```caddyfile
{
  email you@example.com
}

oscarngan.ddns.net {
  @website header Authorization "Bearer {$COMFYUI_API_TOKEN}"

  handle @website {
    reverse_proxy 127.0.0.1:8188
  }

  respond "Unauthorized" 401
}
```

This configuration checks the exact bearer token before it forwards any request to local ComfyUI. It permits the ComfyUI UI websocket upgrade through the proxy as well. The Caddy `header` matcher and `reverse_proxy` directive are documented by Caddy.[2] If you use Nginx, Cloudflare Access, or another proxy instead, configure it to enforce the same bearer-token check and forward only to `127.0.0.1:8188`.

> Do not expose ComfyUI's raw `/prompt`, `/upload/image`, `/history`, or `/view` endpoints directly to the public internet. Those endpoints can submit workflows and access generated files.[3]

## 4. Verify the protected endpoint from the workstation

After Caddy is running, test the protected endpoint from a terminal. The request must return a ComfyUI response rather than `401 Unauthorized`:

```powershell
curl.exe -i -H "Authorization: Bearer YOUR_LONG_RANDOM_TOKEN" https://oscarngan.ddns.net/system_stats
```

Then test without the header. It must return `401`:

```powershell
curl.exe -i https://oscarngan.ddns.net/system_stats
```

If either check does not behave as described, do not configure the website secrets yet. Fix the DDNS, TLS certificate, firewall, or reverse-proxy token rule first.

## 5. Set the two website secrets

Once the workstation endpoint is protected, configure the project secrets exactly as follows:

| Secret | Required value |
|---|---|
| `COMFYUI_SERVER_URL` | `https://oscarngan.ddns.net` |
| `COMFYUI_API_TOKEN` | The same long random value used by the reverse proxy. |

Do not add `/`, `/prompt`, or port `8188` to `COMFYUI_SERVER_URL`. The website appends its own ComfyUI API paths. The integration rejects non-HTTPS server URLs and refuses to make an unauthenticated request.

## 6. Perform the first website test

Sign in to the website, upload a normal fully clothed photo, select `XXX`, and click **TRY ON NOW**. The expected sequence is:

1. The app creates a Qwen task and deducts one credit.
2. The website uploads the selected image to your protected ComfyUI endpoint.
3. ComfyUI processes the fixed workflow; the website polls the saved prompt identifier.
4. The output from node `102` is downloaded and copied into website storage.
5. The result dialog and gallery display the resulting image.

If a request fails before ComfyUI accepts the prompt, the site returns the credit. If the website momentarily cannot reach the workstation after the prompt is already queued, it keeps the task pending and retries on the next status check for up to ten minutes.

## Troubleshooting checklist

| Symptom | Likely cause | Action |
|---|---|---|
| Website reports that HTTPS is required | `COMFYUI_SERVER_URL` still contains `http://` or `:8188`. | Use the HTTPS reverse-proxy URL. |
| Website reports configuration or authorization failure | The app token and proxy token differ, or the proxy did not receive the `Authorization` header. | Re-copy the same token into both settings and retest `curl.exe`. |
| ComfyUI returns a workflow validation error | A required Qwen model or custom node is missing or differs from the fixed workflow. | Open the workflow locally and install/enable the missing node or approved checkpoint. |
| Task remains pending | The workstation is processing, asleep, offline, or its proxy is unreachable. | Keep ComfyUI and the proxy running; examine the local ComfyUI console. |
| Output cannot be found | Node `102` did not save an image or the custom `Image Saver Simple` node differs. | Verify node `102` produces an image in the local ComfyUI History panel. |

## References

[1]: https://caddyserver.com/docs/automatic-https "Caddy Automatic HTTPS"
[2]: https://caddyserver.com/docs/caddyfile/matchers#header "Caddy Header Matcher" 
[3]: https://github.com/Comfy-Org/ComfyUI/blob/master/server.py "ComfyUI server API routes"
