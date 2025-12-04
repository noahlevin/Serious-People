# Serious People - Career Coaching

## Overview

Serious People is a career coaching service that helps users navigate career transitions. The app provides a **structured coaching session** with:
1. A free intro phase to understand the big problem and propose a custom 3-module plan
2. $19 payment via Stripe to unlock the full coaching modules
3. Three coaching modules: Job Autopsy, Fork in the Road, The Great Escape Plan
4. A final "Career Brief" deliverable with diagnosis, action plan, and conversation scripts

**Tagline:** "Short scripts for big career conversations."

**User Flow:** Landing page → Login (Google SSO) → Free intro & plan proposal → Paywall → $19 Stripe payment → 3 coaching modules → Career Brief generation

## User Preferences

Preferred communication style: Simple, everyday language. Plain, direct, no corporate jargon.

## System Architecture

### Frontend Architecture

**Technology Stack:**
- Static HTML pages with inline CSS and vanilla JavaScript
- No React, no build process for frontend
- WSJ-inspired typography: Playfair Display (headlines) + Source Serif 4 (body)
- Design inspired by Wall Street Journal print edition for old-school business credibility

**Static Pages:**
- `public/index.html` - Landing page with hero section, "Start the interview" CTA, and secondary "Log back in" CTA
- `public/login.html` - Login page with Google SSO button and fine print about progress saving
- `public/interview.html` - Chat-style AI interview with conversation UI, profile menu, and auth checks
- `public/success.html` - Payment verification and script generation

**Interview Page Features:**
- Auth check on load, redirects to login if not authenticated
- Profile menu in header (icon + text, no photo) with logout option
- Progress sync: loads from server on init, saves on transcript/progress changes, saves on page unload using sendBeacon with Blob content-type
- Chat-style conversation interface with AI coach (no specific name)
- Transcript stored in both sessionStorage and PostgreSQL database for persistence
- Progress bar integrated into header separator line (per-module progress, persisted to both sessionStorage and database)
- Module name shown in header subtitle (updates when module title cards detected)
- Auto-scrolling chat container
- Elegant WSJ-style module title cards with decorative lines and uppercase headings
- Title card format: `— Module Name (est. X minutes) —` (rendered as styled element)
- Premium plan card: personalized coaching plan rendered as a standout card
- Typing indicator: 0.4–1.5 seconds max delay
- Personalized paywall with value bullets from AI
- Two-step paywall: user must confirm plan via structured option before paywall appears
- Checkout button that creates Stripe session
- Test bypass: Type "testskip" to skip to paywall with sample data

**Success Page Features:**
- Auth check on load
- Payment verification via session_id query param (marks user as paid server-side)
- Transcript retrieval from database or sessionStorage
- Career Brief generation on button click
- Copy-to-clipboard functionality

### Backend Architecture

**Framework:** Express.js with TypeScript

**Server Structure:**
- Express server with JSON body parsing
- Static file serving from `public` directory
- Development mode uses Vite middleware for HMR
- PostgreSQL session store for auth persistence

**API Endpoints:**
1. `GET /api/login` - Redirects directly to Google OAuth login
2. `GET /api/logout` - Logs out user and redirects to landing page
3. `GET /api/auth/google/callback` - Handles OAuth callback from Google
4. `GET /api/auth/user` - Returns authenticated user data (protected)
5. `GET /api/auth/check` - Returns auth status without requiring login (for optional UI elements)
6. `GET /api/progress` - Returns user's progress data (protected)
7. `POST /api/progress` - Saves user's progress (transcript, progress, lastLocation) - hasPaid is not accepted from client
8. `POST /checkout` - Creates Stripe Checkout session, returns redirect URL
9. `GET /verify-session?session_id=xxx` - Validates Stripe payment session and marks user as paid in database
10. `POST /interview` - AI interview endpoint, accepts `{ transcript: [] }`, returns `{ reply, done, valueBullets }`
11. `POST /generate` - Generates scripts from `{ transcript }`, returns `{ text }`

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

**PostgreSQL Database (via Neon):**
- `users` table: User profiles from Google OAuth (id, email, firstName, lastName, profileImageUrl, timestamps)
- `sessions` table: Express session storage for auth persistence (auto-created by connect-pg-simple)
- `user_progress` table: User progress data (userId, transcript JSON, progress int, lastLocation, hasPaid, timestamps)

**Session Storage:**
- Interview transcripts also cached in sessionStorage (`serious_people_transcript` key)
- Progress cached in sessionStorage (`serious_people_progress` key)
- Clears when browser closes, but persisted in database for returning users

### Authentication & Authorization

**Google OAuth 2.0 (via Passport.js):**
- Direct Google SSO using `passport-google-oauth20`
- Users go directly to Google's login page (no intermediary)
- Session stored in PostgreSQL via connect-pg-simple
- Session cookie `secure` is conditional on production environment
- 1-week session TTL
- Auth required for interview page (redirects to login)
- Optional auth for success page (marks payment if authenticated)
- Extensible to other OAuth providers (Apple, GitHub, etc.) via Passport strategies

**User Flow:**
1. User clicks "Start the interview" on landing page
2. Redirected to login page with Google SSO option
3. After SSO, redirected back to interview page
4. Progress saved to database on each message and page unload
5. On logout, progress saved, user can log back in to resume
6. After payment, `hasPaid` marked server-side via verified Stripe session

### External Dependencies

**Payment Processing:**
- **Stripe** - One-time $19 payment via Checkout Sessions
- Uses `STRIPE_SECRET_KEY` (via Replit Stripe connection)
- Auto-creates product/price if not found
- Success URL: `{BASE_URL}/success.html?session_id={CHECKOUT_SESSION_ID}`
- Cancel URL: `{BASE_URL}/interview.html`
- Payment verification marks `hasPaid` in database (server-side, not client-trusted)

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
- `SESSION_SECRET` - Express session secret
- `DATABASE_URL` - PostgreSQL connection string (auto-set by Replit in development)
- `BASE_URL` - Application base URL (auto-detected from Replit domain)
- `GOOGLE_CLIENT_ID` - Google OAuth client ID (required for auth)
- `GOOGLE_CLIENT_SECRET` - Google OAuth client secret (required for auth)
- `PRODUCTION_DATABASE_URL` - (Optional) Override for production database URL. Set this secret if production deployment cannot connect to the database.

### Production Database Configuration

**How database connection works:**
1. In development: Uses `PGHOST`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` environment variables (auto-set by Replit)
2. In production: Checks `/tmp/replitdb` for the Neon PostgreSQL URL

**If production database fails:**
The production deployment may receive an incorrect database URL (e.g., KV store URL instead of PostgreSQL). If you see errors like "Unexpected server response: 404" or "kv.replit.com" in production logs:

1. Go to the Database tool in your Replit workspace
2. Navigate to "Commands" tab → "Environment variables" section
3. Copy the `DATABASE_URL` value (should look like `postgresql://...@...neon.tech:5432/...`)
4. Add it as a secret called `PRODUCTION_DATABASE_URL`
5. Republish the app

The app prioritizes `PRODUCTION_DATABASE_URL` in production to work around platform misconfiguration.

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

**Progress Sync:**
- On init: load from server, fallback to sessionStorage
- On message: debounced save to server (1 second delay)
- On page unload: sendBeacon with Blob content-type for reliable JSON parsing
- On logout: explicit save before redirect

**Script Parsing:**
- Scripts returned as single text block with section headers
- Frontend displays as preformatted text
- Copy-to-clipboard for easy sharing
