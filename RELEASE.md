# Protected Release Procedure

This project releases from protected GitHub `main` through a named Manus checkpoint. The process ensures that the local branch, GitHub release source, and published application can be traced to the same change.

## Required Release Sequence

| Stage | Required action | Verification |
|---|---|---|
| Synchronize | Run `git fetch github --prune`, switch to `main`, and run `git pull --ff-only github main`. | Local `HEAD` and `github/main` resolve to the same SHA. |
| Isolate | Create a descriptive branch from current `main`. | Do not commit directly to `main`. |
| Validate | Run `pnpm check`, `pnpm test:ci`, and `pnpm build`. | All deterministic gates pass. |
| Review | Push the branch and open a pull request to `main`. | The required GitHub **Test** check passes. |
| Merge | Use a rebase merge to preserve linear history. | Confirm the merged pull request and new `github/main` SHA. |
| Checkpoint | Save a Manus checkpoint whose description includes the substantive change and verification results. | Record the checkpoint ID below. |
| Publish | Publish only that latest checkpoint from the project UI. | Confirm the live version after publishing. |

## Safety Rules

Never use `git reset --hard` or `git push --force` on `main`. If production must be restored, use a named Manus checkpoint or open a revert pull request rather than rewriting history. The live ComfyUI endpoint probe is intentionally excluded from `pnpm test:ci` because it depends on a reachable workstation; run it separately when workstation availability is being verified.

## Release Record

| Date (UTC) | GitHub `main` | Pull request | Manus checkpoint | Notes |
|---|---:|---:|---:|---|
| 2026-07-29 | `73b0473` | [#1](https://github.com/send2oscar/Magic8/pull/1) | `669f808d` | Submitted Qwen workflow synchronization, three-LoRA editor mapping, and Gallery recovery reconciliation. |
| 2026-07-29 | `aac4fc3` | [#2](https://github.com/send2oscar/Magic8/pull/2) | Pending | Required Test workflow, protected-main safeguards, and all-task Admin Workspace error logs. |
