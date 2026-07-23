# Direct ComfyUI Architecture for XXX

## Purpose

`XXX` uses the fixed Qwen image-edit workflow through **direct server-side ComfyUI access**. The application server connects to the configured endpoint at `http://oscarngan.ddns.net:8188`; it does not use a local Bridge, workstation pairing code, or a browser-to-ComfyUI connection.

## Roles and Trust Boundaries

| Component | Responsibility | Visible Data |
|---|---|---|
| Dashboard | Lets an authenticated user select an owned photo, enter an edit prompt, start XXX, and view task status | Its own task status and Gallery records |
| Application server | Verifies ownership, reserves/refunds credits, communicates with ComfyUI, and stores completed output | Controlled task metadata and managed-storage references |
| Direct ComfyUI server | Receives the fixed Qwen workflow, processes the source image, and exposes the approved output | Source image and generated output for the active task |
| Private Gallery | Displays finalized managed-storage results to the owning user | Own source and generated images |

## Task Flow

```text
User clicks XXX
    -> Server verifies photo ownership and at least 10 available credits
    -> Server reserves 10 credits and creates a pending Gallery history record
    -> Server confirms http://oscarngan.ddns.net:8188 is reachable
    -> Server uploads the owned source image and submits the fixed Qwen workflow
    -> Dashboard polls its owned task status while the server polls ComfyUI history
    -> Server retrieves the approved result, stores it in managed storage, and finalizes Gallery history
    -> Dashboard refreshes credits and notifies the user to view the result in Gallery
```

If ComfyUI cannot be reached, the workflow reports the complete available error message and refunds the reserved 10 credits. If a queued task does not complete within ten minutes, it is marked failed and the same 10-credit refund applies.

## Prompt and Workflow Rules

The application always uses the reviewed `qwen-image-edit-rapid` workflow. The Dashboard prompt is forwarded exactly as entered to the fixed workflow’s prompt field. Browser clients cannot submit arbitrary workflow JSON, change node IDs, select a different model, or access the ComfyUI endpoint directly.

## Endpoint Configuration

The server uses the `COMFYUI_SERVER_URL` environment variable. It is currently configured as:

```text
http://oscarngan.ddns.net:8188
```

`COMFYUI_API_TOKEN` is optional. If it is set, the server sends it as a bearer token. If it is empty, the server connects without an Authorization header, which matches the currently configured endpoint.

## Operational Notes

The direct endpoint is reachable with a lightweight `GET /system_stats` check. The server uses a 20-second timeout for individual ComfyUI HTTP operations and treats unreachable or invalid responses as task failures with a refund. The Dashboard keeps the task in the background while polling status, so the user can continue selecting photos and shirt styles.

Because this configuration is a direct HTTP endpoint, network access should be restricted to the application environment and trusted operators wherever feasible. Do not expose ComfyUI to untrusted clients, and do not place ComfyUI credentials in browser code.
