# Lovable Design Handoff Pack
## Serious People - Career Coaching Application

---

## 1. Executive Summary

### What the App Is
Serious People is an AI-powered career coaching service designed to help executives and senior professionals navigate major career transitions. The platform guides users through a structured coaching experience: a free AI interview to understand their situation, a paid 3-module coaching curriculum, and a comprehensive "Serious Plan" with personalized artifacts.

**Target users:** VPs, Directors, Engineering Managers, Founders, and Ops Leaders facing career decisions like staying vs. leaving, handling burnout, dealing with bad managers, negotiating severance, or evaluating offers.

**Primary user journey:**
1. Land on marketing site (/)
2. Start free AI interview (login required)
3. Complete interview → see personalized coaching plan
4. Pay via Stripe checkout
5. Complete 3 coaching modules
6. Receive "Serious Plan" (artifacts, action plans, scripts)
7. Optional: Ongoing coach chat

### What "Design Overhaul" Means
**Scope:** Redesign the entire front-end visual layer while preserving:
- All functionality and user flows
- URL structures
- API contracts
- Authentication mechanisms
- Payment integration
- SEO page structure

**Goal:** Modernize the WSJ-inspired typography aesthetic, improve visual hierarchy, enhance mobile experience, and create a more polished, premium feel appropriate for executive-level users.

---

## 2. Tech Stack + Rendering Model

### Framework & Router
- **Framework:** React 18 SPA with Vite bundler
- **Router:** wouter (lightweight React router)
- **Base Path:** App supports both `/` and `/app/*` mounting
- **Rendering:** Client-side SPA (no SSR)

### Styling System
- **CSS:** Custom CSS in `client/src/styles/serious-people.css` (4,600+ lines)
- **Component Library:** shadcn/ui (Radix-based, in `client/src/components/ui/`)
- **Fonts:** 
  - Display: Playfair Display (Georgia fallback)
  - Body: Source Serif 4 (Georgia fallback)
- **Design tokens (CSS custom properties):**
```css
:root {
  --sp-bg: #faf9f6;
  --sp-text: #1a1a1a;
  --sp-text-secondary: #666;
  --sp-text-muted: #444;
  --sp-border: #d4d4d4;
  --sp-border-light: #e5e5e5;
  --sp-font-display: 'Playfair Display', Georgia, serif;
  --sp-font-body: 'Source Serif 4', Georgia, 'Times New Roman', serif;
}
```

### Frontend Boundary
- **UI (Frontend):** Everything in `client/src/`
- **Backend:** Express.js API in `server/`
- **Shared types:** `shared/schema.ts`

### Environment Variables (UI-affecting)
- `VITE_POSTHOG_KEY` - PostHog analytics key
- `VITE_` prefix required for client-side env vars

---

## 3. Navigation + Information Architecture

### Complete Sitemap

#### Public Marketing Routes (No Auth Required)

| Route | Page Purpose | Primary Components | Data Dependencies | Key States |
|-------|-------------|-------------------|-------------------|------------|
| `/` | Static marketing landing page | EJS template (logged-out) or redirect (logged-in) | Stripe pricing API | Default |
| `/guides` | SEO guides index | EJS template | Static markdown files | Default |
| `/guides/:slug` | Individual pillar pages (12 total) | EJS template | Markdown content | Default |
| `/resources` | Content hub linking all SEO | EJS template | Static | Default |
| `/roles` | Role index page | EJS template | Static JSON taxonomy | Default |
| `/roles/:role/situations/:situation` | Programmatic pages (50 total) | EJS template | Markdown modules | Default, noindex if <700 words |
| `/tools/stay-or-go-calculator` | Interactive quiz tool | EJS template | None | Quiz flow states |
| `/robots.txt` | Search engine rules | Text | None | N/A |
| `/sitemap.xml` | XML sitemap (67 URLs) | XML | All routes | N/A |

#### SPA Routes (React App at `/` or `/app/*`)

| Route | Auth Required | Page Purpose | Primary Components | Data Dependencies | Key States |
|-------|--------------|-------------|-------------------|-------------------|------------|
| `/` or `/app/` | No | React landing page | Landing.tsx | `/api/pricing` | Default, auth-check |
| `/login` | No | Login page | Login.tsx | `/auth/me` | Default, email-sent, error |
| `/prepare` | Yes | Pre-interview prep | Prepare.tsx | `/api/journey` | Default, redirect if progressed |
| `/interview` | Yes | AI coaching interview | Interview.tsx | `/api/transcript`, POST `/api/transcript` | Chat flow, typing, options, plan-reveal, paywall |
| `/offer` | Yes | Pricing/checkout page | Offer.tsx | `/api/pricing`, `/api/transcript` | Default, loading, checkout-loading |
| `/success` | Yes | Payment confirmation | Success.tsx | `/verify-session`, `/api/transcript` | Verifying, error, preparing, ready |
| `/module/:moduleNumber` | Yes (paid) | Coaching modules 1-3 | ModulePage.tsx | `/api/module/:n/data`, POST `/api/module` | Chat flow, typing, complete |
| `/progress` | Yes (paid) | Module progress tracker | Progress.tsx | `/api/modules/status`, `/api/transcript` | Loading, 0-3 modules complete |
| `/coach-letter` | Yes (paid) | Graduation letter interstitial | CoachLetter.tsx | `/api/serious-plan/letter` | Loading, generating, ready, error |
| `/serious-plan` | Yes (paid) | Final deliverables hub | SeriousPlan.tsx | `/api/serious-plan/latest` | Loading, generating, ready, artifact-view |
| `/coach-chat` | Yes (paid) | Ongoing AI chat | CoachChat.tsx | `/api/coach-chat/:id/messages` | Loading, empty, chat-flow |
| `/career-brief` | Yes | Legacy career brief generator | CareerBrief.tsx | POST `/generate` | Loading, ready, generating, results, error |

---

## 4. Design Inventory (Current UI Surface Audit)

### Layout Patterns

#### Landing Page (`/`)
- **Header:** Logo left, nav links (Guides, Resources, Log in) right
- **Hero:** Typewriter headline animation, subhead, CTA button
- **Sections:** Quotes, "What you'll get," "How it works" steps, FAQ accordion, testimonials
- **Footer:** Copyright, nav links

#### App Pages (logged-in)
- **Header:** Logo left, UserMenu component right
- **Content:** Centered container (max-width ~720px), card-based layouts
- **Footer:** Simple contact email link

#### Chat Pages (Interview, Modules)
- **Layout:** Full-height chat window, fixed input bar at bottom
- **Messages:** Left-aligned assistant, right-aligned user
- **Components:** Typing indicator, option buttons, progress bar, title cards

### Typography Hierarchy
```
Headline (h1): Playfair Display, 2.5-2.75rem, 700 weight
Section title (h2): Playfair Display, 1.5rem, 600 weight  
Body text: Source Serif 4, 1rem, 400 weight, line-height 1.6-1.7
Secondary text: Source Serif 4, 0.875rem, color #666
Labels: Source Serif 4, 0.75-0.8rem, uppercase, letter-spacing 0.1em
```

### Button Styles
```css
/* Primary CTA */
.sp-cta-button {
  background: #1a1a1a;
  color: #fff;
  padding: 0.875rem 2.5rem;
  border: 2px solid #1a1a1a;
}
.sp-cta-button:hover { background: #fff; color: #1a1a1a; }

/* Secondary/Ghost */
.sp-cta-secondary { background: transparent; border: 1px solid #d4d4d4; }

/* Google login button - white bg, shadowed */
.sp-login-google-button { background: white; border: 1px solid #d4d4d4; box-shadow }
```

### Form Patterns
- **Inputs:** Full-width, border-bottom style or bordered box
- **Labels:** Above input, 0.75rem uppercase
- **Validation:** Red text below input
- **Submit:** Full-width primary CTA

### Card Patterns
- **Interview plan card:** Border, rounded corners, module list
- **Offer page cards:** Icon + title + description grid
- **Serious Plan artifact cards:** Title, type badge, importance indicator, content preview

### Modal/Drawer Usage
- **FAQ Accordion:** Collapsible sections with +/- icons
- **UserMenu dropdown:** Simple dropdown on avatar click

### Alert/Toast Usage
- Uses shadcn Toaster component
- Error messages inline below forms

### Empty States
- "No serious plan yet" message with guidance
- "Complete modules to unlock" messaging

### Error States
- Red inline error messages
- "Something went wrong" fallback screens
- Retry buttons

### Loading States
- Text "Loading..." with centered container
- `.sp-spinner` CSS animation for generation states
- Skeleton cards for artifact loading
- Typing indicator (3 bouncing dots) for AI responses

---

## 5. Component Catalog

### Custom Components (`client/src/components/`)

| Component | File | Purpose | Props | Variants/States | Used In |
|-----------|------|---------|-------|-----------------|---------|
| UserMenu | UserMenu.tsx | User avatar dropdown with logout | None (uses useAuth) | Closed, open, typing animation | All authenticated pages |
| ChatComponents | ChatComponents.tsx | Message bubbles, typing indicators, options | Message, TypingIndicator, OptionsContainer, ModuleCompleteCard, PlanCardTeaser | user/assistant roles, animating | Interview, Module pages |
| ModulesProgressCard | ModulesProgressCard.tsx | Progress tracker showing 3 modules | currentModule, completedModules, title, ctaText, onCtaClick, customModules | 0-3 complete states | Progress, Success pages |

### shadcn/ui Components (`client/src/components/ui/`)

All standard shadcn components available:
- **Layout:** Card, Separator, Tabs
- **Forms:** Input, Textarea, Label, Form, Select, Checkbox, Radio
- **Feedback:** Toast, Alert, Progress, Skeleton
- **Overlays:** Dialog, Sheet, Dropdown, Popover, Tooltip
- **Data:** Table, Accordion, Collapsible
- **Navigation:** Button, Badge, Breadcrumb

### Design Tokens (CSS Custom Properties)

```css
/* Colors */
--sp-bg: #faf9f6          /* Page background */
--sp-text: #1a1a1a         /* Primary text */
--sp-text-secondary: #666  /* Secondary text */
--sp-text-muted: #444      /* Muted text */
--sp-border: #d4d4d4       /* Primary borders */
--sp-border-light: #e5e5e5 /* Light borders */
--sp-accent: #c41e3a       /* Accent/discount red */

/* Typography */
--sp-font-display: 'Playfair Display', Georgia, serif
--sp-font-body: 'Source Serif 4', Georgia, 'Times New Roman', serif

/* Spacing (common values used) */
0.25rem, 0.5rem, 0.75rem, 1rem, 1.5rem, 2rem, 2.5rem, 3rem

/* Breakpoints */
768px (mobile/tablet boundary)
1200px (max container width)
```

---

## 6. Auth + Logged-In Page Simulation Plan

### Auth Flow Screens

#### Login Page (`/login`)
**States:**
1. **Default:** Google button + email input form
2. **Email sent:** Success message with email address, "Use different email" link
3. **Error states:** google_auth_failed, expired_token, invalid_token, login_failed

**Visual elements:**
- Centered card on cream background
- Logo header linking to home
- Google OAuth button with icon
- "or" divider
- Email input with "Send login link" button
- Dev-only: Demo login button

#### Auth Logic
- Google OAuth: Redirects to `/auth/google`, returns to `/prepare`
- Magic link: POST `/auth/magic/start` → email sent → user clicks link → `/auth/magic/verify/:token` → redirects to `/prepare`
- Session: httpOnly cookie, persists across browser sessions

### Post-Login Home Route

Users land on `/prepare` after login, which:
- Shows 3 preparation tips
- "I'm ready, start the interview" CTA
- If user has progressed past interview, auto-redirects to current journey step

### Journey State Machine

```typescript
type JourneyStep = 
  | 'interview'    // Free AI interview
  | 'offer'        // Pricing page (interview complete)
  | 'module_1'     // Paid module 1
  | 'module_2'     // Paid module 2
  | 'module_3'     // Paid module 3
  | 'graduation'   // Coach letter interstitial
  | 'serious_plan' // Final deliverables

// State object
interface JourneyState {
  interviewComplete: boolean;
  paymentVerified: boolean;
  module1Complete: boolean;
  module2Complete: boolean;
  module3Complete: boolean;
  hasSeriousPlan: boolean;
}
```

### Logged-In Page State Snapshots

#### Interview Page (`/interview`)

**First-time user:**
```json
{
  "transcript": [],
  "progress": 0,
  "interviewComplete": false,
  "planCard": null
}
```

**Mid-interview user (assistant just asked a question):**
```json
{
  "transcript": [
    {"role": "assistant", "content": "Hi there. Before we dive in, what should I call you?"},
    {"role": "user", "content": "I'm Sarah"},
    {"role": "assistant", "content": "Nice to meet you, Sarah. Can you tell me briefly about your current role and company?"}
  ],
  "progress": 15,
  "options": null
}
```

**Interview complete (paywall shown):**
```json
{
  "transcript": [...20-30 messages...],
  "progress": 100,
  "interviewComplete": true,
  "planCard": {
    "name": "Sarah",
    "modules": [
      {"name": "Job Autopsy", "objective": "Understand what's driving your desire for change", "approach": "...", "outcome": "..."},
      {"name": "Fork in the Road", "objective": "Explore realistic options", "approach": "...", "outcome": "..."},
      {"name": "The Great Escape Plan", "objective": "Build a concrete action plan", "approach": "...", "outcome": "..."}
    ],
    "seriousPlanSummary": "Decision snapshot, conversation scripts, 60-day action plan, risk assessment",
    "plannedArtifacts": [...]
  },
  "valueBullets": "• Get unstuck from analysis paralysis\n• Know exactly what to say to your manager\n• Have a concrete plan instead of vague intentions"
}
```

#### Offer Page (`/offer`)

**Data shape:**
```json
{
  "planCard": { ... },
  "valueBullets": "...",
  "clientDossier": {
    "interviewAnalysis": {
      "clientName": "Sarah",
      "currentRole": "VP of Product",
      "company": "TechCorp",
      "situation": "Feeling burned out after 3 years...",
      "clientFacingSummary": "You're at a crossroads..."
    }
  }
}
```

**Pricing data:**
```json
{
  "originalPrice": 49,
  "discountedPrice": 19,
  "percentOff": 61,
  "currency": "usd"
}
```

#### Module Page (`/module/1`)

**Starting module:**
```json
{
  "transcript": [],
  "moduleComplete": false,
  "progress": 0,
  "moduleInfo": {
    "number": 1,
    "name": "Job Autopsy",
    "description": "Understand what's really driving your desire for change"
  }
}
```

**Module complete:**
```json
{
  "transcript": [...15-25 messages...],
  "moduleComplete": true,
  "summary": "We identified three core issues driving your dissatisfaction..."
}
```

#### Serious Plan Page (`/serious-plan`)

**Plan generating:**
```json
{
  "id": "plan-123",
  "status": "generating",
  "coachNoteContent": null,
  "artifacts": [
    {"artifactKey": "decision_snapshot", "title": "Decision Snapshot", "generationStatus": "generating"},
    {"artifactKey": "conversation_scripts", "title": "Conversation Scripts", "generationStatus": "pending"}
  ]
}
```

**Plan ready:**
```json
{
  "id": "plan-123",
  "status": "ready",
  "coachNoteContent": "Dear Sarah,\n\nOver the past three coaching sessions...",
  "summaryMetadata": {
    "clientName": "Sarah",
    "planHorizonType": "60_days",
    "primaryRecommendation": "Begin job search while negotiating internal transfer"
  },
  "artifacts": [
    {
      "id": "art-1",
      "artifactKey": "decision_snapshot",
      "title": "Decision Snapshot",
      "type": "snapshot",
      "importanceLevel": "must_read",
      "contentRaw": "## Your Situation\n\nAfter 3 years as VP of Product...",
      "generationStatus": "complete"
    },
    ...
  ]
}
```

### Role-Based UI Differences
- No role-based differences currently
- All authenticated users have same access level
- Journey state controls feature access (paid vs. unpaid)

---

## 7. Data Contract: Frontend ↔ API

### Authentication Endpoints

| Method | Path | Auth | Request | Response |
|--------|------|------|---------|----------|
| GET | `/auth/me` | No | - | `{ authenticated: boolean, user: { id, email, name, providedName } \| null }` |
| POST | `/auth/logout` | Yes | - | `{ success: true }` |
| POST | `/auth/magic/start` | No | `{ email, promoCode?, basePath? }` | `{ success: true }` |
| GET | `/auth/magic/verify/:token` | No | - | Redirect to `/prepare` or `/login?error=...` |
| GET | `/auth/google` | No | Query: `?promo=...&basePath=...` | Redirect to Google OAuth |
| GET | `/auth/google/callback` | No | - | Redirect to `/prepare` |
| POST | `/auth/demo` | No (dev only) | - | `{ success: true }` |

### Pricing & Payment

| Method | Path | Auth | Request | Response |
|--------|------|------|---------|----------|
| GET | `/api/pricing` | No | - | `{ originalPrice, discountedPrice, percentOff, amountOff, currency }` |
| POST | `/create-checkout` | Yes | - | `{ url: string }` (Stripe checkout URL) |
| GET | `/verify-session` | Yes | Query: `?session_id=...` | `{ success: true }` or `{ error: string }` |

### Journey & Transcript

| Method | Path | Auth | Request | Response |
|--------|------|------|---------|----------|
| GET | `/api/journey` | Yes | - | `{ step, interviewComplete, paymentVerified, module1Complete, module2Complete, module3Complete, hasSeriousPlan }` |
| GET | `/api/transcript` | Yes | - | `{ transcript, planCard, valueBullets, clientDossier, interviewComplete, ... }` |
| POST | `/api/transcript` | Yes | `{ message, transcript }` | `{ reply, done, progress?, options?, valueBullets?, planCard? }` |
| POST | `/api/interview/complete` | Yes | - | `{ success: true }` |

### Modules

| Method | Path | Auth | Request | Response |
|--------|------|------|---------|----------|
| GET | `/api/module/:n/data` | Yes | - | `{ transcript, complete, summary }` |
| POST | `/api/module/:n/data` | Yes | `{ transcript }` | `{ success: true }` |
| POST | `/api/module` | Yes | `{ moduleNumber, message, transcript }` | `{ reply, done, progress?, options?, summary? }` |
| GET | `/api/modules/status` | Yes | - | `{ modules: [{ number, complete }] }` |

### Serious Plan

| Method | Path | Auth | Request | Response |
|--------|------|------|---------|----------|
| POST | `/api/serious-plan` | Yes | - | `{ id, status }` (triggers generation) |
| GET | `/api/serious-plan/latest` | Yes | - | Full plan with artifacts |
| GET | `/api/serious-plan/:id` | Yes | - | Full plan with artifacts |
| GET | `/api/serious-plan/letter` | Yes | - | `{ status, content, seenAt }` |
| POST | `/api/serious-plan/letter/seen` | Yes | - | `{ success: true }` |

### Coach Chat

| Method | Path | Auth | Request | Response |
|--------|------|------|---------|----------|
| GET | `/api/coach-chat/:planId/messages` | Yes | - | `[{ id, role, content, createdAt }]` |
| POST | `/api/coach-chat/:planId/message` | Yes | `{ message }` | `{ id, role, content, createdAt }` |

### Client-Side Caching

Uses TanStack Query (React Query v5):
- `staleTime`: Varies (0 for auth, 60000 for pricing)
- Query keys: Array-based for cache invalidation
- Pattern: `['/api/path', param1, param2]`

---

## 8. SEO + Programmatic Content Requirements

### How SEO Pages Are Generated

- **Renderer:** EJS templates in `seo/templates/`
- **Content source:** Markdown files with YAML frontmatter in `seo/content/`
- **Route handling:** Express routes in `server/seoController.ts`
- **Rendering:** Server-side (not part of React SPA)

### Indexable Pages

| Page Type | Count | Pattern | Canonical |
|-----------|-------|---------|-----------|
| Landing | 1 | `/` | Yes |
| Guides index | 1 | `/guides` | Yes |
| Pillar pages | 12 | `/guides/:slug` | Yes |
| Resources hub | 1 | `/resources` | Yes |
| Roles index | 1 | `/roles` | Yes |
| Programmatic pages | 50 | `/roles/:role/situations/:situation` | Yes, noindex if <700 words |
| Tools | 1 | `/tools/stay-or-go-calculator` | Yes |

**Total indexable:** 67 pages

### Metadata Strategy

**Title format:** `{Page Title} | Serious People`

**Meta description:** 
- Pillar pages: From frontmatter `description`
- Programmatic pages: Auto-generated from role + situation

**Open Graph tags:** All pages include og:title, og:description, og:image, og:url, og:type

**Code location:** 
- Layout template: `seo/templates/layout.ejs`
- Controller: `server/seoController.ts`

### Sitemap Generation

- Route: `/sitemap.xml`
- Generated dynamically from taxonomy JSON + pillar list
- Updates automatically when content changes

### Robots Rules

```
# /robots.txt
User-agent: *
Allow: /
Disallow: /api/
Disallow: /auth/
Sitemap: https://seriouspeople.com/sitemap.xml
```

### Structured Data (JSON-LD)

- **Article schema:** Pillar and programmatic pages
- **WebPage schema:** Tools/interactive pages
- **Organization schema:** All pages (in layout)

### Internal Linking Patterns

- **Pillar pages:** Link to related guides + matched programmatic pages
- **Programmatic pages:** Link to related pillars + adjacent role/situation pages
- **Topic clusters:** decision, exit, job-search, internal, survival

---

## 9. Copy + Content Map

### Major Copy Blocks

| Block | Location | Source | Editable? |
|-------|----------|--------|-----------|
| Landing hero headline | landing.tsx, landing.ejs | Hardcoded | Yes |
| Landing typewriter phrases | landing.tsx, landing.ejs | Hardcoded array | Yes |
| Value propositions | landing.tsx, landing.ejs | Hardcoded | Yes |
| FAQ items | offer.tsx, landing.ejs | Hardcoded array | Yes |
| Module names/descriptions | Multiple | planCard from AI or defaults | AI-generated |
| Serious Plan artifacts | serious-plan.tsx | Generated by AI | AI-generated |
| SEO pillar content | seo/content/pillars/*.md | Markdown files | Yes |
| SEO programmatic content | seo/content/programmatic/*.md | Markdown files | Yes |

### Content Constraints

**Must keep exact wording:**
- Pricing display format
- Stripe checkout flow
- Error messages (for debugging)

**AI-generated (do not edit):**
- Plan card content
- Value bullets
- Module customizations
- Serious Plan artifacts
- Coach letter

---

## 10. Analytics + Tracking Hooks

### PostHog Integration

**Client-side:** `client/src/lib/posthog.ts`
**SEO pages:** Inline script in EJS templates

### Events Tracked

```typescript
// Interview funnel
'interview_started'
'interview_message_sent'  
'interview_completed'

// Payment funnel
'checkout_started'
'payment_completed'

// Module progress
'module_started' { module_number }
'module_message_sent' { module_number }
'module_completed' { module_number }

// Plan generation
'serious_plan_generated'

// Engagement
'coach_chat_message_sent'

// SEO (inline scripts)
'seo_page_view' { page_type, page_slug, page_title }
'seo_cta_click'
'seo_scroll_depth' { depth_percent }
```

### Data Attributes for Tracking

All interactive elements have `data-testid` attributes:
```
button-submit, button-google-login, button-send-magic-link
input-email, input-message
link-home, link-login, link-continue
text-username, text-price
```

### A/B Testing

None currently implemented. PostHog feature flags available if needed.

---

## 11. Accessibility + Responsiveness

### Current Breakpoints

```css
/* Mobile-first, single breakpoint */
@media (max-width: 768px) { ... }
@media (min-width: 768px) { ... }
```

### Responsive Patterns

- **Mobile:** Single column, full-width inputs, stacked layouts
- **Desktop:** Centered container (720px max), side-by-side elements in some sections
- **Chat:** Full-height viewport, fixed input bar

### A11y Constraints

- **Keyboard nav:** Standard tab order, escape to close menus
- **Focus states:** Browser defaults + custom focus rings on inputs
- **Color contrast:** High contrast (dark text on cream background)
- **Semantic structure:** Proper heading hierarchy (h1 > h2 > h3)

### Required Semantic Structure

```html
<header> - Page header with logo + nav
<main> - Primary content
<nav> - Navigation menus
<article> - SEO content pages
<footer> - Page footer
```

---

## 12. Non-Goals + "Do Not Break" List

### URLs Must Remain Stable
- All `/guides/:slug` URLs
- All `/roles/:role/situations/:situation` URLs  
- `/tools/stay-or-go-calculator`
- `/app/*` routes for logged-in users
- `/sitemap.xml` and `/robots.txt`

### Auth/Session Must Keep Working
- Google OAuth flow (`/auth/google`)
- Magic link flow (`/auth/magic/*`)
- Session cookie (`connect.sid`)
- Base path preservation in redirects

### Payments Must Keep Working
- Stripe checkout redirect
- Success page verification (`/verify-session`)
- Pricing API (`/api/pricing`)
- Discount/promo code handling

### Fragile Integration Points
- PostHog analytics (must preserve event names)
- Stripe webhook handling (backend only)
- AI response parsing (special tokens like `[[INTERVIEW_COMPLETE]]`)

---

## 13. "Lovable-Ready" Design Brief

### Desired Vibe
- **Premium, trustworthy, sophisticated**
- **WSJ/editorial aesthetic** (newspaper-inspired)
- **Calm, confident, professional**
- **Not flashy, not startup-y**
- **Feels like hiring a real executive coach**

### Visual References
[Provide 3-5 links to sites with similar aesthetic:]
- [WSJ.com articles]
- [McKinsey Insights]
- [The Economist]
- [High-end law firm websites]
- [Executive coaching services]

### Layout Principles
1. Generous white space
2. Centered, narrow content columns (600-720px max)
3. Clear visual hierarchy through typography, not color
4. Minimal use of color (cream background, near-black text)
5. Card-based sections with subtle borders

### Component Principles
1. Buttons: Solid primary (dark bg), ghost secondary (outlined)
2. Inputs: Minimal styling, border-bottom or light border
3. Cards: Light borders, no shadows
4. Typography does the heavy lifting

### Motion/Interaction Principles
1. Subtle hover states (color transitions, not transforms)
2. Typewriter animation for dynamic text
3. Fade-in animations for new content
4. Chat typing indicator (3 bouncing dots)
5. No aggressive animations or transitions

### What to Standardize
1. Button styles (primary, secondary, ghost, icon)
2. Form inputs (text, email, textarea)
3. Card layouts (content, pricing, artifact)
4. Chat message bubbles
5. Loading states (spinner, skeleton)
6. Error states

### Top 10 UI Problems to Improve

1. **Mobile chat experience** - Input bar overlaps content, keyboard handling is janky
2. **Landing page hierarchy** - Too many sections, unclear visual priority
3. **Offer page density** - Information overload, needs better chunking
4. **Progress indicators** - Module progress cards could be more engaging
5. **Serious Plan navigation** - Tab between artifacts feels basic
6. **Empty states** - Generic "no data" messages need personality
7. **Loading states** - Inconsistent (text vs spinner vs skeleton)
8. **Form validation** - Error messages lack personality
9. **SEO page design** - Functional but visually plain
10. **Dark mode** - Not implemented, could benefit users

---

## 14. Appendix

### File Tree Snippets

#### `/client/src/pages/`
```
career-brief.tsx    # Legacy brief generator
coach-chat.tsx      # Post-graduation chat
coach-letter.tsx    # Graduation letter interstitial
interview.tsx       # Main AI interview (free)
landing.tsx         # React landing page
login.tsx           # Login/auth page
module.tsx          # Paid coaching modules
not-found.tsx       # 404 page
offer.tsx           # Pricing/checkout page
prepare.tsx         # Pre-interview prep
progress.tsx        # Module progress tracker
serious-plan.tsx    # Final deliverables
success.tsx         # Payment confirmation
```

#### `/client/src/components/`
```
ui/                 # shadcn components (40+ files)
ChatComponents.tsx  # Message bubbles, typing, options
ModulesProgressCard.tsx  # 3-module progress display
UserMenu.tsx        # User avatar dropdown
```

#### `/client/src/styles/`
```
serious-people.css  # All custom styles (4,600+ lines)
```

#### `/seo/`
```
content/
  modules/          # Reusable content blocks (10 files)
  pillars/          # Guide content (12 files)
  programmatic/     # Role+situation content
    frameworks/     # Decision frameworks
    mistakes/       # Common mistakes by role
    vignettes/      # Story examples
    walkaway/       # When to leave content
taxonomy/
  pages.json        # Page definitions
  taxonomy.json     # Role/situation taxonomy
templates/
  landing.ejs       # Static marketing landing
  layout.ejs        # SEO page layout
  pillar.ejs        # Guide page template
  programmatic.ejs  # Role+situation template
  stay-or-go-calculator.ejs  # Interactive tool
```

#### `/public/`
```
favicon.png         # Site icon
logo.png            # OG image fallback
googleddd96194d9048549.html  # Google verification
```

### Routing Logic (`client/src/App.tsx`)

```typescript
// Base path detection for /app mount
function getBasePath(): string {
  if (typeof window !== "undefined" && window.location.pathname.startsWith("/app")) {
    return "/app";
  }
  return "";
}

// Routes (same for / and /app/)
<Switch>
  <Route path="/" component={Landing} />
  <Route path="/login" component={Login} />
  <Route path="/prepare" component={Prepare} />
  <Route path="/interview" component={Interview} />
  <Route path="/offer" component={Offer} />
  <Route path="/success" component={Success} />
  <Route path="/module/:moduleNumber" component={ModulePage} />
  <Route path="/progress" component={Progress} />
  <Route path="/career-brief" component={CareerBrief} />
  <Route path="/serious-plan" component={SeriousPlan} />
  <Route path="/coach-chat" component={CoachChat} />
  <Route path="/coach-letter" component={CoachLetter} />
  <Route component={NotFound} />
</Switch>
```

### Key Data Shapes

#### User Object
```typescript
interface User {
  id: string;
  email: string | null;
  name: string | null;
  providedName: string | null;  // Name from interview
}
```

#### Journey State
```typescript
interface JourneyState {
  interviewComplete: boolean;
  paymentVerified: boolean;
  module1Complete: boolean;
  module2Complete: boolean;
  module3Complete: boolean;
  hasSeriousPlan: boolean;
}
```

#### Coaching Plan
```typescript
interface CoachingPlan {
  name: string;  // Client's name
  modules: {
    name: string;
    objective: string;
    approach: string;
    outcome: string;
  }[];
  seriousPlanSummary: string;
  plannedArtifacts: {
    key: string;
    title: string;
    type: string;
    description: string;
    importance: 'must_read' | 'recommended' | 'optional' | 'bonus';
  }[];
}
```

### TODOs/Placeholders Found

1. Career Brief page (`/career-brief`) - appears to be legacy/unused
2. No dark mode implementation
3. No mobile-specific navigation (hamburger menu)
4. Second tool page under `/tools` was planned but not built
5. `/lp/*` landing pages for paid ads were planned but not built

---

*Document generated for Lovable design handoff. Last updated: December 2024.*
