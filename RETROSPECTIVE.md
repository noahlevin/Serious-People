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
3. Complete the module normally
```

This saved hours of manual testing during development.

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

## Summary

The key principles that made this project successful:

1. **Persistence before processing** - Always save data before starting async work.
2. **Visible progress** - Users need to see that things are happening.
3. **Flexible validation** - Validate structure, not AI creativity.
4. **Recovery paths** - Design for failure and provide retry mechanisms.
5. **Structured logging** - Make debugging easy with consistent, parseable logs.
6. **Parallel when possible** - Use `Promise.all` for independent operations.
7. **Test shortcuts** - Build in ways to test quickly (like "testskip").

Following these patterns will help avoid the bugs we encountered and make the codebase more maintainable.
