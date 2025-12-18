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
  
  // Convert numbered lists
  const lines2 = html.split("\n");
  let inOl = false;
  const processedLines2: string[] = [];
  
  for (let i = 0; i < lines2.length; i++) {
    const line = lines2[i];
    const isOlItem = /^\d+\. (.+)$/.test(line);
    
    if (isOlItem && !inOl) {
      inOl = true;
      processedLines2.push("<ol>");
    }
    
    if (!isOlItem && inOl) {
      inOl = false;
      processedLines2.push("</ol>");
    }
    
    if (isOlItem) {
      processedLines2.push(line.replace(/^\d+\. (.+)$/, "<li>$1</li>"));
    } else {
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
  "product-manager": "Product Manager",
  "director-engineering": "Director of Engineering",
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
    const expandedMarkdown = processModuleIncludes(markdownBody);
    
    // Convert markdown to HTML
    const htmlContent = markdownToHtml(expandedMarkdown);
    
    // Get related links (other pillars + role-specific pages)
    const relatedLinks = getRelatedLinks(safeSlug);
    const relatedRolePages = getRelatedProgrammaticPages(safeSlug);
    
    // Prepare template data
    const canonicalUrl = `${getBaseUrl()}/guides/${safeSlug}`;
    const title = frontmatter.title || "Guide";
    const description = frontmatter.description || "A career coaching guide from Serious People.";
    
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
    
    // Render the layout with the pillar content
    const layoutTemplatePath = path.join(templatesDir, "layout.ejs");
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
  
  // Use all available pillars
  const pillars = ALL_PILLARS;
  
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Career Guides | Serious People</title>
  <meta name="description" content="Practical career guides for executives and senior leaders. Frameworks, scripts, and action plans for career decisions.">
  <link rel="canonical" href="${baseUrl}/guides">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${baseUrl}/guides">
  <meta property="og:title" content="Career Guides | Serious People">
  <meta property="og:description" content="Practical career guides for executives and senior leaders.">
  ${getSeoStyleHead()}
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: var(--sp-font-body); background: var(--sp-bg); color: var(--sp-text); line-height: 1.6; }
    .header { text-align: center; padding: 1.5rem 1rem; border-bottom: 3px double var(--sp-text); }
    .header-logo { font-family: var(--sp-font-display); font-size: 1.75rem; font-weight: 700; text-transform: uppercase; text-decoration: none; color: var(--sp-text); }
    .main { max-width: 680px; margin: 0 auto; padding: 2rem 1.5rem 4rem; }
    h1 { font-family: var(--sp-font-display); font-size: 2.5rem; margin-bottom: 1rem; }
    .intro { color: var(--sp-text-secondary); margin-bottom: 2rem; }
    .guide-list { list-style: none; }
    .guide-item { border-bottom: 1px solid var(--sp-border); padding: 1rem 0; }
    .guide-item a { font-family: var(--sp-font-display); font-size: 1.25rem; color: var(--sp-text); text-decoration: none; }
    .guide-item a:hover { text-decoration: underline; }
    .footer { border-top: 3px double var(--sp-text); padding: 2rem; text-align: center; font-size: 0.8rem; color: var(--sp-text-secondary); }
  </style>
</head>
<body>
  <header class="header">
    <a href="/" class="header-logo">Serious People</a>
  </header>
  <main class="main">
    <h1>Career Guides</h1>
    <p class="intro">Practical frameworks for serious career decisions. No fluff, no platitudes—just clarity.</p>
    <ul class="guide-list">
      ${pillars.map((p) => `
        <li class="guide-item">
          <a href="/guides/${p.slug}">${p.title}</a>
        </li>
      `).join("")}
    </ul>
  </main>
  <footer class="footer">
    <p>&copy; ${new Date().getFullYear()} Serious People</p>
  </footer>
  ${getPostHogScript("index", "guides", "Career Guides")}
</body>
</html>
  `;
  
  res.set("Content-Type", "text/html");
  res.set("X-SP-SEO", "1");
  res.send(html);
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
    
    // Get adjacent pages (same role, different situations OR same situation, different roles)
    const allPages = getAllProgrammaticPages();
    const adjacentPages = allPages
      .filter(p => (p.role === role && p.situation !== situation) || (p.situation === situation && p.role !== role))
      .slice(0, 4)
      .map(p => ({
        href: `/roles/${p.role}/situations/${p.situation}`,
        title: `${ROLES[p.role]}: ${SITUATIONS[p.situation]}`,
      }));
    
    // Title patterns
    const title = `${situationLabel} for ${roleLabel}: A Practical Framework`;
    const description = `A no-fluff guide to ${situationLabel.toLowerCase()} for ${roleLabel}—framework, common mistakes, examples, and scripts. Includes a 14-day plan and a clear next step.`;
    const lede = `Practical guidance for ${roleLabel} professionals facing ${situationLabel.toLowerCase()} situations.`;
    
    // Check quality threshold (700 words minimum for programmatic)
    const shouldIndex = wordCount >= 700;
    
    // Generate canonical URL
    const canonicalUrl = `${getBaseUrl()}/roles/${role}/situations/${situation}`;
    
    // Generate Article schema for structured data
    const articleSchema = generateArticleSchema({
      title,
      description,
      url: canonicalUrl,
    });
    
    // Prepare template data
    const templateData = {
      title,
      description,
      lede,
      content: htmlContent,
      relatedLinks,
      adjacentPages,
      canonical: canonicalUrl,
      noindex: !shouldIndex,
      posthogKey: POSTHOG_KEY,
      pageType: "programmatic",
      pageSlug: `${role}/${situation}`,
      headExtra: articleSchema,
      organizationSchema: generateOrganizationSchema(),
    };
    
    // Render the programmatic template
    const programmaticTemplatePath = path.join(templatesDir, "programmatic.ejs");
    const pageHtml = await ejs.renderFile(programmaticTemplatePath, templateData);
    
    // Render the layout with the page content
    const layoutTemplatePath = path.join(templatesDir, "layout.ejs");
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
  
  const allPages = getAllProgrammaticPages();
  
  // Group by role
  const roleGroups: Record<string, string[]> = {};
  for (const page of allPages) {
    if (!roleGroups[page.role]) {
      roleGroups[page.role] = [];
    }
    roleGroups[page.role].push(page.situation);
  }
  
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Career Guidance by Role | Serious People</title>
  <meta name="description" content="Role-specific career guidance for executives and senior leaders. Practical frameworks for every situation.">
  <link rel="canonical" href="${baseUrl}/roles">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${baseUrl}/roles">
  <meta property="og:title" content="Career Guidance by Role | Serious People">
  <meta property="og:description" content="Role-specific career guidance for executives and senior leaders.">
  ${getSeoStyleHead()}
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: var(--sp-font-body); background: var(--sp-bg); color: var(--sp-text); line-height: 1.6; }
    .header { text-align: center; padding: 1.5rem 1rem; border-bottom: 3px double var(--sp-text); }
    .header-logo { font-family: var(--sp-font-display); font-size: 1.75rem; font-weight: 700; text-transform: uppercase; text-decoration: none; color: var(--sp-text); }
    .main { max-width: 680px; margin: 0 auto; padding: 2rem 1.5rem 4rem; }
    h1 { font-family: var(--sp-font-display); font-size: 2.5rem; margin-bottom: 1rem; }
    .intro { color: var(--sp-text-secondary); margin-bottom: 2rem; }
    .role-section { margin-bottom: 2rem; }
    .role-title { font-family: var(--sp-font-display); font-size: 1.5rem; margin-bottom: 0.5rem; }
    .situation-list { list-style: none; margin-left: 1rem; }
    .situation-item { padding: 0.25rem 0; }
    .situation-item a { color: var(--sp-text); text-decoration: none; }
    .situation-item a:hover { text-decoration: underline; }
    .footer { border-top: 3px double var(--sp-text); padding: 2rem; text-align: center; font-size: 0.8rem; color: var(--sp-text-secondary); }
  </style>
</head>
<body>
  <header class="header">
    <a href="/" class="header-logo">Serious People</a>
  </header>
  <main class="main">
    <h1>Career Guidance by Role</h1>
    <p class="intro">Find guidance tailored to your specific role and situation.</p>
    ${Object.entries(roleGroups).map(([role, situations]) => `
      <section class="role-section">
        <h2 class="role-title">${ROLES[role]}</h2>
        <ul class="situation-list">
          ${situations.map(sit => `
            <li class="situation-item">
              <a href="/roles/${role}/situations/${sit}">${SITUATIONS[sit]}</a>
            </li>
          `).join("")}
        </ul>
      </section>
    `).join("")}
  </main>
  <footer class="footer">
    <p>&copy; ${new Date().getFullYear()} Serious People</p>
  </footer>
  ${getPostHogScript("index", "roles", "Career Guidance by Role")}
</body>
</html>
  `;
  
  res.set("Content-Type", "text/html");
  res.set("X-SP-SEO", "1");
  res.send(html);
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

// Render the SEO Content Hub page
export async function renderContentHub(_req: Request, res: Response) {
  const baseUrl = getBaseUrl();
  const allPages = getAllProgrammaticPages();
  
  // Group programmatic pages by situation for better organization
  const situationGroups: Record<string, Array<{ role: string; situation: string }>> = {};
  for (const page of allPages) {
    if (!situationGroups[page.situation]) {
      situationGroups[page.situation] = [];
    }
    situationGroups[page.situation].push(page);
  }
  
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Career Resources Hub | Serious People</title>
  <meta name="description" content="Complete career coaching resource library. Guides, frameworks, tools, and role-specific advice for executives navigating career transitions.">
  <link rel="canonical" href="${baseUrl}/resources">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${baseUrl}/resources">
  <meta property="og:title" content="Career Resources Hub | Serious People">
  <meta property="og:description" content="Complete career coaching resource library for executives and senior leaders.">
  ${getSeoStyleHead()}
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: var(--sp-font-body); background: var(--sp-bg); color: var(--sp-text); line-height: 1.6; }
    .header { text-align: center; padding: 1.5rem 1rem; border-bottom: 3px double var(--sp-text); }
    .header-logo { font-family: var(--sp-font-display); font-size: 1.75rem; font-weight: 700; text-transform: uppercase; text-decoration: none; color: var(--sp-text); }
    .main { max-width: 900px; margin: 0 auto; padding: 2rem 1.5rem 4rem; }
    h1 { font-family: var(--sp-font-display); font-size: 2.5rem; margin-bottom: 0.5rem; }
    .intro { color: var(--sp-text-secondary); margin-bottom: 2.5rem; font-size: 1.1rem; }
    .section { margin-bottom: 3rem; }
    .section-title { font-family: var(--sp-font-display); font-size: 1.75rem; margin-bottom: 1rem; padding-bottom: 0.5rem; border-bottom: 1px solid var(--sp-border); }
    .section-subtitle { color: var(--sp-text-secondary); margin-bottom: 1rem; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1rem; }
    .card { padding: 1rem; border: 1px solid var(--sp-border); background: var(--sp-bg-elevated); }
    .card a { font-family: var(--sp-font-display); font-size: 1.1rem; color: var(--sp-text); text-decoration: none; }
    .card a:hover { text-decoration: underline; }
    .card-desc { font-size: 0.9rem; color: var(--sp-text-secondary); margin-top: 0.25rem; }
    .tool-card { background: var(--sp-accent); border-color: var(--sp-accent); }
    .tool-card a { color: var(--sp-accent-foreground); }
    .tool-card .card-desc { color: var(--sp-accent-foreground); opacity: 0.85; }
    .situation-section { margin-bottom: 1.5rem; }
    .situation-title { font-family: var(--sp-font-display); font-size: 1.25rem; margin-bottom: 0.5rem; }
    .role-list { list-style: none; display: flex; flex-wrap: wrap; gap: 0.5rem; }
    .role-item a { font-size: 0.9rem; color: var(--sp-text); text-decoration: none; padding: 0.25rem 0.5rem; background: var(--sp-bg-elevated); border: 1px solid var(--sp-border); }
    .role-item a:hover { background: var(--sp-text); color: var(--sp-bg); }
    .footer { border-top: 3px double var(--sp-text); padding: 2rem; text-align: center; font-size: 0.8rem; color: var(--sp-text-secondary); }
    .cta-section { text-align: center; padding: 2rem; background: var(--sp-bg-elevated); border: 2px solid var(--sp-text); margin: 2rem 0; }
    .cta-section h3 { font-family: var(--sp-font-display); margin-bottom: 0.5rem; }
    .cta-button { display: inline-block; margin-top: 1rem; padding: 0.75rem 2rem; background: var(--sp-text); color: var(--sp-bg); text-decoration: none; font-family: var(--sp-font-body); }
    .cta-button:hover { background: var(--sp-accent); }
  </style>
</head>
<body>
  <header class="header">
    <a href="/" class="header-logo">Serious People</a>
  </header>
  <main class="main">
    <h1>Career Resources Hub</h1>
    <p class="intro">Everything you need to navigate serious career decisions. Frameworks, scripts, and practical guidance—no fluff.</p>
    
    <!-- Interactive Tools -->
    <section class="section">
      <h2 class="section-title">Interactive Tools</h2>
      <p class="section-subtitle">Quick assessments to clarify your thinking</p>
      <div class="grid">
        <div class="card tool-card">
          <a href="/tools/stay-or-go-calculator">Stay-or-Go Calculator</a>
          <p class="card-desc">A 2-minute quiz to help you decide whether to stay or leave</p>
        </div>
      </div>
    </section>
    
    <!-- Career Guides (Pillars) -->
    <section class="section">
      <h2 class="section-title">Career Guides</h2>
      <p class="section-subtitle">In-depth frameworks for major career decisions</p>
      <div class="grid">
        ${ALL_PILLARS.map(p => `
          <div class="card">
            <a href="/guides/${p.slug}">${p.title}</a>
          </div>
        `).join("")}
      </div>
    </section>
    
    <!-- Role-Specific Guidance -->
    <section class="section">
      <h2 class="section-title">Role-Specific Guidance</h2>
      <p class="section-subtitle">Tailored advice for your role and situation</p>
      ${Object.entries(situationGroups).map(([situation, pages]) => `
        <div class="situation-section">
          <h3 class="situation-title">${SITUATIONS[situation]}</h3>
          <ul class="role-list">
            ${pages.map(p => `
              <li class="role-item">
                <a href="/roles/${p.role}/situations/${p.situation}">${ROLES[p.role]}</a>
              </li>
            `).join("")}
          </ul>
        </div>
      `).join("")}
    </section>
    
    <!-- CTA -->
    <div class="cta-section">
      <h3>Ready for Personalized Guidance?</h3>
      <p>Get a clear recommendation, conversation scripts, and a 14-day action plan.</p>
      <a href="/interview" class="cta-button" data-testid="cta-start-session">Start Your Free Session</a>
    </div>
  </main>
  <footer class="footer">
    <p>&copy; ${new Date().getFullYear()} Serious People</p>
  </footer>
  ${getPostHogScript("hub", "resources", "Career Resources Hub")}
</body>
</html>
  `;
  
  res.set("Content-Type", "text/html");
  res.set("X-SP-SEO", "1");
  res.send(html);
}
