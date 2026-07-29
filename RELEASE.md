# Release Procedure

This project releases through protected GitHub `main` and a named Manus checkpoint. The policy prevents a local branch, GitHub `main`, and the published app from drifting apart.

## Required Release Sequence

| Stage | Required action | Verification |
|---|---|---|
| Synchronize | Run `git fetch github`, switch to `main`, and run `git pull --ff-only github main`. | Local `HEAD` and `github/main` must resolve to the same SHA. |
| Isolate | Create a descriptive feature or fix branch from current `main`. | Do not commit directly to `main`. |
| Validate | Run `pnpm check`, `pnpm test`, and `pnpm build`. | All commands must pass before a pull request. |
| Review | Push the branch and open a pull request to `main`. | The GitHub **Test** check must pass. |
| Merge | Use a rebase merge to preserve the required linear history. | Confirm the merged pull request and the new `github/main` SHA. |
| Checkpoint | Save a Manus checkpoint named with the merged change and its validation. | Record the checkpoint ID below. |
| Publish | Publish only that latest checkpoint from the project UI. | Confirm the live version after publishing. |

## Safety Rules

Never use `git reset --hard` or `git push --force` on `main`. If a production release must be undone, restore a named Manus checkpoint or open a revert pull request; do not rewrite branch history.

## Release Record

| Date (UTC) | GitHub `main` | Pull request | Manus checkpoint | Notes |
|---|---:|---:|---:|---|
| 2026-07-29 | `73b0473` | [#1](https://github.com/send2oscar/Magic8/pull/1) | `669f808d` | Submitted Qwen workflow synchronization, mapped three-LoRA editor, and prior Gallery recovery reconciliation. |
