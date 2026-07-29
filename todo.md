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
- [ ] Save a combined recovery checkpoint containing the verified Gallery and LoRA changes.
