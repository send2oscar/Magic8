# Direct ComfyUI XXX Background Finalizer

## Runtime model

The XXX workflow remains **direct server-to-ComfyUI** at `http://oscarngan.ddns.net:8188`. It does not use the local Bridge. A submitted task stores its ComfyUI prompt ID and continues to be tracked even if the Dashboard is refreshed or closed.

There is intentionally **no age-based job timeout**. A pending task is not refunded merely because it has been queued or executing for a long time. Credits are refunded only when ComfyUI reports a terminal workflow failure or when task submission itself fails.

## Scheduled finalization

The application provides a protected callback at:

```text
POST /api/scheduled/finalize-comfyui
```

It accepts only verified scheduled callers, checks up to five pending direct-ComfyUI tasks per invocation, and finalizes a task into Gallery when the remote output is ready. The operation is idempotent, so Dashboard polling and scheduled finalization cannot refund the same failed task twice.

After the current checkpoint is published, create the project-level Heartbeat job:

```bash
manus-heartbeat create \
  --name direct-comfyui-finalizer \
  --cron "0 */1 * * * *" \
  --path /api/scheduled/finalize-comfyui \
  --description "Finalize pending direct ComfyUI XXX tasks"
```

The six-field UTC cron expression runs once per minute. The schedule must be created only after deployment because scheduled callbacks target the deployed application, not the development sandbox.

## Dashboard behavior

Once a user starts Try On Now, the selected photo is locked. The **Use Another Photo** button refreshes the workspace so the user can submit a new task without cancelling the existing direct-ComfyUI XXX job. The existing job continues independently and is saved to Gallery when its remote output becomes available.
