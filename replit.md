# Career Coaching Script Generator

## Overview

This is a career coaching script generation service that helps users navigate career transitions. Users pay $19 via Stripe to access a form where they input career details, which then generates three personalized scripts: one for their boss, one for their partner, and a clarity memo with concrete next steps. The application follows a simple conversion funnel: landing page → payment → form → AI-generated scripts.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Technology Stack:**
- React with TypeScript for UI components
- Vite as the build tool and development server
- Wouter for client-side routing
- TanStack Query for server state management
- Tailwind CSS for styling with shadcn/ui component library

**Design System:**
- Uses shadcn/ui components built on Radix UI primitives
- Custom Tailwind configuration with HSL-based color system
- Design follows a hybrid approach combining Stripe's trust-building aesthetics with Linear's clean form design
- Typography uses Inter font family for professional, form-optimized readability
- Single-column, focused layouts optimized for conversion and form completion

**Static Pages:**
- Landing page served from `public/index.html` - displays hero section with CTA button
- Success page served from `public/success.html` - handles payment verification and displays intake form
- Both pages use inline styling to work independently of the React build

### Backend Architecture

**Framework:** Express.js with TypeScript

**Server Structure:**
- Express server with JSON body parsing and raw body preservation for webhook verification
- Custom logging middleware for API request monitoring
- Static file serving from the `public` directory for landing/success pages
- Development mode uses Vite middleware for HMR; production serves pre-built static files

**API Endpoints:**
1. `POST /checkout` - Creates Stripe Checkout session and returns redirect URL
2. `GET /verify-session` - Validates Stripe payment session using session_id query parameter
3. `POST /generate-scripts` - Accepts intake form data and generates AI scripts via OpenAI
4. `POST /webhook` - Receives Stripe webhook events for payment confirmation

**AI Integration:**
- Uses OpenAI API with GPT-4.1-mini model for script generation
- Generates three personalized scripts based on user's career context:
  - Script for boss conversation
  - Script for partner discussion
  - Clarity memo with next steps

### Data Storage

**Database:** PostgreSQL via Neon serverless driver

**ORM:** Drizzle ORM for type-safe database operations

**Schema:**
- Simple user table with id, username, and password fields (defined in `shared/schema.ts`)
- Uses Drizzle-Zod for schema validation
- Database migrations managed via `drizzle-kit`

**Storage Strategy:**
- In-memory storage implementation (`MemStorage`) provided as fallback
- Production uses PostgreSQL connection via `DATABASE_URL` environment variable

### Authentication & Authorization

**Payment Verification:**
- Stripe Checkout session validation ensures users have paid before accessing the form
- Session ID passed via query parameter from Stripe redirect
- Backend verifies session status before allowing form submission

**No User Authentication:**
- No traditional login/registration system
- Access control is payment-based rather than account-based
- Sessions are ephemeral and tied to Stripe checkout flow

### External Dependencies

**Payment Processing:**
- **Stripe** - Handles one-time $19 payment via Checkout Sessions
- Uses environment variables: `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`
- Implements webhook handling for payment events
- Success URL: `{BASE_URL}/success.html?session_id={CHECKOUT_SESSION_ID}`
- Cancel URL: `{BASE_URL}/` (returns to landing page)

**AI Script Generation:**
- **OpenAI API** - Generates personalized career coaching scripts
- Uses GPT-4.1-mini model (explicitly specified)
- Requires `OPENAI_API_KEY` environment variable

**Database:**
- **Neon Serverless PostgreSQL** - Cloud-hosted database
- Requires `DATABASE_URL` environment variable
- Connection handled via `@neondatabase/serverless` driver

**UI Component Library:**
- **shadcn/ui** - Pre-built accessible components based on Radix UI
- Extensive collection of form inputs, dialogs, tooltips, etc.
- Customized via Tailwind with "new-york" style variant

**Build & Development:**
- **Vite** - Development server with HMR and production bundler
- **esbuild** - Server-side bundling with selective dependency bundling
- **tsx** - TypeScript execution for development and build scripts
- Replit-specific plugins for development banners and error handling

**Environment Configuration:**
- `BASE_URL` - Application base URL (defaults to Replit domain or localhost)
- `DATABASE_URL` - PostgreSQL connection string
- `STRIPE_SECRET_KEY` - Stripe API secret
- `STRIPE_PRICE_ID` - Stripe price object ID for $19 product
- `OPENAI_API_KEY` - OpenAI API authentication