# Content Modules

This directory contains markdown content modules used to generate SEO pages.

## Directory Structure

```
modules/
├── framework/           # "How to think about it" sections
│   ├── stay-or-go-v1.md
│   └── stay-or-go-v2.md
├── mistakes/            # Common mistakes by situation/role
│   ├── product-stay-or-go-v1.md
│   └── engineering-burnout-v1.md
├── vignettes/           # Concrete example scenarios
│   ├── product-leader-burnout.md
│   └── engineering-manager-bad-manager.md
├── walkaway/            # "What you'll walk away with" sections
│   └── decision-artifacts.md
└── cta/                 # Call-to-action blocks
    ├── session.md
    └── tool.md
```

## Module Schema

Each module uses frontmatter metadata:

```yaml
---
type: framework | mistakes | vignette | walkaway | cta
roles: [vp-product, director-product]  # optional array - which roles this applies to
situations: [stay-or-go]               # optional array - which situations this applies to
goals: [decide]                        # optional array - which goals this applies to
variant: v1                            # variant identifier for A/B or diversity
minWords: 150                          # optional minimum word count override
---

Markdown content goes here...
```

## Module Types

### Framework
The "how to think about it" section. Provides a mental model or decision framework.
- Minimum: 2 variants per situation
- Target length: 200-400 words

### Mistakes
Common mistakes people make in this situation, optionally tinted by role.
- Minimum: 2 variants per situation
- Target length: 150-300 words

### Vignette
A concrete, anonymized example scenario that makes the advice tangible.
- Minimum: 2 variants per role cluster (product/eng/ops/exec)
- Target length: 150-250 words

### Walkaway
"What you'll walk away with" - ties to Serious People artifacts.
- Can be shared across multiple pages
- Target length: 100-200 words

### CTA
Call-to-action blocks with specific messaging.
- Separate files for session vs tool CTAs
- Target length: 50-100 words

## Selection Rules

1. **Variant Selection**: Use stable hash of page slug to select variant (deterministic, no reshuffling on rebuild)
2. **Role Matching**: Prefer modules that match the specific role, fall back to role cluster, then generic
3. **Situation Matching**: Exact match required for framework/mistakes, cluster match allowed for vignettes

## Quality Requirements

From `/seo/taxonomy/taxonomy.json`:

- **Pillars**: minWordCount 1200, minUniqueModules 5
- **Programmatic**: minWordCount 700, minUniqueModules 4
- **Similarity**: maxScore 0.7 (measured on rendered text minus boilerplate)
