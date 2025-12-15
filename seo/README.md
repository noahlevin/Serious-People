# Serious People SEO Engine

A taxonomy-driven SEO page generation system for Serious People.

## Overview

This system generates crawlable, indexable marketing pages for career coaching content. It's designed to be **renderer-agnostic** — the content and taxonomy are separate from the rendering layer.

## Architecture

```
seo/
├── taxonomy/
│   ├── taxonomy.json    # Master taxonomy: roles, situations, goals, CTA rules
│   └── pages.json       # Initial batch of programmatic pages to generate
├── content/
│   └── modules/         # Markdown content modules with frontmatter
│       ├── framework/   # "How to think about it" sections
│       ├── mistakes/    # Common mistakes by situation/role
│       ├── vignettes/   # Concrete example scenarios
│       ├── walkaway/    # "What you'll walk away with" sections
│       └── cta/         # Call-to-action blocks
├── templates/           # (Phase 1) EJS templates for rendering
└── README.md            # This file
```

## Page Types

| Type | Route | Index Status |
|------|-------|--------------|
| Pillars | `/guides/*` | indexable |
| Programmatic | `/roles/*/situations/*` | indexable (if passes quality gate) |
| Tools | `/tools/*` | indexable |
| Landing Pages | `/lp/*` | noindex (for paid ads) |

## Rendering

**Current (v1)**: EJS templates served by Express
**Future (v2, optional)**: Astro static site generator

The abstraction boundary is clear:
- Taxonomy + content modules + composer logic = **portable** (no EJS dependencies)
- Templates = **swappable**

## Quality Gate

Pages must pass quality checks to be indexed:

- **Pillars**: 1200+ words, 5+ unique modules
- **Programmatic**: 700+ words, 4+ unique modules
- **Similarity**: < 70% overlap with nearest neighbors (excluding boilerplate)

Pages failing the gate render with `noindex` and are excluded from sitemap.

## Module Selection

Variant selection uses a **stable hash of the page slug** to ensure:
- Deterministic selection (same page always gets same variant)
- No reshuffling on rebuild
- Diverse content across pages

## Usage

### Adding a Pillar Page

1. Create markdown content in `/seo/content/pillars/{slug}.md`
2. Add entry to `taxonomy.json` pillars array
3. Template will render at `/guides/{slug}`

### Adding Programmatic Pages

1. Ensure content modules exist for the role/situation combination
2. Add entry to `pages.json`
3. Composer assembles page from modules automatically

### Adding a New Role or Situation

1. Add to `taxonomy.json` roles/situations arrays
2. Create relevant content modules (min 2 variants each for framework/mistakes)
3. Add page entries to `pages.json`

## Express Integration

Routes are served before the SPA catch-all:

```javascript
// In server/routes.ts
app.get('/guides/:slug', seoController.renderGuide);
app.get('/guides', seoController.renderGuidesIndex);
app.get('/tools/:slug', seoController.renderTool);
app.get('/roles/:role/situations/:situation', seoController.renderProgrammatic);
app.get('/lp/:slug', seoController.renderLandingPage);
app.get('/robots.txt', seoController.robots);
app.get('/sitemap.xml', seoController.sitemap);
```

## Analytics

PostHog events for SEO surface:

- `seo_page_viewed` — include slug, taxonomy dimensions
- `seo_cta_clicked` — include destination
- `tool_started`, `tool_completed`, `tool_cta_clicked`

## Reusing for Other Products

1. Replace `taxonomy.json` with product-specific taxonomy
2. Create new content modules
3. Update templates if needed
4. Wire Express routes

The engine is designed to be portable across Serious People products.
