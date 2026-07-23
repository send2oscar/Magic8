# Shirt Changer App - Project TODO

## Database & Schema
- [x] Create users table with credits field (5 credits default)
- [x] Create user_photos table to store uploaded photos
- [x] Create try_on_history table to track try-on attempts and credit deductions
- [x] Run database migrations

## Backend - Authentication & User Management
- [x] Extend user registration to grant 5 credits to new users
- [x] Create procedure to get user credits balance
- [x] Create procedure to update user credits

## Backend - Photo & File Management
- [x] Create procedure to upload and store user photos
- [x] Create procedure to retrieve user's uploaded photos
- [x] Integrate S3 storage for photo uploads

## Backend - Try-On Feature
- [x] Integrate Manus AI image generation for realistic shirt changes
- [x] Implement credit deduction logic (1 credit per try-on)
- [x] Add validation to prevent try-on if credits <= 0
- [x] Create procedure to store try-on results in database
- [x] Create procedure to retrieve try-on history
- [x] Return shirt applied information in try-on response
- [x] Use GPT Image 2 model with high quality for realistic results

## Frontend - Design & Styling
- [x] Implement cyberpunk color scheme (black bg, neon pink/cyan text)
- [x] Create neon glow effects and HUD-style UI components
- [x] Design geometric sans-serif typography with outer glow
- [x] Create minimalist HUD-style frames and corner brackets

## Frontend - Pages & Components
- [x] Create Login page (using Manus OAuth)
- [x] Create Registration page (using Manus OAuth)
- [x] Create Dashboard/Home page with credit display
- [x] Create Photo Upload component
- [x] Create Shirt Selection component with style options
- [x] Create Try-On button and result display
- [x] Create User Profile/Settings page with logout
- [x] Add navigation header with credit balance display
- [x] Create Try-On Result modal with shirt info and credits display

## Frontend - User Flows
- [x] Implement login/registration flow (Manus OAuth)
- [x] Implement photo upload with validation
- [x] Implement shirt selection UI
- [x] Implement try-on workflow with loading states
- [x] Implement credit balance display and updates
- [x] Implement logout functionality
- [x] Add protection for unauthenticated users

## Testing & Verification
- [x] Test user registration with 5 credit grant
- [x] Test photo upload functionality (auth protection)
- [x] Test try-on processing with AI image generation
- [x] Test credit deduction on try-on (server-side validation)
- [x] Test zero-credit prevention
- [x] Test unauthenticated user blocking
- [x] Test logout functionality
- [x] Verify all cyberpunk styling
- [x] Create comprehensive try-on flow tests (19 tests passing)

## Known Issues & Refinements
- [x] File upload with S3 integration (basic implementation complete)
- [x] Make try-on credit deduction transactional with rollback on failure
- [x] Persist try-on result image URL and API response to database
- [x] Add dedicated Login and Register pages/routes (using Manus OAuth)
- [x] Replace monospace font with geometric sans-serif (Orbitron)
- [x] Implement HUD corner bracket styling in CSS
- [x] Add automated tests for 5-credit new-user assignment
- [x] Add automated tests for unauthenticated upload blocking
- [x] Implement AI-powered shirt try-on using Manus image generation
- [x] Add Try-On Result modal with visual feedback
- [x] Display shirt applied information in results
- [x] Integrate GPT Image 2 model for high-quality image editing

## Completed Features Summary
- ✅ Full cyberpunk-themed virtual shirt try-on application
- ✅ User authentication with Manus OAuth
- ✅ 5-credit system for new users (1 credit per try-on)
- ✅ Photo upload with S3 storage
- ✅ 5 shirt style options (Classic White, Neon Pink, Electric Cyan, Dark Black, Holographic)
- ✅ **AI-powered shirt try-on with realistic image generation**
- ✅ Results modal with shirt info and credit tracking
- ✅ Comprehensive test suite (19 tests, all passing)
- ✅ Professional cyberpunk UI with neon effects
- ✅ Responsive dashboard layout
- ✅ Manus GPT Image 2 integration for high-quality results

## How It Works Now
1. User logs in with Manus OAuth and receives 5 credits
2. User uploads a photo of themselves
3. User selects a shirt style (Classic White, Neon Pink, Electric Cyan, Dark Black, or Holographic)
4. User clicks "TRY ON NOW" - the AI generates a realistic image with the new shirt
5. The result is displayed in a modal showing:
   - The AI-generated image with the new shirt
   - Which shirt style was applied
   - Credits remaining
   - Credits used (1)
6. User can try on more shirts until credits run out
7. Each try-on costs 1 credit

## Deployment
- [x] Create final checkpoint with AI image generation
- [x] Verify all features working in production
- [x] Fix photo upload authentication with JWT token in Authorization header
- [x] Fix production try-on image generation when uploaded photo URLs are relative `/manus-storage` paths
- [ ] Verify the complete production Try On Now flow returns an AI-generated result
- [x] Replace localhost URL construction with a storage-backed public HTTPS image URL for GPT Image editing
- [x] Add regression coverage for relative uploaded-photo URLs passed to the try-on procedure
- [x] Show a percentage-based progress indicator on the Try On Now button while image generation is running
- [x] Add rendered Dashboard coverage for success, timeout, and non-timeout provider-failure resets
- [ ] Investigate and correct the unexpected two-credit change observed during end-to-end try-on verification
- [ ] Verify the deployed authenticated dashboard shows the generated result and deducts exactly one credit
- [x] Store the selected uploaded photo’s database ID in Dashboard instead of falling back to an unrelated ID
- [x] Prevent the demo photo from being submitted to the protected try-on endpoint as a user-owned upload
- [x] Add regression coverage for the selected-photo-not-found scenario
- [x] Verify Try On Now exits finalizing state in the rendered dashboard for both timeout and provider failures
- [x] Verify timeout and provider-failure messages are clear and both paths return the button to a retryable state

## Unpublished Reliability, Privacy & Administration Enhancements
- [x] Remove the application-level image-generation abort timer so a provider request can complete naturally
- [x] Buffer signed source photos on the server and pass image bytes, rather than signed URLs, to the AI provider
- [x] Replace raw provider and signed-URL error details with safe user-facing recovery messages and credit refunds
- [x] Render a browser-local selected-photo preview immediately and show an accessible preview fallback if it fails
- [x] Add a private authenticated gallery for each user's own uploaded and generated try-on images
- [x] Add dedicated `/admin/login` credentials and a secure HTTP-only administrator session
- [x] Add protected `/admin` user-directory, profile-detail, and per-user gallery review queries and UI
- [x] Add automated no-timeout, source-buffering, privacy, gallery, and admin-session coverage
- [x] Run the local type checker and complete automated suite after restoring the enhancements
- [ ] Manually verify a real user upload preview, a completed gallery entry, and a credentialed admin login in the running preview
- [x] Diagnose the post-admin-restoration loss of the Dashboard live task log and the Try On progress stall at 92 percent
- [x] Restore persisted server task stages and active-task polling for the Dashboard live task log
- [x] Ensure successful and failed Try On requests always resolve terminal progress, return the button to a retryable state, and do not remain at 92 percent
- [x] Add regression coverage for the live task-log lifecycle and terminal 92-percent completion path
- [x] Verify the repaired Try On workflow locally before creating a new checkpoint
- [ ] Manually run an authenticated Try On after the live-log repair and confirm the log remains visible, progress exits 92 percent on terminal success or failure, and the button becomes retryable
- [x] Fix the `Failed to create try-on record` regression caused by incompatible database insert identifier handling
- [x] Add regression coverage for both supported history insert-result shapes while preserving live task-stage persistence
- [ ] Verify an authenticated Try On can create its history record and begin the live task log before the next checkpoint
- [x] Diagnose the AI generation or secure source-image stage failure that occurs after Try On history creation
- [x] Repair the failing generation path without exposing provider details or losing the automatic credit-refund safeguard
- [x] Add regression coverage for the diagnosed generation-stage failure and a successful retry path
- [ ] Verify an authenticated Try On produces an image and a completed gallery entry before the next checkpoint
- [ ] Confirm the live provider response category after the high-to-medium retry and verify the retry targets the actual upstream failure
- [ ] Run an authenticated Try On that successfully creates a generated image and completed gallery entry after the generation-path repair
- [ ] If the live provider failure persists, adjust the ImageService request contract using the confirmed safe provider status and add exact regression coverage
- [ ] Capture the safe upstream status and response classification for the persisted post-retry image-service failure
- [ ] Correct the edit-image request field names or supported model contract based on the confirmed provider response
- [ ] Verify a real Try On completes successfully after the provider-contract repair without exposing upstream payloads
- [x] Replace unsupported inline source-image bytes with a five-minute HMAC-signed application relay URL for the image-edit provider
- [x] Stream the relay image from private storage without exposing its upstream signed URL or raw provider errors
- [x] Add signed-relay and Try On contract regression coverage; verify TypeScript and all 37 automated tests pass
- [ ] Run one authenticated production Try On to confirm the provider can fetch the signed application relay and save a completed gallery result
- [ ] Diagnose and fix the newly reported production Try On failure after an uploaded photo is submitted through the signed source-image relay
- [x] Verify the production signed source-image relay returns the uploaded image successfully (HTTP 200 image/jpeg)
- [x] Capture the safe provider failure classification for the reported retry: HTTP 400 `failed_precondition` due to image-generation usage exhaustion

## Versioning & UI Enhancements
- [x] Implement version management system with `versions.json`
- [x] Display current version number at the bottom of the webpage
- [x] Fix preview photo to show full fixed dimension (e.g., 500x500px) and resize large images
- [x] Add "XXX (Coming Soon)" shirt style to the selection UI

- [x] Update the upload preview to use a consistent 500px-maximum square viewport that scales down only on narrow screens without overflow, and verify it remains stable when the browser width changes.
- [ ] Add real oversized-image handling for preview/upload (e.g. canvas/client-side resize or another implemented size-normalization path) and regression coverage for portrait images filling the fixed preview without cropping.
- [x] Repair the responsive upload preview so portrait and landscape photos preserve their native aspect ratio, remain fully contained, and never overflow the bordered viewport.
- [x] Run type checking, automated tests, and desktop/mobile visual verification for the release candidate.
- [x] Save a release-ready checkpoint for publication.
- [x] Restore the Dashboard live task-log rendering required by existing Try On lifecycle tests before release.

## ComfyUI Desktop Workflow Integration
- [x] Provide a downloadable sanitized copy of `POCComfyUI.tsx` with the Positive Prompt default left empty for permitted local customization.
- [x] Assess a per-visit remote prompt-default source and only integrate it if its text is permitted for the apparel-editing POC.
- [x] Implement a server-mediated, no-cache remote prompt fetch on each POC page visit with input limits, safe apparel validation, and frontend fallback behavior.
- [x] Add regression coverage for accepted, rejected, unavailable, and overlong remote prompt-default responses.
- [ ] Add server-mediated live ComfyUI queue/execution progress and a clearly labelled estimated remaining time to the POC Processing Log.
- [ ] Stream truthful in-request ComfyUI POC stages to the Processing Log through a short-lived authenticated status query.
- [x] Diagnose the current ComfyUI `/prompt` HTTP 400 response using the instance's returned validation details.
- [x] Complete a verified corrected POC request contract that uploads to the remote ComfyUI endpoint and injects its returned filename into workflow node `78`.
- [x] Verify that the POC processing-log panel renders safe server-side upload, validation, polling, and output-retrieval diagnostics on a real request.
- [x] Add browser-equivalent regression coverage proving the POC page renders returned ComfyUI diagnostics and the result image after a successful request.
- [x] Add automated coverage for a rejected ComfyUI prompt payload and a successful upload-to-output POC sequence.
- [ ] Remediate the confirmed direct-ComfyUI exposure: the endpoint currently serves unauthenticated HTTP and does not provide HTTPS on port 8188; use an authenticated HTTPS boundary or the planned workstation bridge before launch.
- [ ] Add a server-side ComfyUI client that uploads the selected private photo to ComfyUI, submits a controlled API-format workflow copy, and safely retrieves the named output image.
- [ ] Persist ComfyUI prompt identifiers and terminal task status so processing can recover from a web request ending before the workstation finishes.
- [ ] Connect the `XXX` selection to the ComfyUI workflow while preserving the existing Try On flow for other shirt styles.
- [ ] Add focused automated coverage for ComfyUI input replacement, API submission, output retrieval, timeouts, and safe error handling.
- [x] Perform a real end-to-end run against the configured workstation and document the required desktop-side network, authentication, and workflow settings.
- [ ] Fix `XXX` to the supplied `QwenImageEditRapidv1.0` API workflow only; do not infer or accept a workflow selection from uploaded images or untrusted client input.
- [ ] Replace the Qwen workflow's LoadImage node `78` exclusively with a ComfyUI-managed uploaded filename and collect output from node `102`.
- [ ] Review `QwenImageEditRapidv1.0(External)` for safe apparel-editing prompts, model settings, and a deterministic image input/output contract before it can replace the blocked workflow.
- [ ] Re-audit the newly re-uploaded `QwenImageEditRapidv1.0(External)` contents before any connection is enabled, including its checkpoint, LoRA configuration, positive prompt, and image-output node.
- [ ] Verify the latest re-uploaded workflow uses a non-adult checkpoint and an explicit clothing-preserving Qwen edit prompt before enabling `XXX`.

## Local ComfyUI Bridge Integration (Option B)
- [ ] Replace the direct public-ComfyUI endpoint path with a workstation-initiated bridge; do not require DDNS, port forwarding, CORS, or a ComfyUI-side Bearer Token.
- [ ] Add one-time website-to-workstation pairing codes and revocable per-device credentials without exposing them in the browser after pairing.
- [ ] Add durable queue, lease, retry, completion, and failure states for Qwen `XXX` tasks so an offline workstation never loses a user request.
- [ ] Add authenticated Bridge procedures to claim only the paired device's queued task, obtain a short-lived source-image URL, report progress, and submit an output image.
- [ ] Create a locally executable Bridge that talks only to `127.0.0.1:8188`, injects the website photo into the fixed safe Qwen workflow, and returns only the resulting image.
- [ ] Update Dashboard to show Bridge pairing/availability and to queue `XXX` only when the paired Bridge is online, preserving all existing non-XXX try-on styles.
- [ ] Add migration, unit, integration, and UI coverage for pairing, device isolation, leases, retries, offline handling, output persistence, and credit refund behaviour.
- [ ] Produce Windows installation, first-pairing, start/stop, and troubleshooting instructions, then complete a real local end-to-end test on the ComfyUI workstation.
