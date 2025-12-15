# Serious People Documentation

This folder contains documentation for the Serious People platform.

## Contents

### SEO Engine

- **seo_taxonomy_and_pillars.md** - Source of truth for the SEO engine
  - Pillar page definitions (handwritten, highest quality)
  - Taxonomy dimensions (roles, situations, goals, seniority)
  - Initial programmatic page batch (v1)
  - CTA rules and content module requirements
  - Quality thresholds

### Related Directories

- `/seo/taxonomy/` - Machine-readable JSON files derived from the taxonomy markdown
- `/seo/content/modules/` - Content modules for programmatic page generation
- `/shared/design-tokens.css` - Shared design variables used by both SPA and SEO pages

## Architecture Notes

The SEO engine is designed to be renderer-agnostic:

1. **Content Layer** (portable): Taxonomy JSON + Markdown modules + composer logic
2. **Render Layer** (swappable): Currently EJS, can migrate to Astro if needed

This separation ensures content can be reused across products or rendering approaches.
