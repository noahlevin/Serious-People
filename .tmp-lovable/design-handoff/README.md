# Serious People — Design Handoff for Replit Agent

> **Purpose**: This document set provides everything needed to rebuild the frontend with pixel-perfect fidelity to the new "Quiet Confidence" design system created in Lovable.

---

## 📁 File Manifest

| File | Description |
|------|-------------|
| `README.md` | This file — master guide and implementation roadmap |
| `design-philosophy.md` | First-principles design thinking for independent decision-making |
| `design-tokens.css` | CSS custom properties (colors, typography, spacing, shadows) |
| `tailwind-config.ts` | Complete Tailwind CSS configuration |
| `component-library.md` | Component specs with full code implementations |
| `page-templates.md` | Page-by-page design specifications |
| `graphics-components.md` | Custom SVG graphics and decorative elements |
| `animations.md` | Motion design system and scroll animations |
| `content-structures.ts` | Data shapes and content abstraction patterns |
| `api-considerations.md` | Flags for potential API changes (for collaborative review) |
| `prior-version-copy.md` | Archive of original copy/content for reference |

---

## 🎯 Quick Start

### What This Handoff Covers
- Complete visual redesign of all marketing and app pages
- New typography system (Playfair Display + Inter)
- New color palette (warm ivory, deep sage, muted terracotta)
- Editorial-inspired layouts with asymmetric compositions
- Tasteful animation system
- Component library with all variants and states

### What to Preserve (Do Not Change)
- ✅ All URL structures and routing
- ✅ All API contracts and endpoints
- ✅ Authentication flows (Google OAuth, magic link)
- ✅ Stripe integration and payment logic
- ✅ PostHog event names and tracking
- ✅ Core business logic and state management
- ✅ Existing SEO content structure (adopt as-is)

### Tech Stack Recommendation
We recommend **React + Tailwind CSS** as implemented in Lovable, but Replit Agent may adapt to its existing stack as needed. The design tokens are provided in both CSS variables and Tailwind config format for flexibility.

---

## 🚀 Implementation Phases

### Phase 1: Foundation (Do First)
1. Update `index.css` with new design tokens from `design-tokens.css`
2. Update `tailwind.config.ts` with new configuration
3. Add Google Fonts link to `index.html`:
   ```html
   <link rel="preconnect" href="https://fonts.googleapis.com">
   <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
   <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
   ```

### Phase 2: Shared Components
1. Create/update UI components per `component-library.md`
2. Create custom hooks (`useScrollReveal`, `useParallax`)
3. Create graphics components per `graphics-components.md`

### Phase 3: Marketing Pages
Update in this order:
1. Homepage (`/`)
2. How It Works (`/how-it-works`)
3. Login page (`/app/login`)

### Phase 4: SEO Content Pages
4. Resources Hub (`/resources`)
5. Guides listing and detail pages (`/guides`, `/guides/:slug`)
6. Roles/Situations pages (`/roles/:role/:situation`)

### Phase 5: App Screens
7. Interview flow (`/interview`, `/interview/chat`)
8. Module Wrap-Up (`/app/module-wrap-up`)
9. Artifacts Hub (`/app/artifacts`)
10. Stay or Go Calculator (`/tools/stay-or-go-calculator`)

### Phase 6: Polish
- Add scroll animations per `animations.md`
- Test responsive behavior at all breakpoints
- Verify accessibility (focus states, contrast, screen readers)

---

## 🔄 Content Strategy

### For SEO Pages (Guides, Resources, Roles)
**Adopt existing content structure.** The current content hierarchy and data models should remain unchanged. Only the visual presentation changes.

### For App Data (User data, coaching modules, etc.)
**Replit Agent decides** on storage strategy consistent with current backend patterns. Flag any structural changes needed in `api-considerations.md`.

---

## ⚠️ Change Flags

When implementing, please **document in a separate file** any cases where:
1. The design requires a new API field or endpoint
2. The design conflicts with existing data structures
3. You need clarification on intended behavior
4. You've made an independent design decision for an edge case

We will review these together before finalizing.

---

## 📐 Responsive Breakpoints

| Breakpoint | Width | Usage |
|------------|-------|-------|
| `sm` | 640px | Mobile landscape |
| `md` | 768px | Tablet portrait |
| `lg` | 1024px | Tablet landscape / small desktop |
| `xl` | 1280px | Desktop |
| `2xl` | 1536px | Large desktop |

The design is mobile-first. Most layouts shift from single-column to multi-column at `lg` (1024px).

---

## 🧪 Testing Checklist

After each phase, verify:
- [ ] No console errors
- [ ] All links/navigation work
- [ ] Forms submit correctly
- [ ] Animations are smooth (no jank)
- [ ] Text is readable at all sizes
- [ ] Interactive elements have visible focus states
- [ ] Page loads in under 3 seconds

---

## 📞 Questions?

If anything is unclear or you encounter a design decision not covered here, document it and we'll resolve it together. The goal is pixel-perfect visual fidelity while maintaining full functionality.

---

*Generated from Lovable design implementation — December 2024*
