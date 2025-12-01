# Serious People - Career Coaching Scripts

## Overview

Serious People is a career coaching service that helps users navigate career transitions. The app provides a **free AI-powered interview** to understand the user's situation, then charges $19 via Stripe for three personalized career coaching scripts: one for their boss, one for their partner, and a clarity memo with concrete next steps.

**Tagline:** "Short scripts for big career conversations."

**User Flow:** Landing page → Free AI interview → Personalized paywall → $19 Stripe payment → Script generation

## User Preferences

Preferred communication style: Simple, everyday language. Plain, direct, no corporate jargon.

## System Architecture

### Frontend Architecture

**Technology Stack:**
- Static HTML pages with inline CSS and vanilla JavaScript
- No React, no build process for frontend
- Inter font family for professional typography

**Static Pages:**
- `public/index.html` - Landing page with hero section and "Start the interview" CTA
- `public/interview.html` - Chat-style AI interview with conversation UI
- `public/success.html` - Payment verification and script generation

**Interview Page Features:**
- Chat-style conversation interface
- Transcript stored in localStorage (`serious_people_transcript` key)
- Auto-scrolling chat container
- Personalized paywall with value bullets from AI
- Checkout button that creates Stripe session

**Success Page Features:**
- Payment verification via session_id query param
- Transcript retrieval from localStorage
- Script generation on button click
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
- Interview system prompt conducts 6-8 questions
- Uses `[[INTERVIEW_COMPLETE]]` token to signal completion
- Uses `[[VALUE_BULLETS]]...[[END_VALUE_BULLETS]]` for personalized paywall content
- Script generation creates three sections: boss script, partner script, clarity memo

### Data Storage

**No Database:** This app does not use a database.
- Interview transcripts stored client-side in localStorage
- No user accounts or persistent server-side storage
- Payment verification is session-based via Stripe

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
- Success URL: `{BASE_URL}/success.html?session_id={CHECKOUT_SESSION_ID}`
- Cancel URL: `{BASE_URL}/interview.html`

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
