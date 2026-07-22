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
- [ ] Create procedure to call Bubble.io Workflow API (pending Bubble.io setup)
- [x] Implement credit deduction logic (1 credit per try-on)
- [x] Add validation to prevent try-on if credits <= 0
- [x] Create procedure to store try-on results in database
- [x] Create procedure to retrieve try-on history

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
- [ ] Create User Profile/Settings page with logout
- [x] Add navigation header with credit balance display

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
- [ ] Test photo upload functionality
- [ ] Test try-on API call with Bubble.io (pending setup)
- [ ] Test credit deduction on try-on
- [ ] Test zero-credit prevention
- [x] Test unauthenticated user blocking
- [x] Test logout functionality
- [x] Verify all cyberpunk styling

## Known Issues & Refinements
- [ ] Fix file upload to use proper multipart/form-data with server-side validation
- [ ] Make try-on credit deduction transactional with rollback on failure
- [ ] Persist try-on result image URL and API response to database
- [ ] Add dedicated Login and Register pages/routes
- [ ] Replace monospace font with geometric sans-serif (e.g., Orbitron, Space Mono)
- [ ] Implement HUD corner bracket styling in CSS
- [ ] Add automated tests for 5-credit new-user assignment
- [ ] Add automated tests for unauthenticated upload blocking
- [ ] Complete Bubble.io API integration when ready

## Deployment
- [ ] Create final checkpoint
- [ ] Verify all features working in production
