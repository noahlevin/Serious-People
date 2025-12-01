# Design Guidelines: Career Coaching Script Generator

## Design Approach

**Selected Approach:** Hybrid - Drawing from Stripe's trust-building aesthetics combined with Linear's clean form design

**Key Principles:**
- Professional credibility (handling payments and sensitive career decisions)
- Frictionless conversion flow
- Form-first clarity
- Premium coaching service feel

## Typography

**Font Stack:**
- Primary: Inter (Google Fonts) - Clean, professional, excellent for forms
- Headings: 'font-semibold' to 'font-bold' weights
- Body: 'font-normal' weight

**Hierarchy:**
- Hero headline: text-5xl md:text-6xl, font-bold
- Section headlines: text-3xl md:text-4xl, font-semibold
- Form labels: text-sm, font-medium, uppercase tracking
- Body text: text-base md:text-lg
- Button text: text-base, font-semibold
- Fine print: text-sm

## Layout System

**Spacing Primitives:** Tailwind units of 2, 4, 6, 8, 12, 16, 20, 24

**Container Strategy:**
- Landing page: max-w-4xl centered for focused conversion
- Form sections: max-w-2xl for optimal readability
- Generated content: max-w-3xl with generous line-height

**Grid Structure:**
- Single column focus throughout (form-optimized)
- No multi-column layouts (prioritize completion over exploration)

## Component Library

### Landing Page (`index.html`)

**Hero Section:**
- Height: min-h-screen with flex centering
- Content: Centered layout with headline, subheadline, primary CTA
- Headline: "Get Unstuck. Three Scripts to Navigate Your Next Career Move."
- Subheadline: 2-3 sentences explaining what users receive
- Primary CTA: Large button "Get my scripts – $19", px-8 py-4
- Trust indicator below CTA: "Money-back guarantee • Delivered instantly"

**Social Proof Section (Optional but Recommended):**
- 3 short testimonial quotes in simple card layout
- Stack vertically, py-16 spacing between hero and next section

**How It Works Section:**
- 3-step process explanation
- Numbered steps (01, 02, 03) with titles and brief descriptions
- Icons from Heroicons (CheckCircle, ChatBubble, Document)

**Footer:**
- Minimal: Copyright, Privacy Policy link, Contact email
- py-8 spacing

### Success/Intake Page (`success.html`)

**Payment Verification State:**
- Centered spinner with "Verifying your payment..."
- py-20 vertical spacing

**Intake Form (Post-Verification):**
- Full-width form container, max-w-2xl
- Page headline: "Tell Us About Your Situation"
- Subheadline: "The more context you share, the more useful your scripts will be."

**Form Fields (All Required):**
Each field group with consistent spacing (space-y-6 between groups):

1. **Role** - Single line input, placeholder: "e.g., Senior Product Manager"
2. **Company Context** - Textarea, 3 rows, placeholder: "Company size, culture, your team..."
3. **What's Not Working** - Textarea, 4 rows, placeholder: "Be specific about what's frustrating..."
4. **What You Want Instead** - Textarea, 3 rows, placeholder: "Your ideal next step..."
5. **Boss Ask** - Textarea, 3 rows, placeholder: "If you could ask for anything..."
6. **Partner Context** - Textarea, 3 rows, placeholder: "What does your partner know? What are their concerns?"
7. **Financial Runway** - Single line input, placeholder: "e.g., 6 months savings, need income immediately"
8. **Risk Tolerance** - Range slider 1-5 with labels "Very conservative" to "Ready for big changes"

**Form Styling:**
- Labels: text-sm font-medium mb-2
- Inputs/Textareas: Full width, p-3 padding, rounded corners (rounded-lg)
- Focus states: Visible ring treatment
- Submit button: Full width, py-4, "Generate My Scripts" text

**Generated Content Display:**
- Appears below form after submission
- Divided into three distinct sections with clear headlines:
  1. "Script for Talking to My Boss"
  2. "Script for Talking to My Partner"
  3. "Your Clarity Memo"
- Each section in a card-like container with generous padding (p-8)
- Whitespace between sections (space-y-8)
- Readable line-height (leading-relaxed)
- Option to copy or download content

## Form Design Specifications

**Input Treatment:**
- Consistent border treatment across all inputs
- Placeholder text with reduced opacity
- Clear visual distinction between empty and filled states
- Error states: Red border with error message below field
- All fields vertically stacked, no inline fields

**Progressive Disclosure:**
- Show form only after payment verification succeeds
- Show loading state during script generation
- Show results with smooth reveal

## Images

**Landing Page Hero:**
- Include a hero image showing professional in contemplative moment (looking at laptop, in office setting, or looking out window)
- Image should convey thoughtfulness and career transition
- Placement: Background image with gradient overlay OR split-screen with image on right (50/50 on desktop)
- If background: Use blur filter for button backdrop

**No other images needed** - Keep focus on content and conversion.

## Key UX Patterns

**Loading States:**
- Spinner with clear messaging for all async operations
- "Verifying payment..." 
- "Generating your personalized scripts..." (20-30 second wait expected)

**Button States:**
- Primary CTA: High contrast, generous padding
- Disabled state during processing
- Success state after form submission

**Error Handling:**
- Payment verification failure: Clear message with support email
- Form validation: Inline errors below fields
- API errors: Friendly message with retry option

## Accessibility

- All form fields with proper label associations
- Focus management through form flow
- Keyboard navigation support
- ARIA labels for loading states
- Sufficient contrast ratios throughout