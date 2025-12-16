# Serious People Project Retrospective

*Last updated: December 2024*

This document captures lessons learned from building the Serious People career coaching platform. It's intended for future developers and AI agents working on this codebase or similar projects.

---

## Table of Contents

1. [What Went Well](#what-went-well)
2. [What Didn't Go Well](#what-didnt-go-well)
3. [Instructions for Future Agents](#instructions-for-future-agents)
4. [Bug Prevention Checklist](#bug-prevention-checklist)
5. [Design Patterns That Work](#design-patterns-that-work)
6. [Future Improvements / Technical Debt](#future-improvements--technical-debt)
7. [SEO Architecture](#seo-architecture)
8. [/app Mount Architecture](#app-mount-architecture)

---

## What Went Well

### 1. Non-Blocking Architecture for AI Generation

**Pattern:** Fire-and-forget background processing with frontend polling.

The decision to save data FIRST, then trigger AI generation in the background was crucial. This ensures:
- User sees immediate feedback (data is persisted)
- Subsequent API reads return correct data
- Long-running AI calls don't block the request
- Server continues processing even if user navigates away

```typescript
// GOOD: Save first, then generate async
await storage.updateTranscript(sessionToken, { messages, planCard });
generateAndSaveDossier(userId, messages); // Fire and forget - no await
res.json({ success: true });
```

### 2. Parallel Artifact Generation

Generating 10 artifacts sequentially would take 10+ minutes. Using `Promise.all` reduced this to ~2-3 minutes:

```typescript
const results = await Promise.all(
  artifactsToGenerate.map(artifact => 
    generateSingleArtifact(planId, artifact.id, artifact.artifactKey, ...)
  )
);
```

Each artifact updates its own database record independently, so partial failures don't affect successful ones.

### 3. Structured Logging Standard

Consistent log format made debugging much easier:

```
[EVENT] ts=ISO plan=id artifact=key status=status durationMs=n
```

Examples:
```
[ARTIFACT] ts=2024-12-10T19:44:45.361Z plan=abc123 artifact=action_plan status=started
[ARTIFACT] ts=2024-12-10T19:45:21.422Z plan=abc123 artifact=action_plan status=success durationMs=76098
```

This format is:
- Grep-friendly
- Parseable for metrics
- Human-readable
- Includes timing for performance analysis

### 4. Retry Logic with Exponential Backoff

Critical for handling race conditions and transient failures:

```typescript
async function loadUserTranscriptWithRetry(userId: string, options: {
  requireDossier?: boolean;
  requirePlanCard?: boolean;
  maxAttempts?: number;
  delayMs?: number;
}): Promise<LoadResult> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // Check conditions...
    if (!met) {
      await new Promise(r => setTimeout(r, delayMs * attempt)); // Exponential backoff
    }
  }
}
```

### 5. Flexible Validation with Sensible Defaults

Zod schemas that validate required fields but allow AI flexibility:

```typescript
const artifactResponseSchema = z.object({
  title: z.string().min(1, "Title is required"),      // Required, validated
  content: z.string().min(1, "Content is required"),  // Required, validated
  type: z.string().min(1).transform(s => s.toLowerCase().trim()).default('snapshot'), // Flexible
  importance_level: z.enum(['must_read', 'recommended', 'optional', 'bonus']).default('recommended'),
});
```

### 6. In-Memory Locking for Duplicate Prevention

Prevents multiple simultaneous generation attempts:

```typescript
const dossierGenerationLocks = new Map<string, number>();
const DOSSIER_LOCK_TIMEOUT_MS = 60000; // 60 second stale timeout

if (existingLock && (Date.now() - existingLock) < DOSSIER_LOCK_TIMEOUT_MS) {
  return { status: 'in_progress' };
}
dossierGenerationLocks.set(lockKey, Date.now());
```

### 7. Test Skip Feature

The "testskip" command allows rapid testing without completing full conversations:

```
Typing "testskip" in any module causes the AI to:
1. Fabricate plausible context based on prior conversation
2. List what was fabricated
3. Complete the conversation content ONLY
```

**Critical:** Testskip must only complete the conversational content and stop BEFORE triggering any final programmatic steps (like auto-starting the next phase). This allows testing the conversation flow without side effects.

This saved hours of manual testing during development.

### 8. State Machine for User Journey

Using a state machine pattern to track where users are in their journey proved invaluable:

```typescript
// Journey states tracked in transcript
{
  interviewComplete: boolean;
  hasPaid: boolean;
  module1Complete: boolean;
  module2Complete: boolean;
  module3Complete: boolean;
}

// API endpoint resolves current state
app.get("/api/journey", requireAuth, async (req, res) => {
  const transcript = await storage.getTranscriptByUserId(userId);
  const plan = await storage.getSeriousPlanByUserId(userId);
  
  // Determine current step based on state
  let currentStep = 'interview';
  if (transcript?.interviewComplete && !transcript?.hasPaid) currentStep = 'payment';
  if (transcript?.hasPaid && !transcript?.module1Complete) currentStep = 'module1';
  // ... etc
  
  res.json({ currentStep, ... });
});
```

Benefits:
- Users can always resume where they left off
- Frontend can redirect to correct page on load
- Easy to debug user state issues
- Clear progression through the product

### 9. Default Infrastructure Choices

Starting with solid infrastructure from day one saved significant rework:

**Database:** Use Replit's built-in PostgreSQL (Neon-backed) by default. It provides:
- Automatic provisioning
- Environment variables pre-configured
- Rollback support
- Easy access via SQL tools

**Email:** Resend works well for transactional email:
- Simple API
- Good deliverability
- Magic link authentication support
- Webhook support for inbound email

**Analytics:** PostHog for user behavior tracking:
- Easy integration
- Funnel analysis
- User identification
- **Important:** Always set email as a person property, not just the distinct_id:
  ```typescript
  posthog.identify(email, { email, name, ...otherProperties });
  ```

---

## What Didn't Go Well

### 1. Token Limits Too Low

**Problem:** Initial token limit of 2048 caused truncated JSON responses from AI, leading to parse failures.

**Fix:** Increased to 4096 for artifact generation where content can be substantial.

**Lesson:** Always consider the expected output size when setting `max_tokens`. For structured JSON with rich content, 4096+ is safer.

### 2. Overly Strict Zod Enums

**Problem:** Fixed enum for artifact `type` field:
```typescript
type: z.enum(['snapshot', 'conversation', 'narrative', ...])
```

AI would generate types like `'script'` or `'action_plan'` that weren't in the list, causing validation failures.

**Fix:** Changed to flexible string with normalization:
```typescript
type: z.string().min(1).transform(s => s.toLowerCase().trim()).default('snapshot')
```

**Lesson:** When AI generates values, validate structure and required fields, not specific string values. Let AI be creative within guardrails.

### 3. Race Conditions on Auto-Start

**Problem:** When Module 3 completes, the system auto-starts Serious Plan generation. But the dossier might not be ready yet (still generating in background).

**Symptoms:**
- Plan created with incomplete context
- "Dossier not found" errors
- Artifacts generated with missing information

**Fix:** Retry mechanism with exponential backoff that waits for dependencies:
```typescript
const loadResult = await loadUserTranscriptWithRetry(userId, {
  requireDossier: true,
  requirePlanCard: true,
  maxAttempts: 6,
  delayMs: 2000, // Up to ~8 minutes of retries
});
```

**Lesson:** Any time Process B depends on Process A completing, add explicit dependency checking with retries.

### 4. Stuck "Generating" Status

**Problem:** Artifacts could get stuck in `generating` status if:
- Server crashed during generation
- AI request timed out without proper error handling
- Lock wasn't released properly

**Fix:** Added regeneration endpoint to recover stuck artifacts:
```typescript
app.post("/api/serious-plan/:id/regenerate", requireAuth, async (req, res) => {
  // Find artifacts stuck in 'pending' or 'error' state
  // Reset and regenerate
});
```

**Lesson:** Always design recovery paths for async processes. Users need a way to "unstick" things.

### 5. JSON Parse Errors from AI

**Problem:** AI sometimes returns incomplete JSON or wraps it in markdown code blocks.

**Symptoms:**
```
SyntaxError: Unexpected end of JSON input
SyntaxError: Unexpected token ` in JSON at position 0
```

**Fixes applied:**
1. Strip markdown code fences before parsing
2. Validate with Zod after parsing
3. Use AI prefill technique to force JSON start:
   ```typescript
   messages: [
     { role: 'user', content: prompt },
     { role: 'assistant', content: '{' } // Forces AI to continue JSON
   ]
   ```
4. Use OpenAI's native `response_format: { type: 'json_object' }` as fallback

**Lesson:** Never trust raw AI output. Always sanitize and validate.

### 6. Frontend Polling Without Feedback

**Problem:** Initial implementation polled silently. Users had no idea if generation was progressing or stuck.

**Fix:** 
- Show skeleton loaders for pending artifacts
- Display "Generating X of Y..." status
- Add progress indicators

**Lesson:** Async operations need visible progress indication.

---

## Instructions for Future Agents

### Before Making Changes

1. **Read `replit.md` first** - It contains the current architecture and preferences.

2. **Understand the async flow** - This app uses fire-and-forget patterns. Changes to one process may affect downstream processes.

3. **Check the logging** - The structured logs tell you what's happening. Use:
   ```bash
   grep "\[ARTIFACT\]" logs
   grep "status=error" logs
   ```

### When Adding New AI-Generated Content

1. **Set appropriate token limits** - 2048 for short responses, 4096+ for structured content with rich text.

2. **Use flexible validation** - Validate presence and structure, not specific enum values unless they drive UI logic.

3. **Handle JSON carefully:**
   ```typescript
   // Strip markdown fences
   let cleaned = response.replace(/^```json\n?/, '').replace(/\n?```$/, '');
   // Parse and validate
   const parsed = JSON.parse(cleaned);
   const validated = schema.safeParse(parsed);
   ```

4. **Log start, completion, and errors with timing:**
   ```typescript
   console.log(`[OPERATION] ts=${new Date().toISOString()} id=${id} status=started`);
   // ... do work
   console.log(`[OPERATION] ts=${new Date().toISOString()} id=${id} status=success durationMs=${Date.now()-start}`);
   ```

5. **Add retry capability from day one** - Any async process should have a way to retry/recover.

### When Adding New Background Processes

1. **Save data before starting** - Don't mix data persistence with async generation.

2. **Use status fields** - `pending`, `generating`, `complete`, `error`

3. **Add frontend polling** - Users need visibility into progress:
   ```typescript
   const { data } = useQuery({
     queryKey: ['/api/resource', id],
     refetchInterval: status === 'generating' ? 2000 : false,
   });
   ```

4. **Design the recovery path** - What happens if it fails? How does user retry?

### When Modifying Zod Schemas

1. **Test with real AI output** - AI doesn't always follow your schema exactly.

2. **Use `.default()` for optional fields** - Prevents undefined errors.

3. **Use transforms for normalization** - `.transform(s => s.toLowerCase().trim())`

4. **Keep required fields minimal** - Only enforce what's truly required.

### When Working with SEO Pages

1. **Understand the separation** - SEO pages are EJS-rendered HTML, completely separate from the React SPA.

2. **Route priority matters** - SEO routes are defined BEFORE the SPA catch-all in `server/routes.ts`. Order matters!

3. **Content lives in Markdown** - Edit content in `/seo/content/`, not in templates or controllers.

4. **Use modules for reusable content** - Create a module in `/seo/content/modules/` and include with `{{module:module-id}}`.

5. **Quality thresholds exist** - Pages below word count thresholds get `noindex`. Check `seoController.ts` for thresholds.

6. **Cross-linking is automatic** - The system generates related links based on topic clusters. Update topic mappings if adding new content.

7. **Test with search engine tools** - Verify pages are crawlable, have correct meta tags, and structured data is valid.

### When Working with /app Mount

1. **Test both paths** - Always verify features work at both `/` and `/app/` base paths.

2. **Always use sanitizeBasePath()** - This function in `server/routes.ts` (around line 1802) sanitizes user input to prevent open redirects:
   ```typescript
   // CORRECT: Always sanitize, then concatenate
   const basePath = sanitizeBasePath(req.query.basePath);
   // basePath will be "" (empty string) for root, or "/app" - never external URLs
   res.redirect(`${basePath}/destination`);
   // Results in: "/" at root, or "/app/destination" when at /app
   
   // WRONG: Never use raw input directly
   res.redirect(`${req.query.basePath}/destination`); // Security vulnerability!
   ```
   
   **Note:** The current implementation uses this exact pattern (template strings with sanitized basePath). There is no separate redirect helper function.

3. **Passport.js session regeneration** - Passport regenerates sessions after successful OAuth authentication (security feature). Any data stored in `req.session` before `passport.authenticate()` will be lost. Solution: capture session data in the middleware BEFORE authentication and store it on the `req` object:
   ```typescript
   // In the first middleware (before passport.authenticate):
   const basePath = (req.session as any).pendingBasePath || "";
   (req as any)._pendingBasePath = basePath; // Survives session regeneration
   passport.authenticate("google", { ... })(req, res, next);
   
   // In the success handler (after authentication):
   const basePath = (req as any)._pendingBasePath || ""; // Read from req object
   res.redirect(`${basePath}/prepare`);
   ```

4. **Handle empty base path correctly** - `sanitizeBasePath()` returns empty string `""` for root paths, so `${basePath}/destination` correctly becomes `/destination` at root and `/app/destination` at /app.

5. **Client passes base path** - Frontend code must detect and pass basePath to API calls that trigger redirects:
   ```typescript
   const basePath = window.location.pathname.startsWith('/app') ? '/app' : '';
   fetch('/api/checkout', { 
     method: 'POST',
     body: JSON.stringify({ basePath }) 
   });
   ```

6. **Security is critical** - The `sanitizeBasePath()` function:
   - Trims whitespace and URL-decodes input
   - Only allows single-segment paths matching `/^\/[a-zA-Z0-9-_]+$/`
   - Rejects protocols, path traversal, double slashes, backslashes
   - If multi-level paths like `/app/v2` are needed, update the regex

7. **Wouter handles client routing** - The `<Router base={basePath}>` component handles all client-side navigation. Links and `setLocation` calls are relative to the base.

---

## Bug Prevention Checklist

Use this checklist when building similar features:

### AI Integration
- [ ] Token limit set high enough for expected output? (4096+ for rich content)
- [ ] JSON response sanitized before parsing? (strip markdown fences)
- [ ] Zod validation with `.safeParse()` and error logging?
- [ ] Fallback if primary AI fails?
- [ ] Flexible types where AI generates values?

### Async Processing
- [ ] Data persisted BEFORE async process starts?
- [ ] Status field to track progress? (`pending`, `generating`, `complete`, `error`)
- [ ] Logging at start, completion, and error with timing?
- [ ] Lock mechanism to prevent duplicate runs?
- [ ] Stale lock timeout to recover from crashes?
- [ ] Retry/recovery endpoint for stuck processes?

### Frontend Polling
- [ ] Polling enabled when status is in-progress?
- [ ] Polling disabled when complete?
- [ ] Loading/skeleton state during generation?
- [ ] Progress indicator (X of Y)?
- [ ] Error state with retry button?

### Dependencies Between Processes
- [ ] Dependency explicitly checked before starting?
- [ ] Retry with exponential backoff if dependency not ready?
- [ ] Clear error message if dependency fails?
- [ ] Maximum retry limit with timeout?

### Database
- [ ] Status fields indexed for queries?
- [ ] Unique constraints where needed?
- [ ] Nullable fields have defaults in Zod?
- [ ] No schema changes that would break existing data?

### SEO Pages
- [ ] Route defined before SPA catch-all?
- [ ] Page has unique title and meta description?
- [ ] Open Graph tags present?
- [ ] JSON-LD structured data valid? (pillar and programmatic pages)
- [ ] Canonical URL set correctly?
- [ ] Word count above quality threshold? (1200+ for pillars, 700+ for programmatic)
- [ ] Cross-links generated correctly? (pillar and programmatic pages only)
- [ ] PostHog tracking events firing?

### /app Base Path
- [ ] Feature tested at both `/` and `/app/`?
- [ ] Server redirects use `sanitizeBasePath()`?
- [ ] Client passes basePath to redirect-triggering APIs?
- [ ] No hardcoded paths that bypass base path?
- [ ] Authentication flows preserve base path?
- [ ] Payment flows preserve base path?

---

## Design Patterns That Work

### 1. The "Fire and Forget" Pattern

```typescript
// In route handler
await storage.saveData(data);           // Persist first
triggerBackgroundProcess(data.id);      // Fire and forget
res.json({ success: true, id: data.id }); // Return immediately

// Background function runs independently
async function triggerBackgroundProcess(id: string) {
  try {
    await doExpensiveWork(id);
    await storage.updateStatus(id, 'complete');
  } catch (error) {
    await storage.updateStatus(id, 'error');
    console.error(`[PROCESS] id=${id} status=error error="${error.message}"`);
  }
}
```

### 2. The "Retry Until Ready" Pattern

```typescript
async function waitForDependency(id: string, maxAttempts = 6, delayMs = 2000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const dependency = await storage.getDependency(id);
    if (dependency?.status === 'ready') {
      return dependency;
    }
    console.log(`[WAIT] id=${id} attempt=${attempt}/${maxAttempts} status=waiting`);
    await new Promise(r => setTimeout(r, delayMs * attempt));
  }
  throw new Error(`Dependency not ready after ${maxAttempts} attempts`);
}
```

### 3. The "Parallel with Individual Updates" Pattern

```typescript
async function generateAll(items: Item[]) {
  const results = await Promise.all(
    items.map(async (item) => {
      try {
        const result = await generate(item);
        await storage.updateItem(item.id, { status: 'complete', content: result });
        return { success: true, id: item.id };
      } catch (error) {
        await storage.updateItem(item.id, { status: 'error' });
        return { success: false, id: item.id, error: error.message };
      }
    })
  );
  
  const successCount = results.filter(r => r.success).length;
  console.log(`[BATCH] completed=${successCount}/${items.length}`);
}
```

### 4. The "Lock with Timeout" Pattern

```typescript
const locks = new Map<string, number>();
const LOCK_TIMEOUT_MS = 60000;

function acquireLock(key: string): boolean {
  const existing = locks.get(key);
  const now = Date.now();
  
  if (existing && (now - existing) < LOCK_TIMEOUT_MS) {
    return false; // Lock held by another process
  }
  
  locks.set(key, now);
  return true;
}

function releaseLock(key: string): void {
  locks.delete(key);
}
```

---

## Future Improvements / Technical Debt

These are patterns we should implement in future projects or clean up in this one:

### 1. Model Router for AI Prompts

Currently, model selection is scattered throughout the codebase. A model router would make it easy to:
- Test new models without code changes
- A/B test model performance
- Switch models based on task type

**Recommended pattern:**

```typescript
// server/ai/modelRouter.ts
type TaskType = 'chat' | 'analysis' | 'generation' | 'structured_json';

interface ModelConfig {
  provider: 'anthropic' | 'openai';
  model: string;
  maxTokens: number;
  temperature: number;
}

const modelConfigs: Record<TaskType, ModelConfig> = {
  chat: { provider: 'anthropic', model: 'claude-sonnet-4-20250514', maxTokens: 2048, temperature: 0.7 },
  analysis: { provider: 'anthropic', model: 'claude-haiku-4-20250514', maxTokens: 8192, temperature: 0 },
  generation: { provider: 'anthropic', model: 'claude-sonnet-4-20250514', maxTokens: 4096, temperature: 0.5 },
  structured_json: { provider: 'openai', model: 'gpt-4.1-mini', maxTokens: 4096, temperature: 0 },
};

export function getModel(taskType: TaskType): ModelConfig {
  return modelConfigs[taskType];
}
```

### 2. Prompts as Separate Files

Prompts are currently embedded in TypeScript files, making them hard to iterate on. Better pattern:

```
server/
  prompts/
    interview/
      system.txt
      complete-check.txt
    modules/
      module1-system.txt
      module2-system.txt
      module3-system.txt
    artifacts/
      action-plan.txt
      decision-snapshot.txt
    shared/
      persona.txt
      formatting.txt
```

**Benefits:**
- Easy to read and edit prompts
- Version control shows prompt changes clearly
- Non-developers can contribute to prompt engineering
- Prompts can be loaded dynamically

**Implementation:**

```typescript
// server/ai/prompts.ts
import { readFileSync } from 'fs';
import { join } from 'path';

const promptsDir = join(__dirname, 'prompts');

export function loadPrompt(path: string): string {
  return readFileSync(join(promptsDir, path), 'utf-8');
}

export function loadPromptWithVariables(path: string, vars: Record<string, string>): string {
  let prompt = loadPrompt(path);
  for (const [key, value] of Object.entries(vars)) {
    prompt = prompt.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }
  return prompt;
}
```

### 3. Modular Prompt Components

Common instructions (personas, formatting rules, JSON schemas) are duplicated across prompts. Use composition:

```typescript
// server/ai/promptBuilder.ts
const components = {
  persona: loadPrompt('shared/persona.txt'),
  jsonFormatting: loadPrompt('shared/json-formatting.txt'),
  markdownRules: loadPrompt('shared/markdown-rules.txt'),
};

export function buildPrompt(template: string, includes: string[]): string {
  let prompt = template;
  for (const include of includes) {
    prompt = prompt.replace(`{{include:${include}}}`, components[include] || '');
  }
  return prompt;
}

// Usage in prompt file:
// {{include:persona}}
// 
// Your task is to analyze the interview...
// 
// {{include:jsonFormatting}}
```

**Benefits:**
- Single source of truth for shared instructions
- Easy to update persona across all prompts
- Smaller, more focused prompt files
- Easier testing of individual components

### 4. SEO Static Site Generation

Currently, SEO pages are rendered on-demand with EJS. Future improvement:

**Recommended pattern:**
- Migrate to Astro or similar static site generator
- Pre-render all SEO pages at build time
- Serve from CDN for faster page loads
- Keep content in Markdown with YAML frontmatter (already compatible)

**Benefits:**
- Faster page loads (no server rendering)
- Better Core Web Vitals scores
- Reduced server load
- Easier to cache at CDN level

### 5. Phase 6: Root as Marketing Site

The `/app` mount is preparation for flipping the root to a static marketing site:

**Recommended approach:**
1. Build static marketing pages (can use same EJS/Astro approach as SEO)
2. Update Express to serve marketing at `/` for logged-out users
3. Redirect logged-in users from `/` to `/app`
4. Update all marketing CTAs to point to `/app/interview`

**Considerations:**
- Session cookie still works at both paths
- API routes remain at `/api/*` (no base path)
- Ensure SEO pages have correct CTAs pointing to `/app`

---

## SEO Architecture

### Overview

The SEO engine serves static HTML pages for search engine crawlers, separate from the React SPA. This architecture allows for:
- Crawlable content for organic search traffic
- Fast page loads for SEO pages
- Separation of concerns between marketing content and application

### Key Design Decisions

**1. EJS Templates over React SSR**

We chose EJS templates for SEO pages because:
- Simple server-side rendering without build complexity
- No hydration overhead for static content
- Easy to migrate to Astro or another static site generator later
- Clear separation from SPA codebase

**2. Markdown with YAML Frontmatter**

Content is stored as Markdown files with YAML frontmatter:
```yaml
---
title: "The Stay-or-Go Decision Framework"
description: "A systematic approach to career decisions"
topic: decision
---

# Content here...
```

Benefits:
- Renderer-agnostic (can switch from EJS to Astro)
- Easy for non-developers to edit
- Version-controlled content
- Clear metadata structure

**3. Modular Content System**

Reusable content blocks can be included in any page:
```markdown
{{module:cta-coaching}}
{{module:warning-burnout-signs}}
```

This prevents duplication and ensures consistency across pages.

**4. Programmatic Pages**

Role + situation combinations generate 50+ targeted pages:
- `/roles/vp-product/situations/burnout`
- `/roles/eng-manager/situations/bad-manager`

Each page is composed from content modules (framework, mistakes, vignette, walkaway) to ensure uniqueness while maintaining quality.

### File Structure

```
seo/
├── templates/
│   ├── layout.ejs           # Base layout with header/footer
│   ├── pillar.ejs           # Pillar page template
│   ├── programmatic.ejs     # Role-situation page template
│   └── tool.ejs             # Interactive tool template
├── content/
│   ├── pillars/             # 12 pillar guide markdown files
│   ├── modules/             # Reusable content modules
│   └── programmatic/        # Content for programmatic pages
│       ├── frameworks/      # Decision frameworks by role
│       ├── mistakes/        # Common mistakes by situation
│       ├── vignettes/       # Story examples
│       └── walkaway/        # Walkaway signals
server/
└── seoController.ts         # Route handlers and rendering logic
```

### Quality Thresholds

- **Pillar pages:** 1200+ words, 5+ unique modules
- **Programmatic pages:** 700+ words, 4+ unique modules
- Pages below threshold receive `noindex` meta tag

### Structured Data (JSON-LD)

JSON-LD structured data is implemented for:
- **Pillar pages:** Article schema with headline, description, author, publisher, dates
- **Programmatic pages:** Article schema with role and situation context
- **Tool pages:** WebPage schema (e.g., Stay-or-Go Calculator)

Generated in `seoController.ts` via `articleSchema()`, `webPageSchema()`, and `organizationSchema()` functions.

### Cross-Linking Strategy

Smart cross-links are generated for pillar and programmatic pages:
- Pillar → Related pillars (topic-based)
- Pillar → Programmatic pages (situation-matched)
- Programmatic → Related pillars (situation-to-topic mapping)
- Programmatic → Adjacent pages (same role OR same situation)

**Note:** Index pages (`/guides`, `/roles`, `/resources`) and tool pages do not have automatic cross-links.

---

## /app Mount Architecture

### Purpose

The SPA can be served at both `/` (root) and `/app`:
- **Current state:** Both paths serve the same SPA
- **Future state:** Root becomes static marketing, `/app` serves the application

This enables migrating the root to a marketing site without breaking existing user flows.

### Implementation Details

**1. Router Base Path Detection**

```typescript
// client/src/App.tsx
const basePath = window.location.pathname.startsWith('/app') ? '/app' : '';

<Router base={basePath}>
  {/* Routes are relative to base */}
</Router>
```

**2. Server Route Mounting**

```typescript
// server/routes.ts
// SPA catch-all serves for both root and /app
app.get('*', (req, res) => {
  // SEO routes handled first, then SPA
});
```

**3. Base Path Preservation in Redirects**

Authentication and payment flows must preserve the base path:
- Google OAuth stores basePath in session, uses in callback redirect
- Magic links include basePath in verification URL
- Stripe checkout passes basePath in success/cancel URLs

**4. Security: Open Redirect Prevention**

The `sanitizeBasePath()` function prevents open redirect attacks:
```typescript
function sanitizeBasePath(basePath: string | undefined): string {
  if (!basePath) return "";
  let sanitized = basePath.trim();
  try {
    sanitized = decodeURIComponent(sanitized);
  } catch {
    return "";
  }
  // Only allow single-segment paths like /app
  if (!/^\/[a-zA-Z0-9-_]+$/.test(sanitized)) {
    return "";
  }
  // Reject dangerous patterns
  if (sanitized.includes("://") || sanitized.includes("..")) {
    return "";
  }
  return sanitized;
}
```

**Important:** Current regex only allows single-segment paths (`/app`). If multi-level paths like `/app/v2` are needed, update the regex.

### Testing Considerations

When testing authentication flows:
1. Test at both `/login` and `/app/login`
2. Verify redirects go to correct base path
3. Test with malicious basePath values to verify sanitization

---

## Summary

The key principles that made this project successful:

1. **Persistence before processing** - Always save data before starting async work.
2. **Visible progress** - Users need to see that things are happening.
3. **Flexible validation** - Validate structure, not AI creativity.
4. **Recovery paths** - Design for failure and provide retry mechanisms.
5. **Structured logging** - Make debugging easy with consistent, parseable logs.
6. **Parallel when possible** - Use `Promise.all` for independent operations.
7. **Test shortcuts** - Build in ways to test quickly (like "testskip"), but keep them isolated from programmatic side effects.
8. **State machine for journey** - Track user progress explicitly and resolve to correct state on page load.
9. **Infrastructure from day one** - Start with database, email, and analytics configured properly.
10. **Prompt organization** - Separate prompts from code, modularize common components.

Following these patterns will help avoid the bugs we encountered and make the codebase more maintainable.
