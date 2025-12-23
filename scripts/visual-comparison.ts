/**
 * Visual Comparison Script
 * Takes screenshots of SEO pages at 375/768/1024/1280 widths
 * Outputs to /tmp/screens/
 */

import { chromium, type Browser, type Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const WIDTHS = [375, 768, 1024, 1280];
const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';
const OUTPUT_DIR = '/tmp/screens';

const PAGES_TO_TEST = [
  { path: '/', name: 'landing' },
  { path: '/guides', name: 'guides' },
  { path: '/resources', name: 'resources' },
  { path: '/roles', name: 'roles' },
];

async function ensureOutputDir() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
}

async function takeScreenshots(browser: Browser, pagePath: string, pageName: string) {
  console.log(`\nCapturing ${pageName} (${pagePath})...`);
  
  for (const width of WIDTHS) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      deviceScaleFactor: 2,
    });
    
    const page = await context.newPage();
    
    try {
      await page.goto(`${BASE_URL}${pagePath}`, { 
        waitUntil: 'networkidle',
        timeout: 30000 
      });
      
      // Wait for fonts to load
      await page.waitForTimeout(500);
      
      // Take full page screenshot
      const filename = `${pageName}-${width}w.png`;
      const filepath = path.join(OUTPUT_DIR, filename);
      
      await page.screenshot({ 
        path: filepath, 
        fullPage: true 
      });
      
      console.log(`  ✓ ${width}px → ${filename}`);
    } catch (error) {
      console.error(`  ✗ ${width}px: ${error}`);
    } finally {
      await context.close();
    }
  }
}

async function main() {
  console.log('Visual Comparison Tool');
  console.log('======================');
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Widths: ${WIDTHS.join(', ')}px`);
  console.log(`Output: ${OUTPUT_DIR}`);
  
  await ensureOutputDir();
  
  const browser = await chromium.launch({ headless: true });
  
  try {
    for (const pageConfig of PAGES_TO_TEST) {
      await takeScreenshots(browser, pageConfig.path, pageConfig.name);
    }
    
    console.log('\n✅ All screenshots captured!');
    console.log(`View at: ${OUTPUT_DIR}`);
    
    // List generated files
    const files = fs.readdirSync(OUTPUT_DIR).filter(f => f.endsWith('.png'));
    console.log(`\nGenerated ${files.length} screenshots:`);
    files.forEach(f => console.log(`  - ${f}`));
    
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

main();
