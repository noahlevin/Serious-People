import type { Request, Response } from "express";
import ejs from "ejs";
import path from "path";
import fs from "fs";

// PostHog key for analytics (from environment)
const POSTHOG_KEY = process.env.VITE_POSTHOG_KEY || "";

// Common CSS head snippet for inline SEO pages that links to /seo.css and maps tokens
function getSeoStyleHead(): string {
  return `
  <link rel="stylesheet" href="/seo.css?v=${Date.now()}">
  <style>
    :root {
      /* Map to Lovable tokens from /seo.css */
      --sp-bg: hsl(var(--background));
      --sp-bg-elevated: hsl(var(--card));
      --sp-text: hsl(var(--foreground));
      --sp-text-secondary: hsl(var(--muted-foreground));
      --sp-text-muted: hsl(var(--foreground) / 0.78);
      --sp-border: hsl(var(--border));
      --sp-border-light: hsl(var(--border) / 0.6);
      --sp-accent: hsl(var(--primary));
      --sp-accent-hover: hsl(var(--primary) / 0.85);
      --sp-accent-foreground: hsl(var(--primary-foreground));
      --sp-link: hsl(var(--primary));
      --sp-font-display: var(--sp-display);
      --sp-font-body: var(--sp-body);
    }
  </style>`;
}

// Generate PostHog tracking script for inline HTML pages
function getPostHogScript(pageType: string, pageSlug: string, pageTitle: string): string {
  if (!POSTHOG_KEY) return "";
  return `
  <script>
    !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.async=!0,p.src=s.api_host+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="capture identify alias people.set people.set_once set_config register register_once unregister opt_out_capturing has_opted_out_capturing opt_in_capturing reset isFeatureEnabled onFeatureFlags getFeatureFlag getFeatureFlagPayload reloadFeatureFlags group updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures getActiveMatchingSurveys getSurveys onSessionId".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
    posthog.init('${POSTHOG_KEY}', {
      api_host: 'https://us.i.posthog.com',
      person_profiles: 'identified_only',
      capture_pageview: true,
      capture_pageleave: true,
      autocapture: false
    });
    posthog.capture('seo_page_view', {
      page_type: '${pageType}',
      page_slug: '${pageSlug}',
      page_title: '${pageTitle}'
    });
  </script>`;
}

// Get base URL for canonical links
function getBaseUrl(): string {
  if (process.env.BASE_URL) {
    return process.env.BASE_URL;
  }
  if (process.env.REPLIT_DEV_DOMAIN) {
    return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  }
  return "http://localhost:5000";
}

// Generate JSON-LD Article schema for pillar pages
function generateArticleSchema(options: {
  title: string;
  description: string;
  url: string;
  datePublished?: string;
  dateModified?: string;
}): string {
  const baseUrl = getBaseUrl();
  const schema = {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": options.title,
    "description": options.description,
    "url": options.url,
    "author": {
      "@type": "Organization",
      "name": "Serious People",
      "url": baseUrl
    },
    "publisher": {
      "@type": "Organization",
      "name": "Serious People",
      "url": baseUrl,
      "logo": {
        "@type": "ImageObject",
        "url": `${baseUrl}/logo.png`
      }
    },
    "datePublished": options.datePublished || "2024-12-01",
    "dateModified": options.dateModified || new Date().toISOString().split("T")[0],
    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": options.url
    },
    "inLanguage": "en-US"
  };

  return `<script type="application/ld+json">${JSON.stringify(schema, null, 0)}</script>`;
}

// Generate JSON-LD WebPage schema for tools
function generateWebPageSchema(options: {
  title: string;
  description: string;
  url: string;
}): string {
  const schema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "name": options.title,
    "description": options.description,
    "url": options.url,
    "isPartOf": {
      "@type": "WebSite",
      "name": "Serious People",
      "url": getBaseUrl()
    },
    "publisher": {
      "@type": "Organization",
      "name": "Serious People",
      "url": getBaseUrl()
    }
  };

  return `<script type="application/ld+json">${JSON.stringify(schema, null, 0)}</script>`;
}

// Generate JSON-LD Organization schema (for inclusion in layout)
function generateOrganizationSchema(): string {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "Serious People",
    "url": getBaseUrl(),
    "description": "Career coaching for executives and senior leaders facing serious career decisions.",
    "sameAs": []
  };

  return `<script type="application/ld+json">${JSON.stringify(schema, null, 0)}</script>`;
}

// Simple markdown to HTML converter (no external dependencies)
function markdownToHtml(markdown: string): string {
  let html = markdown;

  // Remove frontmatter
  html = html.replace(/^---[\s\S]*?---\n*/m, "");

  // Convert horizontal rules (standalone --- or *** or ___ on their own line)
  html = html.replace(/^(---|___|\*\*\*)\s*$/gm, "<hr>");

  // Convert headers
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");

  // Convert links [text](url)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // Convert bold
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  // Convert italic
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

  // Convert inline code
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

  // Convert blockquotes
  html = html.replace(/^> (.+)$/gm, "<blockquote>$1</blockquote>");

  // Convert unordered lists
  const lines = html.split("\n");
  let inList = false;
  const processedLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isListItem = /^- (.+)$/.test(line);

    if (isListItem && !inList) {
      inList = true;
      processedLines.push("<ul>");
    }

    if (!isListItem && inList) {
      inList = false;
      processedLines.push("</ul>");
    }

    if (isListItem) {
      processedLines.push(line.replace(/^- (.+)$/, "<li>$1</li>"));
    } else {
      processedLines.push(line);
    }
  }

  if (inList) {
    processedLines.push("</ul>");
  }

  html = processedLines.join("\n");

  // Convert numbered lists - look ahead past blank lines
  const lines2 = html.split("\n");
  let inOl = false;
  const processedLines2: string[] = [];

  // Helper: check if there's another numbered item ahead (skipping blank lines)
  const hasMoreListItems = (startIdx: number): boolean => {
    for (let j = startIdx; j < lines2.length; j++) {
      const nextLine = lines2[j].trim();
      if (!nextLine) continue; // skip blank lines
      return /^\d+\. (.+)$/.test(lines2[j]);
    }
    return false;
  };

  for (let i = 0; i < lines2.length; i++) {
    const line = lines2[i];
    const isOlItem = /^\d+\. (.+)$/.test(line);
    const isBlank = !line.trim();

    if (isOlItem && !inOl) {
      inOl = true;
      processedLines2.push("<ol>");
    }

    // Only close list if this is non-blank, non-list content
    if (!isOlItem && !isBlank && inOl) {
      inOl = false;
      processedLines2.push("</ol>");
    }

    // Close list on blank line only if no more list items ahead
    if (isBlank && inOl && !hasMoreListItems(i + 1)) {
      inOl = false;
      processedLines2.push("</ol>");
    }

    if (isOlItem) {
      processedLines2.push(line.replace(/^\d+\. (.+)$/, "<li>$1</li>"));
    } else if (!isBlank || !inOl) {
      // Keep blank lines outside lists, skip them inside lists
      processedLines2.push(line);
    }
  }

  if (inOl) {
    processedLines2.push("</ol>");
  }

  html = processedLines2.join("\n");

  // Convert paragraphs (lines that aren't already HTML)
  const paragraphLines = html.split("\n\n");
  html = paragraphLines
    .map((block) => {
      block = block.trim();
      if (!block) return "";
      if (
        block.startsWith("<h") ||
        block.startsWith("<ul") ||
        block.startsWith("<ol") ||
        block.startsWith("<li") ||
        block.startsWith("<blockquote") ||
        block.startsWith("</")
      ) {
        return block;
      }
      // Don't wrap lists that are already inside paragraph blocks
      if (block.includes("<li>")) {
        return block;
      }
      return `<p>${block.replace(/\n/g, " ")}</p>`;
    })
    .join("\n\n");

  return html;
}

// Parse frontmatter from markdown
function parseFrontmatter(content: string): { data: Record<string, string>; content: string } {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

  if (!frontmatterMatch) {
    return { data: {}, content };
  }

  const frontmatter = frontmatterMatch[1];
  const body = frontmatterMatch[2];
  const data: Record<string, string> = {};

  frontmatter.split("\n").forEach((line) => {
    const colonIndex = line.indexOf(":");
    if (colonIndex > 0) {
      const key = line.substring(0, colonIndex).trim();
      const value = line.substring(colonIndex + 1).trim();
      data[key] = value;
    }
  });

  return { data, content: body };
}

// Template paths
const templatesDir = path.resolve(process.cwd(), "seo/templates");
const pillarsDir = path.resolve(process.cwd(), "seo/content/pillars");
const modulesDir = path.resolve(process.cwd(), "seo/content/modules");
const programmaticDir = path.resolve(process.cwd(), "seo/content/programmatic");

// Taxonomy for programmatic pages
const ROLES: Record<string, string> = {
  "vp-product": "VP Product",
  "director-product": "Director of Product",
  "vp-engineering": "VP Engineering",
  "director-engineering": "Director of Engineering",
  "chief-of-staff": "Chief of Staff",
  "vp-operations": "VP Operations",
  // Legacy roles for backwards compatibility
  "product-manager": "Product Manager",
  "engineering-manager": "Engineering Manager",
  "ops-leader": "Operations Leader",
  "gm": "General Manager",
  "founder": "Founder",
};

const SITUATIONS: Record<string, string> = {
  "stay-or-go": "Stay or Go",
  "burnout": "Burnout",
  "bad-manager": "Bad Manager",
  "toxic-culture": "Toxic Culture",
  "severance": "Severance",
  "internal-pivot": "Internal Pivot",
  "job-search": "Job Search",
  "offer-evaluation": "Offer Evaluation",
  "resignation": "Resignation",
  "layoff-risk": "Layoff Risk",
};

// Map roles to vignette files
const ROLE_VIGNETTES: Record<string, string> = {
  "vp-product": "vp-product",
  "director-product": "director-product",
  "product-manager": "director-product", // share with director
  "director-engineering": "engineering-leader",
  "engineering-manager": "engineering-leader",
  "ops-leader": "ops-leader",
  "gm": "ops-leader", // share with ops
  "founder": "founder",
};

// Map roles to mistakes files
const ROLE_MISTAKES: Record<string, string> = {
  "vp-product": "product-leadership",
  "director-product": "product-leadership",
  "product-manager": "product-leadership",
  "director-engineering": "engineering-leadership",
  "engineering-manager": "engineering-leadership",
  "ops-leader": "ops-leadership",
  "gm": "ops-leadership",
  "founder": "founder-exec",
};

// Map situations to relevant pillar links
const SITUATION_PILLARS: Record<string, string[]> = {
  "stay-or-go": ["stay-or-go-framework", "burnout-vs-misfit-vs-bad-manager"],
  "burnout": ["burnout-vs-misfit-vs-bad-manager", "stay-or-go-framework"],
  "bad-manager": ["toxic-boss-survival-or-exit", "stay-or-go-framework"],
  "toxic-culture": ["toxic-boss-survival-or-exit", "stay-or-go-framework"],
  "severance": ["severance-negotiation-playbook", "what-to-do-in-the-first-14-days"],
  "internal-pivot": ["how-to-talk-to-your-boss-about-changing-your-role", "stay-or-go-framework"],
  "job-search": ["executive-job-search-is-different", "how-to-explain-your-departure"],
  "offer-evaluation": ["how-to-evaluate-an-offer-like-an-adult", "executive-job-search-is-different"],
  "resignation": ["how-to-resign-without-burning-bridges", "what-to-do-in-the-first-14-days"],
  "layoff-risk": ["layoff-risk-plan", "severance-negotiation-playbook"],
};

// Get all programmatic pages for sitemap
function getAllProgrammaticPages(): Array<{ role: string; situation: string }> {
  const pages: Array<{ role: string; situation: string }> = [];

  // Based on the spec, generate pages for specific combinations
  const rolePages: Record<string, string[]> = {
    "vp-product": ["stay-or-go", "burnout", "bad-manager", "toxic-culture", "severance", "internal-pivot", "job-search", "offer-evaluation", "resignation", "layoff-risk"],
    "director-product": ["stay-or-go", "burnout", "bad-manager", "toxic-culture", "severance", "internal-pivot", "job-search", "offer-evaluation", "resignation", "layoff-risk"],
    "director-engineering": ["stay-or-go", "burnout", "bad-manager", "toxic-culture", "severance", "internal-pivot", "job-search", "offer-evaluation", "resignation", "layoff-risk"],
    "engineering-manager": ["stay-or-go", "burnout", "bad-manager", "toxic-culture", "internal-pivot", "job-search", "offer-evaluation", "resignation"],
    "ops-leader": ["stay-or-go", "burnout", "bad-manager", "toxic-culture", "internal-pivot", "job-search", "offer-evaluation", "resignation"],
    "founder": ["burnout", "stay-or-go", "toxic-culture", "internal-pivot"],
  };

  for (const [role, situations] of Object.entries(rolePages)) {
    for (const situation of situations) {
      pages.push({ role, situation });
    }
  }

  return pages;
}

// Cache for programmatic content
const programmaticCache: Record<string, string> = {};

// Load a programmatic content file
function loadProgrammaticContent(type: string, name: string): string {
  const cacheKey = `${type}/${name}`;
  if (programmaticCache[cacheKey]) {
    return programmaticCache[cacheKey];
  }

  const filePath = path.join(programmaticDir, type, `${name}.md`);
  if (!fs.existsSync(filePath)) {
    console.warn(`[SEO] Programmatic content not found: ${cacheKey}`);
    return "";
  }

  const rawContent = fs.readFileSync(filePath, "utf-8");
  const { content } = parseFrontmatter(rawContent);
  programmaticCache[cacheKey] = content;
  return content;
}

// Select framework variant based on stable hash
function selectVariant(slug: string, maxVariants: number): number {
  let hash = 0;
  for (let i = 0; i < slug.length; i++) {
    hash = ((hash << 5) - hash) + slug.charCodeAt(i);
    hash = hash & hash;
  }
  return (Math.abs(hash) % maxVariants) + 1;
}

// Compose a programmatic page from modules
function composeProgrammaticPage(role: string, situation: string): { content: string; wordCount: number } {
  const sections: string[] = [];

  // 1. Framework section (select variant deterministically)
  const variant = selectVariant(`${role}-${situation}`, 2);
  let framework = loadProgrammaticContent("frameworks", `${situation}-v${variant}`);
  if (!framework) {
    framework = loadProgrammaticContent("frameworks", `${situation}-v1`);
  }
  if (framework) {
    sections.push(framework);
  }

  // 2. Mistakes section (role-specific)
  const mistakesFile = ROLE_MISTAKES[role];
  if (mistakesFile) {
    const mistakes = loadProgrammaticContent("mistakes", mistakesFile);
    if (mistakes) {
      sections.push(mistakes);
    }
  }

  // 3. Vignette section (role cluster)
  const vignetteFile = ROLE_VIGNETTES[role];
  if (vignetteFile) {
    const vignette = loadProgrammaticContent("vignettes", vignetteFile);
    if (vignette) {
      sections.push(vignette);
    }
  }

  // 4. Walkaway section
  const walkaway = loadProgrammaticContent("walkaway", "default");
  if (walkaway) {
    sections.push(walkaway);
  }

  // 5. CTA
  const cta = loadModule("cta-coaching");
  if (cta && !cta.includes("Module not found")) {
    sections.push(cta);
  }

  const content = sections.join("\n\n---\n\n");
  const wordCount = content.split(/\s+/).filter(w => w.length > 0).length;

  return { content, wordCount };
}

// Load and cache modules
const moduleCache: Record<string, string> = {};

function loadModule(moduleId: string): string {
  if (moduleCache[moduleId]) {
    return moduleCache[moduleId];
  }

  const modulePath = path.join(modulesDir, `${moduleId}.md`);
  if (!fs.existsSync(modulePath)) {
    console.warn(`[SEO] Module not found: ${moduleId}`);
    return `<!-- Module not found: ${moduleId} -->`;
  }

  const rawContent = fs.readFileSync(modulePath, "utf-8");
  const { content } = parseFrontmatter(rawContent);
  moduleCache[moduleId] = content;
  return content;
}

// Process module includes in markdown
// Syntax: {{module:module-id}}
function processModuleIncludes(markdown: string): string {
  return markdown.replace(/\{\{module:([a-z0-9-]+)\}\}/g, (_match, moduleId) => {
    return loadModule(moduleId);
  });
}

// All available pillars
const ALL_PILLARS = [
  { slug: "stay-or-go-framework", title: "The Stay-or-Go Decision Framework" },
  { slug: "burnout-vs-misfit-vs-bad-manager", title: "Burnout vs. Misfit vs. Bad Manager: A Diagnostic Guide" },
  { slug: "how-to-resign-without-burning-bridges", title: "How to Resign Without Burning Bridges" },
  { slug: "severance-negotiation-playbook", title: "The Severance Negotiation Playbook" },
  { slug: "executive-job-search-is-different", title: "Executive Job Search Is Different" },
  { slug: "how-to-explain-your-departure", title: "How to Explain Your Departure" },
  { slug: "what-to-do-in-the-first-14-days", title: "What to Do in the First 14 Days After Leaving" },
  { slug: "how-to-talk-to-your-boss-about-changing-your-role", title: "How to Talk to Your Boss About Changing Your Role" },
  { slug: "how-to-evaluate-an-offer-like-an-adult", title: "How to Evaluate an Offer Like an Adult" },
  { slug: "when-to-use-a-coach", title: "When to Use a Coach (And What Kind)" },
  { slug: "layoff-risk-plan", title: "The Layoff Risk Survival Plan" },
  { slug: "toxic-boss-survival-or-exit", title: "Toxic Boss: Survive or Exit?" },
];

// Topic clusters for smart cross-linking (expanded for better coverage)
const PILLAR_TOPICS: Record<string, string[]> = {
  "decision": ["stay-or-go-framework", "burnout-vs-misfit-vs-bad-manager", "when-to-use-a-coach", "how-to-evaluate-an-offer-like-an-adult"],
  "exit": ["how-to-resign-without-burning-bridges", "severance-negotiation-playbook", "how-to-explain-your-departure", "what-to-do-in-the-first-14-days", "layoff-risk-plan"],
  "job-search": ["executive-job-search-is-different", "how-to-evaluate-an-offer-like-an-adult", "how-to-explain-your-departure", "what-to-do-in-the-first-14-days"],
  "internal": ["how-to-talk-to-your-boss-about-changing-your-role", "stay-or-go-framework", "when-to-use-a-coach"],
  "survival": ["toxic-boss-survival-or-exit", "layoff-risk-plan", "burnout-vs-misfit-vs-bad-manager", "severance-negotiation-playbook"],
  "negotiation": ["severance-negotiation-playbook", "how-to-evaluate-an-offer-like-an-adult", "how-to-talk-to-your-boss-about-changing-your-role"],
};

// Get topic for a pillar slug
function getPillarTopics(slug: string): string[] {
  const topics: string[] = [];
  for (const [topic, slugs] of Object.entries(PILLAR_TOPICS)) {
    if (slugs.includes(slug)) {
      topics.push(topic);
    }
  }
  return topics;
}

// Get related links for a pillar (smart topic-based, excluding self)
function getRelatedLinks(currentSlug: string): Array<{ href: string; title: string }> {
  const currentTopics = getPillarTopics(currentSlug);

  // Score pillars by topic overlap
  const scored = ALL_PILLARS
    .filter(p => p.slug !== currentSlug)
    .map(p => {
      const pTopics = getPillarTopics(p.slug);
      const overlap = currentTopics.filter(t => pTopics.includes(t)).length;
      return { ...p, score: overlap };
    })
    .sort((a, b) => b.score - a.score);

  // Return top 4 related pillars
  return scored
    .slice(0, 4)
    .map(p => ({ href: `/guides/${p.slug}`, title: p.title }));
}

// Get related programmatic pages for a pillar
function getRelatedProgrammaticPages(pillarSlug: string): Array<{ href: string; title: string }> {
  // Map pillars to relevant situations (comprehensive mapping)
  const pillarToSituations: Record<string, string[]> = {
    "stay-or-go-framework": ["stay-or-go", "burnout", "internal-pivot"],
    "burnout-vs-misfit-vs-bad-manager": ["burnout", "bad-manager", "toxic-culture"],
    "how-to-resign-without-burning-bridges": ["resignation", "severance"],
    "severance-negotiation-playbook": ["severance", "layoff-risk", "resignation"],
    "executive-job-search-is-different": ["job-search", "offer-evaluation"],
    "how-to-explain-your-departure": ["resignation", "job-search", "severance"],
    "what-to-do-in-the-first-14-days": ["resignation", "severance", "job-search"],
    "how-to-talk-to-your-boss-about-changing-your-role": ["internal-pivot", "stay-or-go"],
    "how-to-evaluate-an-offer-like-an-adult": ["offer-evaluation", "job-search"],
    "when-to-use-a-coach": ["stay-or-go", "burnout", "internal-pivot"],
    "layoff-risk-plan": ["layoff-risk", "severance", "job-search"],
    "toxic-boss-survival-or-exit": ["toxic-culture", "bad-manager", "stay-or-go"],
  };

  const relevantSituations = pillarToSituations[pillarSlug] || [];
  if (relevantSituations.length === 0) return [];

  const allPages = getAllProgrammaticPages();
  return allPages
    .filter(p => relevantSituations.includes(p.situation))
    .slice(0, 3)
    .map(p => ({
      href: `/roles/${p.role}/situations/${p.situation}`,
      title: `${ROLES[p.role]}: ${SITUATIONS[p.situation]}`,
    }));
}

// Render a pillar page
export async function renderGuide(req: Request, res: Response) {
  console.log("[SEO HIT]", req.method, req.originalUrl);

  const { slug } = req.params;

  // Security: sanitize slug
  const safeSlug = slug.replace(/[^a-z0-9-]/gi, "");

  // Try to load the pillar content
  const pillarPath = path.join(pillarsDir, `${safeSlug}.md`);

  if (!fs.existsSync(pillarPath)) {
    return res.status(404).send(`
      <!DOCTYPE html>
      <html>
      <head><title>Guide Not Found | Serious People</title></head>
      <body style="font-family: Georgia, serif; max-width: 600px; margin: 4rem auto; text-align: center;">
        <h1>Guide Not Found</h1>
        <p>The guide you're looking for doesn't exist yet.</p>
        <p><a href="/guides">Browse all guides</a> or <a href="/">return home</a>.</p>
      </body>
      </html>
    `);
  }

  try {
    // Read and parse the markdown
    const rawContent = fs.readFileSync(pillarPath, "utf-8");
    const { data: frontmatter, content: markdownBody } = parseFrontmatter(rawContent);

    // Process module includes ({{module:module-id}} syntax)
    let expandedMarkdown = processModuleIncludes(markdownBody);

    // Get related links (other pillars + role-specific pages)
    const relatedLinks = getRelatedLinks(safeSlug);
    const relatedRolePages = getRelatedProgrammaticPages(safeSlug);

    // Prepare template data
    const canonicalUrl = `${getBaseUrl()}/guides/${safeSlug}`;
    const title = frontmatter.title || "Guide";
    const description = frontmatter.description || "A career coaching guide from Serious People.";

    // Calculate read time (average 200 words per minute)
    const wordCount = expandedMarkdown.split(/\s+/).length;
    const readTimeMinutes = Math.max(1, Math.ceil(wordCount / 200));
    const readTime = `${readTimeMinutes} min read`;

    // Map slugs to short breadcrumb category names (matching GuideDetail.tsx)
    const SLUG_TO_CATEGORY: Record<string, string> = {
      "stay-or-go-framework": "Stay or Go",
      "burnout-vs-misfit-vs-bad-manager": "Burnout",
      "how-to-resign-without-burning-bridges": "Resignation",
      "severance-negotiation-playbook": "Severance",
      "executive-job-search-is-different": "Job Search",
      "how-to-explain-your-departure": "Departure",
      "what-to-do-in-the-first-14-days": "First 14 Days",
      "how-to-talk-to-your-boss-about-changing-your-role": "Role Change",
      "how-to-evaluate-an-offer-like-an-adult": "Offers",
      "when-to-use-a-coach": "Coaching",
      "layoff-risk-plan": "Layoff Risk",
      "toxic-boss-survival-or-exit": "Toxic Boss",
    };
    const category = frontmatter.category || SLUG_TO_CATEGORY[safeSlug] || "Guide";

    // Extract calculator/tool CTA from markdown (pattern: **label** [title](href) — description)
    let toolCta: { label: string; title: string; href: string; description: string } | null = null;
    const ctaPattern = /\*\*(.+?)\*\*\s*\[(.+?)\]\((.+?)\)\s*[—–-]\s*(.+?)(?:\.|$)/m;
    const ctaMatch = expandedMarkdown.match(ctaPattern);
    if (ctaMatch) {
      toolCta = {
        label: ctaMatch[1].trim(),
        title: ctaMatch[2].trim(),
        href: ctaMatch[3].trim(),
        description: ctaMatch[4].trim(),
      };
      // Remove the CTA line from markdown so it's not rendered inline
      expandedMarkdown = expandedMarkdown.replace(ctaPattern, '').trim();
    }

    // Convert markdown to HTML (after extracting CTA)
    const htmlContent = markdownToHtml(expandedMarkdown);

    // Generate Article schema for structured data
    const articleSchema = generateArticleSchema({
      title,
      description,
      url: canonicalUrl,
    });

    const templateData = {
      title,
      description,
      lede: frontmatter.lede || null,
      readTime,
      category,
      toolCta,
      content: htmlContent,
      relatedLinks,
      relatedRolePages,
      canonical: canonicalUrl,
      posthogKey: POSTHOG_KEY,
      pageType: "pillar",
      pageSlug: safeSlug,
      headExtra: articleSchema,
      organizationSchema: generateOrganizationSchema(),
    };

    // Render the pillar template
    const pillarTemplatePath = path.join(templatesDir, "pillar.ejs");
    const pillarHtml = await ejs.renderFile(pillarTemplatePath, templateData);

    // Render the pillar-specific layout (full-width sections, no sp-main wrapper)
    const layoutTemplatePath = path.join(templatesDir, "layout-pillar.ejs");
    const fullHtml = await ejs.renderFile(layoutTemplatePath, {
      ...templateData,
      body: pillarHtml,
    });

    res.set("Content-Type", "text/html");
    res.set("X-SP-SEO", "1");
    res.send(fullHtml);
  } catch (error) {
    console.error(`[SEO] Error rendering guide ${safeSlug}:`, error);
    res.status(500).send("Error rendering guide");
  }
}

// Render the guides index page
export async function renderGuidesIndex(_req: Request, res: Response) {
  console.log("[SEO HIT]", _req.method, _req.originalUrl);
  const baseUrl = getBaseUrl();

  // Transform pillars to include descriptions
  const guides = ALL_PILLARS.map(p => ({
    title: p.title,
    slug: p.slug,
    description: "A practical framework for career decisions",
  }));

  const canonicalUrl = `${baseUrl}/guides`;
  const title = "Career Guides";
  const description = "Practical career guides for executives and senior leaders. Frameworks, scripts, and action plans for career decisions.";

  const templateData = {
    title,
    description,
    guides,
    canonical: canonicalUrl,
    posthogKey: POSTHOG_KEY,
    pageType: "guides-index",
    pageSlug: "guides",
    organizationSchema: generateOrganizationSchema(),
  };

  try {
    const guidesTemplatePath = path.join(templatesDir, "guides.ejs");
    const guidesHtml = await ejs.renderFile(guidesTemplatePath, templateData);

    const layoutTemplatePath = path.join(templatesDir, "layout-pillar.ejs");
    const fullHtml = await ejs.renderFile(layoutTemplatePath, {
      ...templateData,
      body: guidesHtml,
    });

    res.set("Content-Type", "text/html");
    res.set("X-SP-SEO", "1");
    res.send(fullHtml);
  } catch (error) {
    console.error("[SEO] Error rendering guides index:", error);
    res.status(500).send("Error rendering guides");
  }
}

// Robots.txt
export function robots(_req: Request, res: Response) {
  const baseUrl = getBaseUrl();
  const content = `User-agent: *
Allow: /

Sitemap: ${baseUrl}/sitemap.xml
`;
  res.set("Content-Type", "text/plain");
  res.send(content);
}

// Sitemap.xml
export function sitemap(_req: Request, res: Response) {
  const baseUrl = getBaseUrl();

  // Static pages, pillars, and programmatic pages
  const programmaticPages = getAllProgrammaticPages();

  const pages = [
    { loc: "/", priority: "1.0" },
    { loc: "/resources", priority: "0.9" },
    { loc: "/guides", priority: "0.9" },
    { loc: "/roles", priority: "0.8" },
    { loc: "/tools/stay-or-go-calculator", priority: "0.9" },
    ...ALL_PILLARS.map(p => ({ loc: `/guides/${p.slug}`, priority: "0.8" })),
    ...programmaticPages.map(p => ({ loc: `/roles/${p.role}/situations/${p.situation}`, priority: "0.6" })),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map((p) => `  <url>
    <loc>${baseUrl}${p.loc}</loc>
    <priority>${p.priority}</priority>
  </url>`).join("\n")}
</urlset>`;

  res.set("Content-Type", "application/xml");
  res.send(xml);
}

// Render a programmatic page
export async function renderProgrammaticPage(req: Request, res: Response) {
  const { role, situation } = req.params;

  // Validate role and situation
  if (!ROLES[role] || !SITUATIONS[situation]) {
    return res.status(404).send(`
      <!DOCTYPE html>
      <html>
      <head><title>Page Not Found | Serious People</title></head>
      <body style="font-family: Georgia, serif; max-width: 600px; margin: 4rem auto; text-align: center;">
        <h1>Page Not Found</h1>
        <p>The page you're looking for doesn't exist.</p>
        <p><a href="/roles">Browse all roles</a> or <a href="/guides">view our guides</a>.</p>
      </body>
      </html>
    `);
  }

  try {
    const roleLabel = ROLES[role];
    const situationLabel = SITUATIONS[situation];

    // Compose the page content
    const { content: markdown, wordCount } = composeProgrammaticPage(role, situation);

    // Convert to HTML
    const htmlContent = markdownToHtml(markdown);

    // Get related pillar links
    const pillarSlugs = SITUATION_PILLARS[situation] || [];
    const relatedLinks = pillarSlugs.map(slug => {
      const pillar = ALL_PILLARS.find(p => p.slug === slug);
      return pillar ? { href: `/guides/${slug}`, title: pillar.title } : null;
    }).filter(Boolean) as Array<{ href: string; title: string }>;

    // Get related situations for the same role (other situations)
    const allSituations = [
      { slug: "stay-or-go", label: "Stay or Go" },
      { slug: "burnout", label: "Burnout" },
      { slug: "bad-manager", label: "Bad Manager" },
      { slug: "toxic-culture", label: "Toxic Culture" },
      { slug: "severance", label: "Severance" },
      { slug: "internal-pivot", label: "Internal Pivot" },
      { slug: "job-search", label: "Job Search" },
      { slug: "offer-evaluation", label: "Offer Evaluation" },
      { slug: "resignation", label: "Resignation" },
      { slug: "layoff-risk", label: "Layoff Risk" },
    ];
    const relatedSituations = allSituations
      .filter(s => s.slug !== situation)
      .slice(0, 6);

    // Title patterns - matching RoleSituation.tsx lines 40-41 exactly
    const title = `${situationLabel} for ${roleLabel}: A Practical Framework`;
    const subtitle = `Practical guidance for ${roleLabel} professionals facing ${situationLabel.toLowerCase()} situations.`;
    const description = `A no-fluff guide to ${situationLabel.toLowerCase()} for ${roleLabel}—framework, common mistakes, examples, and scripts. Includes a 14-day plan and a clear next step.`;

    // Check quality threshold (700 words minimum for programmatic)
    const shouldIndex = wordCount >= 700;

    // Generate canonical URL
    const canonicalUrl = `${getBaseUrl()}/roles/${role}/situations/${situation}`;

    // Generate Article schema for structured data
    const articleSchema = generateArticleSchema({
      title: `${title}: A Practical Framework`,
      description,
      url: canonicalUrl,
    });

    // Prepare template data for role-situation.ejs
    const templateData = {
      title,
      subtitle,
      description,
      roleSlug: role,
      roleTitle: roleLabel,
      situationSlug: situation,
      situationTitle: situationLabel,
      content: htmlContent,
      relatedLinks,
      relatedSituations,
      canonical: canonicalUrl,
      noindex: !shouldIndex,
      posthogKey: POSTHOG_KEY,
      pageType: "role-situation",
      pageSlug: `${role}/${situation}`,
      headExtra: articleSchema,
      organizationSchema: generateOrganizationSchema(),
    };

    // Render the role-situation template
    const roleSituationTemplatePath = path.join(templatesDir, "role-situation.ejs");
    const pageHtml = await ejs.renderFile(roleSituationTemplatePath, templateData);

    // Render the layout with the page content
    const layoutTemplatePath = path.join(templatesDir, "layout-pillar.ejs");
    const fullHtml = await ejs.renderFile(layoutTemplatePath, {
      ...templateData,
      body: pageHtml,
    });

    res.set("Content-Type", "text/html");
    res.set("X-SP-SEO", "1");
    res.send(fullHtml);
  } catch (error) {
    console.error(`[SEO] Error rendering programmatic page ${role}/${situation}:`, error);
    res.status(500).send("Error rendering page");
  }
}

// Render the roles index page
export async function renderRolesIndex(_req: Request, res: Response) {
  const baseUrl = getBaseUrl();

  // Define roles with descriptions (matching Roles.tsx)
  const roles = [
    { title: "VP Product", slug: "vp-product", description: "Strategic product leadership" },
    { title: "Director of Product", slug: "director-product", description: "Product team management" },
    { title: "VP Engineering", slug: "vp-engineering", description: "Engineering organization leadership" },
    { title: "Director of Engineering", slug: "director-engineering", description: "Engineering team management" },
    { title: "Chief of Staff", slug: "chief-of-staff", description: "Executive operations" },
    { title: "VP Operations", slug: "vp-operations", description: "Operational excellence" },
  ];

  // Define situations (matching Roles.tsx)
  const situations = [
    { slug: "stay-or-go", label: "Stay or Go" },
    { slug: "burnout", label: "Burnout" },
    { slug: "bad-manager", label: "Bad Manager" },
    { slug: "toxic-culture", label: "Toxic Culture" },
    { slug: "severance", label: "Severance" },
    { slug: "internal-pivot", label: "Internal Pivot" },
    { slug: "job-search", label: "Job Search" },
    { slug: "offer-evaluation", label: "Offer Evaluation" },
    { slug: "resignation", label: "Resignation" },
    { slug: "layoff-risk", label: "Layoff Risk" },
  ];

  const canonicalUrl = `${baseUrl}/roles`;
  const title = "Career Guidance by Role";
  const description = "Role-specific career guidance for executives and senior leaders. Practical frameworks for every situation.";

  const templateData = {
    title,
    description,
    roles,
    situations,
    canonical: canonicalUrl,
    posthogKey: POSTHOG_KEY,
    pageType: "roles-index",
    pageSlug: "roles",
    organizationSchema: generateOrganizationSchema(),
  };

  try {
    const rolesTemplatePath = path.join(templatesDir, "roles.ejs");
    const rolesHtml = await ejs.renderFile(rolesTemplatePath, templateData);

    const layoutTemplatePath = path.join(templatesDir, "layout-pillar.ejs");
    const fullHtml = await ejs.renderFile(layoutTemplatePath, {
      ...templateData,
      body: rolesHtml,
    });

    res.set("Content-Type", "text/html");
    res.set("X-SP-SEO", "1");
    res.send(fullHtml);
  } catch (error) {
    console.error("[SEO] Error rendering roles index:", error);
    res.status(500).send("Error rendering roles");
  }
}

// Render a single role page (shows all situations for that role)
export async function renderRolePage(req: Request, res: Response) {
  const baseUrl = getBaseUrl();
  const { role } = req.params;

  // Define roles with descriptions (matching Roles.tsx)
  const rolesData: Record<string, { title: string; description: string }> = {
    "vp-product": { title: "VP Product", description: "Strategic product leadership" },
    "director-product": { title: "Director of Product", description: "Product team management" },
    "vp-engineering": { title: "VP Engineering", description: "Engineering organization leadership" },
    "director-engineering": { title: "Director of Engineering", description: "Engineering team management" },
    "chief-of-staff": { title: "Chief of Staff", description: "Executive operations" },
    "vp-operations": { title: "VP Operations", description: "Operational excellence" },
  };

  const roleData = rolesData[role];
  if (!roleData) {
    res.status(404).send("Role not found");
    return;
  }

  // Define situations (matching Roles.tsx)
  const situations = [
    { slug: "stay-or-go", label: "Stay or Go" },
    { slug: "burnout", label: "Burnout" },
    { slug: "bad-manager", label: "Bad Manager" },
    { slug: "toxic-culture", label: "Toxic Culture" },
    { slug: "severance", label: "Severance" },
    { slug: "internal-pivot", label: "Internal Pivot" },
    { slug: "job-search", label: "Job Search" },
    { slug: "offer-evaluation", label: "Offer Evaluation" },
    { slug: "resignation", label: "Resignation" },
    { slug: "layoff-risk", label: "Layoff Risk" },
  ];

  const canonicalUrl = `${baseUrl}/roles/${role}`;
  const title = `${roleData.title} Career Guidance`;
  const description = `Career guidance for ${roleData.title}s. ${roleData.description}. Practical frameworks for every situation.`;

  const templateData = {
    title,
    description,
    roleTitle: roleData.title,
    roleSlug: role,
    roleDescription: roleData.description,
    situations,
    canonical: canonicalUrl,
    posthogKey: POSTHOG_KEY,
    pageType: "role",
    pageSlug: role,
    organizationSchema: generateOrganizationSchema(),
  };

  try {
    const roleTemplatePath = path.join(templatesDir, "role.ejs");
    const roleHtml = await ejs.renderFile(roleTemplatePath, templateData);

    const layoutTemplatePath = path.join(templatesDir, "layout-pillar.ejs");
    const fullHtml = await ejs.renderFile(layoutTemplatePath, {
      ...templateData,
      body: roleHtml,
    });

    res.set("Content-Type", "text/html");
    res.set("X-SP-SEO", "1");
    res.send(fullHtml);
  } catch (error) {
    console.error(`[SEO] Error rendering role page ${role}:`, error);
    res.status(500).send("Error rendering role page");
  }
}

// Render the Stay-or-Go Calculator tool
export async function renderStayOrGoCalculator(_req: Request, res: Response) {
  const baseUrl = getBaseUrl();
  const templatesDir = path.join(process.cwd(), "seo", "templates");

  const canonicalUrl = `${baseUrl}/tools/stay-or-go-calculator`;
  const title = "Should You Stay or Go? Career Decision Calculator";
  const description = "A 2-minute quiz to help you decide whether to stay at your current job or explore new opportunities. Get a personalized recommendation based on your situation.";

  // Generate WebPage schema for structured data
  const webPageSchema = generateWebPageSchema({
    title,
    description,
    url: canonicalUrl,
  });

  try {
    const templatePath = path.join(templatesDir, "stay-or-go-calculator.ejs");
    const html = await ejs.renderFile(templatePath, {
      canonical: canonicalUrl,
      posthogKey: POSTHOG_KEY,
      structuredData: webPageSchema,
    });

    res.set("Content-Type", "text/html");
    res.set("X-SP-SEO", "1");
    res.send(html);
  } catch (error) {
    console.error("[SEO] Error rendering Stay-or-Go Calculator:", error);
    res.status(500).send("Error rendering calculator");
  }
}

// Render the SEO Content Hub page (Resources)
export async function renderContentHub(_req: Request, res: Response) {
  const baseUrl = getBaseUrl();

  // Transform pillars to guides format
  const guides = ALL_PILLARS.map(p => ({
    title: p.title,
    slug: p.slug,
  }));

  // Define roles matching Resources.tsx
  const roles = [
    { title: "VP Product", slug: "vp-product" },
    { title: "Director of Product", slug: "director-product" },
    { title: "VP Engineering", slug: "vp-engineering" },
    { title: "Director of Engineering", slug: "director-engineering" },
    { title: "Chief of Staff", slug: "chief-of-staff" },
    { title: "VP Operations", slug: "vp-operations" },
  ];

  const canonicalUrl = `${baseUrl}/resources`;
  const title = "Career Resources Hub";
  const description = "Complete career coaching resource library. Guides, frameworks, tools, and role-specific advice for executives navigating career transitions.";

  const templateData = {
    title,
    description,
    guides,
    roles,
    canonical: canonicalUrl,
    posthogKey: POSTHOG_KEY,
    pageType: "resources",
    pageSlug: "resources",
    organizationSchema: generateOrganizationSchema(),
  };

  try {
    const resourcesTemplatePath = path.join(templatesDir, "resources.ejs");
    const resourcesHtml = await ejs.renderFile(resourcesTemplatePath, templateData);

    const layoutTemplatePath = path.join(templatesDir, "layout-pillar.ejs");
    const fullHtml = await ejs.renderFile(layoutTemplatePath, {
      ...templateData,
      body: resourcesHtml,
    });

    res.set("Content-Type", "text/html");
    res.set("X-SP-SEO", "1");
    res.send(fullHtml);
  } catch (error) {
    console.error("[SEO] Error rendering resources:", error);
    res.status(500).send("Error rendering resources");
  }
}
