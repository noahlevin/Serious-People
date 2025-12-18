# Serious People - Career Coaching

## Overview

Serious People is a career coaching service designed to guide users through career transitions with a professional, structured, and AI-powered approach. The platform provides user authentication, a free introductory phase, a dynamically priced 3-module coaching plan, and a final "Serious Plan" with AI-generated artifacts.

**Key Capabilities:**
- User authentication (magic link or Google OAuth).
- Free intro and personalized 3-module plan proposal.
- Dynamic Stripe pricing.
- Three core coaching modules: Job Autopsy, Fork in the Road, The Great Escape Plan.
- AI-generated "Serious Plan" artifacts (e.g., coach graduation note, decision snapshot, action plan) delivered as a PDF via email.
- Persistent coach chat functionality.

## User Preferences

Preferred communication style: Simple, everyday language. Plain, direct, no corporate jargon.

## System Architecture

### UI/UX Decisions
- **Frontend:** React SPA with Vite, using wouter for routing.
- **Design Aesthetic:** WSJ-inspired typography (Playfair Display, Source Serif 4) and overall aesthetic for a credible, professional feel.
- **Styling:** Centralized `serious-people.css` for consistent WSJ-inspired styles.
- **SEO Engine:** Separate EJS templated site for crawlable HTML pages, using Markdown with YAML frontmatter for content. Shares header/footer partials and design tokens with the React SPA for consistency.

### Technical Implementations
- **Backend:** Express.js with TypeScript.
- **AI Integration:** Primarily uses Anthropic Claude Sonnet 4.5, with fallback to OpenAI GPT-4.1-mini, utilizing specific tokens for structured responses.
- **Authentication:** Email magic link (via Resend) and Google OAuth2 (Passport.js) with session-based authentication using `express-session` and `connect-pg-simple`.
- **Data Storage:** PostgreSQL database for all user and coaching data.
- **Serious Plan Generation:** Artifacts are generated in parallel upon Module 3 completion, with initial placeholders and asynchronous background processing. Client dossiers are generated during the interview using a non-blocking architecture.

### Feature Specifications
- **Coaching Modules:** Structured progression through Job Autopsy, Fork in the Road, and The Great Escape Plan.
- **Serious Plan Artifacts:** AI-generated documents forming a comprehensive career plan.
- **SEO Content:** Guides, role-specific advice, and interactive tools served via an SEO engine with structured data, Open Graph, and cross-linking.

### System Design Choices
- **Non-blocking architecture** for dossier generation to ensure immediate data persistence.
- **In-memory locking** for dossier generation to prevent duplicates.
- **Testskip feature** for rapid testing of modules.
- **SPA at `/app`:** React SPA served at `/app` with preserved session handling.
- **Marketing Site at Root:** Static EJS landing page at `/` for logged-out users, redirecting logged-in users to their journey within `/app`.

## External Dependencies

-   **Payment Processing:** Stripe for dynamic pricing, checkout sessions, and discount application.
-   **AI Models:** Anthropic Claude Sonnet 4.5 and OpenAI GPT-4.1-mini for AI-driven coaching and content generation.
-   **Email Services:** Resend for sending magic links and handling inbound email webhooks.
-   **Analytics:** PostHog for user behavior tracking across both the React SPA and SEO pages.
-   **PDF Generation:** Puppeteer for creating WSJ-styled PDFs of Serious Plan artifacts.