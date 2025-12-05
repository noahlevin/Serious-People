import puppeteer, { Browser } from "puppeteer";
import { ObjectStorageService } from "./objectStorage";
import { storage } from "./storage";
import type { SeriousPlanArtifact, SeriousPlan } from "@shared/schema";

const objectStorageService = new ObjectStorageService();

function getWsjCss(): string {
  return `
    @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700&family=Source+Serif+4:wght@400;500;600&display=swap');
    
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Source Serif 4', Georgia, serif;
      font-size: 11pt;
      line-height: 1.6;
      color: #1a1a1a;
      background: #fff;
      padding: 0.75in 0.85in;
      max-width: 8.5in;
    }
    
    .header {
      text-align: center;
      margin-bottom: 0.4in;
      padding-bottom: 0.15in;
      border-bottom: 2px solid #1a1a1a;
    }
    
    .header h1 {
      font-family: 'Playfair Display', Georgia, serif;
      font-size: 20pt;
      font-weight: 600;
      letter-spacing: -0.02em;
      margin-bottom: 0.1in;
      color: #1a1a1a;
    }
    
    .header .subtitle {
      font-family: 'Source Serif 4', Georgia, serif;
      font-size: 10pt;
      color: #666;
      text-transform: uppercase;
      letter-spacing: 0.15em;
    }
    
    .section {
      margin-bottom: 0.3in;
    }
    
    .section-title {
      font-family: 'Playfair Display', Georgia, serif;
      font-size: 13pt;
      font-weight: 600;
      margin-bottom: 0.15in;
      padding-bottom: 0.08in;
      border-bottom: 1px solid #ddd;
      color: #1a1a1a;
    }
    
    h1 { font-size: 18pt; margin: 0.2in 0 0.1in; font-family: 'Playfair Display', Georgia, serif; }
    h2 { font-size: 14pt; margin: 0.15in 0 0.08in; font-family: 'Playfair Display', Georgia, serif; }
    h3 { font-size: 12pt; margin: 0.1in 0 0.06in; font-family: 'Playfair Display', Georgia, serif; }
    
    p {
      margin-bottom: 0.1in;
      text-align: justify;
      hyphens: auto;
    }
    
    ul, ol {
      margin: 0.08in 0 0.12in 0.25in;
      padding: 0;
    }
    
    li {
      margin-bottom: 0.05in;
    }
    
    .callout {
      background: #faf7f2;
      border-left: 3px solid #1a1a1a;
      padding: 0.12in 0.15in;
      margin: 0.12in 0;
      font-style: italic;
    }
    
    .highlight-box {
      border: 1px solid #1a1a1a;
      padding: 0.15in;
      margin: 0.15in 0;
    }
    
    .highlight-box-title {
      font-family: 'Playfair Display', Georgia, serif;
      font-weight: 600;
      font-size: 11pt;
      margin-bottom: 0.08in;
    }
    
    blockquote {
      border-left: 2px solid #999;
      padding-left: 0.15in;
      margin: 0.1in 0;
      color: #444;
      font-style: italic;
    }
    
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 0.12in 0;
      font-size: 10pt;
    }
    
    th, td {
      border: 1px solid #ddd;
      padding: 0.08in;
      text-align: left;
    }
    
    th {
      background: #f5f5f5;
      font-weight: 600;
    }
    
    .footer {
      margin-top: 0.3in;
      padding-top: 0.1in;
      border-top: 1px solid #ddd;
      font-size: 9pt;
      color: #666;
      text-align: center;
    }
    
    .importance-badge {
      display: inline-block;
      font-size: 8pt;
      padding: 0.02in 0.08in;
      border-radius: 2px;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    
    .importance-must-read { background: #1a1a1a; color: #fff; }
    .importance-recommended { background: #f5f5f5; color: #1a1a1a; border: 1px solid #ddd; }
    .importance-optional { background: #fff; color: #666; border: 1px solid #ddd; }
    
    .script-section {
      background: #faf7f2;
      border: 1px solid #e5e5e5;
      padding: 0.12in;
      margin: 0.1in 0;
      font-family: 'Source Serif 4', Georgia, serif;
    }
    
    .script-label {
      font-weight: 600;
      font-size: 9pt;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #666;
      margin-bottom: 0.05in;
    }
    
    code {
      font-family: 'Courier New', monospace;
      font-size: 10pt;
      background: #f5f5f5;
      padding: 0.02in 0.05in;
    }
    
    pre {
      background: #f5f5f5;
      padding: 0.1in;
      overflow-x: auto;
      font-size: 9pt;
      margin: 0.1in 0;
    }
    
    hr {
      border: none;
      border-top: 1px solid #ddd;
      margin: 0.15in 0;
    }
    
    strong { font-weight: 600; }
    em { font-style: italic; }
    
    @media print {
      body { padding: 0; }
      .page-break { page-break-before: always; }
    }
  `;
}

function markdownToHtml(markdown: string): string {
  return markdown
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>')
    .replace(/(<li>.*<\/li>)\n(?!<li>)/g, '</ul>$1\n')
    .replace(/(?<!<\/ul>)(<li>)/g, '<ul>$1')
    .replace(/<\/li>\n<\/ul>/g, '</li></ul>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/^(?!<[hublop])(.+)$/gm, (match) => {
      if (match.startsWith('<')) return match;
      return `<p>${match}</p>`;
    })
    .replace(/<p><\/p>/g, '')
    .replace(/<p>(<[hublop])/g, '$1')
    .replace(/(<\/[hublop][^>]*>)<\/p>/g, '$1');
}

function buildArtifactHtml(artifact: SeriousPlanArtifact, clientName: string): string {
  const importanceBadge = artifact.importanceLevel === 'must_read' 
    ? '<span class="importance-badge importance-must-read">Must Read</span>'
    : artifact.importanceLevel === 'recommended'
    ? '<span class="importance-badge importance-recommended">Recommended</span>'
    : '<span class="importance-badge importance-optional">Optional</span>';

  const contentHtml = markdownToHtml(artifact.contentRaw || '');

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${artifact.title}</title>
      <style>${getWsjCss()}</style>
    </head>
    <body>
      <div class="header">
        <h1>${artifact.title}</h1>
        <div class="subtitle">Prepared for ${clientName} • Serious People Coaching</div>
      </div>
      
      ${artifact.whyImportant ? `
        <div class="callout">
          <strong>Why this matters for you:</strong> ${artifact.whyImportant}
        </div>
      ` : ''}
      
      <div class="content">
        ${contentHtml}
      </div>
      
      <div class="footer">
        ${importanceBadge}
        <br>
        Serious People Career Coaching • Generated ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
      </div>
    </body>
    </html>
  `;
}

function buildBundleHtml(plan: SeriousPlan, artifacts: SeriousPlanArtifact[], clientName: string): string {
  const artifactSections = artifacts.map((artifact, index) => {
    const pageBreak = index > 0 ? 'page-break' : '';
    const contentHtml = markdownToHtml(artifact.contentRaw || '');
    
    return `
      <div class="artifact-section ${pageBreak}">
        <div class="section-title">${artifact.title}</div>
        ${artifact.whyImportant ? `
          <div class="callout">
            <strong>Why this matters:</strong> ${artifact.whyImportant}
          </div>
        ` : ''}
        <div class="content">
          ${contentHtml}
        </div>
      </div>
    `;
  }).join('\n');

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${clientName}'s Serious Plan</title>
      <style>${getWsjCss()}</style>
    </head>
    <body>
      <div class="header">
        <h1>${clientName}'s Serious Plan</h1>
        <div class="subtitle">Career Coaching Bundle • Serious People</div>
      </div>
      
      <div class="toc">
        <div class="section-title">Contents</div>
        <ul>
          ${artifacts.map((a, i) => `<li>${a.title}</li>`).join('\n')}
        </ul>
      </div>
      
      ${artifactSections}
      
      <div class="footer">
        Complete Coaching Bundle • Serious People Career Coaching
        <br>
        Generated ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
      </div>
    </body>
    </html>
  `;
}

async function getBrowser(): Promise<Browser> {
  return puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  });
}

export async function generateArtifactPdf(
  artifactId: string,
  clientName: string
): Promise<{ success: boolean; url?: string; error?: string }> {
  let browser: Browser | null = null;
  
  try {
    const artifact = await storage.getArtifact(artifactId);
    if (!artifact) {
      return { success: false, error: 'Artifact not found' };
    }
    
    await storage.updateArtifactPdf(artifactId, 'generating');
    
    const html = buildArtifactHtml(artifact, clientName);
    
    browser = await getBrowser();
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    
    const pdfBuffer = await page.pdf({
      format: 'Letter',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });
    
    const fileName = `${artifact.artifactKey}-${artifactId}.pdf`;
    const pdfUrl = await objectStorageService.saveBuffer(Buffer.from(pdfBuffer), fileName, 'application/pdf');
    
    await storage.updateArtifactPdf(artifactId, 'ready', pdfUrl);
    
    return { success: true, url: pdfUrl };
  } catch (error: any) {
    console.error('PDF generation error:', error);
    try {
      await storage.updateArtifactPdf(artifactId, 'error');
    } catch {}
    return { success: false, error: error.message };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

export async function generateBundlePdf(
  planId: string
): Promise<{ success: boolean; url?: string; error?: string }> {
  let browser: Browser | null = null;
  
  try {
    const plan = await storage.getSeriousPlan(planId);
    if (!plan) {
      return { success: false, error: 'Plan not found' };
    }
    
    await storage.updateSeriousPlanBundlePdf(planId, 'generating');
    
    const artifacts = await storage.getArtifactsByPlanId(planId);
    const clientName = (plan.summaryMetadata as any)?.clientName || 'Client';
    
    const html = buildBundleHtml(plan, artifacts, clientName);
    
    browser = await getBrowser();
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    
    const pdfBuffer = await page.pdf({
      format: 'Letter',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });
    
    const fileName = `serious-plan-bundle-${planId}.pdf`;
    const pdfUrl = await objectStorageService.saveBuffer(Buffer.from(pdfBuffer), fileName, 'application/pdf');
    
    await storage.updateSeriousPlanBundlePdf(planId, 'ready', pdfUrl);
    
    return { success: true, url: pdfUrl };
  } catch (error: any) {
    console.error('Bundle PDF generation error:', error);
    try {
      await storage.updateSeriousPlanBundlePdf(planId, 'error');
    } catch {}
    return { success: false, error: error.message };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

export async function generateAllArtifactPdfs(
  planId: string
): Promise<{ success: boolean; generated: number; failed: number; errors: string[] }> {
  const plan = await storage.getSeriousPlan(planId);
  if (!plan) {
    return { success: false, generated: 0, failed: 0, errors: ['Plan not found'] };
  }
  
  const artifacts = await storage.getArtifactsByPlanId(planId);
  const clientName = (plan.summaryMetadata as any)?.clientName || 'Client';
  
  let generated = 0;
  let failed = 0;
  const errors: string[] = [];
  
  for (const artifact of artifacts) {
    const result = await generateArtifactPdf(artifact.id, clientName);
    if (result.success) {
      generated++;
    } else {
      failed++;
      errors.push(`${artifact.artifactKey}: ${result.error}`);
    }
  }
  
  return {
    success: failed === 0,
    generated,
    failed,
    errors,
  };
}
