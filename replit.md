# Serious People - Career Coaching

## Overview

Serious People is a career coaching service that helps users navigate career transitions. The app provides a **structured coaching session** with:
1. User authentication (email magic link or Google OAuth)
2. A free intro phase to understand the big problem and propose a custom 3-module plan
3. Dynamic Stripe pricing with automatic discount code pre-application
4. Three coaching modules: Job Autopsy, Fork in the Road, The Great Escape Plan
5. A final "Serious Plan" with AI-generated dynamic artifacts: coach graduation note, decision snapshot, conversation scripts, action plan, risk map, module recap, and resources
6. PDF generation (Puppeteer with WSJ-styled template), email delivery (Resend), and persistent coach chat

**Tagline:** "Short scripts for big career conversations."

**User Flow:** Landing page → Sign in (magic link/Google) → Free intro & plan proposal → Paywall (with dynamic pricing) → Stripe payment (discount pre-applied) → 3 coaching modules → Serious Plan generation → Coach Chat

## User Preferences

Preferred communication style: Simple, everyday language. Plain, direct, no corporate jargon.

## System Architecture

### Frontend Architecture

**Technology Stack:**
- React SPA with Vite build system
- wouter for client-side routing
- WSJ-inspired typography: Playfair Display (headlines) + Source Serif 4 (body)
- Design inspired by Wall Street Journal print edition for old-school business credibility

**React Pages:**
- `client/src/pages/landing.tsx` - Landing page with hero section and "Start the interview" CTA (route: `/`)
- `client/src/pages/login.tsx` - Authentication page with email magic link and Google OAuth (route: `/login`)
- `client/src/pages/interview.tsx` - Chat-style AI interview with conversation UI (route: `/interview`, protected)
- `client/src/pages/success.tsx` - Payment verification and redirect to modules (route: `/success`)
- `client/src/pages/module.tsx` - Individual coaching module conversation (route: `/module/:moduleNumber`, protected)
- `client/src/pages/progress.tsx` - Table of contents showing completed/upcoming modules (route: `/progress`, protected)
- `client/src/pages/career-brief.tsx` - Legacy Career Brief page (route: `/career-brief`, protected) - being replaced by Serious Plan
- `client/src/pages/serious-plan.tsx` - Serious Plan with graduation note and artifacts (route: `/serious-plan`, protected)
- `client/src/pages/coach-chat.tsx` - Persistent coach chat with plan context (route: `/coach-chat`, protected)

**Auth Components:**
- `client/src/hooks/useAuth.tsx` - Auth context provider with user state, login, and logout functions
- `client/src/components/UserMenu.tsx` - User dropdown menu displayed in interview page header

**Styling:**
- `client/src/styles/serious-people.css` - All WSJ-inspired styles imported into each page

**Interview Page Features:**
- Chat-style conversation interface with AI coach (no specific name)
- Transcript stored on server for authenticated users (with sessionStorage fallback)
- User menu dropdown in header showing user name and logout option
- Progress bar integrated into header separator line (per-module progress)
- Module name shown in header subtitle (updates when module title cards detected)
- Auto-scrolling chat container
- Elegant WSJ-style module title cards with decorative lines and uppercase headings
- Title card format: `— Module Name (est. X minutes) —` (rendered as styled element)
- Premium plan card: personalized coaching plan rendered as a standout card with:
  - Header with "[Name]'s Coaching Plan"
  - Three numbered modules with personalized descriptions
  - "Your Career Brief" section highlighting the final deliverable
  - WSJ-premium styling with shadow, offset background, and elegant typography
- Typing indicator: 0.4–1.5 seconds max delay
- Personalized paywall with value bullets from AI
- Two-step paywall: user must confirm plan via structured option before paywall appears
- Checkout button that creates Stripe session
- Test bypass: Type "testskip" to skip to paywall with sample data
- Dev-only auto-client button (hidden in production):
  - Robot button (🤖): Generates a single realistic client response using AI

**Success Page Features:**
- Payment verification via session_id query param
- Transcript retrieval from sessionStorage
- Career Brief generation on button click
- Copy-to-clipboard functionality

### Backend Architecture

**Framework:** Express.js with TypeScript

**Server Structure:**
- Express server with JSON body parsing
- Static file serving from `public` directory
- Development mode uses Vite middleware for HMR

**API Endpoints:**
1. `POST /checkout` - Creates Stripe Checkout session with pre-applied discount code, returns redirect URL
2. `GET /verify-session?session_id=xxx` - Validates Stripe payment session
3. `GET /api/pricing` - Returns current price and active discount from Stripe (originalPrice, discountedPrice, percentOff, amountOff, currency)
4. `POST /interview` - AI interview endpoint, accepts `{ transcript: [] }`, returns `{ reply, done, valueBullets }`
5. `POST /api/module` - Module conversation endpoint, accepts `{ moduleNumber: 1|2|3, transcript: [] }`, returns `{ reply, done, progress, options, summary }`
6. `POST /generate` - Generates Career Brief from `{ transcript }`, returns `{ text }`
7. `GET /api/transcript` - Load user's transcript from database (requires auth)
8. `POST /api/transcript` - Save user's transcript to database (requires auth)
9. `GET /auth/me` - Get current authenticated user
10. `POST /auth/logout` - Log out current user
11. `POST /auth/magic/send` - Send magic link email
12. `GET /auth/magic/verify` - Verify magic link token
13. `GET /auth/google` - Initiate Google OAuth flow
14. `GET /auth/google/callback` - Google OAuth callback
15. `POST /api/dev/auto-client` - Dev-only: Generates realistic client responses for testing (returns 404 in production)
16. `POST /api/webhook/inbound` - Receives Resend inbound email webhooks and forwards to seriouspeople@noahlevin.com
17. `POST /api/serious-plan` - Generate a new Serious Plan with artifacts (requires auth)
18. `GET /api/serious-plan/latest` - Get user's latest Serious Plan with all artifacts (requires auth)
19. `GET /api/serious-plan/:id` - Get a specific Serious Plan by ID (requires auth)
20. `POST /api/serious-plan/:planId/artifacts/:artifactId/pdf` - Generate PDF for an artifact (requires auth)
21. `POST /api/serious-plan/:planId/bundle-pdf` - Generate bundle PDF with all artifacts (requires auth)
22. `POST /api/serious-plan/:planId/send-email` - Send the Serious Plan to user's email (requires auth)
23. `GET /api/coach-chat/:planId/messages` - Get chat history for a plan (requires auth)
24. `POST /api/coach-chat/:planId/message` - Send a message and get AI response (requires auth)

**AI Integration:**
- Uses Anthropic Claude Sonnet 4.5 as primary AI model when ANTHROPIC_API_KEY is set
- Falls back to OpenAI GPT-4.1-mini if no Anthropic key is available
- Interview conducted by plain-spoken career coach (no name)
- Interview system prompt conducts structured coaching session with modules
- Uses `[[PROGRESS]]...[[END_PROGRESS]]` token to track per-module progress (5-100)
- Uses `[[INTERVIEW_COMPLETE]]` token to signal completion (triggers paywall after plan proposal)
- Uses `[[VALUE_BULLETS]]...[[END_VALUE_BULLETS]]` for personalized paywall content
- Uses `[[OPTIONS]]...[[END_OPTIONS]]` for clickable response options
- Uses `[[PLAN_CARD]]...[[END_PLAN_CARD]]` for premium coaching plan card with structured fields (NAME, MODULE1_NAME, MODULE1_DESC, etc.)
- Uses `[[SOCIAL_PROOF]]...[[END_SOCIAL_PROOF]]` for context-relevant pricing comparison or coaching stat in paywall
- Career Brief generation creates structured document: Mirror, Diagnosis, Decision Framework, Action Plan, Conversation Kit, Further Support

### Data Storage

**PostgreSQL Database:** Replit's built-in PostgreSQL database is provisioned and connected.

**Database Tables:**
- **users** table - User accounts (id, email, name, password, oauthProvider, oauthId, createdAt, updatedAt)
- **sessions** table - express-session storage for authenticated sessions
- **interview_transcripts** table - Conversation history linked to users (sessionToken, userId, transcript, progress, interviewComplete, paymentVerified, stripeSessionId, valueBullets, socialProof, planCard, clientDossier, plannedArtifacts)
- **magic_link_tokens** table - One-time authentication tokens (email, tokenHash, expiresAt, usedAt)
- **serious_plans** table - Serious Plan records with graduation note and summary metadata
- **serious_plan_artifacts** table - Individual artifacts (decision snapshot, action plan, scripts, etc.) linked to plans
- **coach_chat_messages** table - Persistent chat messages linked to plans

**Storage Pattern:**
- Interview transcripts stored server-side in database for authenticated users
- sessionStorage used as fallback and for performance
- Progress and state synced to server on each update

**Test Endpoint:**
- `GET /api/test-db` - Tests database connectivity (creates and retrieves test record)

**Dev-Only Testing Features:**
- **Dev Skip Panel**: A floating panel (bottom-right) that appears only in development mode when authenticated. Allows jumping directly to any stage of the app (interview, paywall, module 1/2/3, serious plan, coach chat) by setting up the required database state automatically.
- **POST /api/dev/skip**: Backend endpoint that sets up database state for the specified stage. Requires authentication and only works in development mode.
- **testskip command**: In the interview page, type "testskip" to skip directly to the paywall with sample data.

### Authentication & Authorization

**User Authentication (Passport.js):**
- Email magic link via Resend (primary method)
- Google OAuth2 (requires GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET)
- Session-based authentication with httpOnly cookies
- Protected routes redirect unauthenticated users to /login

**Session Management:**
- express-session with connect-pg-simple PostgreSQL store
- sameSite=lax for security
- SESSION_SECRET required for production

### External Dependencies

**Payment Processing:**
- **Stripe** - Dynamic pricing via Checkout Sessions
- Uses specific product ID: `prod_TWhB1gfxXvIa9N`
- Uses `STRIPE_SECRET_KEY` (via Replit Stripe connection)
- Dynamic pricing: Fetches current price and active promotion codes from Stripe
- Pre-applies active promotion codes at checkout (discount automatically applied)
- Displays strikethrough pricing on landing page and paywall when discount is active
- Success URL: `{BASE_URL}/success?session_id={CHECKOUT_SESSION_ID}`
- Cancel URL: `{BASE_URL}/interview`

**AI Script Generation:**
- **OpenAI API** - Powers interview and script generation
- Uses GPT-4.1-mini model
- Requires `OPENAI_API_KEY` environment variable

**Build & Development:**
- **Vite** - Development server with HMR
- **esbuild** - Server-side bundling
- **tsx** - TypeScript execution

### Environment Variables

- `OPENAI_API_KEY` - OpenAI API authentication (required)
- `STRIPE_SECRET_KEY` - Stripe API secret (via Replit connection)
- `BASE_URL` - Application base URL (auto-detected from Replit domain)

### Key Implementation Details

**Interview Completion Detection:**
- AI includes `[[INTERVIEW_COMPLETE]]` token when ready to write scripts
- Token is stripped from user-facing reply
- Value bullets extracted from `[[VALUE_BULLETS]]...[[END_VALUE_BULLETS]]` block

**Transcript Format:**
```json
[
  { "role": "assistant", "content": "..." },
  { "role": "user", "content": "..." },
  ...
]
```

**Script Parsing:**
- Scripts returned as single text block with section headers
- Frontend displays as preformatted text
- Copy-to-clipboard for easy sharing
