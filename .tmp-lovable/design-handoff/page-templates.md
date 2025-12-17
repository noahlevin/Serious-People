# Page Templates

> Detailed specifications for each page type, including layout structure, component usage, responsive behavior, and animation sequences.

---

## Table of Contents

1. [Homepage](#homepage)
2. [How It Works](#how-it-works)
3. [Login Page](#login-page)
4. [Interview Introduction](#interview-introduction)
5. [Interview Chat](#interview-chat)
6. [Prepare Page](#prepare-page)
7. [Module Wrap-Up](#module-wrap-up)
8. [Artifacts Hub](#artifacts-hub)
9. [Resources Hub](#resources-hub)
10. [Guide Detail](#guide-detail)
11. [Role/Situation Page](#rolesituation-page)
12. [Stay or Go Calculator](#stay-or-go-calculator)

---

## Homepage

### Route
`/`

### Purpose
Primary landing page for new visitors. Establishes credibility, explains the service, and drives users to begin the interview.

### Layout Structure

```
┌─────────────────────────────────────────────────────┐
│  HEADER (sticky)                                     │
│  [Logo]                    [Nav Links]    [CTA]     │
├─────────────────────────────────────────────────────┤
│                                                      │
│  HERO SECTION                                        │
│  ┌─────────────────┐  ┌─────────────────────────┐   │
│  │ Decorative      │  │ Headline (Playfair)     │   │
│  │ Shapes (SVG)    │  │ Subheadline             │   │
│  │                 │  │ [Primary CTA]           │   │
│  └─────────────────┘  │ Trust signals           │   │
│                       └─────────────────────────┘   │
│                                                      │
├─────────────────────────────────────────────────────┤
│                                                      │
│  SITUATIONS SECTION                                  │
│  Section headline                                    │
│  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐                    │
│  │Card │ │Card │ │Card │ │Card │  (4 situation     │
│  │     │ │     │ │     │ │     │   cards)          │
│  └─────┘ └─────┘ └─────┘ └─────┘                    │
│                                                      │
├─────────────────────────────────────────────────────┤
│                                                      │
│  PROCESS SECTION                                     │
│  ┌─────────────────────────────────────────────┐    │
│  │  1. Interview  →  2. Insights  →  3. Plan   │    │
│  │  (with animated connecting line)            │    │
│  └─────────────────────────────────────────────┘    │
│                                                      │
├─────────────────────────────────────────────────────┤
│                                                      │
│  TESTIMONIALS SECTION                                │
│  Quote cards in horizontal scroll or grid           │
│                                                      │
├─────────────────────────────────────────────────────┤
│                                                      │
│  FINAL CTA SECTION                                   │
│  Headline + Button                                   │
│                                                      │
├─────────────────────────────────────────────────────┤
│  FOOTER                                              │
│  Links | Copyright                                   │
└─────────────────────────────────────────────────────┘
```

### Key Components

**Header:**
```tsx
<header className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border/30">
  <div className="container flex items-center justify-between h-16">
    <Link to="/" className="font-serif text-xl font-semibold">
      Serious People
    </Link>
    <nav className="hidden md:flex items-center gap-8">
      <NavLink to="/how-it-works">How It Works</NavLink>
      <NavLink to="/resources">Resources</NavLink>
    </nav>
    <Button asChild>
      <Link to="/interview">Get Started</Link>
    </Button>
  </div>
</header>
```

**Hero Section:**
- Two-column layout on desktop (decorative left, content right)
- Single column on mobile (content only, shapes hidden)
- Headline in Playfair Display, 48-72px responsive
- Subheadline in Inter, muted color
- Primary CTA button
- Trust signals (time estimate, privacy indicator)

**Situation Cards:**
- 4-column grid on desktop, 2-column on tablet, 1-column on mobile
- Each card links to `/roles/:role/:situation`
- Custom SVG illustration per situation
- Hover effect: subtle border color shift, slight lift

### Animations

1. **Hero entrance**: Fade-in-up with 0.6s delay stagger
2. **Decorative shapes**: Gentle floating animation (6-8s cycle)
3. **Section reveals**: Scroll-triggered fade-in-up
4. **Process line**: SVG draw animation on scroll

### Responsive Behavior

| Breakpoint | Layout Changes |
|------------|----------------|
| Mobile (<768px) | Single column, hide decorative elements, stack cards |
| Tablet (768-1024px) | Two-column grids, reduced padding |
| Desktop (>1024px) | Full layout with all decorative elements |

---

## How It Works

### Route
`/how-it-works`

### Purpose
Detailed explanation of the interview and coaching process.

### Layout Structure

```
┌─────────────────────────────────────────────────────┐
│  HEADER                                              │
├─────────────────────────────────────────────────────┤
│                                                      │
│  HERO                                                │
│  "How Serious People Works"                          │
│  Subheadline explaining the process                  │
│                                                      │
├─────────────────────────────────────────────────────┤
│                                                      │
│  STEP 1: THE INTERVIEW                               │
│  ┌─────────────┬────────────────────────────────┐   │
│  │ Illustration│  Content explaining step       │   │
│  └─────────────┴────────────────────────────────┘   │
│                                                      │
├─────────────────────────────────────────────────────┤
│                                                      │
│  STEP 2: YOUR INSIGHTS                               │
│  ┌────────────────────────────────┬─────────────┐   │
│  │  Content explaining step       │ Illustration│   │
│  └────────────────────────────────┴─────────────┘   │
│                                                      │
├─────────────────────────────────────────────────────┤
│                                                      │
│  STEP 3: PERSONALIZED PLAN                           │
│  (alternating layout continues)                     │
│                                                      │
├─────────────────────────────────────────────────────┤
│                                                      │
│  FAQ SECTION                                         │
│  Accordion of common questions                      │
│                                                      │
├─────────────────────────────────────────────────────┤
│                                                      │
│  FINAL CTA                                           │
│                                                      │
├─────────────────────────────────────────────────────┤
│  FOOTER                                              │
└─────────────────────────────────────────────────────┘
```

### Key Patterns

- **Alternating layout**: Image-left/text-right, then text-left/image-right
- **Numbered steps**: Large serif numbers as decorative elements
- **Connecting elements**: Subtle lines or shapes between sections

---

## Login Page

### Route
`/app/login`

### Purpose
Unified login/signup page with multiple auth methods.

### Layout Structure

```
┌─────────────────────────────────────────────────────┐
│  HEADER (minimal)                                    │
│  [Logo]                                             │
├─────────────────────────────────────────────────────┤
│                                                      │
│  ┌─────────────────────┬───────────────────────┐    │
│  │                     │                       │    │
│  │  VALUE PROP         │   AUTH FORM           │    │
│  │  (left side)        │   (right side)        │    │
│  │                     │                       │    │
│  │  - Headline         │   "Sign in or         │    │
│  │  - Brief copy       │    create account"    │    │
│  │  - Trust signals    │                       │    │
│  │                     │   [Google Button]     │    │
│  │                     │   ─── or ───          │    │
│  │                     │   [Email input]       │    │
│  │                     │   [Continue button]   │    │
│  │                     │                       │    │
│  └─────────────────────┴───────────────────────┘    │
│                                                      │
└─────────────────────────────────────────────────────┘
```

### States

1. **Default**: Shows auth form
2. **Email sent**: Shows "Check your inbox" confirmation

### Key Components

```tsx
// Google OAuth Button
<Button variant="outline" className="w-full gap-2" onClick={handleGoogleLogin}>
  <GoogleIcon className="w-5 h-5" />
  Continue with Google
</Button>

// Divider
<div className="flex items-center gap-4 my-6">
  <div className="flex-1 h-px bg-border" />
  <span className="text-xs text-muted-foreground">or</span>
  <div className="flex-1 h-px bg-border" />
</div>

// Magic link input
<form onSubmit={handleSubmit}>
  <Input 
    type="email" 
    placeholder="Enter your email"
    value={email}
    onChange={(e) => setEmail(e.target.value)}
  />
  <Button type="submit" className="w-full mt-3">
    Continue with Email
  </Button>
</form>
```

---

## Interview Introduction

### Route
`/interview`

### Purpose
Pre-interview screen that sets expectations before the chat begins.

### Layout Structure

```
┌─────────────────────────────────────────────────────┐
│  HEADER                                              │
│  [Logo]                              [Step 1 of 3]  │
├─────────────────────────────────────────────────────┤
│                                                      │
│  ┌─────────────────────────────────────────────┐    │
│  │                                             │    │
│  │  HERO                                       │    │
│  │  "Let's understand your situation"          │    │
│  │                                             │    │
│  │  Brief explanation of what will happen      │    │
│  │                                             │    │
│  └─────────────────────────────────────────────┘    │
│                                                      │
│  WHAT TO EXPECT                                      │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐    │
│  │ Icon    │ │ Icon    │ │ Icon    │ │ Icon    │    │
│  │ Title   │ │ Title   │ │ Title   │ │ Title   │    │
│  │ Desc    │ │ Desc    │ │ Desc    │ │ Desc    │    │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘    │
│                                                      │
│  ┌─────────────────────────────────────────────┐    │
│  │           [Begin Interview Button]          │    │
│  └─────────────────────────────────────────────┘    │
│                                                      │
│  "← Back to home"                                   │
│                                                      │
└─────────────────────────────────────────────────────┘
```

### Expectations Grid

```tsx
const expectations = [
  {
    icon: <Clock className="w-6 h-6" />,
    title: "15 minutes",
    description: "A focused conversation about your career situation"
  },
  {
    icon: <MessageCircle className="w-6 h-6" />,
    title: "Conversational",
    description: "Just answer naturally—no right or wrong responses"
  },
  {
    icon: <Lock className="w-6 h-6" />,
    title: "Private",
    description: "Your responses are confidential and secure"
  },
  {
    icon: <Sparkles className="w-6 h-6" />,
    title: "AI-powered",
    description: "Get personalized insights based on your answers"
  }
];
```

---

## Interview Chat

### Route
`/interview/chat`

### Purpose
The core interview experience—conversational AI interface.

### Layout Structure

```
┌─────────────────────────────────────────────────────┐
│  HEADER (fixed)                                      │
│  [← Exit]         Interview          [Step 2 of 3]  │
├─────────────────────────────────────────────────────┤
│  PROGRESS BAR                                        │
│  [Situation] [Challenges] [Goals] [Review]          │
│  ████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░            │
├─────────────────────────────────────────────────────┤
│                                                      │
│  CHAT MESSAGES (scrollable)                          │
│                                                      │
│  ┌─────────────────────────────────┐                │
│  │  WelcomeCard                    │                │
│  └─────────────────────────────────┘                │
│                                                      │
│        ┌─────────────────────────────────┐          │
│        │  AI Message                     │          │
│        └─────────────────────────────────┘          │
│                                                      │
│                    ┌─────────────────────┐          │
│                    │  User Message       │          │
│                    └─────────────────────┘          │
│                                                      │
│  ─────── Section: Challenges ───────                │
│                                                      │
│        ┌─────────────────────────────────┐          │
│        │  AI Message                     │          │
│        └─────────────────────────────────┘          │
│                                                      │
│                                                      │
├─────────────────────────────────────────────────────┤
│  CHAT INPUT (fixed bottom)                           │
│  [                                    ] [Send]      │
└─────────────────────────────────────────────────────┘
```

### Key Behaviors

1. **Auto-scroll**: Chat scrolls to bottom on new messages
2. **Typing indicator**: Three dots pulse animation
3. **Section dividers**: Inserted between interview sections
4. **Completion state**: Shows upsell card after final question

### Typing Indicator

```tsx
<div className="flex gap-1 px-4 py-3 bg-sage-wash rounded-2xl rounded-bl-md w-fit">
  <span className="w-2 h-2 bg-primary/40 rounded-full animate-pulse-dot" />
  <span className="w-2 h-2 bg-primary/40 rounded-full animate-pulse-dot [animation-delay:0.2s]" />
  <span className="w-2 h-2 bg-primary/40 rounded-full animate-pulse-dot [animation-delay:0.4s]" />
</div>
```

---

## Prepare Page

### Route
`/prepare`

### Purpose
Alternative interview preparation screen with more detail.

### Layout
Two-column layout:
- Left: Instructions and expectations
- Right: Quote and metadata

---

## Module Wrap-Up

### Route
`/app/module-wrap-up`

### Purpose
Summary screen shown after completing a coaching module.

### Layout Structure

```
┌─────────────────────────────────────────────────────┐
│  HEADER                                              │
├─────────────────────────────────────────────────────┤
│                                                      │
│  ┌─────────────────────────────────────────────┐    │
│  │  MODULE COMPLETED BANNER                    │    │
│  │  "You've completed: [Module Name]"          │    │
│  │  Progress indicator                         │    │
│  └─────────────────────────────────────────────┘    │
│                                                      │
│  KEY TAKEAWAYS                                       │
│  • Insight 1                                        │
│  • Insight 2                                        │
│  • Insight 3                                        │
│                                                      │
│  EXERCISES COMPLETED                                 │
│  ┌─────┐ ┌─────┐ ┌─────┐                            │
│  │ ✓   │ │ ✓   │ │ ✓   │                            │
│  └─────┘ └─────┘ └─────┘                            │
│                                                      │
│  NEXT MODULE PREVIEW                                 │
│  ┌─────────────────────────────────────────────┐    │
│  │  [Next Module Card with CTA]                │    │
│  └─────────────────────────────────────────────┘    │
│                                                      │
└─────────────────────────────────────────────────────┘
```

---

## Artifacts Hub

### Route
`/app/artifacts`

### Purpose
Central repository of all user-generated content and insights.

### Layout Structure

```
┌─────────────────────────────────────────────────────┐
│  HEADER                                              │
├─────────────────────────────────────────────────────┤
│                                                      │
│  PAGE TITLE                                          │
│  "Your Artifacts"                                   │
│  Brief description                                  │
│                                                      │
│  FILTER/TABS                                         │
│  [All] [Exercises] [Insights] [Notes]               │
│                                                      │
│  ARTIFACT GRID                                       │
│  ┌───────────────┐ ┌───────────────┐                │
│  │ Artifact Card │ │ Artifact Card │                │
│  │ Type badge    │ │ Type badge    │                │
│  │ Title         │ │ Title         │                │
│  │ Preview       │ │ Preview       │                │
│  │ Date          │ │ Date          │                │
│  └───────────────┘ └───────────────┘                │
│                                                      │
│  ┌───────────────┐ ┌───────────────┐                │
│  │ Artifact Card │ │ Artifact Card │                │
│  └───────────────┘ └───────────────┘                │
│                                                      │
└─────────────────────────────────────────────────────┘
```

---

## Resources Hub

### Route
`/resources`

### Purpose
Central hub for all educational content (guides, tools, etc.).

### Layout Structure

```
┌─────────────────────────────────────────────────────┐
│  HEADER                                              │
├─────────────────────────────────────────────────────┤
│                                                      │
│  HERO                                                │
│  "Career Resources"                                  │
│  "Expert guidance for every stage of your career"   │
│                                                      │
├─────────────────────────────────────────────────────┤
│                                                      │
│  FEATURED GUIDES                                     │
│  ┌─────────────────────────────────────────────┐    │
│  │ Featured Guide (large card)                  │    │
│  └─────────────────────────────────────────────┘    │
│                                                      │
│  ALL GUIDES                                          │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐               │
│  │ Guide   │ │ Guide   │ │ Guide   │               │
│  └─────────┘ └─────────┘ └─────────┘               │
│                                                      │
├─────────────────────────────────────────────────────┤
│                                                      │
│  TOOLS                                               │
│  ┌─────────┐ ┌─────────┐                            │
│  │ Tool    │ │ Tool    │                            │
│  └─────────┘ └─────────┘                            │
│                                                      │
├─────────────────────────────────────────────────────┤
│  FOOTER                                              │
└─────────────────────────────────────────────────────┘
```

---

## Guide Detail

### Route
`/guides/:slug`

### Purpose
Long-form educational content page.

### Layout Structure

```
┌─────────────────────────────────────────────────────┐
│  HEADER                                              │
├─────────────────────────────────────────────────────┤
│                                                      │
│  ARTICLE HEADER                                      │
│  Category badge                                     │
│  "Guide Title" (Playfair, large)                    │
│  Meta: Author • Read time • Date                    │
│                                                      │
├─────────────────────────────────────────────────────┤
│                                                      │
│  ┌───────────┬─────────────────────────────────┐    │
│  │ TOC       │  ARTICLE CONTENT                │    │
│  │ (sticky)  │                                 │    │
│  │           │  ## Section 1                   │    │
│  │ • Sec 1   │  Paragraph text...              │    │
│  │ • Sec 2   │                                 │    │
│  │ • Sec 3   │  ## Section 2                   │    │
│  │           │  Paragraph text...              │    │
│  │           │                                 │    │
│  └───────────┴─────────────────────────────────┘    │
│                                                      │
│  RELATED GUIDES                                      │
│  ┌─────┐ ┌─────┐ ┌─────┐                            │
│  └─────┘ └─────┘ └─────┘                            │
│                                                      │
├─────────────────────────────────────────────────────┤
│  FOOTER                                              │
└─────────────────────────────────────────────────────┘
```

### Typography for Articles

```css
.article-content {
  max-width: 720px;
}

.article-content h2 {
  font-family: var(--font-serif);
  font-size: 1.75rem;
  margin-top: 3rem;
  margin-bottom: 1rem;
}

.article-content p {
  font-family: var(--font-sans);
  font-size: 1.125rem;
  line-height: 1.8;
  margin-bottom: 1.5rem;
}
```

---

## Role/Situation Page

### Route
`/roles/:role/:situation`

### Purpose
SEO-optimized landing page for specific career situations.

### Layout
Similar to Guide Detail but with:
- Situation-specific illustration
- Tailored CTA ("See how we help [situation]")
- Related situations in footer

---

## Stay or Go Calculator

### Route
`/tools/stay-or-go-calculator`

### Purpose
Interactive tool helping users evaluate their current role.

### Layout Structure

```
┌─────────────────────────────────────────────────────┐
│  HEADER                                              │
├─────────────────────────────────────────────────────┤
│                                                      │
│  TOOL HEADER                                         │
│  "Stay or Go Calculator"                            │
│  Brief description of the tool                      │
│                                                      │
├─────────────────────────────────────────────────────┤
│                                                      │
│  CALCULATOR INTERFACE                                │
│  ┌─────────────────────────────────────────────┐    │
│  │  Question 1 of 10                           │    │
│  │  "How satisfied are you with..."            │    │
│  │                                             │    │
│  │  [1] [2] [3] [4] [5] [6] [7] [8] [9] [10]  │    │
│  │       Very dissatisfied → Very satisfied    │    │
│  │                                             │    │
│  │  Progress bar                               │    │
│  │  [← Back]                      [Next →]     │    │
│  └─────────────────────────────────────────────┘    │
│                                                      │
├─────────────────────────────────────────────────────┤
│                                                      │
│  RESULTS (shown after completion)                    │
│  Score visualization                                │
│  Interpretation                                     │
│  Recommended next steps                             │
│  [Get Personalized Coaching CTA]                    │
│                                                      │
└─────────────────────────────────────────────────────┘
```

---

## Global Patterns

### Page Wrapper

All pages should use this wrapper:

```tsx
<div className="min-h-screen bg-background">
  <Header />
  <main>
    {/* Page content */}
  </main>
  <Footer />
</div>
```

### Section Spacing

```tsx
<section className="py-section-sm md:py-section-md lg:py-section-lg">
  <div className="container">
    {/* Section content */}
  </div>
</section>
```

### Scroll Reveal Pattern

Apply to sections that should animate in:

```tsx
const { ref, isVisible } = useScrollReveal();

<div 
  ref={ref}
  className={cn(
    "transition-all duration-700",
    isVisible 
      ? "opacity-100 translate-y-0" 
      : "opacity-0 translate-y-8"
  )}
>
  {/* Content */}
</div>
```
