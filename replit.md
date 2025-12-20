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
- **SEO Engine:** Separate EJS templated site for crawlable HTML pages, using Markdown with YAML frontmatter for content. Shares design tokens with the React SPA via `public/seo.css` which mirrors `client/src/index.css` tokens exactly. CSS architecture uses `.sp-container` for horizontal padding (24px mobile, 32px tablet+) and `.sp-section` for vertical-only padding to avoid conflicts.

### CSS Parity Rules (SEO ↔ SPA)
When maintaining visual parity between SEO pages (EJS + seo.css) and React SPA (Tailwind + index.css):

1. **Trace Actual Values, Not Names:** Don't assume semantic class names match. Trace exact Tailwind utility values (`h-12` = 48px, `px-8` = 32px) and use those exact values in seo.css.

2. **Variable Names AND Values:** Both `index.css` and `seo.css` must have identical variable names (unprefixed for Tailwind: `--terracotta`, `--sage-wash`) AND identical HSL values.

3. **Height vs Padding:** React buttons use height-based sizing (`h-12`) with flexbox centering. SEO CSS must use `height: 3rem` not `padding: 0.875rem 2rem` - vertical padding creates taller elements.

4. **Font Weights:** All display typography using `var(--sp-display)` must use `font-weight: 500` per the design system.

5. **No Duplicates:** Keep one definition per selector. Duplicate rules create override conflicts and maintenance drift.

6. **Test Computed Values:** Use Playwright to measure actual rendered dimensions (height, padding, font-size) on both SEO and SPA pages to verify parity.

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

### Event-Driven UI Architecture

The interview chat uses an **app_events** table to stream structured UI events to the frontend, enabling rich interactive elements beyond plain text messages.

**Core Concepts:**
- **Event Types:** `chat.title_card_added`, `chat.section_header_added`, `chat.structured_outcomes_added`, `chat.outcome_selected`, `user.provided_name_set`, `chat.final_next_steps_added`
- **afterMessageIndex:** Each event specifies where it should appear in the chat timeline (after which message index)
- **Tool-Based Approach:** LLM uses tools (`append_title_card`, `append_section_header`, `append_structured_outcomes`, `set_provided_name`, `finalize_interview`) to inject UI elements rather than embedding tokens in text

**Dev Tools:**
- Development-only endpoints under `/api/dev/interview/*` (returns 404 in production)
- Endpoints: `inject-outcomes`, `select-outcome`, `finalize` for testing the event lifecycle
- Gated by `requireDevTools` middleware

**Smoke Test:**
- Location: `scripts/smoke-interview-chat.mjs`
- Run: `node scripts/smoke-interview-chat.mjs`
- Coverage: 15 checks including name capture, structured outcomes lifecycle, finalization, and artifact generation
- Strict mode: Test fails (not warns) when expected events are missing

**Legacy Token Parsing:**
- Some output tokens (`[[PROGRESS]]`, `[[PLAN_CARD]]`, `[[VALUE_BULLETS]]`, `[[SOCIAL_PROOF]]`, `[[INTERVIEW_COMPLETE]]`) are still parsed for backwards compatibility
- Located in isolated block in `server/routes.ts` with TODO comments for migration
- `[[OPTIONS]]` replaced by `append_structured_outcomes` tool (fallback parsing still exists)

## External Dependencies

-   **Payment Processing:** Stripe for dynamic pricing, checkout sessions, and discount application.
-   **AI Models:** Anthropic Claude Sonnet 4.5 and OpenAI GPT-4.1-mini for AI-driven coaching and content generation.
-   **Email Services:** Resend for sending magic links and handling inbound email webhooks.
-   **Analytics:** PostHog for user behavior tracking across both the React SPA and SEO pages.
-   **PDF Generation:** Puppeteer for creating WSJ-styled PDFs of Serious Plan artifacts.

## Recent Changes

- **Dec 19, 2025:** Fixed mobile horizontal overflow on SEO landing page by hiding `.sp-situation-hover` on mobile viewports. Fixed quote centering with explicit `text-align: center` on blockquote/cite elements.