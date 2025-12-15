# Serious People — SEO Taxonomy + Content Pillars (v1)

This file is the source of truth for the Serious People SEO engine.

It defines:
- The **pillar pages** (handwritten, highest quality)
- The **taxonomy** used to generate programmatic pages
- The **initial v1 batch** of pages to generate (50, high intent only)
- CTA rules and content module requirements
- Quality thresholds

---

## 0) Routing + Page Types

Three content surfaces (served as HTML, not SPA):

| Surface | Route | Default Index |
|---------|-------|---------------|
| Guides | `/guides/*` | indexable |
| Tools | `/tools/*` | indexable |
| Landing Pages (ads) | `/lp/*` | noindex |

Optional later:
- App mounted at `/app/*` (SPA)

---

## 1) Positioning Constraints

Serious People is a structured, high-signal career decision session that produces concrete artifacts. Content should feel:

- **Pragmatic, specific, operator-grade**
- Not therapy, not vibes, not "manifest your future"
- Frameworks + scripts + examples > generic advice

No fluff intros. Assume the reader is smart and stressed.

---

## 2) Pillar Pages (12) — Handwritten

These are the "hubs" we link to constantly. Each pillar should be strong enough to rank on its own.

### Pillars List

| # | Slug | Title |
|---|------|-------|
| 1 | `/guides/stay-or-go-framework` | The Stay-or-Go Decision Framework |
| 2 | `/guides/burnout-vs-misfit-vs-bad-manager` | Burnout vs. Misfit vs. Bad Manager: A Diagnostic Guide |
| 3 | `/guides/how-to-resign-without-burning-bridges` | How to Resign Without Burning Bridges |
| 4 | `/guides/severance-negotiation-playbook` | The Severance Negotiation Playbook |
| 5 | `/guides/executive-job-search-is-different` | Executive Job Search Is Different |
| 6 | `/guides/how-to-explain-your-departure` | How to Explain Your Departure |
| 7 | `/guides/what-to-do-in-the-first-14-days` | What to Do in the First 14 Days After Leaving |
| 8 | `/guides/how-to-talk-to-your-boss-about-changing-your-role` | How to Talk to Your Boss About Changing Your Role |
| 9 | `/guides/how-to-evaluate-an-offer-like-an-adult` | How to Evaluate an Offer Like an Adult |
| 10 | `/guides/when-to-use-a-coach` | When to Use a Coach (And What Kind) |
| 11 | `/guides/layoff-risk-plan` | The Layoff Risk Survival Plan |
| 12 | `/guides/toxic-boss-survival-or-exit` | Toxic Boss: Survive or Exit? |

---

## 3) Tools (Conversion + Link Magnets)

Tools should be genuinely useful and work without login.

### Tools List (v1)

| Tool | Route | Description |
|------|-------|-------------|
| Stay/Go Worksheet | `/tools/stay-or-go-worksheet` | Scored assessment → recommended direction + next steps |
| Severance Calculator | `/tools/severance-runway-calculator` | Inputs → runway, risk flags, decision considerations |

### Tools (v2 - Future)

- `/tools/exit-message-generator` - Resignation + all-hands variants
- `/tools/narrative-builder` - LinkedIn "about" + interview story outline
- `/tools/role-mandate-checklist` - Boss fit + decision rights

---

## 4) Taxonomy (For Programmatic Pages)

### 4.1 Dimensions

#### Roles (`role`)
| Key | Label |
|-----|-------|
| vp-product | VP Product |
| director-product | Director of Product |
| product-manager | Product Manager |
| director-engineering | Director of Engineering |
| engineering-manager | Engineering Manager |
| ops-leader | Operations Leader |
| gm | General Manager |
| founder | Founder |

#### Situations (`situation`)
| Key | Label |
|-----|-------|
| stay-or-go | Stay or go |
| burnout | Burnout |
| bad-manager | Bad manager |
| toxic-culture | Toxic culture |
| severance | Severance |
| internal-pivot | Internal pivot |
| job-search | Job search |
| offer-evaluation | Offer evaluation |
| resignation | Resignation |
| layoff-risk | Layoff risk |

#### Goals (`goal`)
| Key | Label |
|-----|-------|
| decide | Decide |
| negotiate | Negotiate |
| narrate | Narrate |
| plan | Plan |
| execute | Execute |

#### Seniority (`seniority`)
| Key | Label |
|-----|-------|
| mid | Mid-level |
| senior | Senior |
| exec | Executive |

### 4.2 URL Scheme (v1)

Pattern B (role + situation) for highest intent:
- `/roles/{role}/situations/{situation}`
- `/roles/{role}/situations/{situation}/{goal}` (v1.1)

---

## 5) CTA Rules

Each page gets **one primary CTA**. Secondary links are internal only.

### CTA Types
| Type | Description |
|------|-------------|
| `cta_session` | Start the Serious People session |
| `cta_tool` | Use a tool (worksheet/calculator) |
| `cta_email` | Email capture (use sparingly) |

### Default CTA Mapping
| Situation | Primary CTA |
|-----------|-------------|
| stay-or-go, burnout, bad-manager, toxic-culture, internal-pivot | `cta_session` |
| severance, offer-evaluation | `cta_tool` (then session as internal link) |
| job-search, resignation, layoff-risk | `cta_session` |

---

## 6) Content Module Requirements

Every indexable page must contain these modules:

1. **Framework** ("how to think about it")
2. **Common mistakes** (situation-specific, role-tinted)
3. **Example vignette** (concrete scenario, anonymized)
4. **What you'll walk away with** (tie to artifacts)
5. **CTA block** (single primary)
6. **Related links** (6–10 internal links)

### Content Module Schema

```yaml
---
type: framework | mistakes | vignette | walkaway | cta
roles: [vp-product, director-product]  # optional array
situations: [stay-or-go]                # optional array
goals: [decide]                         # optional
variant: v1
minWords: 150                           # optional override
---
```

### Variant Requirements

For each situation, minimum:
- 2 variants of framework module
- 2 variants of mistakes module
- 2 variants of vignettes per role cluster (product/eng/ops/exec)

Selection rule: Pick variant by **stable hash of page slug** (deterministic, no reshuffling).

---

## 7) Quality Thresholds

```json
{
  "qualityThresholds": {
    "pillars": {
      "minWordCount": 1200,
      "minUniqueModules": 5
    },
    "programmatic": {
      "minWordCount": 700,
      "minUniqueModules": 4
    },
    "maxSimilarityScore": 0.7
  }
}
```

Similarity measured on rendered text **minus** header/footer/CTA boilerplate.

Pages failing quality gate: render with `noindex`, exclude from sitemap.

---

## 8) Artifacts Language (What We Promise)

Consistent output descriptions:

- **Decision snapshot** — What's true, what's not, what matters
- **Fork recommendation** — Stay vs go vs pivot, with rationale
- **Risk map** — What could go wrong, how to mitigate
- **Conversation scripts** — Boss / partner / recruiter
- **Action plan** — 14 days + 30 days
- **Narrative outline** — LinkedIn + interview story

---

## 9) Initial Programmatic Batch (v1) — 50 Pages

### Role + Situation Pages (Core)

**VP Product (10 pages)**
1. `/roles/vp-product/situations/stay-or-go`
2. `/roles/vp-product/situations/burnout`
3. `/roles/vp-product/situations/bad-manager`
4. `/roles/vp-product/situations/toxic-culture`
5. `/roles/vp-product/situations/severance`
6. `/roles/vp-product/situations/internal-pivot`
7. `/roles/vp-product/situations/job-search`
8. `/roles/vp-product/situations/offer-evaluation`
9. `/roles/vp-product/situations/resignation`
10. `/roles/vp-product/situations/layoff-risk`

**Director of Product (10 pages)**
11. `/roles/director-product/situations/stay-or-go`
12. `/roles/director-product/situations/burnout`
13. `/roles/director-product/situations/bad-manager`
14. `/roles/director-product/situations/toxic-culture`
15. `/roles/director-product/situations/severance`
16. `/roles/director-product/situations/internal-pivot`
17. `/roles/director-product/situations/job-search`
18. `/roles/director-product/situations/offer-evaluation`
19. `/roles/director-product/situations/resignation`
20. `/roles/director-product/situations/layoff-risk`

**Director of Engineering (10 pages)**
21. `/roles/director-engineering/situations/stay-or-go`
22. `/roles/director-engineering/situations/burnout`
23. `/roles/director-engineering/situations/bad-manager`
24. `/roles/director-engineering/situations/toxic-culture`
25. `/roles/director-engineering/situations/severance`
26. `/roles/director-engineering/situations/internal-pivot`
27. `/roles/director-engineering/situations/job-search`
28. `/roles/director-engineering/situations/offer-evaluation`
29. `/roles/director-engineering/situations/resignation`
30. `/roles/director-engineering/situations/layoff-risk`

**Engineering Manager (8 pages)**
31. `/roles/engineering-manager/situations/stay-or-go`
32. `/roles/engineering-manager/situations/burnout`
33. `/roles/engineering-manager/situations/bad-manager`
34. `/roles/engineering-manager/situations/toxic-culture`
35. `/roles/engineering-manager/situations/internal-pivot`
36. `/roles/engineering-manager/situations/job-search`
37. `/roles/engineering-manager/situations/offer-evaluation`
38. `/roles/engineering-manager/situations/resignation`

**Operations Leader (8 pages)**
39. `/roles/ops-leader/situations/stay-or-go`
40. `/roles/ops-leader/situations/burnout`
41. `/roles/ops-leader/situations/bad-manager`
42. `/roles/ops-leader/situations/toxic-culture`
43. `/roles/ops-leader/situations/internal-pivot`
44. `/roles/ops-leader/situations/job-search`
45. `/roles/ops-leader/situations/offer-evaluation`
46. `/roles/ops-leader/situations/resignation`

**Founder (4 pages)**
47. `/roles/founder/situations/burnout`
48. `/roles/founder/situations/stay-or-go`
49. `/roles/founder/situations/toxic-culture`
50. `/roles/founder/situations/internal-pivot`

---

## 10) Internal Linking Rules

Each generated page should link to:
- 1–2 relevant **pillars**
- 1 relevant **tool**
- 3–6 adjacent generated pages:
  - Same role, adjacent situations
  - Same situation, adjacent roles (limit to avoid spam)
- `/guides/what-to-do-in-the-first-14-days` frequently (strong cross-cutting hub)

---

## 11) Paid Ads Landing Pages (`/lp/*`)

Default `noindex`. Message-matched to ad groups.

| # | Route | Intent |
|---|-------|--------|
| 1 | `/lp/stay-or-go-session` | Stay/go decision |
| 2 | `/lp/burnout-decision-session` | Burnout clarity |
| 3 | `/lp/severance-negotiation` | Severance help |
| 4 | `/lp/resignation-script` | Clean exit |
| 5 | `/lp/executive-job-search-plan` | Senior job search |
| 6 | `/lp/internal-pivot-conversation` | Role change |

---

## 12) Title + Description Templates

### Title Patterns
- `{Situation} for {Role}: A Practical Framework`
- `How to Handle {Situation} as a {Role}`
- `{Role} Guide to {Situation}: Decisions, Scripts, Next Steps`

### Meta Description Pattern
> A no-fluff guide to {situation} for {role}—framework, common mistakes, examples, and scripts. Includes a 14-day plan and a clear next step.

Keep it human. Avoid keyword stuffing.

---

## 13) Renderer Architecture

**Current (v1)**: EJS templates
**Future (v2, optional)**: Astro (if tools need hydration or authoring becomes painful)

**Abstraction boundary**: Taxonomy + content modules + composer logic are renderer-agnostic.
