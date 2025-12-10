# Serious People - Career Coaching

## Overview

Serious People is a career coaching service designed to guide users through career transitions. The platform offers a structured coaching experience including user authentication, a free introductory phase to define user needs, a dynamically priced 3-module coaching plan, and a final "Serious Plan" with AI-generated artifacts. The project aims to provide a professional, structured, and AI-powered career coaching solution.

**Key Capabilities:**
- User authentication (magic link or Google OAuth).
- Free intro and personalized 3-module plan proposal.
- Dynamic Stripe pricing with automated discount application.
- Three core coaching modules: Job Autopsy, Fork in the Road, The Great Escape Plan.
- AI-generated "Serious Plan" artifacts: coach graduation note, decision snapshot, conversation scripts, action plan, risk map, module recap, and resources.
- PDF generation and email delivery of the Serious Plan.
- Persistent coach chat functionality.

**Serious Plan Generation:**
The Serious Plan and its artifacts are generated in parallel upon completion of Module 3. Initial placeholders are created, and generation processes for the coach letter and other artifacts run asynchronously. The frontend polls for completion, displaying loaders during this period.

**Dossier Generation:**
Client dossiers are generated during the interview (when the plan card is created) to avoid delays after payment. The system uses:
- **Non-blocking architecture**: Transcript is saved FIRST, then dossier generation runs in background (fire-and-forget). This ensures planCard and messages are persisted immediately so subsequent reads see correct data.
- Anthropic Claude Haiku 4.5 for speed (8192 max tokens, temperature=0 for deterministic output)
- Anthropic prefill technique for reliable JSON output
- OpenAI native JSON mode as fallback
- In-memory locking (60s stale timeout) to prevent duplicate concurrent generation
- Success page polling (every 2 seconds for up to 60 seconds) with fallback generation if needed

## User Preferences

Preferred communication style: Simple, everyday language. Plain, direct, no corporate jargon.

## System Architecture

### Frontend
- **Technology Stack:** React SPA with Vite, wouter for routing.
- **Design:** WSJ-inspired typography (Playfair Display, Source Serif 4) and overall aesthetic for a credible, professional feel.
- **Analytics:** PostHog for user tracking and funnel analysis (events include interview progress, payments, module completion, plan generation, and chat messages).
- **Core Pages:** Landing, Login, AI Interview, Payment Success, Coaching Modules, Progress, Coach Letter, Serious Plan, and Coach Chat.
- **Components:** Auth context provider (`useAuth.tsx`), UserMenu.
- **Styling:** Centralized `serious-people.css` for WSJ-inspired styles.
- **Interview Features:** Chat interface, server-side transcript storage, user menu, progress bar, module title cards, personalized paywall with AI-generated value bullets, two-step plan confirmation, Stripe checkout integration.

### Backend
- **Framework:** Express.js with TypeScript.
- **API Endpoints:**
    - Authentication (login, logout, magic link, Google OAuth).
    - Interview and Module conversation management.
    - Stripe integration (checkout, pricing, session verification).
    - Serious Plan initialization, artifact generation, PDF creation, and email delivery.
    - Coach chat message handling.
    - Transcript and module data persistence.
- **AI Integration:** Primarily uses Anthropic Claude Sonnet 4.5, with fallback to OpenAI GPT-4.1-mini. Utilizes specific tokens (e.g., `[[INTERVIEW_COMPLETE]]`, `[[VALUE_BULLETS]]`, `[[PLAN_CARD]]`) for structured AI responses and system control.
- **Testing Feature ("testskip"):** Typing "testskip" in the interview or any module causes the coach to fabricate plausible context, list the fabricated details, and complete the module normally. This allows rapid testing without manually completing conversations.
- **Data Storage:** PostgreSQL database.
    - **Tables:** `users`, `sessions`, `interview_transcripts`, `magic_link_tokens`, `serious_plans`, `serious_plan_artifacts`, `coach_chat_messages`.
    - **Storage Pattern:** Server-side persistence for all user and coaching data, ensuring cross-device and cross-session continuity.

### Authentication & Authorization
- **Methods:** Email magic link (via Resend) and Google OAuth2 (Passport.js).
- **Session Management:** Session-based authentication with `express-session` and `connect-pg-simple` for PostgreSQL storage, using httpOnly cookies.

## External Dependencies

-   **Payment Processing:** Stripe for dynamic pricing, checkout sessions, and discount pre-application.
-   **AI Models:** Anthropic Claude Sonnet 4.5 (primary) and OpenAI GPT-4.1-mini (fallback) for all AI-driven coaching interactions and content generation.
-   **Email Services:** Resend for sending magic links and inbound email webhooks.
-   **Analytics:** PostHog for user behavior tracking.
-   **PDF Generation:** Puppeteer for generating WSJ-styled PDFs of Serious Plan artifacts.

## Project Documentation

- **RETROSPECTIVE.md** - Comprehensive retrospective covering what went well, what didn't, instructions for future agents, bug prevention checklists, and design patterns. Essential reading before making significant changes.