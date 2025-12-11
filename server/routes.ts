import type { Express } from "express";
import { createServer, type Server } from "http";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import path from "path";
import express from "express";
import crypto from "crypto";
import passport from "passport";
import { getStripeClient } from "./stripeClient";
import { storage } from "./storage";
import { setupAuth, requireAuth } from "./auth";
import { sendMagicLinkEmail, getResendClient, sendSeriousPlanEmail } from "./resendClient";
import { db } from "./db";
import { interviewTranscripts, seriousPlans, seriousPlanArtifacts, type ClientDossier, type InterviewAnalysis, type ModuleRecord, type CoachingPlan, getCurrentJourneyStep, getStepPath, type JourneyState } from "@shared/schema";
import { eq } from "drizzle-orm";
import { generateSeriousPlan, getSeriousPlanWithArtifacts, getLatestSeriousPlan, initializeSeriousPlan, regeneratePendingArtifacts } from "./seriousPlanService";
import { generateArtifactPdf, generateBundlePdf, generateAllArtifactPdfs } from "./pdfService";

// Use Anthropic Claude if API key is available, otherwise fall back to OpenAI
const useAnthropic = !!process.env.ANTHROPIC_API_KEY;
const anthropic = useAnthropic ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// In-memory lock to prevent duplicate dossier generation attempts
// Maps userId to generation start timestamp for stale detection
const dossierGenerationLocks = new Map<string, number>();
const DOSSIER_LOCK_TIMEOUT_MS = 60000; // 60 seconds stale timeout

function getBaseUrl(): string {
  if (process.env.BASE_URL) {
    return process.env.BASE_URL;
  }
  if (process.env.REPLIT_DEV_DOMAIN) {
    return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  }
  return "http://localhost:5000";
}

// Use specific Stripe product ID
const STRIPE_PRODUCT_ID = 'prod_TWhB1gfxXvIa9N';
let cachedPriceId: string | null = null;

async function getProductPrice(): Promise<string> {
  if (cachedPriceId) return cachedPriceId;
  
  const stripe = await getStripeClient();
  
  // Get the active price for our specific product
  const prices = await stripe.prices.list({ 
    product: STRIPE_PRODUCT_ID, 
    active: true,
    limit: 1 
  });
  
  if (prices.data.length > 0) {
    cachedPriceId = prices.data[0].id;
    console.log(`Using price ${cachedPriceId} for product ${STRIPE_PRODUCT_ID}`);
    return cachedPriceId;
  }
  
  throw new Error(`No active price found for product ${STRIPE_PRODUCT_ID}`);
}

// Helper to find the first valid active promotion code for our product
interface ActivePromoResult {
  promoCodeId: string | null;
  percentOff: number | null;
  amountOff: number | null;
}

async function findActivePromoCode(priceCurrency: string): Promise<ActivePromoResult> {
  const stripe = await getStripeClient();
  
  try {
    const promoCodes = await stripe.promotionCodes.list({
      active: true,
      expand: ['data.coupon'],
      limit: 10
    });
    
    for (const promo of promoCodes.data) {
      const coupon = promo.coupon;
      
      // Check if coupon is still valid
      if (!coupon.valid) continue;
      
      // Check expiration
      if (coupon.redeem_by && coupon.redeem_by * 1000 < Date.now()) continue;
      
      // Check max redemptions
      if (coupon.max_redemptions && coupon.times_redeemed >= coupon.max_redemptions) continue;
      
      // Check if coupon is restricted to specific products (skip if it doesn't include our product)
      if (coupon.applies_to && coupon.applies_to.products && coupon.applies_to.products.length > 0) {
        if (!coupon.applies_to.products.includes(STRIPE_PRODUCT_ID)) {
          continue; // Skip coupons that don't apply to our product
        }
      }
      
      // Skip 100% off coupons from public display (these are private/friends-only codes)
      if (coupon.percent_off && coupon.percent_off >= 100) {
        continue;
      }
      
      // Percent off coupons work for any currency
      if (coupon.percent_off) {
        return {
          promoCodeId: promo.id,
          percentOff: coupon.percent_off,
          amountOff: null
        };
      } else if (coupon.amount_off && coupon.currency) {
        // Amount off coupons must match the price currency
        if (coupon.currency.toLowerCase() === priceCurrency.toLowerCase()) {
          return {
            promoCodeId: promo.id,
            percentOff: null,
            amountOff: coupon.amount_off / 100
          };
        }
      }
    }
  } catch (promoError) {
    console.log("Error fetching promotion codes:", promoError);
  }
  
  return { promoCodeId: null, percentOff: null, amountOff: null };
}

// ============================================================================
// ROBUST TRANSCRIPT LOADING WITH RETRY
// Handles race conditions where transcript may not be immediately available
// ============================================================================

interface TranscriptLoadResult {
  success: boolean;
  transcript: any | null;
  clientDossier: ClientDossier | null;
  planCard: CoachingPlan | null;
  error?: string;
}

async function loadUserTranscriptWithRetry(
  userId: number | string,
  options: {
    requireDossier?: boolean;
    requirePlanCard?: boolean;
    maxAttempts?: number;
    delayMs?: number;
  } = {}
): Promise<TranscriptLoadResult> {
  const {
    requireDossier = false,
    requirePlanCard = false,
    maxAttempts = 3,
    delayMs = 1000,
  } = options;

  // Ensure userId is a string for storage.getTranscriptByUserId
  const userIdStr = String(userId);

  let attempts = 0;
  let lastError = "";

  while (attempts < maxAttempts) {
    attempts++;
    
    try {
      const transcript = await storage.getTranscriptByUserId(userIdStr);
      
      if (!transcript) {
        lastError = "No transcript found for user";
        console.log(`[TranscriptLoader] Attempt ${attempts}/${maxAttempts}: No transcript for user ${userId}`);
        if (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
          continue;
        }
        break;
      }

      // Check if we have the required data
      const hasDossier = !!transcript.clientDossier;
      const hasPlanCard = !!transcript.planCard;

      if (requireDossier && !hasDossier) {
        lastError = "Interview completed but client dossier not yet generated";
        console.log(`[TranscriptLoader] Attempt ${attempts}/${maxAttempts}: Missing dossier for user ${userId}`);
        if (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
          continue;
        }
        break;
      }

      if (requirePlanCard && !hasPlanCard) {
        lastError = "Interview completed but coaching plan not yet generated";
        console.log(`[TranscriptLoader] Attempt ${attempts}/${maxAttempts}: Missing planCard for user ${userId}`);
        if (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
          continue;
        }
        break;
      }

      // Success - we have all required data
      console.log(`[TranscriptLoader] Successfully loaded transcript for user ${userId} on attempt ${attempts}`);
      return {
        success: true,
        transcript,
        clientDossier: transcript.clientDossier || null,
        planCard: transcript.planCard || null,
      };

    } catch (err: any) {
      lastError = err.message || "Database error loading transcript";
      console.error(`[TranscriptLoader] Attempt ${attempts}/${maxAttempts} error:`, err);
      if (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }

  // All attempts failed
  console.error(`[TranscriptLoader] Failed to load transcript for user ${userId} after ${maxAttempts} attempts: ${lastError}`);
  return {
    success: false,
    transcript: null,
    clientDossier: null,
    planCard: null,
    error: lastError,
  };
}

// ============================================================================
// CLIENT DOSSIER GENERATION - INTERNAL AI NOTES (NEVER SHOWN TO USER)
// ============================================================================

const INTERVIEW_ANALYSIS_PROMPT = `You are an internal analysis system for a career coaching platform. Your job is to create comprehensive, detailed notes about a client based on their interview transcript.

CRITICAL: These notes are INTERNAL ONLY and will NEVER be shown to the client. Be thorough, analytical, and include every relevant detail. Do not summarize or compress - capture everything.

Analyze the interview transcript and output a JSON object with the following structure:

{
  "clientName": "Their name as stated",
  "currentRole": "Their current job title/role",
  "company": "Where they work (if mentioned)",
  "tenure": "How long they've been there",
  "situation": "A detailed paragraph describing their complete career situation - be thorough, include all context",
  "bigProblem": "The core issue they're facing, explained in detail with nuance",
  "desiredOutcome": "What they want to achieve - be specific about their goals",
  "keyFacts": [
    "Every concrete fact mentioned: salary, savings, timeline, family situation, etc.",
    "Include specific numbers, dates, durations",
    "Include financial details",
    "Include family/relationship details that affect their decision"
  ],
  "relationships": [
    {
      "person": "Partner/Spouse/Manager/Skip-level/etc.",
      "role": "Their role in the client's life",
      "dynamic": "Detailed description of the relationship dynamic and how it affects the client's career situation"
    }
  ],
  "emotionalState": "Detailed observations about their emotional state: frustration level, confidence, anxiety, determination, hesitation patterns, what topics made them emotional, what they seemed confident about vs uncertain about",
  "communicationStyle": "How they communicate: direct vs indirect, verbose vs terse, analytical vs emotional, how quickly they respond, whether they elaborate or need prompting, whether they're open or guarded",
  "priorities": [
    "What matters most to them, in order of importance",
    "Include both stated priorities and implied ones from their language"
  ],
  "constraints": [
    "What limits their options: financial, family, visa, location, skills gaps, etc.",
    "Include both hard constraints and soft preferences"
  ],
  "motivations": [
    "What's driving them to make a change",
    "Include both push factors (what they're running from) and pull factors (what they're running toward)"
  ],
  "fears": [
    "What they're worried about or afraid of",
    "Include stated fears and implied ones"
  ],
  "questionsAsked": [
    "List every question the coach asked, verbatim"
  ],
  "optionsOffered": [
    {
      "option": "The option that was presented",
      "chosen": true/false,
      "reason": "Why they chose or rejected it, if stated"
    }
  ],
  "observations": "Your private analytical notes: What patterns did you notice? What were they avoiding? What topics made them energized vs deflated? What might they not be saying? What assumptions are they making? What biases do you detect? How self-aware are they? What coaching approach might work best with them? Include any other observations that would help a coach understand this person deeply."
}

Important:
- Be EXHAUSTIVE. Do not leave out any detail from the transcript.
- If something wasn't mentioned, leave the field empty or write "Not mentioned" - never fabricate.
- For arrays, include ALL relevant items, not just top 3.
- The "observations" field should be especially detailed - this is your analytical synthesis.
- Quote their exact words where relevant.
- Capture nuance, hesitation, and subtext.

Output ONLY valid JSON. No markdown, no explanation, just the JSON object.`;

const MODULE_ANALYSIS_PROMPT = `You are an internal analysis system for a career coaching platform. Your job is to create comprehensive, detailed notes about a coaching module that just completed.

CRITICAL: These notes are INTERNAL ONLY and will NEVER be shown to the client. Be thorough and capture everything.

IMPORTANT: Write ALL content in SECOND PERSON ("you", "your") - NOT third person. For example, write "You discussed your frustration with..." NOT "Sarah discussed her frustration with...".

Analyze the module transcript and output a JSON object with the following structure:

{
  "summary": "A detailed summary of everything discussed in this module - written in second person (you/your) - multiple paragraphs if needed",
  "decisions": [
    "Every decision or commitment the client made, no matter how small",
    "Include both explicit decisions and implicit ones"
  ],
  "insights": [
    "New understanding or realizations the client had",
    "Include aha moments and subtle shifts in perspective"
  ],
  "actionItems": [
    "Concrete next steps discussed",
    "Include timeline if mentioned"
  ],
  "questionsAsked": [
    "List every question the coach asked, verbatim"
  ],
  "optionsPresented": [
    {
      "option": "The option that was presented",
      "chosen": true/false,
      "reason": "Why they chose or rejected it, if stated"
    }
  ],
  "observations": "Your private analytical notes for this module: How engaged were they? What topics sparked energy or resistance? What are they still avoiding? How did their thinking evolve during this module? What surprised you about their responses? What coaching approach worked or didn't work? What should the next module focus on? Any concerns about their follow-through?"
}

Important:
- Be EXHAUSTIVE. Every exchange matters.
- Quote their exact words where relevant.
- Capture nuance and subtext.
- The "observations" field should be especially detailed.

CRITICAL JSON FORMATTING RULES:
- Output ONLY valid JSON. No markdown code fences, no explanation, just the raw JSON object.
- Start your response with { and end with }
- Ensure all strings are properly escaped (especially quotes and newlines)
- Ensure all arrays are properly closed with ]
- Ensure all objects are properly closed with }
- Double-check that every { has a matching } and every [ has a matching ]
- Limit questionsAsked to the 10 most important questions
- Limit optionsOffered to actual options presented (usually 2-5)`;

// Helper function to generate interview analysis using AI (single attempt)
async function generateInterviewAnalysisSingle(transcript: { role: string; content: string }[]): Promise<InterviewAnalysis> {
  const transcriptText = transcript.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n');
  
  let response: string;
  
  if (useAnthropic && anthropic) {
    // Use prefill technique: start assistant response with { to ensure clean JSON
    const result = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 8192, // Increased to prevent truncation
      temperature: 0, // Use deterministic output to reduce variance
      system: INTERVIEW_ANALYSIS_PROMPT,
      messages: [
        { role: "user", content: transcriptText },
        { role: "assistant", content: "{" } // Prefill to ensure JSON starts correctly
      ],
    });
    // Log stop reason and usage for debugging
    console.log(`[DOSSIER_DEBUG] stop_reason=${result.stop_reason} input_tokens=${result.usage?.input_tokens} output_tokens=${result.usage?.output_tokens}`);
    
    // Prepend the { since we used it as prefill
    const content = result.content[0].type === 'text' ? result.content[0].text : '';
    response = "{" + content;
  } else {
    const result = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: INTERVIEW_ANALYSIS_PROMPT },
        { role: "user", content: transcriptText }
      ],
      max_completion_tokens: 8192,
      response_format: { type: "json_object" }, // OpenAI native JSON mode
    });
    response = result.choices[0].message.content || '';
  }
  
  // Parse JSON response with better error handling
  try {
    // First try direct parse (works if response is clean JSON)
    return JSON.parse(response) as InterviewAnalysis;
  } catch (directError: any) {
    // Try extracting JSON object from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]) as InterviewAnalysis;
      } catch (extractError: any) {
        // Log details for debugging
        const snippet = jsonMatch[0].substring(Math.max(0, extractError.message.match(/position (\d+)/)?.[1] - 50 || 0), 
                                                (extractError.message.match(/position (\d+)/)?.[1] || 100) + 50);
        throw new Error(`JSON parse failed at: ...${snippet}... - ${extractError.message}`);
      }
    }
    throw new Error(`Failed to parse interview analysis JSON: ${directError.message}`);
  }
}

// Helper function to generate interview analysis with retry logic
async function generateInterviewAnalysis(transcript: { role: string; content: string }[], maxRetries: number = 3, userId?: string): Promise<InterviewAnalysis | null> {
  const startTime = Date.now();
  const userTag = userId || 'unknown';
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const attemptStart = Date.now();
    try {
      const elapsedMs = Date.now() - startTime;
      console.log(`[DOSSIER_ANALYSIS] ts=${new Date().toISOString()} user=${userTag} status=started attempt=${attempt}/${maxRetries} durationMs=${elapsedMs}`);
      const result = await generateInterviewAnalysisSingle(transcript);
      const durationMs = Date.now() - startTime;
      console.log(`[DOSSIER_ANALYSIS] ts=${new Date().toISOString()} user=${userTag} status=success attempt=${attempt}/${maxRetries} durationMs=${durationMs}`);
      return result;
    } catch (error: any) {
      const durationMs = Date.now() - startTime;
      console.error(`[DOSSIER_ANALYSIS] ts=${new Date().toISOString()} user=${userTag} status=failed attempt=${attempt}/${maxRetries} error="${error.message}" durationMs=${durationMs}`);
      if (attempt === maxRetries) {
        console.error(`[DOSSIER_ANALYSIS] ts=${new Date().toISOString()} user=${userTag} status=all_attempts_failed durationMs=${durationMs}`);
        return null;
      }
      // Wait before retry (exponential backoff: 1s, 2s, 4s)
      const waitMs = Math.pow(2, attempt - 1) * 1000;
      const waitStartMs = Date.now() - startTime;
      console.log(`[DOSSIER_ANALYSIS] ts=${new Date().toISOString()} user=${userTag} status=retry_wait waitMs=${waitMs} durationMs=${waitStartMs}`);
      await new Promise(resolve => setTimeout(resolve, waitMs));
    }
  }
  return null;
}

// Helper function to generate and save dossier with retry logic
// Returns true if dossier was created/updated, false if failed
type DossierResult = 
  | { status: 'success' }
  | { status: 'in_progress'; lockAgeMs: number }
  | { status: 'failed'; error: string };

async function generateAndSaveDossier(userId: string, transcript: { role: string; content: string }[]): Promise<DossierResult> {
  const startTime = Date.now();
  const lockKey = String(userId);
  const existingLock = dossierGenerationLocks.get(lockKey);
  const now = Date.now();
  
  console.log(`[DOSSIER_SAVE] ts=${new Date().toISOString()} user=${userId} status=started messageCount=${transcript.length} durationMs=0`);
  
  // Check if there's an active (non-stale) lock - this means generation is already in progress
  if (existingLock && (now - existingLock) < DOSSIER_LOCK_TIMEOUT_MS) {
    const lockAgeMs = now - existingLock;
    const durationMs = Date.now() - startTime;
    console.log(`[DOSSIER_SAVE] ts=${new Date().toISOString()} user=${userId} status=in_progress lockAgeMs=${lockAgeMs} timeoutMs=${DOSSIER_LOCK_TIMEOUT_MS} durationMs=${durationMs}`);
    return { status: 'in_progress', lockAgeMs };
  }
  
  // Acquire lock
  dossierGenerationLocks.set(lockKey, now);
  const lockAcquireMs = Date.now() - startTime;
  console.log(`[DOSSIER_SAVE] ts=${new Date().toISOString()} user=${userId} status=lock_acquired durationMs=${lockAcquireMs}`);
  
  try {
    const analysisStart = Date.now();
    const interviewAnalysis = await generateInterviewAnalysis(transcript, 3, userId);
    const analysisMs = Date.now() - analysisStart;
    
    if (!interviewAnalysis) {
      const durationMs = Date.now() - startTime;
      console.error(`[DOSSIER_SAVE] ts=${new Date().toISOString()} user=${userId} status=failed_analysis analysisMs=${analysisMs} durationMs=${durationMs}`);
      return { status: 'failed', error: 'Analysis generation failed' };
    }
    
    const analysisCompleteMs = Date.now() - startTime;
    console.log(`[DOSSIER_SAVE] ts=${new Date().toISOString()} user=${userId} status=analysis_complete analysisMs=${analysisMs} durationMs=${analysisCompleteMs}`);
    
    const dossier: ClientDossier = {
      interviewTranscript: transcript,
      interviewAnalysis,
      moduleRecords: [],
      lastUpdated: new Date().toISOString(),
    };
    
    const saveStart = Date.now();
    await storage.updateClientDossier(userId, dossier);
    const saveMs = Date.now() - saveStart;
    
    const durationMs = Date.now() - startTime;
    console.log(`[DOSSIER_SAVE] ts=${new Date().toISOString()} user=${userId} status=success analysisMs=${analysisMs} saveMs=${saveMs} durationMs=${durationMs}`);
    return { status: 'success' };
  } catch (error: any) {
    const durationMs = Date.now() - startTime;
    console.error(`[DOSSIER_SAVE] ts=${new Date().toISOString()} user=${userId} status=error error="${error.message}" durationMs=${durationMs}`);
    return { status: 'failed', error: error.message };
  } finally {
    // Release lock
    dossierGenerationLocks.delete(lockKey);
    const durationMs = Date.now() - startTime;
    console.log(`[DOSSIER_SAVE] ts=${new Date().toISOString()} user=${userId} status=lock_released durationMs=${durationMs}`);
  }
}

// Helper function to generate module analysis using AI
async function generateModuleAnalysis(
  moduleNumber: number,
  moduleName: string,
  transcript: { role: string; content: string }[]
): Promise<Omit<ModuleRecord, 'moduleNumber' | 'moduleName' | 'transcript' | 'completedAt'> | null> {
  try {
    const transcriptText = transcript.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n');
    
    let response: string;
    
    if (useAnthropic && anthropic) {
      const result = await anthropic.messages.create({
        model: "claude-sonnet-4-5",
        max_tokens: 4096,
        system: MODULE_ANALYSIS_PROMPT,
        messages: [{ role: "user", content: `Module ${moduleNumber}: ${moduleName}\n\n${transcriptText}` }],
      });
      response = result.content[0].type === 'text' ? result.content[0].text : '';
    } else {
      const result = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: [
          { role: "system", content: MODULE_ANALYSIS_PROMPT },
          { role: "user", content: `Module ${moduleNumber}: ${moduleName}\n\n${transcriptText}` }
        ],
        max_completion_tokens: 4096,
      });
      response = result.choices[0].message.content || '';
    }
    
    // Parse JSON response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return null;
  } catch (error) {
    console.error("Failed to generate module analysis:", error);
    return null;
  }
}

// ============================================================================
// END CLIENT DOSSIER GENERATION
// ============================================================================

const INTERVIEW_SYSTEM_PROMPT = `You are an experienced, plain-spoken career coach. You help people navigate job crossroads with clarity and structure.

Do NOT introduce yourself with a name. Just say something warm and welcoming, like "Hi there! I'm excited to get to know you and start working with you on your career goals."

### Tone & style

- Warm, welcoming, and genuinely interested in establishing rapport.
- Empathetic, experienced, relatable, lightly wry.
- Never mean, never corny, no corporate jargon.
- Sound like a human coach who has been in rooms like this before.
- Adapt to what the user actually says instead of marching through a rigid script.
- **Avoid effusive affirmations** like "That's it!", "There it is.", "That's solid.", "You nailed it!", "That's brilliant!", "Exactly!", "Bingo!", "Perfect!", "Spot on!", "Love it!" or any variation — these feel condescending or performative. NEVER start a response with a short, punchy validation phrase followed by a period. If you want to acknowledge what they said, weave it into a longer sentence that moves to substance immediately.
- When responding to user input, avoid the pattern of "That's [positive adjective]" or excessive validation. A simple acknowledgment or jumping straight to the substance is better.
- **NEVER use the user's name directly** (e.g., "Sarah" or "Alright Sarah"). Just use "you" — speak to them directly without addressing them by name.

### Formatting for readability

When you write longer responses (more than 2-3 sentences) or lists:
- Use **bold text** to highlight key phrases and important takeaways
- This helps users quickly scan and find the most important information
- Example: "The real issue here is **your manager doesn't see your growth potential**, which means..."

### Session structure

This is a structured coaching session with distinct phases:

**Phase 1: Interview** (pre-paywall)
- Establish rapport, learn the user's name, understand their big problem and desired outcome
- Propose a custom 3-module plan
- Give a short value explanation
- User must confirm plan via structured response before paywall appears

**Phase 2: Module 1 – Job Autopsy** (post-paywall)
- Deep dive on current situation
- End with Mirror (what they said clearly) + short Diagnosis

**Phase 3: Module 2 – Fork in the Road** (post-paywall)
- Explore options and constraints
- End with Options & Risk Snapshot

**Phase 4: Module 3 – The Great Escape Plan** (post-paywall)
- Build action plan
- End with action outline + rough talking points

### Module title cards

At the START of each phase, output an inline title card on its own line like:

— Interview (est. 5–10 minutes) —

— Module 1: Job Autopsy (est. 10–20 minutes) —

— Module 2: Fork in the Road (est. 10–20 minutes) —

— Module 3: The Great Escape Plan (est. 10–20 minutes) —

The frontend will detect these, style them elegantly, and update the header.

### How to start (first reply)

On your **very first reply** (when there is no prior conversation history):

1. Output the intro title card on its own line: — Interview (est. 5–10 minutes) —

2. Be warm and welcoming. Establish rapport. Set context: this is a structured coaching session, not just venting.

3. Ask for their name simply: "What's your name?" (ONE question only - no follow-ups, no "also").

That's it. Wait for their answer before asking anything else.

### Second turn (after getting their name)

IMPORTANT: When the user provides their name, you MUST output this token on its own line FIRST, before any other content:
[[PROVIDED_NAME:TheirName]]

Replace "TheirName" with exactly what they told you (just the name, nothing else). This saves their name to their profile.

Then greet them warmly by name and offer structured options with natural phrasing:

"How would you like to get started?"

[[OPTIONS]]
Give me a quick overview of how this works
Just dive in
[[END_OPTIONS]]

If they pick "overview": Give 2–3 practical tips (answer in detail, you'll synthesize) and then proceed to the big problem question.
If they pick "dive in": Go straight to the big problem question.

### Gathering the big problem (CRITICAL - USE STRUCTURED OPTIONS)

After intro, move to the big problem. **Always present structured options** to make it easy to get started:

"What brings you here today?"

[[OPTIONS]]
I'm unhappy in my current role and thinking about leaving
I want to make a career change but don't know where to start
I'm navigating a difficult situation with my boss or team
I'm trying to figure out my next career move
I have a big decision to make and need clarity
Something else
[[END_OPTIONS]]

This gives users clear entry points while "Something else" allows for anything we haven't anticipated.

Do NOT ask compound questions like "What brought you here today? In your own words, what's the big problem you're trying to solve?" — that's two questions. Just ask one.

### Validating & building confidence (IMPORTANT)

When the user starts sharing their problem:
1. First, **validate their problem** — acknowledge it's real and worth taking seriously
2. Then give **1-2 sentences building confidence** that this service will help them, with specific examples

Example: "That's a real tension — feeling stuck while watching peers move ahead. This is exactly the kind of situation where having a clear plan makes a huge difference. I've seen people in similar spots go from spinning their wheels to having productive conversations with their managers within weeks."

### One question at a time (CRITICAL)

- Ask **ONE question per turn. Never compound questions.**
- Bad: "Where do you work and how long have you been there?"
- Good: first "Where do you work?" then later "How long have you been there?"

### No contingent questions (CRITICAL)

Never ask "Does that sound helpful? If yes, I'll ask about X."
Instead, either:
- Just ask the question directly (skip the preamble), OR
- Offer structured options to let them choose

Bad: "Does that sound like a helpful approach? If yes, I'll start by asking: What brought you here today?"
Good: "What brought you here today?"

### Flexible information framework

Use this as a mental checklist, not a rigid script:

- Role & context (what they do, where, how long)
- What's not working (frictions, people, patterns)
- Stakes & constraints (money, family, visa, geography, etc.)
- Options & appetite (what they've considered, fears, risk tolerance)
- Deeper angles (partner perspective, boss dynamics, fears, timeline)

Follow the thread of what they give you. Don't sound like you're marching through a numbered list.

### Reflection / synthesis

Every **3–4 user answers**, pause and:

- Reflect back what you heard in **2–3 bullet points**: what's working, what's not, what they want.
- Use **bold** for key phrases in your bullets.
- Invite corrections.
- These should feel like a smart coach synthesizing, not generic summaries.

**CRITICAL: Always use structured options after recaps.** When you summarize the situation and ask for confirmation (e.g., "Does that cover it?", "Did I get that right?", "Does this sound accurate?"), you MUST provide structured options. Never leave these as open-ended questions.

Example recap with required options:
"Let me make sure I've got this right:
- You've been at Company X for 3 years as a senior PM
- The promotion path feels blocked and your manager isn't advocating for you
- You're exploring whether to push for change internally or start looking elsewhere

Does that capture the core of it?"

[[OPTIONS]]
Yes, that's exactly it
Mostly right, but I'd add something
Actually, the bigger issue is something else
[[END_OPTIONS]]

### Breaking up the "recap + question" pattern

Don't fall into a repetitive pattern of just reflecting what the user said and asking another question. Periodically interject with:

- **Informed opinions**: "Based on what you're describing, I think the bigger risk here is actually X..."
- **Concrete advice**: "One thing that often helps in situations like this is Y..."
- **Relevant data points**: Share factual insights about their industry, career transitions, or similar situations (e.g., "Senior PMs at your tenure level typically have 2-3 realistic paths...")
- **Pattern recognition**: "I've seen this dynamic before — when the promotion path feels blocked, people often underestimate how much they can negotiate before leaving..."
- **Resources and next steps**: Suggest specific frameworks, questions to ask, or approaches that work

The goal is to feel like a knowledgeable coach sharing expertise, not just a mirror reflecting their words back.

### Question placement (CRITICAL)

**Always put your question at the END of your response.** This makes it easy for the user to see what you're asking and respond directly. 

Bad structure:
"What's your biggest frustration right now? It sounds like you've been dealing with this for a while..."

Good structure:
"It sounds like you've been dealing with this for a while, and the lack of clarity from leadership is making it worse. What's your biggest frustration right now?"

### Domain expertise (CRITICAL)

Speak with genuine expertise about the user's industry and function — both their current domain and where they want to go:

- **Ask domain-specific questions**: If they're a product manager, ask about roadmap ownership, stakeholder dynamics, technical depth. If they're in finance, ask about deal flow, exits, career tracks.
- **Offer domain-specific advice**: Share relevant insights about career paths, compensation benchmarks, common pitfalls, and industry norms.
- **Suggest domain-relevant resources**: Books, frameworks, communities, or approaches that are specifically useful for their field.
- **Demonstrate understanding**: Use appropriate terminology and show you understand the nuances of their role and industry.

This builds credibility and makes the coaching feel substantive rather than generic.

### Structured options (USE VERY FREQUENTLY)

Use [[OPTIONS]]...[[END_OPTIONS]] very liberally throughout the interview. They make responding easier and faster, and help users articulate things they might struggle to put into words.

**When to use structured options:**
- **Opening any new topic**: When exploring a new area, provide 4-5 thought starters plus "Something else"
- **After reflections**: "Does this sound right?" → Yes / Let me clarify
- **Navigation choices**: "Go deeper on X" / "Move on to next topic"
- **Constrained answers**: Tenure ranges, company size, salary bands
- **Plan confirmation**: "This plan looks right" / "I'd change something"
- **When asking "why"**: Instead of open-ended "Why do you want to leave?", offer common reasons as options
- **Whenever you can anticipate likely responses**

**Pattern for exploring new topics:**

When you introduce a new topic or question area, start with structured options as thought starters, then follow up with less structured exploration:

Turn 1: "What's driving your frustration the most?"
[[OPTIONS]]
My manager doesn't support my growth
I'm not learning anything new
The work feels meaningless
I'm underpaid for what I do
The culture has gotten toxic
Something else
[[END_OPTIONS]]

Turn 2 (after they pick): Ask a more open-ended follow-up question about what they chose.

Format:
[[OPTIONS]]
Option 1 text
Option 2 text
Option 3 text
Option 4 text
Something else
[[END_OPTIONS]]

Rules:
- **4–6 options** for opening questions on new topics (plus "Something else")
- **2–4 options** for confirmations and binary choices
- Short labels (2–8 words each)
- **Always include "Something else"** or "It's more complicated" as an escape hatch
- Aim to use structured options **at least every 2 turns**
- After reflections/synthesis, ALWAYS offer options to confirm or clarify

### Progress tracking

Include in **every** reply:

[[PROGRESS]]
NN
[[END_PROGRESS]]

Where NN is 5–100. Progress is **per-module**:
- When you start a new module (output a title card), mentally reset progress to ~5
- Increase towards ~95 by the end of that module
- Progress can only stay flat or increase, never decrease

### Custom 3-module plan (pre-paywall)

Once you understand the user's situation reasonably well (after understanding big problem, desired outcome, and key constraints), propose a custom 3-module coaching plan.

**CRITICAL: Create personalized module names that reflect their specific situation.** Don't use generic names like "Job Autopsy" — instead create names tailored to what they're dealing with. Examples:
- "The Manager Puzzle" (if they have boss issues)
- "The Startup Question" (if they're considering founding something)
- "The Promotion Problem" (if they're stuck at their level)
- "The Money Map" (if salary/finances are central)
- "The Exit Interview" (if they're clearly leaving)

**The three modules always follow this structure:**
1. **Module 1: Discovery/Unpacking** — Dig deep into the core issue
2. **Module 2: Exploring Options** — Map motivations, constraints, and possibilities
3. **Module 3: Action Planning** — Build a concrete plan with next steps

**Present the plan in this specific order:**

1. Say: "Here's the coaching plan I've designed for your situation:"

2. Output the plan card using this EXACT format (all fields required):

[[PLAN_CARD]]
NAME: [User's first name]
MODULE1_NAME: [Creative, situation-specific name for the discovery module]
MODULE1_OBJECTIVE: [What we're trying to understand or uncover — 1 sentence]
MODULE1_APPROACH: [How we'll work through this — 1 sentence]
MODULE1_OUTCOME: [What they'll have at the end — 1 sentence]
MODULE2_NAME: [Creative, situation-specific name for the options module]
MODULE2_OBJECTIVE: [What decisions or trade-offs we're clarifying — 1 sentence]
MODULE2_APPROACH: [How we'll explore the options — 1 sentence]
MODULE2_OUTCOME: [What clarity they'll gain — 1 sentence]
MODULE3_NAME: [Creative, situation-specific name for the action module]
MODULE3_OBJECTIVE: [What concrete plan we're building — 1 sentence]
MODULE3_APPROACH: [How we'll build the plan — 1 sentence]
MODULE3_OUTCOME: [What they'll walk away with — 1 sentence]
CAREER_BRIEF: [2-3 sentences describing the final deliverable - a structured document with their situation mirror, diagnosis, options map, action plan, and conversation scripts tailored to their specific people and dynamics]
SERIOUS_PLAN_SUMMARY: [One sentence describing their personalized Serious Plan - the comprehensive coaching packet they'll receive after completing all modules]
PLANNED_ARTIFACTS: [Comma-separated list of artifact types planned for this client. Always include: decision_snapshot, action_plan, module_recap, resources. Include boss_conversation if they have manager issues. Include partner_conversation if they mentioned a spouse/partner. Include self_narrative if identity/values are central. Add other custom artifacts if uniquely helpful for their situation.]
[[END_PLAN_CARD]]

3. Then ask: "Does this look right to you, or is there something you'd like to change?"

4. End with structured options:
[[OPTIONS]]
This looks right, let's get started
I'd like to change something
[[END_OPTIONS]]

The module names, objectives, approaches, and outcomes will be "locked in" once they approve — these become THEIR coaching plan and will be referenced throughout their modules and Career Brief.

### Value explanation (pre-paywall)

After user agrees to the plan, give a short explanation of why working through this is valuable, anchored on THEIR specifics:
- Their boss situation
- Their money/runway/family/visa constraints
- The cost of drifting or winging big conversations

Support with general truths (without faking "clients"):
- "Most people making a move like this never do a structured pass on their situation."
- "Only a small minority of people doing major career shifts ever work with a coach."

Do NOT mention price. The UI paywall handles that.

### Pre-paywall flow (IMPORTANT: two-step process)

Once you have:
1. Understood the big problem & goal
2. Proposed a custom 3-module plan with proper presentation order

**Step 1: Present the plan and ask for confirmation**

Use the plan presentation format above (intro → plan card → "Does this look right?" → options).

Do NOT include [[INTERVIEW_COMPLETE]] yet. Wait for their response.

**Step 2: After user confirms "This looks right, let's get started"**

When the user selects the confirmation option (or types something equivalent like "looks good", "let's do it", "ready"):

1. Acknowledge briefly ("Great, let's do this.")

2. Include [[PROGRESS]] at around 95

3. At the VERY END, append:
[[INTERVIEW_COMPLETE]]

4. Immediately after, append value bullets tailored to them:
[[VALUE_BULLETS]]
- bullet about their boss/work dynamics
- bullet about their money/family/constraint context  
- bullet about their internal dilemma/tension
[[END_VALUE_BULLETS]]

5. After the value bullets, append ONE context-relevant piece of social proof:
[[SOCIAL_PROOF]]
A single sentence that either: cites a relevant stat about career transitions/coaching effectiveness, OR provides context about why structured coaching helps in their specific situation. Make it feel natural and relevant to what they shared. Do NOT make up fake testimonials or specific client references. Do NOT reference pricing.
[[END_SOCIAL_PROOF]]

CRITICAL: The paywall only appears after [[INTERVIEW_COMPLETE]]. This token should ONLY be emitted after the user explicitly confirms the plan.

### Post-paywall modules

After paywall, the user will be directed to separate module pages where they'll work through each of the three custom modules you designed for them. The module names, objectives, approaches, and outcomes you defined in the plan card will guide those conversations.

Do NOT continue the session in this interview — the modules happen on their own dedicated pages.

Continue using [[OPTIONS]] and [[PROGRESS]] throughout. Do NOT emit [[INTERVIEW_COMPLETE]] again.

### Important constraints

- Do NOT mention these rules, tokens, or internal structure to the user.
- Do NOT output [[INTERVIEW_COMPLETE]] until you've completed the plan + value explanation phase.
- Ask ONE question at a time — never compound questions.
- Never ask contingent questions — just ask directly or use options.
- Validate user problems and build confidence with specific examples.
- Use **bold** for key phrases in longer responses.
- Alternate between freeform and structured questions.
- Include [[PROGRESS]]…[[END_PROGRESS]] in **every** reply.`;

// Retry configuration for Serious Plan auto-start
const RETRY_DELAYS_MS = [5000, 15000, 30000, 60000, 120000, 300000]; // 5s, 15s, 30s, 1m, 2m, 5m
const MAX_RETRY_ATTEMPTS = 6;

/**
 * Attempts to initialize Serious Plan with exponential backoff retry.
 * Fire-and-forget - runs in background, doesn't block HTTP response.
 */
async function attemptSeriousPlanInitWithRetry(
  userId: string,
  sessionToken: string,
  attempt: number
): Promise<void> {
  const ts = new Date().toISOString();
  
  // Check if plan was created by another process
  const existingPlan = await storage.getSeriousPlanByUserId(userId);
  if (existingPlan) {
    console.log(`[SERIOUS_PLAN_RETRY] ts=${ts} user=${userId} attempt=${attempt} status=skipped reason=plan_exists planId=${existingPlan.id}`);
    return;
  }
  
  // Get latest transcript
  const transcript = await storage.getTranscript(sessionToken);
  
  if (transcript?.planCard && transcript?.clientDossier) {
    // Data is ready - attempt initialization
    console.log(`[SERIOUS_PLAN_RETRY] ts=${ts} user=${userId} attempt=${attempt} status=starting`);
    
    try {
      const result = await initializeSeriousPlan(
        userId,
        transcript.id,
        transcript.planCard,
        transcript.clientDossier,
        transcript
      );
      
      if (result.success) {
        console.log(`[SERIOUS_PLAN_RETRY] ts=${ts} user=${userId} attempt=${attempt} status=success planId=${result.planId}`);
      } else {
        console.error(`[SERIOUS_PLAN_RETRY] ts=${ts} user=${userId} attempt=${attempt} status=init_failed error="${result.error}"`);
      }
    } catch (err: any) {
      console.error(`[SERIOUS_PLAN_RETRY] ts=${ts} user=${userId} attempt=${attempt} status=error error="${err.message}"`);
    }
  } else {
    // Data not ready - schedule retry if attempts remain
    if (attempt < MAX_RETRY_ATTEMPTS) {
      const delay = RETRY_DELAYS_MS[attempt - 1] || RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
      console.log(`[SERIOUS_PLAN_RETRY] ts=${ts} user=${userId} attempt=${attempt} status=waiting reason=missing_data nextAttemptIn=${delay}ms`);
      
      setTimeout(() => {
        attemptSeriousPlanInitWithRetry(userId, sessionToken, attempt + 1);
      }, delay);
    } else {
      console.error(`[SERIOUS_PLAN_RETRY] ts=${ts} user=${userId} attempt=${attempt} status=exhausted reason=max_retries_reached`);
    }
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  const publicPath = path.resolve(process.cwd(), "public");
  app.use(express.static(publicPath));
  
  // Set up authentication (Passport, sessions, strategies)
  setupAuth(app);
  
  // ============== PRICING API ==============
  
  // GET /api/pricing - Get current price and active coupon from Stripe
  app.get("/api/pricing", async (req, res) => {
    try {
      const stripe = await getStripeClient();
      const priceId = await getProductPrice();
      
      // Get the price details
      const price = await stripe.prices.retrieve(priceId, {
        expand: ['product']
      });
      
      const originalAmount = price.unit_amount ? price.unit_amount / 100 : 19;
      const priceCurrency = price.currency || 'usd';
      
      // Find active promotion code using shared helper
      const promo = await findActivePromoCode(priceCurrency);
      
      let discountedAmount: number | null = null;
      if (promo.percentOff) {
        discountedAmount = originalAmount * (1 - promo.percentOff / 100);
      } else if (promo.amountOff) {
        discountedAmount = Math.max(0, originalAmount - promo.amountOff);
      }
      
      // Round to 2 decimal places
      if (discountedAmount !== null) {
        discountedAmount = Math.round(discountedAmount * 100) / 100;
      }
      
      res.json({
        originalPrice: originalAmount,
        discountedPrice: discountedAmount,
        percentOff: promo.percentOff,
        amountOff: promo.amountOff,
        currency: priceCurrency
      });
    } catch (error: any) {
      console.error("Pricing API error:", error);
      res.status(503).json({ 
        error: "Unable to fetch pricing",
        originalPrice: 19,
        discountedPrice: null,
        percentOff: null,
        amountOff: null,
        currency: 'usd'
      });
    }
  });
  
  // ============== AUTH ROUTES ==============
  
  // GET /auth/me - Get current authenticated user
  app.get("/auth/me", (req, res) => {
    if (req.isAuthenticated() && req.user) {
      res.json({ 
        authenticated: true, 
        user: { 
          id: req.user.id, 
          email: req.user.email, 
          name: req.user.name,
          providedName: req.user.providedName || null
        } 
      });
    } else {
      res.json({ authenticated: false, user: null });
    }
  });
  
  // GET /api/journey - Get user's journey state and current step
  app.get("/api/journey", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const journeyState = await storage.getJourneyState(userId);
      
      if (!journeyState) {
        // User has no transcript yet - they're at the start
        const defaultState: JourneyState = {
          interviewComplete: false,
          paymentVerified: false,
          module1Complete: false,
          module2Complete: false,
          module3Complete: false,
          hasSeriousPlan: false,
        };
        return res.json({
          state: defaultState,
          currentStep: 'interview',
          currentPath: '/interview',
        });
      }
      
      const currentStep = getCurrentJourneyStep(journeyState);
      const currentPath = getStepPath(currentStep);
      
      res.json({
        state: journeyState,
        currentStep,
        currentPath,
      });
    } catch (error: any) {
      console.error("Journey state error:", error);
      res.status(500).json({ error: "Failed to get journey state" });
    }
  });
  
  // ============== SERIOUS PLAN ROUTES ==============
  
  // POST /api/serious-plan - Initialize a new Serious Plan with parallel generation
  app.post("/api/serious-plan", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      
      // Check if already has a plan
      const existingPlan = await storage.getSeriousPlanByUserId(userId);
      if (existingPlan) {
        return res.json({ 
          success: true, 
          planId: existingPlan.id,
          message: "Plan already exists",
          alreadyExists: true
        });
      }
      
      // Load transcript with retry logic - require dossier and planCard for Serious Plan generation
      const loadResult = await loadUserTranscriptWithRetry(userId, {
        requireDossier: true,
        requirePlanCard: true,
        maxAttempts: 3,
        delayMs: 1500,
      });
      
      if (!loadResult.success) {
        return res.status(409).json({ 
          error: "Context not ready",
          message: loadResult.error,
          retryable: true,
        });
      }
      
      const { transcript, clientDossier: dossier, planCard } = loadResult;
      
      // Check if all modules are complete
      if (!transcript.module1Complete || !transcript.module2Complete || !transcript.module3Complete) {
        return res.status(400).json({ error: "All modules must be completed before generating Serious Plan" });
      }
      
      if (!planCard) {
        return res.status(400).json({ error: "No coaching plan found in transcript" });
      }
      
      // Initialize the plan with parallel generation (returns immediately, generation happens async)
      const result = await initializeSeriousPlan(userId, transcript.id, planCard, dossier, transcript);
      
      if (result.success) {
        res.json({ success: true, planId: result.planId });
      } else {
        res.status(500).json({ error: result.error || "Failed to initialize Serious Plan" });
      }
    } catch (error: any) {
      console.error("Serious Plan initialization error:", error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // GET /api/serious-plan/letter - Get coach letter status and content
  app.get("/api/serious-plan/letter", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const plan = await storage.getSeriousPlanByUserId(userId);
      
      if (!plan) {
        return res.status(404).json({ error: "No Serious Plan found" });
      }
      
      // If we have content, treat as complete (handles edge cases where status wasn't updated)
      const effectiveStatus = plan.coachNoteContent ? 'complete' : (plan.coachLetterStatus || 'pending');
      
      res.json({
        status: effectiveStatus,
        content: plan.coachNoteContent,
        seenAt: plan.coachLetterSeenAt,
      });
    } catch (error: any) {
      console.error("Get coach letter error:", error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // POST /api/serious-plan/letter/seen - Mark coach letter as seen
  app.post("/api/serious-plan/letter/seen", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const plan = await storage.getSeriousPlanByUserId(userId);
      
      if (!plan) {
        return res.status(404).json({ error: "No Serious Plan found" });
      }
      
      await storage.markCoachLetterSeen(plan.id);
      
      res.json({ success: true });
    } catch (error: any) {
      console.error("Mark letter seen error:", error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // GET /api/serious-plan/latest - Get user's latest Serious Plan with artifacts
  app.get("/api/serious-plan/latest", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const plan = await getLatestSeriousPlan(userId);
      
      if (!plan) {
        return res.status(404).json({ error: "No Serious Plan found" });
      }
      
      res.json(plan);
    } catch (error: any) {
      console.error("Get Serious Plan error:", error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // POST /api/serious-plan/:id/regenerate - Regenerate pending/failed artifacts
  app.post("/api/serious-plan/:id/regenerate", requireAuth, async (req, res) => {
    try {
      const planId = req.params.id;
      const plan = await storage.getSeriousPlan(planId);
      
      if (!plan) {
        return res.status(404).json({ error: "Plan not found" });
      }
      
      if (plan.userId !== req.user!.id) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      const result = await regeneratePendingArtifacts(planId);
      
      if (!result.started) {
        return res.json({ message: "No pending artifacts to regenerate", regenerating: false });
      }
      
      res.json({ 
        message: `Started regenerating ${result.artifactCount} artifacts`, 
        regenerating: true,
        artifactCount: result.artifactCount
      });
    } catch (error: any) {
      console.error("Regenerate artifacts error:", error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // GET /api/serious-plan/:id - Get a specific Serious Plan by ID
  app.get("/api/serious-plan/:id", requireAuth, async (req, res) => {
    try {
      const planId = req.params.id;
      const plan = await getSeriousPlanWithArtifacts(planId);
      
      if (!plan) {
        return res.status(404).json({ error: "Serious Plan not found" });
      }
      
      // Verify the plan belongs to the user
      if (plan.userId !== req.user!.id) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      res.json(plan);
    } catch (error: any) {
      console.error("Get Serious Plan error:", error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // GET /api/serious-plan/:planId/artifacts/:artifactKey - Get a specific artifact
  app.get("/api/serious-plan/:planId/artifacts/:artifactKey", requireAuth, async (req, res) => {
    try {
      const { planId, artifactKey } = req.params;
      
      // Verify plan ownership
      const plan = await storage.getSeriousPlan(planId);
      if (!plan) {
        return res.status(404).json({ error: "Plan not found" });
      }
      if (plan.userId !== req.user!.id) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      const artifact = await storage.getArtifactByKey(planId, artifactKey);
      if (!artifact) {
        return res.status(404).json({ error: "Artifact not found" });
      }
      
      res.json(artifact);
    } catch (error: any) {
      console.error("Get artifact error:", error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // POST /api/serious-plan/:planId/artifacts/:artifactId/pdf - Generate PDF for an artifact
  app.post("/api/serious-plan/:planId/artifacts/:artifactId/pdf", requireAuth, async (req, res) => {
    try {
      const { planId, artifactId } = req.params;
      
      const plan = await storage.getSeriousPlan(planId);
      if (!plan) {
        return res.status(404).json({ error: "Plan not found" });
      }
      if (plan.userId !== req.user!.id) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      const clientName = (plan.summaryMetadata as any)?.clientName || 'Client';
      const result = await generateArtifactPdf(artifactId, clientName);
      
      if (result.success) {
        res.json({ success: true, url: result.url });
      } else {
        res.status(500).json({ error: result.error });
      }
    } catch (error: any) {
      console.error("Artifact PDF generation error:", error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // POST /api/serious-plan/:planId/bundle-pdf - Generate bundle PDF with all artifacts
  app.post("/api/serious-plan/:planId/bundle-pdf", requireAuth, async (req, res) => {
    try {
      const { planId } = req.params;
      
      const plan = await storage.getSeriousPlan(planId);
      if (!plan) {
        return res.status(404).json({ error: "Plan not found" });
      }
      if (plan.userId !== req.user!.id) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      const result = await generateBundlePdf(planId);
      
      if (result.success) {
        res.json({ success: true, url: result.url });
      } else {
        res.status(500).json({ error: result.error });
      }
    } catch (error: any) {
      console.error("Bundle PDF generation error:", error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // POST /api/serious-plan/:planId/generate-all-pdfs - Generate PDFs for all artifacts
  app.post("/api/serious-plan/:planId/generate-all-pdfs", requireAuth, async (req, res) => {
    try {
      const { planId } = req.params;
      
      const plan = await storage.getSeriousPlan(planId);
      if (!plan) {
        return res.status(404).json({ error: "Plan not found" });
      }
      if (plan.userId !== req.user!.id) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      const result = await generateAllArtifactPdfs(planId);
      
      res.json(result);
    } catch (error: any) {
      console.error("Generate all PDFs error:", error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // POST /api/serious-plan/:planId/send-email - Send the Serious Plan to user's email
  app.post("/api/serious-plan/:planId/send-email", requireAuth, async (req, res) => {
    try {
      const { planId } = req.params;
      const userId = req.user!.id;
      const userEmail = req.user!.email;
      
      if (!userEmail) {
        return res.status(400).json({ error: "No email address associated with your account" });
      }
      
      const plan = await storage.getSeriousPlan(planId);
      if (!plan) {
        return res.status(404).json({ error: "Plan not found" });
      }
      if (plan.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      if (plan.status !== 'ready') {
        return res.status(400).json({ error: "Plan is not ready yet" });
      }
      
      const artifacts = await storage.getArtifactsByPlanId(planId);
      const clientName = (plan.summaryMetadata as any)?.clientName || 'Client';
      const coachNote = plan.coachNoteContent || 'Your Serious Plan is ready for review.';
      
      const baseUrl = getBaseUrl();
      const viewPlanUrl = `${baseUrl}/serious-plan`;
      const bundlePdfUrl = plan.bundlePdfUrl || undefined;
      
      const result = await sendSeriousPlanEmail({
        toEmail: userEmail,
        clientName,
        coachNote,
        artifactCount: artifacts.length,
        viewPlanUrl,
        bundlePdfUrl,
      });
      
      if (result.success) {
        res.json({ success: true, message: "Email sent successfully" });
      } else {
        res.status(500).json({ error: result.error || "Failed to send email" });
      }
    } catch (error: any) {
      console.error("Send Serious Plan email error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ========================================
  // COACH CHAT ENDPOINTS
  // ========================================
  
  // GET /api/coach-chat/:planId/messages - Get chat history for a plan
  app.get("/api/coach-chat/:planId/messages", requireAuth, async (req, res) => {
    try {
      const { planId } = req.params;
      const userId = req.user!.id;
      
      // Verify user owns this plan
      const plan = await storage.getSeriousPlan(planId);
      if (!plan) {
        return res.status(404).json({ error: "Plan not found" });
      }
      if (plan.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      const messages = await storage.getCoachChatMessages(planId);
      res.json(messages);
    } catch (error: any) {
      console.error("Get coach chat messages error:", error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // POST /api/coach-chat/:planId/message - Send a message and get AI response
  app.post("/api/coach-chat/:planId/message", requireAuth, async (req, res) => {
    try {
      const { planId } = req.params;
      const { message } = req.body;
      const userId = req.user!.id;
      
      if (!message || typeof message !== "string") {
        return res.status(400).json({ error: "Message is required" });
      }
      
      // Verify user owns this plan
      const plan = await storage.getSeriousPlan(planId);
      if (!plan) {
        return res.status(404).json({ error: "Plan not found" });
      }
      if (plan.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      // Get existing chat history
      const existingMessages = await storage.getCoachChatMessages(planId);
      
      // Get user's coaching context from the interview transcript with retry
      const loadResult = await loadUserTranscriptWithRetry(userId, {
        requireDossier: true,
        requirePlanCard: true,
        maxAttempts: 2, // Less aggressive retries since user should definitely have data at this point
        delayMs: 1000,
      });
      
      if (!loadResult.success) {
        return res.status(409).json({ 
          error: "Context not ready",
          message: loadResult.error,
          retryable: true,
        });
      }
      
      const { clientDossier, planCard: coachingPlan } = loadResult;
      
      // Get the artifacts for context
      const artifacts = await storage.getArtifactsByPlanId(planId);
      
      // Build the chat context for the AI
      const clientName = (plan.summaryMetadata as any)?.clientName || 'Client';
      const primaryRecommendation = (plan.summaryMetadata as any)?.primaryRecommendation || '';
      
      // Save the user's message
      await storage.createCoachChatMessage({
        planId,
        role: 'user',
        content: message,
      });
      
      // Build system prompt with context
      const systemPrompt = `You are a supportive career coach continuing a conversation with ${clientName} who has completed a 3-module coaching program and received their Serious Plan.

CONTEXT FROM COACHING:
${clientDossier ? `Client Background: ${JSON.stringify(clientDossier)}` : ''}
${coachingPlan ? `Coaching Plan: ${JSON.stringify(coachingPlan)}` : ''}
Primary Recommendation: ${primaryRecommendation}
Coach's Note: ${plan.coachNoteContent || 'Completed coaching successfully.'}

ARTIFACTS IN THEIR PLAN:
${artifacts.map(a => `- ${a.title} (${a.type}): ${a.whyImportant || ''}`).join('\n')}

YOUR ROLE:
- Answer questions about their Serious Plan and artifacts
- Provide encouragement and practical advice
- Help them prepare for difficult conversations
- Remind them of key insights from their coaching
- Keep responses concise but warm (2-4 short paragraphs max)
- You can reference specific artifacts if relevant
- If they ask about something outside the scope of career coaching, gently redirect

COMMUNICATION STYLE:
- Warm but direct
- No corporate jargon
- Practical and actionable
- Empathetic but not saccharine`;

      // Build conversation history for AI
      const chatHistory = existingMessages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));
      
      // Add the new user message
      chatHistory.push({ role: 'user', content: message });
      
      // Use Anthropic if available, otherwise OpenAI
      let aiReply: string;
      
      if (process.env.ANTHROPIC_API_KEY) {
        const Anthropic = (await import("@anthropic-ai/sdk")).default;
        const anthropic = new Anthropic();
        
        const response = await anthropic.messages.create({
          model: "claude-sonnet-4-5",
          max_tokens: 1024,
          system: systemPrompt,
          messages: chatHistory.map(m => ({
            role: m.role,
            content: m.content,
          })),
        });
        
        aiReply = response.content
          .filter(block => block.type === 'text')
          .map(block => (block as { type: 'text'; text: string }).text)
          .join('\n');
      } else {
        const OpenAI = (await import("openai")).default;
        const openai = new OpenAI();
        
        const response = await openai.chat.completions.create({
          model: "gpt-4-1106-preview",
          messages: [
            { role: 'system', content: systemPrompt },
            ...chatHistory,
          ],
          max_tokens: 1024,
        });
        
        aiReply = response.choices[0]?.message?.content || "I'm sorry, I couldn't generate a response. Please try again.";
      }
      
      // Save the assistant's reply
      const assistantMessage = await storage.createCoachChatMessage({
        planId,
        role: 'assistant',
        content: aiReply,
      });
      
      res.json({ 
        reply: aiReply,
        message: assistantMessage,
      });
    } catch (error: any) {
      console.error("Coach chat message error:", error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // GET /auth/google - Start Google OAuth flow
  app.get("/auth/google", (req, res, next) => {
    // Store promo code in session before OAuth redirect
    const promoCode = req.query.promo as string | undefined;
    if (promoCode) {
      (req.session as any).pendingPromoCode = promoCode;
      req.session.save((err) => {
        if (err) console.error("Session save error for promo code:", err);
        passport.authenticate("google", { scope: ["email", "profile"] })(req, res, next);
      });
    } else {
      passport.authenticate("google", { scope: ["email", "profile"] })(req, res, next);
    }
  });
  
  // GET /auth/google/callback - Google OAuth callback
  app.get("/auth/google/callback",
    passport.authenticate("google", { 
      failureRedirect: "/login?error=google_auth_failed" 
    }),
    async (req, res) => {
      // Check if there's a pending promo code to save
      const promoCode = (req.session as any).pendingPromoCode;
      if (promoCode && req.user) {
        const user = req.user as any;
        // Get full user record to check if they already have a promo code
        const fullUser = await storage.getUser(user.id);
        if (fullUser && !fullUser.promoCode) {
          await storage.updateUser(user.id, { promoCode });
          console.log(`Saved promo code ${promoCode} for Google user ${user.id}`);
        }
        delete (req.session as any).pendingPromoCode;
      }
      
      // Ensure session is saved before redirect (prevents race condition)
      req.session.save((err) => {
        if (err) {
          console.error("[Google callback] Session save error:", err);
        }
        res.redirect("/prepare");
      });
    }
  );
  
  // POST /auth/magic/start - Request magic link email
  app.post("/auth/magic/start", async (req, res) => {
    try {
      const { email, promoCode } = req.body;
      
      if (!email || typeof email !== "string") {
        return res.status(400).json({ error: "Email is required" });
      }
      
      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ error: "Invalid email format" });
      }
      
      // Generate secure token
      const token = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
      
      // Store token in database with promo code if provided
      await storage.createMagicLinkToken({
        email: email.toLowerCase(),
        tokenHash,
        promoCode: promoCode || null,
        expiresAt,
      });
      
      // Send email with magic link
      const baseUrl = getBaseUrl();
      const magicLinkUrl = `${baseUrl}/auth/magic/verify?token=${token}`;
      
      const result = await sendMagicLinkEmail(email, magicLinkUrl);
      
      if (result.success) {
        res.json({ success: true, message: "Check your email for the login link" });
      } else {
        console.error("Failed to send magic link:", result.error);
        res.status(500).json({ error: "Failed to send email. Please try again." });
      }
    } catch (error: any) {
      console.error("Magic link start error:", error);
      res.status(500).json({ error: "Something went wrong. Please try again." });
    }
  });
  
  // GET /auth/magic/verify - Verify magic link and log in
  app.get("/auth/magic/verify", async (req, res) => {
    try {
      const { token } = req.query;
      
      if (!token || typeof token !== "string") {
        return res.redirect("/login?error=invalid_token");
      }
      
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      const magicToken = await storage.getMagicLinkToken(tokenHash);
      
      if (!magicToken) {
        return res.redirect("/login?error=expired_token");
      }
      
      // Mark token as used
      await storage.markMagicLinkTokenUsed(magicToken.id);
      
      // Find or create user
      let user = await storage.getUserByEmail(magicToken.email);
      
      if (!user) {
        user = await storage.createUser({
          email: magicToken.email,
          name: null,
          oauthProvider: "magic_link",
          oauthId: null,
          promoCode: magicToken.promoCode || null,
        });
      } else if (magicToken.promoCode && !user.promoCode) {
        // Update existing user with promo code if they don't have one
        await storage.updateUser(user.id, { promoCode: magicToken.promoCode });
        user = { ...user, promoCode: magicToken.promoCode };
      }
      
      // Log user in
      req.login({ id: user.id, email: user.email, name: user.name, providedName: user.providedName || null }, (err) => {
        if (err) {
          console.error("Login error:", err);
          return res.redirect("/login?error=login_failed");
        }
        // Ensure session is saved before redirect (prevents race condition)
        req.session.save((saveErr) => {
          if (saveErr) {
            console.error("Session save error:", saveErr);
          }
          res.redirect("/prepare");
        });
      });
    } catch (error: any) {
      console.error("Magic link verify error:", error);
      res.redirect("/login?error=verification_failed");
    }
  });
  
  // POST /auth/logout - Log out
  app.post("/auth/logout", (req, res) => {
    req.logout((err) => {
      if (err) {
        console.error("Logout error:", err);
        return res.status(500).json({ error: "Logout failed" });
      }
      res.json({ success: true });
    });
  });

  // POST /auth/demo - Demo login for testing (development only)
  app.post("/auth/demo", async (req, res) => {
    try {
      const demoEmail = "demo@test.local";
      
      // Find or create demo user
      let user = await storage.getUserByEmail(demoEmail);
      
      if (!user) {
        user = await storage.createUser({
          email: demoEmail,
          name: "Demo User",
          oauthProvider: "demo",
          oauthId: null,
        });
      } else {
        // Clear any existing transcript for fresh demo session
        try {
          await db.delete(interviewTranscripts).where(eq(interviewTranscripts.userId, user.id));
        } catch (e) {
          console.error("Failed to clear demo transcript:", e);
        }
      }
      
      // Log user in
      req.login({ id: user.id, email: user.email, name: user.name, providedName: user.providedName || null }, (err) => {
        if (err) {
          console.error("Demo login error:", err);
          return res.status(500).json({ error: "Login failed" });
        }
        req.session.save((saveErr) => {
          if (saveErr) {
            console.error("Session save error:", saveErr);
          }
          res.json({ success: true });
        });
      });
    } catch (error: any) {
      console.error("Demo login error:", error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // ============== TRANSCRIPT API (Protected) ==============
  
  // GET /api/transcript - Get user's transcript
  app.get("/api/transcript", requireAuth, async (req, res) => {
    const requestStart = Date.now();
    try {
      const userId = req.user!.id;
      const transcript = await storage.getTranscriptByUserId(userId);
      
      if (transcript) {
        const durationMs = Date.now() - requestStart;
        const messageCount = Array.isArray(transcript.transcript) ? transcript.transcript.length : 0;
        console.log(`[TRANSCRIPT_GET] ts=${new Date().toISOString()} user=${userId} status=found messageCount=${messageCount} module=${transcript.currentModule} progress=${transcript.progress} interviewComplete=${transcript.interviewComplete} paymentVerified=${transcript.paymentVerified} hasPlanCard=${!!transcript.planCard} hasDossier=${!!transcript.clientDossier} durationMs=${durationMs}`);
        
        res.json({
          transcript: transcript.transcript,
          currentModule: transcript.currentModule,
          progress: transcript.progress,
          interviewComplete: transcript.interviewComplete,
          paymentVerified: transcript.paymentVerified,
          valueBullets: transcript.valueBullets,
          socialProof: transcript.socialProof,
          planCard: transcript.planCard,
          // Include clientDossier for personalization on offer page
          clientDossier: transcript.clientDossier || null,
        });
      } else {
        const durationMs = Date.now() - requestStart;
        console.log(`[TRANSCRIPT_GET] ts=${new Date().toISOString()} user=${userId} status=not_found durationMs=${durationMs}`);
        res.json({ transcript: null });
      }
    } catch (error: any) {
      const durationMs = Date.now() - requestStart;
      console.error(`[TRANSCRIPT_GET] ts=${new Date().toISOString()} user=${req.user?.id || 'unknown'} status=error durationMs=${durationMs} error="${error.message}"`);
      res.status(500).json({ error: "Failed to fetch transcript" });
    }
  });
  
  // NOTE: POST /api/transcript is defined later in the file with dossier generation logic
  
  // ============== EXISTING ROUTES ==============
  
  // POST /checkout - Create Stripe Checkout session
  app.post("/checkout", async (req, res) => {
    try {
      const stripe = await getStripeClient();
      const priceId = await getProductPrice();
      const baseUrl = getBaseUrl();
      const { promoCode: sessionPromoCode } = req.body || {};
      
      // Get the price to check currency
      const price = await stripe.prices.retrieve(priceId);
      const priceCurrency = price.currency || 'usd';
      
      // Determine promo code priority: DB (user-specific) > session > default
      let promoCode: string | null = null;
      let isUserSpecificPromo = false;
      
      // Check if user is authenticated and has a promo code stored
      const user = req.user as any;
      if (user?.id) {
        const fullUser = await storage.getUser(user.id);
        if (fullUser?.promoCode) {
          promoCode = fullUser.promoCode;
          isUserSpecificPromo = true;
          console.log(`Using user's stored promo code: ${promoCode}`);
        }
      }
      
      // If no DB promo code, use session-provided promo code
      if (!promoCode && sessionPromoCode) {
        promoCode = sessionPromoCode;
        console.log(`Using session promo code: ${promoCode}`);
      }
      
      // Build checkout session options
      const sessionOptions: any = {
        mode: "payment",
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        success_url: `${baseUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/interview`,
      };
      
      // If a promo code was found (from DB or session), look it up and apply it
      if (promoCode) {
        try {
          const promoCodes = await stripe.promotionCodes.list({
            code: promoCode,
            active: true,
            limit: 1,
          });
          
          if (promoCodes.data.length > 0) {
            sessionOptions.discounts = [{ promotion_code: promoCodes.data[0].id }];
            console.log(`Applied promo code: ${promoCode} (user-specific: ${isUserSpecificPromo})`);
          } else {
            console.log(`Promo code not found or inactive: ${promoCode}, falling back to default`);
            // Fall back to standard promo or allow manual entry
            const promo = await findActivePromoCode(priceCurrency);
            if (promo.promoCodeId) {
              sessionOptions.discounts = [{ promotion_code: promo.promoCodeId }];
            } else {
              sessionOptions.allow_promotion_codes = true;
            }
          }
        } catch (promoError) {
          console.log(`Error looking up promo code: ${promoCode}`, promoError);
          // Fall back to standard behavior
          const promo = await findActivePromoCode(priceCurrency);
          if (promo.promoCodeId) {
            sessionOptions.discounts = [{ promotion_code: promo.promoCodeId }];
          } else {
            sessionOptions.allow_promotion_codes = true;
          }
        }
      } else {
        // No custom code - use the standard promo code discovery
        const promo = await findActivePromoCode(priceCurrency);
        if (promo.promoCodeId) {
          sessionOptions.discounts = [{ promotion_code: promo.promoCodeId }];
        } else {
          sessionOptions.allow_promotion_codes = true;
        }
      }
      
      const session = await stripe.checkout.sessions.create(sessionOptions);

      res.json({ url: session.url });
    } catch (error: any) {
      console.error("Checkout error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /verify-session - Verify Stripe payment and mark transcript as payment verified
  app.get("/verify-session", async (req, res) => {
    const requestStart = Date.now();
    try {
      const sessionId = req.query.session_id as string;
      const user = (req as any).user;
      const userId = user?.id || 'anonymous';
      
      console.log(`[VERIFY_SESSION] ts=${new Date().toISOString()} user=${userId} status=started stripeSessionId=${sessionId?.slice(0, 20)}...`);
      
      if (!sessionId) {
        const durationMs = Date.now() - requestStart;
        console.log(`[VERIFY_SESSION] ts=${new Date().toISOString()} user=${userId} status=failed_missing_session durationMs=${durationMs}`);
        return res.status(400).json({ ok: false, error: "Missing session_id" });
      }

      const stripe = await getStripeClient();
      // Expand total_details.breakdown to get coupon info
      const session = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ['total_details.breakdown']
      });

      console.log(`[VERIFY_SESSION] ts=${new Date().toISOString()} user=${userId} stripePaymentStatus=${session.payment_status}`);

      if (session.payment_status === "paid") {
        // If user is authenticated, mark their transcript as payment verified
        if (user?.id) {
          const transcript = await storage.getTranscriptByUserId(user.id);
          if (transcript && transcript.sessionToken) {
            await storage.updateTranscript(transcript.sessionToken, {
              paymentVerified: true,
              stripeSessionId: sessionId,
            });
            console.log(`[VERIFY_SESSION] ts=${new Date().toISOString()} user=${userId} status=state_change paymentVerified=true hasDossier=${!!transcript.clientDossier}`);
          }
          
          // Check if a friends & family coupon was used
          const FRIENDS_FAMILY_COUPONS = ['uEW83Os5', 'h8TgzjXR', 'klpY3iUM'];
          const discounts = session.total_details?.breakdown?.discounts || [];
          const usedCouponId = discounts.length > 0 
            ? (discounts[0].discount as any)?.coupon?.id 
            : null;
          
          if (usedCouponId && FRIENDS_FAMILY_COUPONS.includes(usedCouponId)) {
            await storage.updateUser(user.id, { isFriendsAndFamily: true });
            console.log(`[VERIFY_SESSION] ts=${new Date().toISOString()} user=${userId} status=friends_family_flagged couponId=${usedCouponId}`);
          }
        }
        const durationMs = Date.now() - requestStart;
        console.log(`[VERIFY_SESSION] ts=${new Date().toISOString()} user=${userId} status=success durationMs=${durationMs}`);
        return res.json({ ok: true });
      } else {
        const durationMs = Date.now() - requestStart;
        console.log(`[VERIFY_SESSION] ts=${new Date().toISOString()} user=${userId} status=failed_not_paid stripePaymentStatus=${session.payment_status} durationMs=${durationMs}`);
        return res.status(403).json({ ok: false, error: "Payment not completed" });
      }
    } catch (error: any) {
      const durationMs = Date.now() - requestStart;
      console.error(`[VERIFY_SESSION] ts=${new Date().toISOString()} user=${(req as any).user?.id || 'anonymous'} status=error durationMs=${durationMs} error="${error.message}"`);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // POST /api/interview/complete - Lightweight endpoint to mark interview complete
  // Called BEFORE Stripe redirect to ensure database is updated
  // Note: Dossier generation now happens when planCard is saved via POST /api/transcript
  app.post("/api/interview/complete", async (req, res) => {
    const requestStart = Date.now();
    try {
      const user = req.user as any;
      if (!user?.id) {
        console.log(`[INTERVIEW_COMPLETE] ts=${new Date().toISOString()} user=anonymous status=rejected_not_authenticated`);
        return res.status(401).json({ error: "Not authenticated" });
      }

      console.log(`[INTERVIEW_COMPLETE] ts=${new Date().toISOString()} user=${user.id} status=started`);

      const transcript = await storage.getTranscriptByUserId(user.id);
      if (!transcript) {
        const durationMs = Date.now() - requestStart;
        console.log(`[INTERVIEW_COMPLETE] ts=${new Date().toISOString()} user=${user.id} status=failed_no_transcript durationMs=${durationMs}`);
        return res.status(400).json({ error: "No transcript found" });
      }

      const hasPlanCard = !!transcript.planCard;
      const hasDossier = !!transcript.clientDossier;

      // Already complete - return success
      if (transcript.interviewComplete) {
        const durationMs = Date.now() - requestStart;
        console.log(`[INTERVIEW_COMPLETE] ts=${new Date().toISOString()} user=${user.id} status=already_complete hasPlanCard=${hasPlanCard} hasDossier=${hasDossier} durationMs=${durationMs}`);
        return res.json({ ok: true, alreadyComplete: true, hasDossier });
      }

      // Mark interview as complete in database
      await storage.updateTranscript(transcript.sessionToken, {
        interviewComplete: true,
        progress: 100,
      });

      const durationMs = Date.now() - requestStart;
      console.log(`[INTERVIEW_COMPLETE] ts=${new Date().toISOString()} user=${user.id} status=state_change interviewComplete=true progress=100 hasPlanCard=${hasPlanCard} hasDossier=${hasDossier} durationMs=${durationMs}`);

      // Dossier should already exist (generated when planCard was saved)
      // Just report whether it's ready
      res.json({ ok: true, hasDossier });
    } catch (error: any) {
      const durationMs = Date.now() - requestStart;
      console.error(`[INTERVIEW_COMPLETE] ts=${new Date().toISOString()} user=${(req.user as any)?.id || 'unknown'} status=error durationMs=${durationMs} error="${error.message}"`);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/transcript/revision - Increment revision count when user clicks "Change Something"
  app.post("/api/transcript/revision", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user?.id) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const transcript = await storage.getTranscriptByUserId(user.id);
      if (!transcript) {
        return res.status(400).json({ error: "No transcript found" });
      }

      const currentCount = (transcript as any).revisionCount || 0;
      await storage.updateTranscript(transcript.sessionToken, {
        revisionCount: currentCount + 1,
      } as any);

      console.log(`[REVISION] ts=${new Date().toISOString()} user=${user.id} revisionCount=${currentCount + 1}`);
      res.json({ ok: true, revisionCount: currentCount + 1 });
    } catch (error: any) {
      console.error("Revision count error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/generate-dossier - Fallback endpoint to generate dossier if missing
  // Normally dossier is generated when planCard is saved, but this provides a fallback
  app.post("/api/generate-dossier", async (req, res) => {
    const requestStart = Date.now();
    
    try {
      const user = req.user as any;
      if (!user?.id) {
        console.log(`[DOSSIER_FALLBACK] ts=${new Date().toISOString()} user=anonymous status=rejected_not_authenticated`);
        return res.status(401).json({ error: "Not authenticated" });
      }

      console.log(`[DOSSIER_FALLBACK] ts=${new Date().toISOString()} user=${user.id} status=started`);

      // Get the user's transcript from the database
      const transcript = await storage.getTranscriptByUserId(user.id);
      if (!transcript || !transcript.transcript || !Array.isArray(transcript.transcript)) {
        const durationMs = Date.now() - requestStart;
        console.log(`[DOSSIER_FALLBACK] ts=${new Date().toISOString()} user=${user.id} status=failed_no_transcript durationMs=${durationMs}`);
        return res.status(400).json({ error: "No interview transcript found" });
      }

      // Check if dossier already exists
      if (transcript.clientDossier) {
        const durationMs = Date.now() - requestStart;
        console.log(`[DOSSIER_FALLBACK] ts=${new Date().toISOString()} user=${user.id} status=already_exists durationMs=${durationMs}`);
        return res.json({ ok: true, message: "Dossier already exists" });
      }

      const messageCount = transcript.transcript.length;
      console.log(`[DOSSIER_FALLBACK] ts=${new Date().toISOString()} user=${user.id} status=generating messageCount=${messageCount}`);

      // Use the shared helper with retry logic
      const transcriptMessages = transcript.transcript as { role: string; content: string }[];
      const generateStart = Date.now();
      const result = await generateAndSaveDossier(user.id, transcriptMessages);
      const generateDurationMs = Date.now() - generateStart;
      
      const durationMs = Date.now() - requestStart;
      
      if (result.status === 'in_progress') {
        // Generation is already in progress (another request is handling it)
        // Return success - the polling will pick up the dossier when it's ready
        console.log(`[DOSSIER_FALLBACK] ts=${new Date().toISOString()} user=${user.id} status=in_progress lockAgeMs=${result.lockAgeMs} durationMs=${durationMs}`);
        return res.json({ ok: true, message: "Generation in progress", inProgress: true });
      }
      
      if (result.status === 'failed') {
        console.error(`[DOSSIER_FALLBACK] ts=${new Date().toISOString()} user=${user.id} status=failed generateDurationMs=${generateDurationMs} durationMs=${durationMs} error="${result.error}"`);
        return res.status(500).json({ error: "Failed to generate dossier after retries" });
      }

      console.log(`[DOSSIER_FALLBACK] ts=${new Date().toISOString()} user=${user.id} status=success generateDurationMs=${generateDurationMs} durationMs=${durationMs}`);
      res.json({ ok: true });
    } catch (error: any) {
      const durationMs = Date.now() - requestStart;
      console.error(`[DOSSIER_FALLBACK] ts=${new Date().toISOString()} user=${(req.user as any)?.id || 'unknown'} status=error durationMs=${durationMs} error="${error.message}"`);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/update-module-dossier - Update dossier with module completion record
  app.post("/api/update-module-dossier", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user?.id) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const { moduleNumber, moduleName, transcript: moduleTranscript } = req.body;
      
      if (!moduleNumber || !moduleTranscript) {
        return res.status(400).json({ error: "Missing module data" });
      }

      // Get the user's current dossier
      const userTranscript = await storage.getTranscriptByUserId(user.id);
      if (!userTranscript?.clientDossier) {
        return res.status(400).json({ error: "No dossier found" });
      }

      console.log(`Updating dossier with module ${moduleNumber} for user ${user.id}...`);

      // Generate the module analysis
      const analysis = await generateModuleAnalysis(moduleNumber, moduleName || `Module ${moduleNumber}`, moduleTranscript);
      
      if (!analysis) {
        return res.status(500).json({ error: "Failed to generate module analysis" });
      }

      // Create the module record
      const moduleRecord: ModuleRecord = {
        moduleNumber,
        moduleName: moduleName || `Module ${moduleNumber}`,
        transcript: moduleTranscript,
        ...analysis,
        completedAt: new Date().toISOString(),
      };

      // Update the dossier
      const updatedDossier: ClientDossier = {
        ...userTranscript.clientDossier,
        moduleRecords: [
          ...userTranscript.clientDossier.moduleRecords.filter(m => m.moduleNumber !== moduleNumber),
          moduleRecord
        ].sort((a, b) => a.moduleNumber - b.moduleNumber),
        lastUpdated: new Date().toISOString(),
      };

      await storage.updateClientDossier(user.id, updatedDossier);

      // Also mark the module as complete in the transcript for journey state tracking
      if (userTranscript.sessionToken) {
        const moduleCompleteUpdate: Record<string, boolean> = {};
        if (moduleNumber === 1) moduleCompleteUpdate.module1Complete = true;
        if (moduleNumber === 2) moduleCompleteUpdate.module2Complete = true;
        if (moduleNumber === 3) moduleCompleteUpdate.module3Complete = true;
        
        await storage.updateTranscript(userTranscript.sessionToken, moduleCompleteUpdate);
        console.log(`Module ${moduleNumber} marked as complete for user ${user.id}`);
        
        // Auto-start Serious Plan generation when Module 3 completes
        if (moduleNumber === 3) {
          // Check if plan already exists before starting
          const existingPlan = await storage.getSeriousPlanByUserId(user.id);
          if (existingPlan) {
            console.log(`[SERIOUS_PLAN] ts=${new Date().toISOString()} user=${user.id} status=skipped reason=plan_exists planId=${existingPlan.id} planStatus=${existingPlan.status}`);
          } else {
            // Fire and forget - retry mechanism handles missing data
            attemptSeriousPlanInitWithRetry(
              user.id,
              userTranscript.sessionToken,
              1 // Start at attempt 1
            );
          }
        }
      }

      console.log(`Dossier updated with module ${moduleNumber} for user ${user.id}`);
      res.json({ ok: true });
    } catch (error: any) {
      console.error("Update module dossier error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /interview - AI interview endpoint
  app.post("/interview", async (req, res) => {
    try {
      if (!useAnthropic && !process.env.OPENAI_API_KEY) {
        return res.status(500).json({ error: "No AI API key configured" });
      }

      const { transcript = [] } = req.body;

      // Check if user sent "testskip" command (case-insensitive)
      const lastUserMessage = [...transcript].reverse().find((t: any) => t.role === 'user');
      const isTestSkip = lastUserMessage?.content?.toLowerCase().trim() === 'testskip';

      // Build testskip prompt override if needed
      const testSkipPrompt = isTestSkip ? `

IMPORTANT OVERRIDE - TESTSKIP MODE:
The user has entered "testskip" which is a testing command. You must now:
1. Review the conversation so far
2. Fabricate plausible, realistic answers for ALL remaining interview questions
3. Start your response with: "Skipping ahead for testing purposes..."
4. Present a summary of the fabricated client story in a clear, structured format
5. Ask the user to confirm if this summary is correct using structured options

DO NOT output the plan card yet. Wait for the user to confirm first.

Your response should follow this format:

---

Skipping ahead for testing purposes...

Based on our conversation, here's what I understand about your situation:

**Your Story:**
- **Name:** [Fabricated name, e.g., Sarah Chen]
- **Current Role:** [Fabricated role, e.g., Marketing Manager at a mid-size tech company]
- **Tenure:** [Fabricated tenure, e.g., 3 years]
- **The Situation:** [Fabricated situation, e.g., Feeling stuck, manager is unsupportive, considering leaving]
- **Key Constraints:** [Fabricated constraints, e.g., Lives in Atlanta, cannot relocate, has financial obligations]
- **What You Want:** [Fabricated goals, e.g., More strategic responsibility and growth opportunities]

[[PROGRESS]]85[[END_PROGRESS]]

---

Does this capture your situation correctly?

[[STRUCTURED_OPTIONS]]
- Yes, that's right - let's continue
- Not quite - let me clarify a few things
[[END_STRUCTURED_OPTIONS]]

---

Remember: Do NOT output [[PLAN_CARD]], [[INTERVIEW_COMPLETE]], [[VALUE_BULLETS]], or [[SOCIAL_PROOF]] in this response. Those come only after the user confirms.
` : '';

      let reply: string;
      const systemPromptToUse = INTERVIEW_SYSTEM_PROMPT + testSkipPrompt;

      if (useAnthropic && anthropic) {
        // Use Anthropic Claude
        const claudeMessages: { role: "user" | "assistant"; content: string }[] = [];

        for (const turn of transcript) {
          if (turn && turn.role && turn.content) {
            claudeMessages.push({
              role: turn.role as "user" | "assistant",
              content: turn.content
            });
          }
        }

        if (transcript.length === 0) {
          claudeMessages.push({ role: "user", content: "Start the interview. Ask your first question." });
        }

        const response = await anthropic.messages.create({
          model: "claude-sonnet-4-5",
          max_tokens: 2048,
          system: systemPromptToUse,
          messages: claudeMessages,
        });

        reply = response.content[0].type === 'text' ? response.content[0].text : '';
      } else {
        // Fall back to OpenAI
        const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
          { role: "system", content: systemPromptToUse }
        ];

        for (const turn of transcript) {
          if (turn && turn.role && turn.content) {
            messages.push({
              role: turn.role as "user" | "assistant",
              content: turn.content
            });
          }
        }

        if (transcript.length === 0) {
          messages.push({ role: "user", content: "Start the interview. Ask your first question." });
        }

        const response = await openai.chat.completions.create({
          model: "gpt-4.1-mini",
          messages,
          max_completion_tokens: isTestSkip ? 2048 : 1024,
        });

        reply = response.choices[0].message.content || "";
      }
      let done = false;
      let valueBullets: string | null = null;
      let socialProof: string | null = null;
      let options: string[] | null = null;
      let progress: number | null = null;
      let planCard: { 
        name: string; 
        modules: { name: string; objective: string; approach: string; outcome: string }[]; 
        careerBrief: string;
        seriousPlanSummary: string;
        plannedArtifacts: { key: string; title: string; type: string; description: string; importance: string }[];
      } | null = null;

      // Parse progress token
      const progressMatch = reply.match(/\[\[PROGRESS\]\]\s*(\d+)\s*\[\[END_PROGRESS\]\]/);
      if (progressMatch) {
        progress = parseInt(progressMatch[1], 10);
        if (isNaN(progress) || progress < 0 || progress > 100) {
          progress = null;
        }
      }

      // Parse structured options (handles both newline and pipe-separated)
      const optionsMatch = reply.match(/\[\[OPTIONS\]\]([\s\S]*?)\[\[END_OPTIONS\]\]/);
      if (optionsMatch) {
        const rawOptions = optionsMatch[1].trim();
        // Split on newlines first, then on pipes if we only got one option
        let parsedOptions = rawOptions.split('\n').map(opt => opt.trim()).filter(opt => opt.length > 0);
        if (parsedOptions.length === 1 && parsedOptions[0].includes('|')) {
          parsedOptions = parsedOptions[0].split('|').map(opt => opt.trim()).filter(opt => opt.length > 0);
        }
        options = parsedOptions;
      }

      // Parse plan card with expanded format (objectives, approach, outcome)
      const planCardMatch = reply.match(/\[\[PLAN_CARD\]\]([\s\S]*?)\[\[END_PLAN_CARD\]\]/);
      if (planCardMatch) {
        const cardContent = planCardMatch[1].trim();
        const nameMatch = cardContent.match(/NAME:\s*(.+)/);
        
        // Module 1
        const module1NameMatch = cardContent.match(/MODULE1_NAME:\s*(.+)/);
        const module1ObjectiveMatch = cardContent.match(/MODULE1_OBJECTIVE:\s*(.+)/);
        const module1ApproachMatch = cardContent.match(/MODULE1_APPROACH:\s*(.+)/);
        const module1OutcomeMatch = cardContent.match(/MODULE1_OUTCOME:\s*(.+)/);
        
        // Module 2
        const module2NameMatch = cardContent.match(/MODULE2_NAME:\s*(.+)/);
        const module2ObjectiveMatch = cardContent.match(/MODULE2_OBJECTIVE:\s*(.+)/);
        const module2ApproachMatch = cardContent.match(/MODULE2_APPROACH:\s*(.+)/);
        const module2OutcomeMatch = cardContent.match(/MODULE2_OUTCOME:\s*(.+)/);
        
        // Module 3
        const module3NameMatch = cardContent.match(/MODULE3_NAME:\s*(.+)/);
        const module3ObjectiveMatch = cardContent.match(/MODULE3_OBJECTIVE:\s*(.+)/);
        const module3ApproachMatch = cardContent.match(/MODULE3_APPROACH:\s*(.+)/);
        const module3OutcomeMatch = cardContent.match(/MODULE3_OUTCOME:\s*(.+)/);
        
        const careerBriefMatch = cardContent.match(/CAREER_BRIEF:\s*(.+)/);
        const seriousPlanSummaryMatch = cardContent.match(/SERIOUS_PLAN_SUMMARY:\s*(.+)/);
        const plannedArtifactsMatch = cardContent.match(/PLANNED_ARTIFACTS:\s*(.+)/);

        // Parse planned artifacts into structured format
        const parseArtifacts = (artifactList: string): { key: string; title: string; type: string; description: string; importance: string }[] => {
          const artifactKeys = artifactList.split(',').map(a => a.trim().toLowerCase().replace(/\s+/g, '_'));
          const artifactDefinitions: Record<string, { title: string; type: string; description: string; importance: string }> = {
            'decision_snapshot': { title: 'Decision Snapshot', type: 'snapshot', description: 'A concise summary of your situation, options, and recommended path forward', importance: 'must_read' },
            'action_plan': { title: 'Action Plan', type: 'plan', description: 'A time-boxed plan with concrete steps and decision checkpoints', importance: 'must_read' },
            'boss_conversation': { title: 'Boss Conversation Plan', type: 'conversation', description: 'Scripts and strategies for navigating your manager conversation', importance: 'must_read' },
            'partner_conversation': { title: 'Partner Conversation Plan', type: 'conversation', description: 'Talking points for discussing this transition with your partner', importance: 'recommended' },
            'self_narrative': { title: 'Clarity Memo', type: 'narrative', description: 'The story you tell yourself about this transition and what you want', importance: 'recommended' },
            'module_recap': { title: 'Module Recap', type: 'recap', description: 'Key insights and decisions from each coaching session', importance: 'recommended' },
            'resources': { title: 'Curated Resources', type: 'resources', description: 'Articles, books, and tools specifically chosen for your situation', importance: 'optional' },
            'risk_map': { title: 'Risk & Fallback Map', type: 'plan', description: 'Identified risks with mitigation strategies and backup plans', importance: 'recommended' },
            'negotiation_toolkit': { title: 'Negotiation Toolkit', type: 'conversation', description: 'Strategies and scripts for salary or terms negotiation', importance: 'recommended' },
            'networking_plan': { title: 'Networking Plan', type: 'plan', description: 'A targeted approach to building connections for your next move', importance: 'optional' },
          };
          
          return artifactKeys.map(key => {
            const def = artifactDefinitions[key] || { title: key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), type: 'custom', description: 'Custom artifact for your situation', importance: 'recommended' };
            return { key, ...def };
          });
        };

        if (nameMatch) {
          const artifactList = plannedArtifactsMatch?.[1]?.trim() || 'decision_snapshot, action_plan, module_recap, resources';
          planCard = {
            name: nameMatch[1].trim(),
            modules: [
              { 
                name: module1NameMatch?.[1]?.trim() || 'Discovery', 
                objective: module1ObjectiveMatch?.[1]?.trim() || '',
                approach: module1ApproachMatch?.[1]?.trim() || '',
                outcome: module1OutcomeMatch?.[1]?.trim() || ''
              },
              { 
                name: module2NameMatch?.[1]?.trim() || 'Options', 
                objective: module2ObjectiveMatch?.[1]?.trim() || '',
                approach: module2ApproachMatch?.[1]?.trim() || '',
                outcome: module2OutcomeMatch?.[1]?.trim() || ''
              },
              { 
                name: module3NameMatch?.[1]?.trim() || 'Action Plan', 
                objective: module3ObjectiveMatch?.[1]?.trim() || '',
                approach: module3ApproachMatch?.[1]?.trim() || '',
                outcome: module3OutcomeMatch?.[1]?.trim() || ''
              }
            ],
            careerBrief: careerBriefMatch?.[1]?.trim() || '',
            seriousPlanSummary: seriousPlanSummaryMatch?.[1]?.trim() || 'Your personalized Serious Plan with tailored coaching artifacts',
            plannedArtifacts: parseArtifacts(artifactList)
          };
        }
      }

      // Check for interview completion
      if (reply.includes("[[INTERVIEW_COMPLETE]]")) {
        done = true;

        const bulletMatch = reply.match(/\[\[VALUE_BULLETS\]\]([\s\S]*?)\[\[END_VALUE_BULLETS\]\]/);
        if (bulletMatch) {
          valueBullets = bulletMatch[1].trim();
        }

        const socialProofMatch = reply.match(/\[\[SOCIAL_PROOF\]\]([\s\S]*?)\[\[END_SOCIAL_PROOF\]\]/);
        if (socialProofMatch) {
          socialProof = socialProofMatch[1].trim();
        }
      }

      // Sanitize reply - remove all control tokens
      reply = reply
        .replace(/\[\[PROGRESS\]\]\s*\d+\s*\[\[END_PROGRESS\]\]/g, '')
        .replace(/\[\[INTERVIEW_COMPLETE\]\]/g, '')
        .replace(/\[\[VALUE_BULLETS\]\][\s\S]*?\[\[END_VALUE_BULLETS\]\]/g, '')
        .replace(/\[\[SOCIAL_PROOF\]\][\s\S]*?\[\[END_SOCIAL_PROOF\]\]/g, '')
        .replace(/\[\[OPTIONS\]\][\s\S]*?\[\[END_OPTIONS\]\]/g, '')
        .replace(/\[\[PLAN_CARD\]\][\s\S]*?\[\[END_PLAN_CARD\]\]/g, '')
        .trim();

      res.json({ reply, done, valueBullets, socialProof, options, progress, planCard });
    } catch (error: any) {
      console.error("Interview error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Module system prompts
  const MODULE_SYSTEM_PROMPTS: Record<number, string> = {
    1: `You are an experienced, plain-spoken career coach conducting Module 1: Job Autopsy.

### Context
The user has completed an initial interview where they shared their career situation. They've paid for coaching and are now starting the first module.

### Your Goal
Help the user deeply examine their current job situation to understand what's really driving their dissatisfaction. Separate fixable problems from fundamental mismatches.

### Tone & Style
- Warm, direct, and insightful
- Ask probing questions that help them see their situation clearly
- No corporate jargon, no empty validation
- Sound like a coach who has helped hundreds of people through this
- **Avoid effusive affirmations** like "That's it!", "There it is.", "That's solid.", "You nailed it!", "Exactly!", "Bingo!", "Perfect!", "Spot on!", "Love it!" or any variation — these feel condescending or performative. NEVER start a response with a short, punchy validation phrase followed by a period. If you want to acknowledge what they said, weave it into a longer sentence that moves to substance immediately.
- Keep acknowledgments simple and move to substance quickly
- **NEVER use the user's name directly** (e.g., "Sarah" or "Alright Sarah"). Just use "you" — speak to them directly without addressing them by name.

### Response Structure (CRITICAL)

**Always put your question at the END of your response.** This makes it easy for the user to respond.

**Break up the "recap + question" pattern** by interspersing:
- **Informed opinions**: "Based on what you're describing, the real issue might be..."
- **Concrete advice**: "One thing that often helps here is..."
- **Relevant data points**: Industry-specific insights, typical career paths, common patterns
- **Pattern recognition**: "I've seen this before — when X happens, it usually means..."

### Domain Expertise

Speak with genuine expertise about their industry and function:
- Ask domain-specific questions relevant to their role
- Share relevant insights about career paths, compensation, and industry norms
- Use appropriate terminology and demonstrate understanding of their field

### Structured Options (USE FREQUENTLY)

Use [[OPTIONS]]...[[END_OPTIONS]] liberally — at least every 2-3 turns. When exploring a new topic, provide 4-5 thought starters with "Something else" as an option, then follow up with less structured questions.

### Session Structure
1. **Opening (1 message)**: Start with a title card, then briefly introduce the module's purpose. Reference something specific from their interview to show you remember their situation.
2. **Deep Dive (4-6 exchanges)**: Ask questions that explore:
   - What specifically frustrates them day-to-day?
   - What aspects of the job did they used to enjoy (if any)?
   - Is the problem the role, the company, the manager, or something else?
   - What would need to change for them to want to stay?
3. **Wrap-up**: When you feel you have a clear picture, output [[MODULE_COMPLETE]] along with a summary.

### First Message Format
On your first message, output a title card EXACTLY like this (using em-dashes, not code blocks or ASCII art):
— Job Autopsy (est. 10–20 minutes) —

CRITICAL: The title card must be plain text on its own line. Do NOT use backticks, code blocks, ASCII box art, or markdown heading prefixes like #.

Then introduce the module and ask your first probing question based on what you know about their situation.

### Progress Tracking
Include [[PROGRESS]]<number>[[END_PROGRESS]] in each response (5-100).

### Completion
When the module is complete, include:
[[MODULE_COMPLETE]]
[[SUMMARY]]
**The Mirror** (what they said, reflected clearly)
- Key point 1
- Key point 2
- Key point 3

**Diagnosis**
Your assessment of the core issue in 2-3 sentences.

**Key Takeaway**
One concrete insight they can carry forward.
[[END_SUMMARY]]`,

    2: `You are an experienced, plain-spoken career coach conducting Module 2: Fork in the Road.

### Context
The user has completed Module 1 (Job Autopsy) where they examined what's driving their dissatisfaction. Now they need to explore their options.

### Your Goal
Help the user clarify their options and evaluate the trade-offs of staying, pivoting internally, or leaving entirely.

### Tone & Style
- Warm, direct, and practical
- Help them see options they might be overlooking
- Challenge assumptions about what's possible
- No corporate jargon, sound like a trusted advisor
- **Avoid effusive affirmations** like "That's it!", "There it is.", "That's solid.", "You nailed it!", "Exactly!", "Bingo!", "Perfect!", "Spot on!", "Love it!" or any variation — these feel condescending or performative. NEVER start a response with a short, punchy validation phrase followed by a period. If you want to acknowledge what they said, weave it into a longer sentence that moves to substance immediately.
- Keep acknowledgments simple and move to substance quickly
- **NEVER use the user's name directly** (e.g., "Sarah" or "Alright Sarah"). Just use "you" — speak to them directly without addressing them by name.

### Response Structure (CRITICAL)

**Always put your question at the END of your response.** This makes it easy for the user to respond.

**Break up the "recap + question" pattern** by interspersing:
- **Informed opinions**: "Given your situation, I think the most overlooked option is..."
- **Concrete advice**: "Before making any move, you should probably..."
- **Relevant data points**: Industry-specific insights about similar transitions
- **Pattern recognition**: "People in your situation often underestimate..."

### Domain Expertise

Speak with genuine expertise about their industry and function:
- Share relevant insights about typical career paths and transition patterns in their field
- Offer domain-specific advice about how to evaluate options
- Suggest industry-relevant resources or frameworks

### Structured Options (USE FREQUENTLY)

Use [[OPTIONS]]...[[END_OPTIONS]] liberally — at least every 2-3 turns. When exploring a new topic, provide 4-5 thought starters with "Something else" as an option, then follow up with less structured questions.

### Session Structure
1. **Opening (1 message)**: Start with a title card, then briefly recap what you learned in Module 1 and introduce this module's focus.
2. **Options Exploration (4-6 exchanges)**: Ask questions that explore:
   - What are their actual options? (stay and negotiate, internal move, leave entirely)
   - What constraints are real vs. assumed?
   - What's the cost of staying another year?
   - What would make leaving worth the risk?
3. **Wrap-up**: When you've mapped their options, output [[MODULE_COMPLETE]] with a summary.

### First Message Format
On your first message, output a title card EXACTLY like this (using em-dashes, not code blocks or ASCII art):
— Fork in the Road (est. 10–20 minutes) —

CRITICAL: The title card must be plain text on its own line. Do NOT use backticks, code blocks, ASCII box art, or markdown heading prefixes like #.

Then recap their situation briefly and ask your first question about options.

### Progress Tracking
Include [[PROGRESS]]<number>[[END_PROGRESS]] in each response (5-100).

### Completion
When the module is complete, include:
[[MODULE_COMPLETE]]
[[SUMMARY]]
**Options Map**
- Option A: [description] — Trade-offs: [brief]
- Option B: [description] — Trade-offs: [brief]
- Option C: [description] — Trade-offs: [brief]

**Risk Snapshot**
What they risk by staying vs. leaving.

**Key Insight**
One reframe or insight that might change how they see their choice.
[[END_SUMMARY]]`,

    3: `You are an experienced, plain-spoken career coach conducting Module 3: The Great Escape Plan.

### Context
The user has completed Modules 1 and 2. They've examined their situation and mapped their options. Now it's time to build an action plan.

### Your Goal
Help the user build a concrete action plan with timelines, specific next steps, and talking points for key conversations.

### Tone & Style
- Warm, direct, and action-oriented
- Focus on concrete, doable steps
- Help them feel prepared, not overwhelmed
- Sound like a coach who's helped people execute these plans before
- **Avoid effusive affirmations** like "That's it!", "There it is.", "That's solid.", "You nailed it!", "Exactly!", "Bingo!", "Perfect!", "Spot on!", "Love it!" or any variation — these feel condescending or performative. NEVER start a response with a short, punchy validation phrase followed by a period. If you want to acknowledge what they said, weave it into a longer sentence that moves to substance immediately.
- Keep acknowledgments simple and move to substance quickly
- **NEVER use the user's name directly** (e.g., "Sarah" or "Alright Sarah"). Just use "you" — speak to them directly without addressing them by name.

### Response Structure (CRITICAL)

**Always put your question at the END of your response.** This makes it easy for the user to respond.

**Break up the "recap + question" pattern** by interspersing:
- **Informed opinions**: "Based on your timeline, I'd prioritize..."
- **Concrete advice**: "When you have that conversation, lead with..."
- **Relevant data points**: Practical insights about negotiation, job searching, networking in their field
- **Pattern recognition**: "The biggest mistake people make at this stage is..."

### Domain Expertise

Speak with genuine expertise about their industry and function:
- Share domain-specific advice about job searching, networking, and transitioning in their field
- Offer relevant resources, communities, or approaches for their industry
- Provide practical scripts and talking points tailored to their situation

### Structured Options (USE FREQUENTLY)

Use [[OPTIONS]]...[[END_OPTIONS]] liberally — at least every 2-3 turns. When exploring a new topic, provide 4-5 thought starters with "Something else" as an option, then follow up with less structured questions.

### Session Structure
1. **Opening (1 message)**: Start with a title card, briefly recap their options and which direction they're leaning, then dive into planning.
2. **Action Planning (4-6 exchanges)**: Cover:
   - What's their timeline? What needs to happen first?
   - Who do they need to talk to and what will they say?
   - What's their backup plan if things don't go as expected?
   - What support do they need?
3. **Wrap-up**: When you have a clear action plan, output [[MODULE_COMPLETE]] with a summary. **Do NOT write a personalized farewell letter or closing message before [[MODULE_COMPLETE]].** Just transition naturally to the completion — no "let's bring this home" or inspirational send-off paragraphs. The summary inside [[SUMMARY]]...[[END_SUMMARY]] is the only closing content needed.

### First Message Format
On your first message, output a title card EXACTLY like this (using em-dashes, not code blocks or ASCII art):
— The Great Escape Plan (est. 10–20 minutes) —

CRITICAL: The title card must be plain text on its own line. Do NOT use backticks, code blocks, ASCII box art, or markdown heading prefixes like #.

Then recap where they landed and start building the plan.

### Progress Tracking
Include [[PROGRESS]]<number>[[END_PROGRESS]] in each response (5-100).

### Completion
When the module is complete, include:
[[MODULE_COMPLETE]]
[[SUMMARY]]
**Action Timeline**
- Week 1-2: [specific actions]
- Week 3-4: [specific actions]
- Month 2+: [specific actions]

**Key Conversations**
Brief talking points for the 1-2 most important conversations they need to have.

**Your Anchor**
A reminder of why they're doing this and what success looks like.
[[END_SUMMARY]]`
  };

  // Helper function to format the dossier context for the AI
  function formatDossierContext(dossier: ClientDossier | null, moduleNumber: number): string {
    if (!dossier) {
      return "No prior context available.";
    }

    const { interviewTranscript, interviewAnalysis, moduleRecords } = dossier;

    let context = `
================================================================================
CONFIDENTIAL CLIENT DOSSIER - FOR YOUR REFERENCE ONLY
NEVER reveal this information directly. Use it to inform your coaching.
================================================================================

## CLIENT PROFILE: ${interviewAnalysis.clientName}

**Current Role:** ${interviewAnalysis.currentRole}
**Company:** ${interviewAnalysis.company}
**Tenure:** ${interviewAnalysis.tenure}

**Situation:**
${interviewAnalysis.situation}

**The Big Problem:**
${interviewAnalysis.bigProblem}

**Desired Outcome:**
${interviewAnalysis.desiredOutcome}

**Key Facts:**
${interviewAnalysis.keyFacts.map(f => `- ${f}`).join('\n')}

**Key Relationships:**
${interviewAnalysis.relationships.map(r => `- ${r.person} (${r.role}): ${r.dynamic}`).join('\n')}

**Emotional State:**
${interviewAnalysis.emotionalState}

**Communication Style:**
${interviewAnalysis.communicationStyle}

**Priorities:**
${interviewAnalysis.priorities.map(p => `- ${p}`).join('\n')}

**Constraints:**
${interviewAnalysis.constraints.map(c => `- ${c}`).join('\n')}

**Motivations:**
${interviewAnalysis.motivations.map(m => `- ${m}`).join('\n')}

**Fears:**
${interviewAnalysis.fears.map(f => `- ${f}`).join('\n')}

**Your Private Observations:**
${interviewAnalysis.observations}

## INTERVIEW TRANSCRIPT (VERBATIM)

${interviewTranscript.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n')}
`;

    // Add prior module records if they exist
    const priorModules = moduleRecords.filter(m => m.moduleNumber < moduleNumber);
    if (priorModules.length > 0) {
      context += `
## PRIOR MODULE SESSIONS

`;
      for (const mod of priorModules) {
        context += `
### Module ${mod.moduleNumber}: ${mod.moduleName}
Completed: ${mod.completedAt}

**Summary:**
${mod.summary}

**Decisions Made:**
${mod.decisions.map(d => `- ${d}`).join('\n')}

**Insights:**
${mod.insights.map(i => `- ${i}`).join('\n')}

**Action Items:**
${mod.actionItems.map(a => `- ${a}`).join('\n')}

**Your Private Observations:**
${mod.observations}

**Full Transcript:**
${mod.transcript.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n')}

---
`;
      }
    }

    context += `
================================================================================
END CONFIDENTIAL DOSSIER
================================================================================

CRITICAL RULES:
1. NEVER quote from this dossier directly to the client
2. NEVER say "according to my notes" or similar
3. NEVER reveal that you have this detailed background
4. Use this context naturally as if you simply remember your prior conversations
5. Reference specific details to show continuity, but make it feel natural
6. If something seems inconsistent with what they said before, gently explore it
================================================================================
`;

    return context;
  }

  // Helper function to generate dynamic module system prompts
  function generateModulePrompt(moduleNumber: number, planCard: any, dossier: ClientDossier | null = null): string {
    const moduleInfo = planCard?.modules?.[moduleNumber - 1];
    
    // Format the dossier context
    const dossierContext = formatDossierContext(dossier, moduleNumber);
    
    if (!moduleInfo) {
      // If no custom plan, use default prompts but still include dossier
      const basePrompt = MODULE_SYSTEM_PROMPTS[moduleNumber];
      if (dossier) {
        return basePrompt + `\n\n${dossierContext}`;
      }
      return basePrompt;
    }
    
    const { name, objective, approach, outcome } = moduleInfo;
    
    const moduleStructure: Record<number, { role: string; context: string; structure: string }> = {
      1: {
        role: "discovery/unpacking",
        context: "The user has completed an initial interview where they shared their career situation. They've paid for coaching and are now starting the first module. You have complete access to the interview transcript and your analysis of their situation.",
        structure: `1. **Opening (1 message)**: Start with a title card, then briefly introduce the module's purpose. Reference something specific from their interview to show you remember their situation.
2. **Deep Dive (4-6 exchanges)**: ${approach}
3. **Wrap-up**: When you feel you have a clear picture, output [[MODULE_COMPLETE]] along with a summary.`
      },
      2: {
        role: "exploring motivations/options/constraints",
        context: "The user has completed Module 1. You have the full transcript and analysis from that module. Now they need to explore their motivations, constraints, and options.",
        structure: `1. **Opening (1 message)**: Start with a title card, then briefly recap what you learned in Module 1 and introduce this module's focus.
2. **Exploration (4-6 exchanges)**: ${approach}
3. **Wrap-up**: When you've mapped their options and constraints, output [[MODULE_COMPLETE]] with a summary.`
      },
      3: {
        role: "action planning",
        context: "The user has completed Modules 1 and 2. You have the full transcripts and analyses from both modules. Now it's time to build an action plan.",
        structure: `1. **Opening (1 message)**: Start with a title card, briefly recap their situation and direction, then dive into planning.
2. **Action Planning (4-6 exchanges)**: ${approach}
3. **Wrap-up**: When you have a clear action plan, output [[MODULE_COMPLETE]] with a summary.`
      }
    };
    
    const info = moduleStructure[moduleNumber];
    
    return `You are an experienced, plain-spoken career coach conducting Module ${moduleNumber}: ${name}.

### Context
${info.context}

### Your Goal
${objective}

### Expected Outcome
${outcome}

### Tone & Style
- Warm, direct, and insightful
- Ask probing questions that help them see their situation clearly
- No corporate jargon, no empty validation
- Sound like a coach who has helped hundreds of people through this

### Session Structure
${info.structure}

### First Message Format
On your first message, output a title card EXACTLY like this (using em-dashes, not code blocks or ASCII art):
— ${name} (est. 10–20 minutes) —

CRITICAL: The title card must be plain text on its own line. Do NOT use backticks, code blocks, ASCII box art, or markdown heading prefixes like #.

Then introduce the module and ask your first probing question based on what you know about their situation.

### Progress Tracking
Include [[PROGRESS]]<number>[[END_PROGRESS]] in each response (5-100).

### Completion
When the module is complete, include:
[[MODULE_COMPLETE]]
[[SUMMARY]]
**Key Insights**
- Insight 1 (written in second person - "you", not their name)
- Insight 2
- Insight 3

**Summary**
Your assessment of what was covered in 2-3 sentences. IMPORTANT: Write in second person ("you discovered", "your situation") - NOT third person with their name.

**Key Takeaway**
One concrete insight they can carry forward (in second person).
[[END_SUMMARY]]

${dossierContext}`;
  }

  // POST /api/module - Module conversation endpoint
  app.post("/api/module", async (req, res) => {
    try {
      if (!useAnthropic && !process.env.OPENAI_API_KEY) {
        return res.status(500).json({ error: "No AI API key configured" });
      }

      const { moduleNumber, transcript = [] } = req.body;

      if (!moduleNumber || moduleNumber < 1 || moduleNumber > 3) {
        return res.status(400).json({ error: "Invalid module number" });
      }

      // Check if user sent "testskip" command (case-insensitive)
      const lastUserMessage = [...transcript].reverse().find((t: any) => t.role === 'user');
      const isTestSkip = lastUserMessage?.content?.toLowerCase().trim() === 'testskip';

      // Ensure user is authenticated
      if (!req.user || !(req.user as any).id) {
        return res.status(401).json({ error: "Authentication required" });
      }
      const userId = (req.user as any).id;

      // Load transcript with retry logic - REQUIRE dossier for modules
      // This prevents the AI from fabricating context when data is missing
      let loadResult = await loadUserTranscriptWithRetry(userId, {
        requireDossier: true,
        requirePlanCard: true,
        maxAttempts: 3,
        delayMs: 1500,
      });

      // If dossier is missing but we have a transcript, generate it now (fallback)
      if (!loadResult.success && loadResult.error?.includes("dossier")) {
        const userIdStr = String(userId);
        const existingLock = dossierGenerationLocks.get(userIdStr);
        const now = Date.now();
        
        // Check if there's an active (non-stale) lock
        if (existingLock && (now - existingLock) < DOSSIER_LOCK_TIMEOUT_MS) {
          console.log(`[MODULE] Dossier generation already in progress for user ${userId}`);
          return res.status(409).json({
            error: "Dossier generation in progress",
            message: "Your coaching context is being prepared. Please try again in a few seconds.",
            retryable: true,
          });
        }
        
        // Acquire lock and generate
        dossierGenerationLocks.set(userIdStr, now);
        console.log(`[MODULE] Dossier missing for user ${userId}, generating on-demand...`);
        
        const rawTranscript = await storage.getTranscriptByUserId(userId);
        if (rawTranscript?.transcript && Array.isArray(rawTranscript.transcript)) {
          const transcriptMessages = rawTranscript.transcript as { role: string; content: string }[];
          
          try {
            const interviewAnalysis = await generateInterviewAnalysis(transcriptMessages);
            if (interviewAnalysis) {
              const dossier: ClientDossier = {
                interviewTranscript: transcriptMessages,
                interviewAnalysis,
                moduleRecords: [],
                lastUpdated: new Date().toISOString(),
              };
              await storage.updateClientDossier(userId, dossier);
              console.log(`[MODULE] On-demand dossier generated for user ${userId}`);
              
              // Retry loading after generation
              loadResult = await loadUserTranscriptWithRetry(userId, {
                requireDossier: true,
                requirePlanCard: true,
                maxAttempts: 1,
                delayMs: 0,
              });
            }
          } catch (dossierErr) {
            console.error(`[MODULE] Failed to generate on-demand dossier:`, dossierErr);
          } finally {
            // Release lock
            dossierGenerationLocks.delete(userIdStr);
          }
        } else {
          // No transcript to work with, release lock
          dossierGenerationLocks.delete(userIdStr);
        }
      }

      if (!loadResult.success) {
        // Return a specific error code so frontend can handle appropriately
        return res.status(409).json({ 
          error: "Context not ready",
          message: loadResult.error,
          retryable: true,
        });
      }

      const { clientDossier, planCard } = loadResult;

      // Generate dynamic system prompt based on the coaching plan and dossier
      let systemPrompt = generateModulePrompt(moduleNumber, planCard, clientDossier);

      // Add testskip override if needed
      if (isTestSkip) {
        systemPrompt += `

IMPORTANT OVERRIDE - TESTSKIP MODE:
The user has entered "testskip" which is a testing command. You must now:
1. Review the conversation so far and the client dossier
2. Fabricate plausible, realistic answers for ALL remaining module questions
3. Start your response with: "Skipping ahead for testing purposes..."
4. List bullet points of fabricated insights and decisions for this module
5. Then ask for confirmation: "Does this summary capture your situation correctly? If so, I'll wrap up this module."

After the user confirms (or on the next message), immediately complete the module by outputting [[MODULE_COMPLETE]] and the [[SUMMARY]] with fabricated but realistic key insights.

Example fabricated module insights:
- Key realization about their work situation
- Decision or clarity gained during this module
- Specific action they're considering

Remember to output [[PROGRESS]]95[[END_PROGRESS]] now, and [[MODULE_COMPLETE]] with [[SUMMARY]] on confirmation.
`;
      }

      let reply: string;

      if (useAnthropic && anthropic) {
        // Use Anthropic Claude
        const claudeMessages: { role: "user" | "assistant"; content: string }[] = [];

        for (const turn of transcript) {
          if (turn && turn.role && turn.content) {
            claudeMessages.push({
              role: turn.role as "user" | "assistant",
              content: turn.content
            });
          }
        }

        if (transcript.length === 0) {
          claudeMessages.push({ role: "user", content: "Start the module. Introduce it and ask your first question." });
        }

        const response = await anthropic.messages.create({
          model: "claude-sonnet-4-5",
          max_tokens: isTestSkip ? 2048 : 1024,
          system: systemPrompt,
          messages: claudeMessages,
        });

        reply = response.content[0].type === 'text' ? response.content[0].text : '';
      } else {
        // Fall back to OpenAI
        const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
          { role: "system", content: systemPrompt }
        ];

        for (const turn of transcript) {
          if (turn && turn.role && turn.content) {
            messages.push({
              role: turn.role as "user" | "assistant",
              content: turn.content
            });
          }
        }

        if (transcript.length === 0) {
          messages.push({ role: "user", content: "Start the module. Introduce it and ask your first question." });
        }

        const response = await openai.chat.completions.create({
          model: "gpt-4.1-mini",
          messages,
          max_completion_tokens: isTestSkip ? 2048 : 1024,
        });

        reply = response.choices[0].message.content || "";
      }
      let done = false;
      let summary: string | null = null;
      let options: string[] | null = null;
      let progress: number | null = null;

      // Parse progress token
      const progressMatch = reply.match(/\[\[PROGRESS\]\]\s*(\d+)\s*\[\[END_PROGRESS\]\]/);
      if (progressMatch) {
        progress = parseInt(progressMatch[1], 10);
        if (isNaN(progress) || progress < 0 || progress > 100) {
          progress = null;
        }
      }

      // Parse structured options (handles both newline and pipe-separated)
      const optionsMatch = reply.match(/\[\[OPTIONS\]\]([\s\S]*?)\[\[END_OPTIONS\]\]/);
      if (optionsMatch) {
        const rawOptions = optionsMatch[1].trim();
        // Split on newlines first, then on pipes if we only got one option
        let parsedOptions = rawOptions.split('\n').map(opt => opt.trim()).filter(opt => opt.length > 0);
        if (parsedOptions.length === 1 && parsedOptions[0].includes('|')) {
          parsedOptions = parsedOptions[0].split('|').map(opt => opt.trim()).filter(opt => opt.length > 0);
        }
        options = parsedOptions;
      }

      // Check for module completion
      if (reply.includes("[[MODULE_COMPLETE]]")) {
        done = true;

        const summaryMatch = reply.match(/\[\[SUMMARY\]\]([\s\S]*?)\[\[END_SUMMARY\]\]/);
        if (summaryMatch) {
          summary = summaryMatch[1].trim();
        }
        
        // Mark module as complete in database (user is already authenticated at this point)
        try {
          await storage.updateModuleComplete(userId, moduleNumber as 1 | 2 | 3, true);
          console.log(`Module ${moduleNumber} marked complete for user ${userId}`);
        } catch (err) {
          console.error("Failed to mark module complete:", err);
        }
      }

      // Sanitize reply - remove all control tokens
      reply = reply
        .replace(/\[\[PROGRESS\]\]\s*\d+\s*\[\[END_PROGRESS\]\]/g, '')
        .replace(/\[\[MODULE_COMPLETE\]\]\s*/g, '')
        .replace(/\[\[SUMMARY\]\][\s\S]*?\[\[END_SUMMARY\]\]\s*/g, '')
        .replace(/\[\[OPTIONS\]\][\s\S]*?\[\[END_OPTIONS\]\]/g, '')
        .replace(/\n\s*\n\s*\n/g, '\n\n') // Clean up excessive blank lines
        .trim();

      res.json({ reply, done, summary, options, progress });
    } catch (error: any) {
      console.error("Module error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /generate - Generate career coaching scripts from transcript
  app.post("/generate", async (req, res) => {
    try {
      if (!useAnthropic && !process.env.OPENAI_API_KEY) {
        return res.status(500).json({ error: "No AI API key configured" });
      }

      const { transcript } = req.body;

      if (!transcript || !Array.isArray(transcript) || transcript.length === 0) {
        return res.status(400).json({ error: "Missing or empty transcript" });
      }

      const formatted = transcript
        .map((turn: { role?: string; content?: string }) => {
          if (!turn || !turn.role || !turn.content) return "";
          const who = turn.role === "assistant" ? "Coach" : "You";
          return `${who}: ${turn.content}`;
        })
        .filter(Boolean)
        .join("\n\n");

      const prompt = `You previously conducted a structured career coaching session with a user.

Here is the full conversation between you (the coach) and the user:

${formatted}

Based on this transcript, produce a single, structured "Career Brief" document.

TITLE:
- Start with a title line like: "Career Brief for [Name]: [Subtitle]"
- Use the user's first name if available in the transcript
- The subtitle should be slightly humorous and reflect their situation (examples: "The Great Escape", "We're Not Gonna Take It Anymore", "Operation Sanity", "The Reset", "Time to Negotiate")

SECTIONS (use these exact headings):

## Mirror
"Here's what you said, clearly."
- Summarize what they told you about their situation, constraints, and feelings
- Use bullet points
- Be accurate and empathetic

## Diagnosis  
"Here's what's actually going on."
- Your analysis of the underlying dynamics
- What patterns you see
- What they might not be seeing clearly

## Decision Framework & Risk Map
- 2–3 realistic options (e.g., stay and renegotiate, line up a new job then quit, take a break, etc.)
- For each option: key risks and tradeoffs
- Be honest about uncertainty

## Decision Memo
- The document they'd write if advising themselves
- A clear recommendation or decision framework
- When to pull the trigger vs. wait

## Action Plan & Milestones
- Concrete 30–90 day steps
- What to do this week, this month, this quarter
- Key decision points and checkpoints

## Conversation Kit
Scripts/talking points for key conversations:

### Boss Conversation
- A conversational 2–3 minute script they can mostly read verbatim
- Be honest but non-destructive
- Plain, direct English

### Partner Conversation  
- Empathetic and transparent about risk and money
- Acknowledges their likely concerns (stability, income, stress at home)
- Asks for support and collaboration, not just permission

### [Optional: Third Stakeholder]
- If relevant (cofounder, board member, mentor, etc.), include talking points
- Skip this section if not relevant

## Further Support
- What kind of help would actually be useful going forward (coach, mentor, therapist, lawyer, etc.)
- 2–3 non-generic, tailored resource suggestions based on their situation

FORMAT:
- Use clear headings and subheadings
- Use short paragraphs and bullet points where helpful
- No corporate jargon
- No mention of being an AI or a coach
- Write as if the user drafted this themselves after talking it through with a trusted advisor`;

      let text: string | null;

      if (useAnthropic && anthropic) {
        // Use Anthropic Claude
        const response = await anthropic.messages.create({
          model: "claude-sonnet-4-5",
          max_tokens: 4096,
          messages: [{ role: "user", content: prompt }],
        });

        text = response.content[0].type === 'text' ? response.content[0].text : null;
      } else {
        // Fall back to OpenAI
        const response = await openai.chat.completions.create({
          model: "gpt-4.1-mini",
          messages: [{ role: "user", content: prompt }],
          max_completion_tokens: 4096,
        });

        text = response.choices[0].message.content;
      }

      res.json({ text });
    } catch (error: any) {
      console.error("Generate error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // NOTE: GET /api/transcript is defined earlier in the file at line ~1660 with clientDossier field

  // POST /api/transcript - Save user's transcript to database
  // Also triggers dossier generation when planCard is present
  app.post("/api/transcript", requireAuth, async (req, res) => {
    const requestStart = Date.now();
    
    try {
      const userId = (req.user as any)?.id;
      if (!userId) {
        console.log(`[TRANSCRIPT_POST] ts=${new Date().toISOString()} user=anonymous status=rejected_not_authenticated`);
        return res.status(401).json({ error: "Not authenticated" });
      }

      const { 
        transcript, 
        currentModule, 
        progress, 
        interviewComplete, 
        paymentVerified,
        valueBullets,
        socialProof,
        planCard
      } = req.body;

      const messageCount = transcript?.length || 0;
      console.log(`[TRANSCRIPT_POST] ts=${new Date().toISOString()} user=${userId} status=started module=${currentModule} progress=${progress} interviewComplete=${interviewComplete} hasPlanCard=${!!planCard} messageCount=${messageCount}`);

      if (!transcript || !Array.isArray(transcript)) {
        const durationMs = Date.now() - requestStart;
        console.log(`[TRANSCRIPT_POST] ts=${new Date().toISOString()} user=${userId} status=failed_invalid_format durationMs=${durationMs}`);
        return res.status(400).json({ error: "Invalid transcript format" });
      }

      // Parse PROVIDED_NAME token from AI responses and update user profile
      // Token format: [[PROVIDED_NAME:TheirName]]
      let providedNameUpdated = false;
      for (const message of transcript) {
        if (message.role === 'assistant' && message.content) {
          const nameMatch = message.content.match(/\[\[PROVIDED_NAME:([^\]]+)\]\]/);
          if (nameMatch && nameMatch[1]) {
            const providedName = nameMatch[1].trim();
            if (providedName) {
              // Check if user already has a providedName
              const existingUser = await storage.getUser(userId);
              if (existingUser && !existingUser.providedName) {
                await storage.updateUser(userId, { providedName });
                providedNameUpdated = true;
                console.log(`[TRANSCRIPT_POST] ts=${new Date().toISOString()} user=${userId} providedName="${providedName}" status=updated`);
              }
            }
            break; // Only process the first name token
          }
        }
      }

      // Check if we need to generate dossier BEFORE upsert (to get existing state)
      let dossierTriggered = false;
      let existingHasDossier = false;
      let shouldTriggerDossier = false;
      
      if (planCard && transcript.length > 0) {
        // Check existing state BEFORE we upsert
        const existingTranscript = await storage.getTranscriptByUserId(userId);
        const existingPlanCard = existingTranscript?.planCard;
        existingHasDossier = !!existingTranscript?.clientDossier;
        const planCardChanged = !existingPlanCard || 
          JSON.stringify(existingPlanCard) !== JSON.stringify(planCard);
        
        console.log(`[TRANSCRIPT_POST] ts=${new Date().toISOString()} user=${userId} planCardCheck existingPlanCard=${!!existingPlanCard} planCardChanged=${planCardChanged} hasDossier=${existingHasDossier}`);
        
        shouldTriggerDossier = planCardChanged && !existingHasDossier;
      }
      
      // SAVE THE TRANSCRIPT FIRST - this ensures planCard and messages are persisted
      // before the user navigates to Stripe. Dossier generation happens in background.
      const upsertStart = Date.now();
      const result = await storage.upsertTranscriptByUserId(userId, {
        transcript,
        currentModule: currentModule || "Interview",
        progress: progress || 0,
        interviewComplete: interviewComplete || false,
        paymentVerified: paymentVerified || false,
        valueBullets,
        socialProof,
        planCard,
      });
      const upsertDurationMs = Date.now() - upsertStart;
      
      // Trigger dossier generation in background AFTER transcript is saved
      if (shouldTriggerDossier) {
        console.log(`[TRANSCRIPT_POST] ts=${new Date().toISOString()} user=${userId} status=triggering_dossier_background`);
        
        // Trigger dossier generation in BACKGROUND (fire-and-forget)
        // This allows the POST to complete immediately so the user can proceed to payment
        const transcriptMessages = transcript as { role: string; content: string }[];
        generateAndSaveDossier(userId, transcriptMessages)
          .then(result => {
            console.log(`[DOSSIER_BACKGROUND] ts=${new Date().toISOString()} user=${userId} status=${result.status}`);
          })
          .catch(err => {
            console.error(`[DOSSIER_BACKGROUND] ts=${new Date().toISOString()} user=${userId} status=error error="${err.message}"`);
          });
        
        dossierTriggered = true;
      } else if (planCard && existingHasDossier) {
        console.log(`[TRANSCRIPT_POST] ts=${new Date().toISOString()} user=${userId} status=skipping_dossier reason=already_exists`);
      }

      const durationMs = Date.now() - requestStart;
      console.log(`[TRANSCRIPT_POST] ts=${new Date().toISOString()} user=${userId} status=success upsertDurationMs=${upsertDurationMs} dossierTriggered=${dossierTriggered} providedNameUpdated=${providedNameUpdated} durationMs=${durationMs}`);

      res.json({ success: true, id: result.id, dossierTriggered, providedNameUpdated });
    } catch (error: any) {
      const durationMs = Date.now() - requestStart;
      console.error(`[TRANSCRIPT_POST] ts=${new Date().toISOString()} user=${(req.user as any)?.id || 'unknown'} status=error durationMs=${durationMs} error="${error.message}"`);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // MODULE DATA ENDPOINTS (Database persistence for module state)
  // ============================================
  
  // GET /api/module/:moduleNumber/data - Load module transcript, summary, and completion status
  app.get("/api/module/:moduleNumber/data", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const moduleNumber = parseInt(req.params.moduleNumber) as 1 | 2 | 3;
      
      if (![1, 2, 3].includes(moduleNumber)) {
        return res.status(400).json({ error: "Invalid module number" });
      }
      
      const moduleData = await storage.getModuleData(userId, moduleNumber);
      
      if (!moduleData) {
        // No transcript record exists, return empty state
        return res.json({
          transcript: null,
          summary: null,
          complete: false,
        });
      }
      
      res.json(moduleData);
    } catch (error: any) {
      console.error("Load module data error:", error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // POST /api/module/:moduleNumber/data - Save module transcript, summary, and/or completion status
  app.post("/api/module/:moduleNumber/data", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const moduleNumber = parseInt(req.params.moduleNumber) as 1 | 2 | 3;
      
      if (![1, 2, 3].includes(moduleNumber)) {
        return res.status(400).json({ error: "Invalid module number" });
      }
      
      const { transcript, summary, complete } = req.body;
      
      // Ensure user has a transcript record first
      let existingTranscript = await storage.getTranscriptByUserId(userId);
      if (!existingTranscript) {
        // Create a basic transcript record for this user
        const sessionToken = crypto.randomBytes(32).toString("hex");
        await storage.createTranscript({
          sessionToken,
          userId,
          transcript: [],
          currentModule: `Module ${moduleNumber}`,
          progress: 0,
          interviewComplete: false,
          paymentVerified: false,
        });
      }
      
      // Update module data
      await storage.updateModuleData(userId, moduleNumber, {
        transcript,
        summary,
        complete,
      });
      
      res.json({ success: true });
    } catch (error: any) {
      console.error("Save module data error:", error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // GET /api/modules/status - Get completion status for all modules
  app.get("/api/modules/status", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const transcript = await storage.getTranscriptByUserId(userId);
      
      if (!transcript) {
        return res.json({
          modules: [
            { number: 1, complete: false, summary: null },
            { number: 2, complete: false, summary: null },
            { number: 3, complete: false, summary: null },
          ],
        });
      }
      
      res.json({
        modules: [
          { number: 1, complete: transcript.module1Complete || false, summary: transcript.module1Summary || null },
          { number: 2, complete: transcript.module2Complete || false, summary: transcript.module2Summary || null },
          { number: 3, complete: transcript.module3Complete || false, summary: transcript.module3Summary || null },
        ],
      });
    } catch (error: any) {
      console.error("Get modules status error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/test-db - Test database connectivity
  app.get("/api/test-db", async (req, res) => {
    try {
      const testToken = `test-${Date.now()}`;
      
      // Create a test record
      const created = await storage.createTranscript({
        sessionToken: testToken,
        transcript: [{ role: "test", content: "Database test record" }],
        currentModule: "Test",
        progress: 100,
        interviewComplete: false,
        paymentVerified: false,
      });

      // Read it back
      const retrieved = await storage.getTranscript(testToken);

      if (retrieved && retrieved.sessionToken === testToken) {
        res.json({
          success: true,
          message: "Database is working correctly",
          testRecord: {
            id: created.id,
            sessionToken: created.sessionToken,
            module: created.currentModule,
            createdAt: created.createdAt,
          },
        });
      } else {
        res.status(500).json({
          success: false,
          message: "Test record was created but could not be retrieved",
        });
      }
    } catch (error: any) {
      console.error("Database test error:", error);
      res.status(500).json({
        success: false,
        message: "Database test failed",
        error: error.message,
      });
    }
  });

  // POST /api/webhook/inbound - Receive inbound emails from Resend and forward to seriouspeople@noahlevin.com
  app.post("/api/webhook/inbound", async (req, res) => {
    try {
      const payload = req.body;
      
      console.log("Received Resend webhook:", JSON.stringify(payload, null, 2));
      
      // Verify this is an email.received event
      if (payload.type !== "email.received") {
        console.log("Ignoring non-email.received event:", payload.type);
        return res.status(200).json({ message: "Event type ignored" });
      }
      
      const emailData = payload.data;
      
      if (!emailData) {
        console.log("No email data in payload");
        return res.status(200).json({ message: "No email data" });
      }
      
      // Extract email details
      const originalFrom = emailData.from || "Unknown sender";
      const originalTo = Array.isArray(emailData.to) ? emailData.to.join(", ") : (emailData.to || "Unknown recipient");
      const originalSubject = emailData.subject || "(No subject)";
      const htmlBody = emailData.html || emailData.text || "(No content)";
      const textBody = emailData.text || "";
      
      // Create forwarded subject line
      const forwardedSubject = `Fwd from ${originalFrom}: ${originalSubject}`;
      
      // Create forwarded email body with original recipient info
      const forwardedHtml = `
        <div style="font-family: 'Source Serif 4', Georgia, serif; max-width: 700px; margin: 0 auto; padding: 20px;">
          <div style="background: #f5f5f5; padding: 16px; border-radius: 4px; margin-bottom: 20px; font-size: 14px; color: #555;">
            <p style="margin: 0 0 8px 0;"><strong>Original From:</strong> ${originalFrom}</p>
            <p style="margin: 0 0 8px 0;"><strong>Original To:</strong> ${originalTo}</p>
            <p style="margin: 0;"><strong>Original Subject:</strong> ${originalSubject}</p>
          </div>
          <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;" />
          <div style="line-height: 1.6;">
            ${htmlBody}
          </div>
        </div>
      `;
      
      // Get the Resend client and send the forwarded email
      const { client, fromEmail } = await getResendClient();
      const senderEmail = fromEmail || "onboarding@resend.dev";
      
      console.log("Forwarding email from:", senderEmail, "to: seriouspeople@noahlevin.com");
      console.log("Subject:", forwardedSubject);
      
      const result = await client.emails.send({
        from: senderEmail,
        to: "seriouspeople@noahlevin.com",
        subject: forwardedSubject,
        html: forwardedHtml,
        text: `Original From: ${originalFrom}\nOriginal To: ${originalTo}\nOriginal Subject: ${originalSubject}\n\n---\n\n${textBody}`,
      });
      
      if (result.error) {
        console.error("Failed to forward email:", result.error);
        // Still return 200 to acknowledge receipt - we don't want Resend to retry
        return res.status(200).json({ 
          message: "Received but failed to forward",
          error: result.error.message 
        });
      }
      
      console.log("Email forwarded successfully:", result.data?.id);
      res.status(200).json({ 
        message: "Email forwarded successfully",
        emailId: result.data?.id 
      });
      
    } catch (error: any) {
      console.error("Webhook processing error:", error);
      // Still return 200 to acknowledge receipt
      res.status(200).json({ 
        message: "Received but processing failed",
        error: error.message 
      });
    }
  });

  // ADMIN: Fix user state - generates dossier and fixes flags
  // Usage: POST /api/admin/fix-user with { email: "user@example.com", secret: "admin-secret" }
  // Or: POST /api/admin/fix-user with { userId: "uuid", secret: "admin-secret" }
  app.post("/api/admin/fix-user", async (req, res) => {
    try {
      const { email, userId, secret } = req.body;
      
      // Simple secret check - in production, use a proper admin auth system
      const adminSecret = process.env.ADMIN_SECRET || "serious-admin-2024";
      if (secret !== adminSecret) {
        return res.status(403).json({ error: "Invalid admin secret" });
      }
      
      if (!email && !userId) {
        return res.status(400).json({ error: "Email or userId required" });
      }
      
      // Find the user by email or userId
      let user;
      if (userId) {
        user = await storage.getUser(userId);
        console.log(`[ADMIN] Fixing user state for userId: ${userId}`);
      } else {
        user = await storage.getUserByEmail(email);
        console.log(`[ADMIN] Fixing user state for: ${email}`);
      }
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Get their transcript
      const transcript = await storage.getTranscriptByUserId(user.id);
      if (!transcript) {
        return res.status(404).json({ error: "No transcript found for user" });
      }
      
      const fixes: string[] = [];
      
      // Fix 1: Mark interview as complete if they've paid
      if (transcript.paymentVerified && !transcript.interviewComplete) {
        await storage.updateTranscript(transcript.sessionToken, {
          interviewComplete: true,
          progress: 100,
        });
        fixes.push("Set interview_complete=true, progress=100");
      }
      
      // Fix 2: Generate dossier if missing
      if (!transcript.clientDossier && transcript.transcript && Array.isArray(transcript.transcript)) {
        const transcriptMessages = transcript.transcript as { role: string; content: string }[];
        console.log(`[ADMIN] Generating client dossier for ${email}... (${transcriptMessages.length} messages)`);
        
        let interviewAnalysis: InterviewAnalysis | null = null;
        try {
          interviewAnalysis = await generateInterviewAnalysis(transcriptMessages);
        } catch (aiError: any) {
          console.error(`[ADMIN] AI analysis error:`, aiError.message);
        }
        
        if (interviewAnalysis) {
          const dossier: ClientDossier = {
            interviewTranscript: transcriptMessages,
            interviewAnalysis,
            moduleRecords: [],
            lastUpdated: new Date().toISOString(),
          };
          
          await storage.updateClientDossier(user.id, dossier);
          fixes.push("Generated client dossier with AI analysis");
        } else {
          // Create a minimal dossier without AI analysis so user can proceed
          console.log(`[ADMIN] Creating minimal dossier without AI analysis for ${email}`);
          const minimalAnalysis: InterviewAnalysis = {
            clientName: "Client",
            currentRole: "See transcript",
            company: "See transcript",
            tenure: "See transcript",
            situation: "Interview completed - see transcript for details",
            bigProblem: "See transcript for details",
            desiredOutcome: "See transcript for details",
            keyFacts: ["See transcript for details"],
            relationships: [],
            emotionalState: "engaged",
            communicationStyle: "direct",
            priorities: ["Career transition"],
            constraints: [],
            motivations: ["Career growth"],
            fears: [],
            questionsAsked: [],
            optionsOffered: [],
            observations: "Dossier created via admin fix - AI analysis was unavailable. The coach should read the full interview transcript to understand this client's situation."
          };
          
          const dossier: ClientDossier = {
            interviewTranscript: transcriptMessages,
            interviewAnalysis: minimalAnalysis,
            moduleRecords: [],
            lastUpdated: new Date().toISOString(),
          };
          
          await storage.updateClientDossier(user.id, dossier);
          fixes.push(`Created minimal dossier (AI unavailable) with ${transcriptMessages.length} transcript messages`);
        }
      } else if (transcript.clientDossier) {
        fixes.push("Dossier already exists (no action needed)");
      } else {
        fixes.push(`No transcript data to generate dossier from (transcript: ${typeof transcript.transcript})`);
      }
      
      console.log(`[ADMIN] Fixes applied for ${email}:`, fixes);
      
      res.json({ 
        ok: true, 
        email,
        userId: user.id,
        fixes 
      });
      
    } catch (error: any) {
      console.error("[ADMIN] Fix user error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  return httpServer;
}
