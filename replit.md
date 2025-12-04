# Serious People - Career Coaching

## Overview

Serious People is a career coaching service that helps users navigate career transitions. The app provides a **structured coaching session** with:
1. A free intro phase to understand the big problem and propose a custom 3-module plan
2. $19 payment via Stripe to unlock the full coaching modules
3. Three coaching modules: Job Autopsy, Fork in the Road, The Great Escape Plan
4. A final "Career Brief" deliverable with diagnosis, action plan, and conversation scripts

**Tagline:** "Short scripts for big career conversations."

**User Flow:** Landing page → Free intro & plan proposal → Paywall → $19 Stripe payment → 3 coaching modules → Career Brief generation

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
- `client/src/pages/interview.tsx` - Chat-style AI interview with conversation UI (route: `/interview`)
- `client/src/pages/success.tsx` - Payment verification and script generation (route: `/success`)

**Styling:**
- `client/src/styles/serious-people.css` - All WSJ-inspired styles imported into each page

**Interview Page Features:**
- Chat-style conversation interface with AI coach (no specific name)
- Transcript stored in sessionStorage (`serious_people_transcript` key) - clears when browser closes
- Progress bar integrated into header separator line (per-module progress, persisted to sessionStorage `serious_people_progress`)
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
4. `POST /generate` - Generates scripts from `{ transcript }`, returns `{ text }`

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

**Current Usage:**
- **users** table - Ready for future SSO integration with Passport (fields: id, email, name, password, oauthProvider, oauthId, createdAt, updatedAt)
- **sessions** table - Ready for express-session integration
- **interview_transcripts** table - Ready to store conversation history (sessionToken, userId, transcript, progress, interviewComplete, paymentVerified, stripeSessionId)

**Current Storage Pattern:**
- Interview transcripts stored client-side in sessionStorage (serious_people_transcript key) - clears when browser closes
- Module progress stored in sessionStorage (serious_people_progress key)
- Payment verification is session-based via Stripe session_id query param

**Test Endpoint:**
- `GET /api/test-db` - Tests database connectivity (creates and retrieves test record)
- Works in both development and production environments
- Reads DATABASE_URL from env or /tmp/replitdb file (production)

### Authentication & Authorization

**No User Authentication:**
- No login/registration system
- Access control is payment-based
- Stripe Checkout session validates payment
- Scripts only generated after successful payment verification

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
