import type { Request, Response } from "express";
import ejs from "ejs";
import path from "path";
import fs from "fs";

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

// Get related links for a pillar (returns other pillars, excluding self)
function getRelatedLinks(currentSlug: string): Array<{ href: string; title: string }> {
  return ALL_PILLARS
    .filter(p => p.slug !== currentSlug)
    .slice(0, 5)
    .map(p => ({ href: `/guides/${p.slug}`, title: p.title }));
}

// Render a pillar page
export async function renderGuide(req: Request, res: Response) {
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
    
    // Get related links
    const relatedLinks = getRelatedLinks(safeSlug);
    
    // Prepare template data
    const templateData = {
      title: frontmatter.title || "Guide",
      description: frontmatter.description || "A career coaching guide from Serious People.",
      lede: frontmatter.lede || null,
      content: htmlContent,
      relatedLinks,
      canonical: `${getBaseUrl()}/guides/${safeSlug}`,
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
    res.send(fullHtml);
  } catch (error) {
    console.error(`[SEO] Error rendering guide ${safeSlug}:`, error);
    res.status(500).send("Error rendering guide");
  }
}

// Render the guides index page
export async function renderGuidesIndex(_req: Request, res: Response) {
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
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=Source+Serif+4:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --sp-bg: #faf9f6;
      --sp-text: #1a1a1a;
      --sp-text-secondary: #666;
      --sp-border: #d4d4d4;
      --sp-font-display: 'Playfair Display', Georgia, serif;
      --sp-font-body: 'Source Serif 4', Georgia, serif;
    }
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
</body>
</html>
  `;
  
  res.set("Content-Type", "text/html");
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
  
  // Static pages and all pillars
  const pages = [
    { loc: "/", priority: "1.0" },
    { loc: "/guides", priority: "0.9" },
    ...ALL_PILLARS.map(p => ({ loc: `/guides/${p.slug}`, priority: "0.8" })),
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
