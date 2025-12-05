# Serious People - Career Coaching

## Overview

Serious People is a career coaching service that helps users navigate career transitions. The app provides a **structured coaching session** with:
1. User authentication (email magic link or Google OAuth)
2. A free intro phase to understand the big problem and propose a custom 3-module plan
3. $19 payment via Stripe to unlock the full coaching modules
4. Three coaching modules: Job Autopsy, Fork in the Road, The Great Escape Plan
5. A final "Career Brief" deliverable with diagnosis, action plan, and conversation scripts

**Tagline:** "Short scripts for big career conversations."

**User Flow:** Landing page → Sign in (magic link/Google) → Free intro & plan proposal → Paywall → $19 Stripe payment → 3 coaching modules → Career Brief generation

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
- `client/src/pages/career-brief.tsx` - Final Career Brief generation after all modules (route: `/career-brief`, protected)

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
1. `POST /checkout` - Creates Stripe Checkout session, returns redirect URL
2. `GET /verify-session?session_id=xxx` - Validates Stripe payment session
3. `POST /interview` - AI interview endpoint, accepts `{ transcript: [] }`, returns `{ reply, done, valueBullets }`
4. `POST /api/module` - Module conversation endpoint, accepts `{ moduleNumber: 1|2|3, transcript: [] }`, returns `{ reply, done, progress, options, summary }`
5. `POST /generate` - Generates Career Brief from `{ transcript }`, returns `{ text }`
6. `GET /api/transcript` - Load user's transcript from database (requires auth)
7. `POST /api/transcript` - Save user's transcript to database (requires auth)
8. `GET /auth/me` - Get current authenticated user
9. `POST /auth/logout` - Log out current user
10. `POST /auth/magic/send` - Send magic link email
11. `GET /auth/magic/verify` - Verify magic link token
12. `GET /auth/google` - Initiate Google OAuth flow
13. `GET /auth/google/callback` - Google OAuth callback

**AI Integration:**
- Uses OpenAI API with GPT-4.1-mini model
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
- **interview_transcripts** table - Conversation history linked to users (sessionToken, userId, transcript, progress, interviewComplete, paymentVerified, stripeSessionId, valueBullets, socialProof, planCard)
- **magic_link_tokens** table - One-time authentication tokens (email, tokenHash, expiresAt, usedAt)

**Storage Pattern:**
- Interview transcripts stored server-side in database for authenticated users
- sessionStorage used as fallback and for performance
- Progress and state synced to server on each update

**Test Endpoint:**
- `GET /api/test-db` - Tests database connectivity (creates and retrieves test record)

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
- **Stripe** - One-time $19 payment via Checkout Sessions
- Uses `STRIPE_SECRET_KEY` (via Replit Stripe connection)
- Auto-creates product/price if not found
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
