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
