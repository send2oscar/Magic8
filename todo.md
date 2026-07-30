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
- ✅ Direct ComfyUI XXX workflow with durable background finalization
- ✅ ASCII-safe photo filename normalization for international uploads
- ✅ Active scheduled finalizer with verified Heartbeat responses

## How It Works Now
1. User logs in with Manus OAuth and receives 5 credits
2. User uploads a photo of themselves (non-ASCII filenames automatically normalized)
3. User selects a shirt style (Classic White, Neon Pink, Electric Cyan, Dark Black, Holographic, or XXX)
4. User clicks "TRY ON NOW" - the AI generates a realistic image with the new shirt
5. The result is displayed in Gallery showing:
   - The AI-generated image with the new shirt
   - Which shirt style was applied
   - Credits remaining
   - Credits used (1 for standard, 10 for XXX)
6. User can try on more shirts until credits run out
7. XXX requests process in the background via direct ComfyUI at `http://oscarngan.ddns.net:8188`
8. Scheduled finalizer checks pending XXX tasks every minute and saves completed outputs to Gallery

## Remaining Tasks (Paused Until Local ComfyUI Restarts)
- [x] After the user restarts local ComfyUI, rerun the live direct `system_stats` health check and complete the external integration regression suite.
- [x] Keep all direct local-ComfyUI health and integration tests paused until the user explicitly confirms that the local ComfyUI service has restarted.

## ButtonFix Recovery
- [x] Diagnose and restore the single refresh-style ButtonFix flow after the user reported the deployed Dashboard reverted to duplicated controls.
- [x] Commit the restored ButtonFix Dashboard and regression-test changes on main.
- [x] Push the restored ButtonFix commit to the GitHub main branch.
- [x] Save a recovery checkpoint for the restored ButtonFix behavior.

## Heartbeat and Gallery Recovery
- [x] Inspect the scheduled ComfyUI finalizer’s Heartbeat status, recent runs, and error responses after the reported Gallery regression.
- [x] Trace pending ComfyUI task records through output retrieval and Gallery persistence to identify the failure point.
- [x] Deploy the safe ComfyUI output-folder normalization and verify the Heartbeat finalizer writes completed outputs into the Gallery.

## Qwen LoRA Weight Editor
- [x] Locate and expose the approved Qwen workflow’s LoRA weight setting for the project owner.
- [x] Add bounded server-side validation and Dashboard controls for editing the LoRA weight without allowing arbitrary workflow changes.
- [x] Add regression coverage and verify the selected LoRA weight is submitted with the approved workflow.
- [x] Save a combined recovery checkpoint containing the verified Gallery and LoRA changes.

## Release Safeguards
- [x] Inspect the GitHub repository, remote branch state, and current protection rules for main.
- [x] Reauthorize the GitHub integration with workflow-write permission.
- [x] Add a GitHub Actions test workflow and a RELEASE.md that records the verified release sequence.
- [x] Fix the GitHub Actions pnpm setup so the required Test check can install dependencies from the package-manager declaration.
- [x] Configure non-production administrator credentials for the mocked CI regression tests.
- [x] Configure non-production Bubble API values and exclude the opt-in live ComfyUI endpoint probe from the deterministic CI suite.
- [x] Protect main against force-pushes and deletion, requiring pull-request-based releases.
- [x] Verify the remote main protection policy: pull requests and linear history are required, while force-pushes and branch deletion are disabled.
- [x] Save a recovery checkpoint for the verified workflow synchronization and protected main merge.
- [x] Require the successful GitHub Test status check and merge the protected safeguards and all-task error-log pull request.
- [x] Save a recovery checkpoint for the required-test safeguard and all-task admin error logs.

## Submitted ComfyUI Workflow Synchronization
- [x] Compare the user-supplied Qwen workflow with the current approved workflow and identify the three LoRA-node mappings.
- [x] Update the approved workflow and retain bounded Dashboard controls mapped to the corresponding submitted LoRAs.
- [x] Add regression coverage, verify the generated ComfyUI payload, and merge the protected pull request for the adjustment.

## Admin Error Log Coverage
- [x] Inspect the existing admin error-log query, task-history schema, and Admin Workspace panel to identify why only XXX errors appear.
- [x] Extend the administrator data flow to include complete logs for every failed image-generation task type.
- [x] Update the Admin Workspace label and rendering so each full raw error remains readable and distinguishable by task type.
- [x] Add regression coverage and verify the expanded all-task error-log panel.

## User-Supplied Dashboard Replacement
- [x] Replace `Dashboard.tsx` with the user-supplied file without inspecting or diffing its contents.
- [x] Validate the replacement compiles and selects Classic White by default.
- [x] Reconcile Dashboard regression expectations with the user-supplied Classic White default selection.
- [x] Save a recovery checkpoint for the verified Dashboard replacement.
- [x] Make Classic White the default selected shirt after initial load and reset.
- [x] Show the Qwen prompt and LoRA configuration section only when XXX is selected.
- [x] Apply the immediate Use Another Photo reset flow to successful submissions for every shirt style.
- [x] Add a visible, accessible flashing treatment to the XXX selection button.
- [x] Guard both standard and XXX submission completions so a confirmed reset cannot restore stale Dashboard state.
- [x] Add Dashboard regression coverage for a reset during a standard-shirt submission.
- [x] Set the XXX default prompt to the developer-confirmation placeholder.

## XXX Local ComfyUI Error Investigation
- [x] Inspect the direct local-ComfyUI configuration and reproduce the reported XXX submission failure.
- [x] Trace the full failing request and error across the Dashboard, server, and local ComfyUI service; the remote history identifies node 104 (`WidgetToString`) as the execution failure.
- [x] Apply the smallest safe fix for the confirmed failure cause without changing unrelated Dashboard behavior.
- [x] Verify a corrected XXX submission in local ComfyUI after the user retries it.
- [x] Save a recovery checkpoint for the verified WidgetToString fix and XXX configuration visibility update.

## XXX Visual Attention Treatment
- [x] Replace the existing XXX emphasis with a persistent, high-contrast neon-pink flashing treatment inspired by the supplied reference.
- [x] Verify the XXX treatment remains legible, interactive, and respectful of reduced-motion preferences.

## XXX Configuration Visibility
- [x] Hide only the first displayed XXX configuration row while preserving its backend default value and submission behavior.
- [x] Verify the remaining visible rows continue to allow supported weight editing.
- [x] Provide the precise source file and line numbers for editing the remaining visible configuration labels.

## Positive Prompt Visibility Regression
- [x] Keep the Positive Prompt text area visible for every shirt selection, including all five standard styles.
- [x] Add regression coverage that proves the prompt remains visible and updates for standard and XXX selections.
- [x] Verify the restored visibility in the Dashboard preview.
- [x] Save a recovery checkpoint for the Positive Prompt visibility fix.

## XXX Configuration Label Source
- [x] Trace why visible XXX configuration labels do not reflect direct wording edits in Dashboard.tsx; the server workflow response was taking precedence over the local fallback labels.
- [x] Apply the smallest safe source-of-truth correction for the editable labels.
- [x] Verify the new wording appears in the Dashboard.
- [x] Save a recovery checkpoint for the verified wording-source correction.

## Notification Duration Extension
- [x] Extend the notification message display duration from the current short duration to 15 seconds.
- [x] Verify the extended duration in the Dashboard preview.
- [x] Save a recovery checkpoint for the extended notification duration.

## Renewed Local ComfyUI Failure Investigation
- [x] Investigate the newly reported local ComfyUI image-generation failure using current logs, task records, and endpoint diagnostics only; no fix was applied pending explicit authorization.

## Durable Direct-ComfyUI WidgetToString Repair
- [x] Replace the GUI-only WidgetToString/Image Saver metadata chain with a direct-API-compatible Qwen output path.
- [x] Add a workflow compatibility guard that rejects GUI-only metadata dependencies before any direct ComfyUI submission.
- [x] Add regression coverage for the submitted `/prompt` payload and for rejection of the previously failing node chain.
- [x] Run the complete test suite, type checks, and a local-ComfyUI live verification of the repaired workflow.
- [x] Save a recovery checkpoint and synchronize the verified repair to GitHub main.

## Heartbeat Status Investigation
- [x] Investigate the current ComfyUI finalizer Heartbeat configuration and execution history without changing code, schedules, database records, or endpoint settings; the scheduler works, while Gallery finalization was blocked by valid empty output subfolders.

## ComfyUI Gallery Synchronization Repair
- [x] Accept ComfyUI `SaveImage` outputs whose valid root output folder is represented by an empty `subfolder` value.
- [x] Add regression coverage for empty-subfolder output discovery and download while retaining path-traversal protections.
- [x] Run the complete test suite, TypeScript checks, and production build.
- [x] Confirm the two completed local-ComfyUI tasks remain successful with persisted Gallery result URLs.
- [x] Save a recovery checkpoint and synchronize the verified repair to GitHub main.

## Post-Release Local ComfyUI Submission Regression
- [x] Trace the newest stuck submission through the deployed request, task records, and local ComfyUI queue without changing the connection method; the newest requests were recorded as `classic-white`, not Qwen tasks.
- [x] Reproduce the dashboard routing decision and prove which selected shirt value is submitted when the user expects XXX.
- [x] Add durable administrator diagnostics that preserve the submitted shirt style and selected processing route for future routing investigations.
- [x] Apply the smallest confirmed correction and add regression safeguards for the failed submission path.
- [x] Run the complete automated suite and verify a controlled prompt reaches and completes in local ComfyUI.
- [x] Save a recovery checkpoint and synchronize the verified correction to GitHub main.
- [x] Expose the persisted `route_selected` stage through the administrator task-diagnostics query for standard and XXX submissions.
- [x] Render each selected processing route in the Admin Workspace and add regression coverage for full route visibility.
- [x] Synchronize the latest verified routing-safeguard commit to GitHub `main` (no active branch-protection rule was present at push time).
- [x] Confirm GitHub `main` contains the synchronized commit and save a fresh post-synchronization recovery checkpoint.

## PayPal Payment Gateway
- [x] Create the `PayPalPaymentGateway` feature branch from the verified GitHub `main` baseline.
- [x] Add a minimal payment ledger and singleton credit-policy data model with a schema migration.
- [x] Implement secure PayPal order creation, server-side return-page capture validation, and idempotent credit fulfillment.
- [x] Add a user-facing PayPal credit-purchase flow that reflects the current administrator-configured USD price.
- [x] Add administrator tables for PayPal payment records and configurable XXX deduction, non-XXX deduction, and USD credit pricing.
- [x] Replace fixed credit costs across standard and XXX flows with the stored administrator credit policy.
- [x] Deduct credits only after a result is successfully completed and saved; failed or incomplete generation attempts must not consume credits.
- [x] Add backend and frontend regression coverage for payments, policies, authorization, idempotency, and dynamic deductions.
- [x] Validate the feature, save a checkpoint, and push the completed feature branch to GitHub.
- [x] Seed the administrator credit policy with standard = 1 credit, XXX = 10 credits, and USD 1.00 per 10 credits.
- [x] Seed editable fixed purchase packages for 100, 500, and 1,000 credits, with server-calculated USD amounts.
- [x] Use PayPal Sandbox return-page capture only, with no credit grant until the server verifies a completed capture.
- [x] Keep every editable package’s USD amount server-derived from the active USD-per-10-credit policy whenever either setting changes.
- [x] Trace the reported PayPal Sandbox return-page failure through the stored payment record, returned order ID, capture response, and full administrator-visible error log.
- [x] Correct the return-page capture logic so an approved Sandbox order is captured and verified once before credits are granted; non-terminal `PENDING/UNILATERAL` captures remain uncredited and retryable.
- [x] Add a regression covering the reported approved-but-not-captured order state and validate the corrected payment-ledger result, including 128 deterministic tests and a production build; the independent external ComfyUI endpoint test remains unavailable due to a socket hang-up.
- [x] Save a checkpoint and synchronize the PayPal capture correction to GitHub `PayPalPaymentGateway` through merged Pull Request #6.
- [x] Record the receiving PayPal Sandbox merchant email confirmation as deferred at the user's request; until it is completed externally, any `PENDING/UNILATERAL` capture remains uncredited, visible to administrators, and safely retryable.
- [x] Update the PayPal Sandbox application client ID and client secret through managed project secrets.
- [x] Validate the new PayPal credentials with the existing credential test without creating an order or capture.
- [x] Save a recovery checkpoint containing the verified PayPal credential configuration update.
- [x] Add a fixed USD 0.10 package that grants exactly 1 credit, with server-side package and amount validation.
- [x] Verify the 1-credit package renders in the purchase UI and cannot grant credits before a completed PayPal capture.
- [x] Audit the end-to-end ComfyUI prompt flow: the Dashboard positive prompt is forwarded unchanged to the approved Qwen node, while the server-owned workflow adds a fixed negative prompt and never removes user-entered text.
- [x] Update the PayPal Live account application client ID and client secret through managed project secrets.
- [x] Validate the new PayPal Live credentials with the existing credential test without creating an order or capture (test now auto-detects Live/Sandbox endpoints).
- [x] Save a checkpoint containing the verified PayPal Live account configuration.
