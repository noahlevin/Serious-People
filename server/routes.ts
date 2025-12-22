import type { Express } from "express";
import { createServer, type Server } from "http";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import path from "path";
import express from "express";
import crypto from "crypto";
import ejs from "ejs";
import passport from "passport";
import { getStripeClient } from "./stripeClient";
import { storage } from "./storage";
import { setupAuth, requireAuth } from "./auth";
import {
  sendMagicLinkEmail,
  getResendClient,
  sendSeriousPlanEmail,
} from "./resendClient";
import { db } from "./db";
import {
  interviewTranscripts,
  seriousPlans,
  seriousPlanArtifacts,
  type ClientDossier,
  type InterviewAnalysis,
  type ModuleRecord,
  type CoachingPlan,
  getCurrentJourneyStep,
  getStepPath,
  type JourneyState,
  type AppEvent,
  type AppEventPayload,
} from "@shared/schema";
import { eq } from "drizzle-orm";
import {
  generateSeriousPlan,
  getSeriousPlanWithArtifacts,
  getLatestSeriousPlan,
  initializeSeriousPlan,
  regeneratePendingArtifacts,
  generateArtifactsAsync,
} from "./seriousPlanService";
import {
  generateArtifactPdf,
  generateBundlePdf,
  generateAllArtifactPdfs,
} from "./pdfService";
import * as seoController from "./seoController";

// Use Anthropic Claude if API key is available, otherwise fall back to OpenAI
const useAnthropic = !!process.env.ANTHROPIC_API_KEY;
const anthropic = useAnthropic
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// In-memory lock to prevent duplicate dossier generation attempts
// Maps userId to generation start timestamp for stale detection
const dossierGenerationLocks = new Map<string, number>();
const DOSSIER_LOCK_TIMEOUT_MS = 60000; // 60 seconds stale timeout

// ============================================================================
// ROUTING HELPER - Shared by /api/bootstrap and /app/* gating middleware
// ============================================================================

interface RoutingResult {
  phase: string;
  canonicalPath: string;
  resumePath: string;
  allowedPaths: string[];
}

async function computeRoutingForUser(userId: string): Promise<RoutingResult> {
  // Fetch journey state
  const journeyState = await storage.getJourneyState(userId);
  const state: JourneyState = journeyState || {
    interviewComplete: false,
    paymentVerified: false,
    module1Complete: false,
    module2Complete: false,
    module3Complete: false,
    hasSeriousPlan: false,
  };

  // Determine phase
  let phase: string;
  if (!state.interviewComplete) {
    phase = "INTERVIEW";
  } else if (!state.paymentVerified) {
    // Check if user has a pending checkout
    const transcript = await storage.getTranscriptByUserId(userId);
    if (transcript?.stripeSessionId) {
      phase = "CHECKOUT_PENDING";
    } else {
      phase = "OFFER";
    }
  } else if (!state.module1Complete) {
    phase = "PURCHASED";
  } else if (!state.module2Complete) {
    phase = "MODULE_2";
  } else if (!state.module3Complete) {
    phase = "MODULE_3";
  } else if (!state.hasSeriousPlan) {
    phase = "COACH_LETTER";
  } else {
    phase = "SERIOUS_PLAN";
  }

  // Compute routing (app-internal paths without /app prefix)
  let canonicalPath: string;
  let resumePath: string;
  let allowedPaths: string[];

  switch (phase) {
    case "INTERVIEW":
      canonicalPath = "/interview/start";
      resumePath = "/interview/start";
      allowedPaths = ["/interview/start", "/interview/prepare", "/interview/chat"];
      break;
    case "OFFER":
      canonicalPath = "/offer";
      resumePath = "/offer";
      allowedPaths = ["/offer", "/offer/success"];
      break;
    case "CHECKOUT_PENDING":
      canonicalPath = "/offer/success";
      resumePath = "/offer/success";
      allowedPaths = ["/offer", "/offer/success"];
      break;
    case "PURCHASED":
      canonicalPath = "/progress";
      resumePath = "/module/1";
      allowedPaths = ["/progress", "/module/1"];
      break;
    case "MODULE_2":
      canonicalPath = "/progress";
      resumePath = "/module/2";
      allowedPaths = ["/progress", "/module/1", "/module/2"];
      break;
    case "MODULE_3":
      canonicalPath = "/progress";
      resumePath = "/module/3";
      allowedPaths = ["/progress", "/module/1", "/module/2", "/module/3"];
      break;
    case "COACH_LETTER":
      canonicalPath = "/coach-letter";
      resumePath = "/coach-letter";
      allowedPaths = ["/progress", "/module/1", "/module/2", "/module/3", "/coach-letter"];
      break;
    case "SERIOUS_PLAN":
    default:
      canonicalPath = "/serious-plan";
      resumePath = "/serious-plan";
      allowedPaths = ["/progress", "/module/1", "/module/2", "/module/3", "/coach-letter", "/serious-plan", "/artifact"];
      break;
  }

  return { phase, canonicalPath, resumePath, allowedPaths };
}

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
const STRIPE_PRODUCT_ID = "prod_TWhB1gfxXvIa9N";
let cachedPriceId: string | null = null;

async function getProductPrice(): Promise<string> {
  if (cachedPriceId) return cachedPriceId;

  const stripe = await getStripeClient();

  // Get the active price for our specific product
  const prices = await stripe.prices.list({
    product: STRIPE_PRODUCT_ID,
    active: true,
    limit: 1,
  });

  if (prices.data.length > 0) {
    cachedPriceId = prices.data[0].id;
    console.log(
      `Using price ${cachedPriceId} for product ${STRIPE_PRODUCT_ID}`,
    );
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

async function findActivePromoCode(
  priceCurrency: string,
): Promise<ActivePromoResult> {
  const stripe = await getStripeClient();

  try {
    const promoCodes = await stripe.promotionCodes.list({
      active: true,
      expand: ["data.coupon"],
      limit: 10,
    });

    for (const promo of promoCodes.data) {
      const coupon = promo.coupon;

      // Check if coupon is still valid
      if (!coupon.valid) continue;

      // Check expiration
      if (coupon.redeem_by && coupon.redeem_by * 1000 < Date.now()) continue;

      // Check max redemptions
      if (
        coupon.max_redemptions &&
        coupon.times_redeemed >= coupon.max_redemptions
      )
        continue;

      // Check if coupon is restricted to specific products (skip if it doesn't include our product)
      if (
        coupon.applies_to &&
        coupon.applies_to.products &&
        coupon.applies_to.products.length > 0
      ) {
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
          amountOff: null,
        };
      } else if (coupon.amount_off && coupon.currency) {
        // Amount off coupons must match the price currency
        if (coupon.currency.toLowerCase() === priceCurrency.toLowerCase()) {
          return {
            promoCodeId: promo.id,
            percentOff: null,
            amountOff: coupon.amount_off / 100,
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
  } = {},
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
        console.log(
          `[TranscriptLoader] Attempt ${attempts}/${maxAttempts}: No transcript for user ${userId}`,
        );
        if (attempts < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }
        break;
      }

      // Check if we have the required data
      const hasDossier = !!transcript.clientDossier;
      const hasPlanCard = !!transcript.planCard;

      if (requireDossier && !hasDossier) {
        lastError = "Interview completed but client dossier not yet generated";
        console.log(
          `[TranscriptLoader] Attempt ${attempts}/${maxAttempts}: Missing dossier for user ${userId}`,
        );
        if (attempts < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }
        break;
      }

      if (requirePlanCard && !hasPlanCard) {
        lastError = "Interview completed but coaching plan not yet generated";
        console.log(
          `[TranscriptLoader] Attempt ${attempts}/${maxAttempts}: Missing planCard for user ${userId}`,
        );
        if (attempts < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }
        break;
      }

      // Success - we have all required data
      console.log(
        `[TranscriptLoader] Successfully loaded transcript for user ${userId} on attempt ${attempts}`,
      );
      return {
        success: true,
        transcript,
        clientDossier: transcript.clientDossier || null,
        planCard: transcript.planCard || null,
      };
    } catch (err: any) {
      lastError = err.message || "Database error loading transcript";
      console.error(
        `[TranscriptLoader] Attempt ${attempts}/${maxAttempts} error:`,
        err,
      );
      if (attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  // All attempts failed
  console.error(
    `[TranscriptLoader] Failed to load transcript for user ${userId} after ${maxAttempts} attempts: ${lastError}`,
  );
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
  "clientFacingSummary": "A 2-3 sentence CLIENT-FACING summary shown to the user on the offer page. Write in second person ('You are...', 'Your goal is...'). Briefly describe their situation and what coaching will help them achieve. Keep it warm, professional, and focused on their goals - not their problems. Example: 'You're a Senior PM at a growing fintech looking to break into leadership. Together we'll map out your path forward and build the confidence and clarity you need to make your next move.'",
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
async function generateInterviewAnalysisSingle(
  transcript: { role: string; content: string }[],
): Promise<InterviewAnalysis> {
  const transcriptText = transcript
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join("\n\n");

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
        { role: "assistant", content: "{" }, // Prefill to ensure JSON starts correctly
      ],
    });
    // Log stop reason and usage for debugging
    console.log(
      `[DOSSIER_DEBUG] stop_reason=${result.stop_reason} input_tokens=${result.usage?.input_tokens} output_tokens=${result.usage?.output_tokens}`,
    );

    // Prepend the { since we used it as prefill
    const content =
      result.content[0].type === "text" ? result.content[0].text : "";
    response = "{" + content;
  } else {
    const result = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: INTERVIEW_ANALYSIS_PROMPT },
        { role: "user", content: transcriptText },
      ],
      max_completion_tokens: 8192,
      response_format: { type: "json_object" }, // OpenAI native JSON mode
    });
    response = result.choices[0].message.content || "";
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
        const snippet = jsonMatch[0].substring(
          Math.max(
            0,
            extractError.message.match(/position (\d+)/)?.[1] - 50 || 0,
          ),
          (extractError.message.match(/position (\d+)/)?.[1] || 100) + 50,
        );
        throw new Error(
          `JSON parse failed at: ...${snippet}... - ${extractError.message}`,
        );
      }
    }
    throw new Error(
      `Failed to parse interview analysis JSON: ${directError.message}`,
    );
  }
}

// Helper function to generate interview analysis with retry logic
async function generateInterviewAnalysis(
  transcript: { role: string; content: string }[],
  maxRetries: number = 3,
  userId?: string,
): Promise<InterviewAnalysis | null> {
  const startTime = Date.now();
  const userTag = userId || "unknown";

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const attemptStart = Date.now();
    try {
      const elapsedMs = Date.now() - startTime;
      console.log(
        `[DOSSIER_ANALYSIS] ts=${new Date().toISOString()} user=${userTag} status=started attempt=${attempt}/${maxRetries} durationMs=${elapsedMs}`,
      );
      const result = await generateInterviewAnalysisSingle(transcript);
      const durationMs = Date.now() - startTime;
      console.log(
        `[DOSSIER_ANALYSIS] ts=${new Date().toISOString()} user=${userTag} status=success attempt=${attempt}/${maxRetries} durationMs=${durationMs}`,
      );
      return result;
    } catch (error: any) {
      const durationMs = Date.now() - startTime;
      console.error(
        `[DOSSIER_ANALYSIS] ts=${new Date().toISOString()} user=${userTag} status=failed attempt=${attempt}/${maxRetries} error="${error.message}" durationMs=${durationMs}`,
      );
      if (attempt === maxRetries) {
        console.error(
          `[DOSSIER_ANALYSIS] ts=${new Date().toISOString()} user=${userTag} status=all_attempts_failed durationMs=${durationMs}`,
        );
        return null;
      }
      // Wait before retry (exponential backoff: 1s, 2s, 4s)
      const waitMs = Math.pow(2, attempt - 1) * 1000;
      const waitStartMs = Date.now() - startTime;
      console.log(
        `[DOSSIER_ANALYSIS] ts=${new Date().toISOString()} user=${userTag} status=retry_wait waitMs=${waitMs} durationMs=${waitStartMs}`,
      );
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
  return null;
}

// Helper function to generate and save dossier with retry logic
// Returns true if dossier was created/updated, false if failed
type DossierResult =
  | { status: "success" }
  | { status: "in_progress"; lockAgeMs: number }
  | { status: "failed"; error: string };

async function generateAndSaveDossier(
  userId: string,
  transcript: { role: string; content: string }[],
): Promise<DossierResult> {
  const startTime = Date.now();
  const lockKey = String(userId);
  const existingLock = dossierGenerationLocks.get(lockKey);
  const now = Date.now();

  console.log(
    `[DOSSIER_SAVE] ts=${new Date().toISOString()} user=${userId} status=started messageCount=${transcript.length} durationMs=0`,
  );

  // Check if there's an active (non-stale) lock - this means generation is already in progress
  if (existingLock && now - existingLock < DOSSIER_LOCK_TIMEOUT_MS) {
    const lockAgeMs = now - existingLock;
    const durationMs = Date.now() - startTime;
    console.log(
      `[DOSSIER_SAVE] ts=${new Date().toISOString()} user=${userId} status=in_progress lockAgeMs=${lockAgeMs} timeoutMs=${DOSSIER_LOCK_TIMEOUT_MS} durationMs=${durationMs}`,
    );
    return { status: "in_progress", lockAgeMs };
  }

  // Acquire lock
  dossierGenerationLocks.set(lockKey, now);
  const lockAcquireMs = Date.now() - startTime;
  console.log(
    `[DOSSIER_SAVE] ts=${new Date().toISOString()} user=${userId} status=lock_acquired durationMs=${lockAcquireMs}`,
  );

  try {
    const analysisStart = Date.now();
    const interviewAnalysis = await generateInterviewAnalysis(
      transcript,
      3,
      userId,
    );
    const analysisMs = Date.now() - analysisStart;

    if (!interviewAnalysis) {
      const durationMs = Date.now() - startTime;
      console.error(
        `[DOSSIER_SAVE] ts=${new Date().toISOString()} user=${userId} status=failed_analysis analysisMs=${analysisMs} durationMs=${durationMs}`,
      );
      return { status: "failed", error: "Analysis generation failed" };
    }

    const analysisCompleteMs = Date.now() - startTime;
    console.log(
      `[DOSSIER_SAVE] ts=${new Date().toISOString()} user=${userId} status=analysis_complete analysisMs=${analysisMs} durationMs=${analysisCompleteMs}`,
    );

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
    console.log(
      `[DOSSIER_SAVE] ts=${new Date().toISOString()} user=${userId} status=success analysisMs=${analysisMs} saveMs=${saveMs} durationMs=${durationMs}`,
    );
    return { status: "success" };
  } catch (error: any) {
    const durationMs = Date.now() - startTime;
    console.error(
      `[DOSSIER_SAVE] ts=${new Date().toISOString()} user=${userId} status=error error="${error.message}" durationMs=${durationMs}`,
    );
    return { status: "failed", error: error.message };
  } finally {
    // Release lock
    dossierGenerationLocks.delete(lockKey);
    const durationMs = Date.now() - startTime;
    console.log(
      `[DOSSIER_SAVE] ts=${new Date().toISOString()} user=${userId} status=lock_released durationMs=${durationMs}`,
    );
  }
}

// Helper function to generate module analysis using AI
async function generateModuleAnalysis(
  moduleNumber: number,
  moduleName: string,
  transcript: { role: string; content: string }[],
): Promise<Omit<
  ModuleRecord,
  "moduleNumber" | "moduleName" | "transcript" | "completedAt"
> | null> {
  try {
    const transcriptText = transcript
      .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
      .join("\n\n");

    let response: string;

    if (useAnthropic && anthropic) {
      const result = await anthropic.messages.create({
        model: "claude-sonnet-4-5",
        max_tokens: 4096,
        system: MODULE_ANALYSIS_PROMPT,
        messages: [
          {
            role: "user",
            content: `Module ${moduleNumber}: ${moduleName}\n\n${transcriptText}`,
          },
        ],
      });
      response =
        result.content[0].type === "text" ? result.content[0].text : "";
    } else {
      const result = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: [
          { role: "system", content: MODULE_ANALYSIS_PROMPT },
          {
            role: "user",
            content: `Module ${moduleNumber}: ${moduleName}\n\n${transcriptText}`,
          },
        ],
        max_completion_tokens: 4096,
      });
      response = result.choices[0].message.content || "";
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

### UI Tools (USE THESE FOR STRUCTURED UI ELEMENTS)

You have access to tools for injecting UI elements into the chat:

1. **append_title_card** - Use ONCE at the very start to introduce the session. Call with title "Interview" and subtitle "Getting to know your situation".

2. **append_section_header** - Use when transitioning to a new major topic or phase.

3. **append_structured_outcomes** - Use to present clickable ANSWER buttons. IMPORTANT: The question/ask must be in your freetext message BEFORE calling this tool. The tool should ONLY contain the answer options (no question text). Call with an array of options (objects with id and label). Example: First write "How would you like to get started?" in your message, THEN call append_structured_outcomes with options=[{id: "overview", label: "Give me a quick overview"}, {id: "dive_in", label: "Just dive in"}]

4. **set_provided_name** - Use when the user tells you their name. Call with the name they provided.

5. **finalize_interview** - Call ONCE when the interview is complete and you have generated the coaching plan. This marks the interview as finished, triggers artifact generation, and displays a final next steps card.

**IMPORTANT:**
- Call append_title_card exactly ONCE near the very beginning.
- Call append_section_header when shifting to a distinctly new topic area.
- Use append_structured_outcomes liberally (every 2-3 turns) for presenting options to the user.
- Do NOT print fake dividers, dashes, or title text in your message content. Use the tools.
- Keep your text responses clean and conversational.

### How to start (first reply)

On your **very first reply** (when there is no prior conversation history):

1. Call the append_title_card tool with title "Interview" and subtitle "Getting to know your situation".

2. Be warm and welcoming. Establish rapport. Set context: this is a structured coaching session, not just venting.

3. Ask for their name simply: "What's your name?" (ONE question only - no follow-ups, no "also").

That's it. Wait for their answer before asking anything else.

### Second turn (after getting their name)

When the user provides their name, call the **set_provided_name** tool with exactly what they told you. This saves their name to their profile.

Then greet them warmly by name and use the append_structured_outcomes tool:

"How would you like to get started?"

Call append_structured_outcomes with options like:
[{id: "overview", label: "Give me a quick overview of how this works"}, {id: "dive_in", label: "Just dive in"}]

If they pick "overview": Give 2–3 practical tips (answer in detail, you'll synthesize) and then proceed to the big problem question.
If they pick "dive in": Go straight to the big problem question.

### Gathering the big problem (CRITICAL - USE append_structured_outcomes)

After intro, move to the big problem. **Always use append_structured_outcomes** to make it easy to get started:

"What brings you here today?"

Call append_structured_outcomes with options like:
[{id: "unhappy", label: "I'm unhappy in my current role and thinking about leaving"},
 {id: "career_change", label: "I want to make a career change but don't know where to start"},
 {id: "difficult_situation", label: "I'm navigating a difficult situation with my boss or team"},
 {id: "next_move", label: "I'm trying to figure out my next career move"},
 {id: "decision", label: "I have a big decision to make and need clarity"},
 {id: "other", label: "Something else"}]

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

Then call append_structured_outcomes with:
[{id: "yes", label: "Yes, that's exactly it"},
 {id: "add", label: "Mostly right, but I'd add something"},
 {id: "different", label: "Actually, the bigger issue is something else"}]

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

### Structured options (USE append_structured_outcomes VERY FREQUENTLY)

Use the append_structured_outcomes tool liberally throughout the interview. Clickable options make responding easier and faster, and help users articulate things they might struggle to put into words.

**When to use append_structured_outcomes:**
- **Opening any new topic**: When exploring a new area, provide 4-5 thought starters plus "Something else"
- **After reflections**: "Does this sound right?" → Yes / Let me clarify
- **Navigation choices**: "Go deeper on X" / "Move on to next topic"
- **Constrained answers**: Tenure ranges, company size, salary bands
- **Plan confirmation**: "This plan looks right" / "I'd change something"
- **When asking "why"**: Instead of open-ended "Why do you want to leave?", offer common reasons as options
- **Whenever you can anticipate likely responses**
- **When questions are posed as multiple choice**: "Is it that you are feeling X, or is it more of Y?"

**Pattern for exploring new topics:**

When you introduce a new topic or question area, use append_structured_outcomes as thought starters, then follow up with less structured exploration:

Turn 1: "What's driving your frustration the most?"
Call append_structured_outcomes with:
[{id: "manager", label: "My manager doesn't support my growth"},
 {id: "learning", label: "I'm not learning anything new"},
 {id: "meaning", label: "The work feels meaningless"},
 {id: "pay", label: "I'm underpaid for what I do"},
 {id: "culture", label: "The culture has gotten toxic"},
 {id: "other", label: "Something else"}]

Turn 2 (after they pick): Ask a more open-ended follow-up question about what they chose.

Rules:
- **4–6 options** for opening questions on new topics (plus "Something else")
- **2–4 options** for confirmations and binary choices
- Short labels (2–8 words each)
- **Always include "Something else"** or "It's more complicated" as an escape hatch
- Aim to use append_structured_outcomes **at least every 2 turns**
- After reflections/synthesis, ALWAYS offer options to confirm or clarify

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

**Complete the interview using these tool calls in this exact order:**

1. Say a brief, warm statement like: "I've put together a personalized coaching plan for you."

2. Call **append_value_bullets** with 3-4 bullets tailored to their specific situation:
   - A bullet about their boss/work dynamics
   - A bullet about their money/family/constraint context
   - A bullet about their internal dilemma/tension

3. Call **append_social_proof** with a single sentence that either cites a relevant stat about career transitions/coaching effectiveness OR provides context about why structured coaching helps in their specific situation. Make it feel natural and relevant. Do NOT make up fake testimonials. Do NOT reference pricing.

4. Call **finalize_interview** to mark the interview as complete and trigger artifact generation. This tool will save the coaching plan and generate the final next steps card.

**IMPORTANT:** When calling finalize_interview, the plan card data must be included in your visible message text using this EXACT JSON format embedded in your response (the system will parse it):

\`\`\`plancard
{
  "name": "[User's first name]",
  "modules": [
    {"name": "[Module 1 creative name]", "objective": "[1 sentence]", "approach": "[1 sentence]", "outcome": "[1 sentence]"},
    {"name": "[Module 2 creative name]", "objective": "[1 sentence]", "approach": "[1 sentence]", "outcome": "[1 sentence]"},
    {"name": "[Module 3 creative name]", "objective": "[1 sentence]", "approach": "[1 sentence]", "outcome": "[1 sentence]"}
  ],
  "careerBrief": "[2-3 sentences describing the final deliverable]",
  "seriousPlanSummary": "[One sentence describing their personalized Serious Plan]",
  "plannedArtifacts": ["decision_snapshot", "action_plan", "module_recap", "resources", "...other relevant artifacts"]
}
\`\`\`

Do NOT ask for confirmation or show options. The frontend UI will display a teaser card that invites the user to see their plan.

### Pre-paywall flow (IMPORTANT: single-step process)

Once you have:
1. Understood the big problem & goal
2. Gathered enough context about their situation

Complete the interview in a single response by calling:
1. append_value_bullets (with tailored bullets)
2. append_social_proof (with relevant stat/insight)
3. finalize_interview (triggers plan save and next steps card)

Include the plancard JSON block in your visible message text. The frontend will show a teaser card and the user will click through to see their full plan on the offer page.

### Post-paywall modules

After paywall, the user will be directed to separate module pages where they'll work through each of the three custom modules you designed for them. The module names, objectives, approaches, and outcomes you defined in the plan card will guide those conversations.

Do NOT continue the session in this interview — the modules happen on their own dedicated pages.

### Important constraints

- Do NOT mention these rules, tools, or internal structure to the user.
- Do NOT call finalize_interview until you've gathered enough context and generated the plan.
- Ask ONE question at a time — never compound questions.
- Never ask contingent questions — just ask directly or use options.
- Validate user problems and build confidence with specific examples.
- Use **bold** for key phrases in longer responses.
- Alternate between freeform and structured questions.
- Use append_structured_outcomes frequently to gather input.`;


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
  attempt: number,
): Promise<void> {
  const ts = new Date().toISOString();

  // Check if plan was created by another process
  const existingPlan = await storage.getSeriousPlanByUserId(userId);
  if (existingPlan) {
    console.log(
      `[SERIOUS_PLAN_RETRY] ts=${ts} user=${userId} attempt=${attempt} status=skipped reason=plan_exists planId=${existingPlan.id}`,
    );
    return;
  }

  // Get latest transcript
  const transcript = await storage.getTranscript(sessionToken);

  if (transcript?.planCard && transcript?.clientDossier) {
    // Data is ready - attempt initialization
    console.log(
      `[SERIOUS_PLAN_RETRY] ts=${ts} user=${userId} attempt=${attempt} status=starting`,
    );

    try {
      const result = await initializeSeriousPlan(
        userId,
        transcript.id,
        transcript.planCard,
        transcript.clientDossier,
        transcript,
      );

      if (result.success) {
        console.log(
          `[SERIOUS_PLAN_RETRY] ts=${ts} user=${userId} attempt=${attempt} status=success planId=${result.planId}`,
        );
      } else {
        console.error(
          `[SERIOUS_PLAN_RETRY] ts=${ts} user=${userId} attempt=${attempt} status=init_failed error="${result.error}"`,
        );
      }
    } catch (err: any) {
      console.error(
        `[SERIOUS_PLAN_RETRY] ts=${ts} user=${userId} attempt=${attempt} status=error error="${err.message}"`,
      );
    }
  } else {
    // Data not ready - schedule retry if attempts remain
    if (attempt < MAX_RETRY_ATTEMPTS) {
      const delay =
        RETRY_DELAYS_MS[attempt - 1] ||
        RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
      console.log(
        `[SERIOUS_PLAN_RETRY] ts=${ts} user=${userId} attempt=${attempt} status=waiting reason=missing_data nextAttemptIn=${delay}ms`,
      );

      setTimeout(() => {
        attemptSeriousPlanInitWithRetry(userId, sessionToken, attempt + 1);
      }, delay);
    } else {
      console.error(
        `[SERIOUS_PLAN_RETRY] ts=${ts} user=${userId} attempt=${attempt} status=exhausted reason=max_retries_reached`,
      );
    }
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express,
): Promise<Server> {
  const publicPath = path.resolve(process.cwd(), "public");
  app.use(express.static(publicPath));

  // Set up authentication (Passport, sessions, strategies)
  setupAuth(app);

  // ============== /app/* SERVER-SIDE GATING ==============
  // Gate all /app/* routes based on authentication and journey state
  // This runs before SPA serving (vite or static) to enforce routing server-side
  app.use("/app", async (req, res, next) => {
    // Skip API/auth routes - they are handled by the proxy above or API handlers
    if (req.originalUrl.startsWith("/app/api") || req.originalUrl.startsWith("/app/auth")) {
      return next();
    }
    
    // Skip debug routes - they have their own gating
    if (req.originalUrl.startsWith("/app/debug/")) {
      return next();
    }

    // Parse the internal path (strip /app prefix) and query string
    const urlObj = new URL(req.originalUrl, `http://${req.headers.host}`);
    const internalPath = urlObj.pathname.replace(/^\/app/, "") || "/";
    const queryString = urlObj.search;

    // Not authenticated - allow /login, redirect everything else
    if (!req.isAuthenticated() || !req.user) {
      if (internalPath === "/login" || internalPath === "/login/") {
        return next(); // Allow login page
      }
      // Redirect to login with next param (preserve original path + query)
      const nextParam = encodeURIComponent(req.originalUrl);
      return res.redirect(`/app/login?next=${nextParam}`);
    }

    // Authenticated - check journey-based routing
    try {
      const userId = req.user.id;
      const routing = await computeRoutingForUser(userId);

      // Normalize internal path for comparison (remove trailing slash)
      const normalizedPath = internalPath.replace(/\/$/, "") || "/";
      
      // Check if path is allowed
      const isAllowed = routing.allowedPaths.some(allowed => {
        const normalizedAllowed = allowed.replace(/\/$/, "") || "/";
        return normalizedPath === normalizedAllowed || normalizedPath.startsWith(normalizedAllowed + "/");
      });

      if (!isAllowed) {
        // Redirect to canonical path
        return res.redirect(`/app${routing.canonicalPath}`);
      }

      // Path is allowed - let SPA handle it
      return next();
    } catch (error) {
      console.error("[app-gate] Error computing routing:", error);
      // On error, let SPA handle it
      return next();
    }
  });

  // ============== PRICING API ==============

  // GET /api/pricing - Get current price and active coupon from Stripe
  app.get("/api/pricing", async (req, res) => {
    try {
      const stripe = await getStripeClient();
      const priceId = await getProductPrice();

      // Get the price details
      const price = await stripe.prices.retrieve(priceId, {
        expand: ["product"],
      });

      const originalAmount = price.unit_amount ? price.unit_amount / 100 : 19;
      const priceCurrency = price.currency || "usd";

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
        currency: priceCurrency,
      });
    } catch (error: any) {
      console.error("Pricing API error:", error);
      res.status(503).json({
        error: "Unable to fetch pricing",
        originalPrice: 19,
        discountedPrice: null,
        percentOff: null,
        amountOff: null,
        currency: "usd",
      });
    }
  });

  // ============== DEBUG ENDPOINTS ==============

  // GET /api/debug/auth-config - Returns computed auth config (dev only)
  app.get("/api/debug/auth-config", async (req, res) => {
    const isProduction = process.env.REPLIT_DEPLOYMENT === "1" || process.env.NODE_ENV === "production";
    const debugEnabled = process.env.DEBUG_AUTH === "1";
    
    if (isProduction && !debugEnabled) {
      return res.status(404).json({ error: "Not found" });
    }

    const { getBaseUrl, getAppBasePath, getGoogleCallbackUrl, getMagicVerifyUrlTemplate } = await import("./auth");
    
    res.json({
      baseUrl: getBaseUrl(),
      appBasePath: getAppBasePath(),
      googleCallbackUrl: getGoogleCallbackUrl(),
      magicVerifyUrlTemplate: getMagicVerifyUrlTemplate(),
      googleConfigured: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    });
  });

  // GET /api/debug/magic-last-send - Returns last magic link send attempt (dev only)
  app.get("/api/debug/magic-last-send", async (req, res) => {
    const isProduction = process.env.REPLIT_DEPLOYMENT === "1" || process.env.NODE_ENV === "production";
    const debugEnabled = process.env.DEBUG_AUTH === "1";
    
    if (isProduction && !debugEnabled) {
      return res.status(404).json({ error: "Not found" });
    }

    const { getLastMagicLinkSendAttempt } = await import("./resendClient");
    const lastAttempt = getLastMagicLinkSendAttempt();
    
    if (!lastAttempt) {
      return res.json({ message: "No magic link send attempts yet" });
    }
    
    res.json(lastAttempt);
  });

  // ============== AUTH ROUTES ==============

  // GET /auth/me - Get current authenticated user
  // Always fetch fresh data from storage to reflect updates like providedName
  app.get("/auth/me", async (req, res) => {
    if (req.isAuthenticated() && req.user) {
      try {
        const freshUser = await storage.getUser(req.user.id);
        // Use fresh data if available, otherwise fall back to session data
        const userData = freshUser || req.user;
        res.json({
          authenticated: true,
          user: {
            id: userData.id,
            email: userData.email,
            name: userData.name,
            providedName: userData.providedName || null,
          },
        });
      } catch (error) {
        console.error("[auth/me] Error fetching user:", error);
        // Fall back to session data on error
        res.json({
          authenticated: true,
          user: {
            id: req.user.id,
            email: req.user.email,
            name: req.user.name,
            providedName: req.user.providedName || null,
          },
        });
      }
    } else {
      res.json({ authenticated: false, user: null });
    }
  });

  // Duplicate at /app/auth/me for SPA compatibility
  app.get("/app/auth/me", async (req, res) => {
    if (req.isAuthenticated() && req.user) {
      try {
        const freshUser = await storage.getUser(req.user.id);
        const userData = freshUser || req.user;
        res.json({
          authenticated: true,
          user: {
            id: userData.id,
            email: userData.email,
            name: userData.name,
            providedName: userData.providedName || null,
          },
        });
      } catch (error) {
        console.error("[auth/me] Error fetching user:", error);
        res.json({
          authenticated: true,
          user: {
            id: req.user.id,
            email: req.user.email,
            name: req.user.name,
            providedName: req.user.providedName || null,
          },
        });
      }
    } else {
      res.json({ authenticated: false, user: null });
    }
  });

  // GET /api/bootstrap - Combined session + journey bootstrap for SPA initialization
  // Returns auth status, user data, journey state, phase, and routing in one call
  app.get("/api/bootstrap", async (req, res) => {
    try {
      // Not authenticated
      if (!req.isAuthenticated() || !req.user) {
        return res.json({
          authenticated: false,
          user: null,
          journey: null,
          routing: null,
        });
      }

      const userId = req.user.id;

      // Fetch user data (fresh from storage)
      let userData = req.user;
      try {
        const freshUser = await storage.getUser(userId);
        if (freshUser) userData = freshUser;
      } catch (e) {
        console.error("[bootstrap] Error fetching fresh user:", e);
      }

      // Fetch journey state for response
      const journeyState = await storage.getJourneyState(userId);
      const state: JourneyState = journeyState || {
        interviewComplete: false,
        paymentVerified: false,
        module1Complete: false,
        module2Complete: false,
        module3Complete: false,
        hasSeriousPlan: false,
      };

      // Use shared helper for routing computation
      const routing = await computeRoutingForUser(userId);

      // Get plan-derived modules if interview is complete
      let modules = null;
      if (state.interviewComplete) {
        const transcript = await storage.getTranscriptByUserId(userId);
        if (transcript?.planCard?.modules) {
          modules = transcript.planCard.modules.map((mod: any, i: number) => ({
            moduleNumber: i + 1,
            title: mod.name,
            description: mod.objective,
          }));
        }
      }

      res.json({
        authenticated: true,
        user: {
          id: userData.id,
          email: userData.email,
          name: userData.name,
          providedName: userData.providedName || null,
        },
        journey: {
          state,
          phase: routing.phase,
          modules,
        },
        routing: {
          canonicalPath: routing.canonicalPath,
          resumePath: routing.resumePath,
          allowedPaths: routing.allowedPaths,
        },
      });
    } catch (error: any) {
      console.error("[bootstrap] Error:", error);
      res.status(500).json({ error: "Failed to load bootstrap data" });
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
          currentStep: "interview",
          currentPath: "/interview",
          modules: null, // No plan yet
        });
      }

      const currentStep = getCurrentJourneyStep(journeyState);
      const currentPath = getStepPath(currentStep);

      // Get plan-derived modules if interview is complete and planCard exists
      let modules = null;
      if (journeyState.interviewComplete) {
        const transcript = await storage.getTranscriptByUserId(userId);
        if (transcript?.planCard?.modules) {
          modules = transcript.planCard.modules.map((mod: any, i: number) => ({
            moduleNumber: i + 1,
            title: mod.name,
            description: mod.objective,
          }));
        }
      }

      res.json({
        state: journeyState,
        currentStep,
        currentPath,
        modules,
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
          alreadyExists: true,
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
      if (
        !transcript.module1Complete ||
        !transcript.module2Complete ||
        !transcript.module3Complete
      ) {
        return res
          .status(400)
          .json({
            error:
              "All modules must be completed before generating Serious Plan",
          });
      }

      if (!planCard) {
        return res
          .status(400)
          .json({ error: "No coaching plan found in transcript" });
      }

      // Initialize the plan with parallel generation (returns immediately, generation happens async)
      const result = await initializeSeriousPlan(
        userId,
        transcript.id,
        planCard,
        dossier,
        transcript,
      );

      if (result.success) {
        res.json({ success: true, planId: result.planId });
      } else {
        res
          .status(500)
          .json({ error: result.error || "Failed to initialize Serious Plan" });
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
      const effectiveStatus = plan.coachNoteContent
        ? "complete"
        : plan.coachLetterStatus || "pending";

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
  app.post(
    "/api/serious-plan/:id/regenerate",
    requireAuth,
    async (req, res) => {
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
          return res.json({
            message: "No pending artifacts to regenerate",
            regenerating: false,
          });
        }

        res.json({
          message: `Started regenerating ${result.artifactCount} artifacts`,
          regenerating: true,
          artifactCount: result.artifactCount,
        });
      } catch (error: any) {
        console.error("Regenerate artifacts error:", error);
        res.status(500).json({ error: error.message });
      }
    },
  );

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
  app.get(
    "/api/serious-plan/:planId/artifacts/:artifactKey",
    requireAuth,
    async (req, res) => {
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
    },
  );

  // POST /api/serious-plan/:planId/artifacts/:artifactId/pdf - Generate PDF for an artifact
  app.post(
    "/api/serious-plan/:planId/artifacts/:artifactId/pdf",
    requireAuth,
    async (req, res) => {
      try {
        const { planId, artifactId } = req.params;

        const plan = await storage.getSeriousPlan(planId);
        if (!plan) {
          return res.status(404).json({ error: "Plan not found" });
        }
        if (plan.userId !== req.user!.id) {
          return res.status(403).json({ error: "Access denied" });
        }

        const clientName =
          (plan.summaryMetadata as any)?.clientName || "Client";
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
    },
  );

  // POST /api/serious-plan/:planId/bundle-pdf - Generate bundle PDF with all artifacts
  app.post(
    "/api/serious-plan/:planId/bundle-pdf",
    requireAuth,
    async (req, res) => {
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
    },
  );

  // POST /api/serious-plan/:planId/generate-all-pdfs - Generate PDFs for all artifacts
  app.post(
    "/api/serious-plan/:planId/generate-all-pdfs",
    requireAuth,
    async (req, res) => {
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
    },
  );

  // POST /api/serious-plan/:planId/send-email - Send the Serious Plan to user's email
  app.post(
    "/api/serious-plan/:planId/send-email",
    requireAuth,
    async (req, res) => {
      try {
        const { planId } = req.params;
        const userId = req.user!.id;
        const userEmail = req.user!.email;

        if (!userEmail) {
          return res
            .status(400)
            .json({ error: "No email address associated with your account" });
        }

        const plan = await storage.getSeriousPlan(planId);
        if (!plan) {
          return res.status(404).json({ error: "Plan not found" });
        }
        if (plan.userId !== userId) {
          return res.status(403).json({ error: "Access denied" });
        }

        if (plan.status !== "ready") {
          return res.status(400).json({ error: "Plan is not ready yet" });
        }

        const artifacts = await storage.getArtifactsByPlanId(planId);
        const clientName =
          (plan.summaryMetadata as any)?.clientName || "Client";
        const coachNote =
          plan.coachNoteContent || "Your Serious Plan is ready for review.";

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
          res
            .status(500)
            .json({ error: result.error || "Failed to send email" });
        }
      } catch (error: any) {
        console.error("Send Serious Plan email error:", error);
        res.status(500).json({ error: error.message });
      }
    },
  );

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
      const clientName = (plan.summaryMetadata as any)?.clientName || "Client";
      const primaryRecommendation =
        (plan.summaryMetadata as any)?.primaryRecommendation || "";

      // Save the user's message
      await storage.createCoachChatMessage({
        planId,
        role: "user",
        content: message,
      });

      // Build system prompt with context
      const systemPrompt = `You are a supportive career coach continuing a conversation with ${clientName} who has completed a 3-module coaching program and received their Serious Plan.

CONTEXT FROM COACHING:
${clientDossier ? `Client Background: ${JSON.stringify(clientDossier)}` : ""}
${coachingPlan ? `Coaching Plan: ${JSON.stringify(coachingPlan)}` : ""}
Primary Recommendation: ${primaryRecommendation}
Coach's Note: ${plan.coachNoteContent || "Completed coaching successfully."}

ARTIFACTS IN THEIR PLAN:
${artifacts.map((a) => `- ${a.title} (${a.type}): ${a.whyImportant || ""}`).join("\n")}

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
      const chatHistory = existingMessages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

      // Add the new user message
      chatHistory.push({ role: "user", content: message });

      // Use Anthropic if available, otherwise OpenAI
      let aiReply: string;

      if (process.env.ANTHROPIC_API_KEY) {
        const Anthropic = (await import("@anthropic-ai/sdk")).default;
        const anthropic = new Anthropic();

        const response = await anthropic.messages.create({
          model: "claude-sonnet-4-5",
          max_tokens: 1024,
          system: systemPrompt,
          messages: chatHistory.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        });

        aiReply = response.content
          .filter((block) => block.type === "text")
          .map((block) => (block as { type: "text"; text: string }).text)
          .join("\n");
      } else {
        const OpenAI = (await import("openai")).default;
        const openai = new OpenAI();

        const response = await openai.chat.completions.create({
          model: "gpt-4-1106-preview",
          messages: [{ role: "system", content: systemPrompt }, ...chatHistory],
          max_tokens: 1024,
        });

        aiReply =
          response.choices[0]?.message?.content ||
          "I'm sorry, I couldn't generate a response. Please try again.";
      }

      // Save the assistant's reply
      const assistantMessage = await storage.createCoachChatMessage({
        planId,
        role: "assistant",
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

  // Sanitize basePath to prevent open redirect attacks
  // Only allow empty string or paths starting with "/" that are safe internal paths
  function sanitizeBasePath(basePath: string | undefined): string {
    if (!basePath) return "";
    
    // Trim whitespace
    let sanitized = basePath.trim();
    
    // Decode URL-encoded characters to catch encoded attacks
    try {
      sanitized = decodeURIComponent(sanitized);
    } catch {
      return ""; // Invalid encoding, reject
    }
    
    // Reject if empty after processing
    if (!sanitized) return "";
    
    // Must start with exactly one "/" and contain only safe characters
    // Allow: /app, /app-v2, /app_v2, /my-app (alphanumeric, dash, underscore after leading /)
    if (!/^\/[a-zA-Z0-9-_]+$/.test(sanitized)) {
      // Special case: allow exactly "/" (root path) - but we don't want that, so reject
      return "";
    }
    
    // Extra safety checks - reject dangerous patterns
    if (
      sanitized.includes("://") ||    // Protocol
      sanitized.includes("//") ||     // Double slashes
      sanitized.includes("..") ||     // Path traversal
      sanitized.includes("\\") ||     // Backslashes
      sanitized.includes("@") ||      // Potential URL authority
      sanitized.includes("%")         // Still has encoded chars after decode
    ) {
      return "";
    }
    
    return sanitized;
  }

  // ============== AUTH ROUTER ==============
  // Create auth router and mount at both /auth and /app/auth
  const authRouter = express.Router();

  // GET /google - Start Google OAuth flow
  authRouter.get("/google", (req, res, next) => {
    // Store promo code and base path in session before OAuth redirect
    const promoCode = req.query.promo as string | undefined;
    const basePath = sanitizeBasePath(req.query.basePath as string | undefined);
    
    // Always store basePath (even if empty) to ensure consistent redirect behavior
    (req.session as any).pendingBasePath = basePath;
    if (promoCode) {
      (req.session as any).pendingPromoCode = promoCode;
    }
    
    req.session.save((err) => {
      if (err) console.error("Session save error for OAuth context:", err);
      passport.authenticate("google", { scope: ["email", "profile"] })(
        req,
        res,
        next,
      );
    });
  });

  // GET /google/callback - Google OAuth callback
  authRouter.get(
    "/google/callback",
    (req, res, next) => {
      // Get the stored base path and promo code BEFORE passport auth (which regenerates session)
      // Store them on req object to survive session regeneration
      const basePath = (req.session as any).pendingBasePath || "";
      const promoCode = (req.session as any).pendingPromoCode || "";
      (req as any)._pendingBasePath = basePath;
      (req as any)._pendingPromoCode = promoCode;
      passport.authenticate("google", {
        failureRedirect: `${basePath}/login?error=google_auth_failed`,
      })(req, res, next);
    },
    async (req, res) => {
      // Get base path from req object (survives session regeneration)
      const basePath = (req as any)._pendingBasePath || "";
      const promoCode = (req as any)._pendingPromoCode || "";
      if (promoCode && req.user) {
        const user = req.user as any;
        // Get full user record to check if they already have a promo code
        const fullUser = await storage.getUser(user.id);
        if (fullUser && !fullUser.promoCode) {
          await storage.updateUser(user.id, { promoCode });
          console.log(
            `Saved promo code ${promoCode} for Google user ${user.id}`,
          );
        }
        delete (req.session as any).pendingPromoCode;
      }
      
      // Clean up session data
      delete (req.session as any).pendingBasePath;

      // Ensure session is saved before redirect (prevents race condition)
      req.session.save((err) => {
        if (err) {
          console.error("[Google callback] Session save error:", err);
        }
        res.redirect(`${basePath}/prepare`);
      });
    },
  );

  // POST /magic/start - Request magic link email
  authRouter.post("/magic/start", async (req, res) => {
    try {
      const { email, promoCode, basePath } = req.body;

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

      // Send email with magic link (include basePath in URL and as query param for redirect after verification)
      const baseUrl = getBaseUrl();
      const sanitizedBasePath = sanitizeBasePath(basePath || "/app");
      const basePathParam = `&basePath=${encodeURIComponent(sanitizedBasePath)}`;
      const magicLinkUrl = `${baseUrl}${sanitizedBasePath}/auth/magic/verify?token=${token}${basePathParam}`;

      const result = await sendMagicLinkEmail(email, magicLinkUrl);

      if (result.success) {
        res.json({
          success: true,
          message: "Check your email for the login link",
        });
      } else {
        console.error("Failed to send magic link:", result.error);
        res
          .status(500)
          .json({ error: "Failed to send email. Please try again." });
      }
    } catch (error: any) {
      console.error("Magic link start error:", error);
      res
        .status(500)
        .json({ error: "Something went wrong. Please try again." });
    }
  });

  // GET /magic/verify - Verify magic link and log in
  authRouter.get("/magic/verify", async (req, res) => {
    try {
      const { token, basePath: basePathParam } = req.query;
      const basePath = sanitizeBasePath(typeof basePathParam === "string" ? basePathParam : "");

      if (!token || typeof token !== "string") {
        return res.redirect(`${basePath}/login?error=invalid_token`);
      }

      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      const magicToken = await storage.getMagicLinkToken(tokenHash);

      if (!magicToken) {
        return res.redirect(`${basePath}/login?error=expired_token`);
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
      req.login(
        {
          id: user.id,
          email: user.email,
          name: user.name,
          providedName: user.providedName || null,
        },
        (err) => {
          if (err) {
            console.error("Login error:", err);
            return res.redirect(`${basePath}/login?error=login_failed`);
          }
          // Ensure session is saved before redirect (prevents race condition)
          req.session.save((saveErr) => {
            if (saveErr) {
              console.error("Session save error:", saveErr);
            }
            res.redirect(`${basePath}/prepare`);
          });
        },
      );
    } catch (error: any) {
      console.error("Magic link verify error:", error);
      const basePath = sanitizeBasePath(typeof req.query.basePath === "string" ? req.query.basePath : "");
      res.redirect(`${basePath}/login?error=verification_failed`);
    }
  });

  // POST /logout - Log out
  authRouter.post("/logout", (req, res) => {
    req.logout((err) => {
      if (err) {
        console.error("Logout error:", err);
        return res.status(500).json({ error: "Logout failed" });
      }
      res.json({ success: true });
    });
  });

  // POST /demo - Demo login for testing (development only)
  authRouter.post("/demo", async (req, res) => {
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
          await db
            .delete(interviewTranscripts)
            .where(eq(interviewTranscripts.userId, user.id));
        } catch (e) {
          console.error("Failed to clear demo transcript:", e);
        }
      }

      // Log user in
      req.login(
        {
          id: user.id,
          email: user.email,
          name: user.name,
          providedName: user.providedName || null,
        },
        (err) => {
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
        },
      );
    } catch (error: any) {
      console.error("Demo login error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Mount auth router at both /auth and /app/auth
  app.use("/auth", authRouter);
  app.use("/app/auth", authRouter);

  // ============== TRANSCRIPT API (Protected) ==============

  // GET /api/transcript - Get user's transcript
  app.get("/api/transcript", requireAuth, async (req, res) => {
    const requestStart = Date.now();
    try {
      const userId = req.user!.id;
      const transcript = await storage.getTranscriptByUserId(userId);

      if (transcript) {
        const durationMs = Date.now() - requestStart;
        const messageCount = Array.isArray(transcript.transcript)
          ? transcript.transcript.length
          : 0;
        console.log(
          `[TRANSCRIPT_GET] ts=${new Date().toISOString()} user=${userId} status=found messageCount=${messageCount} module=${transcript.currentModule} progress=${transcript.progress} interviewComplete=${transcript.interviewComplete} paymentVerified=${transcript.paymentVerified} hasPlanCard=${!!transcript.planCard} hasDossier=${!!transcript.clientDossier} durationMs=${durationMs}`,
        );

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
        console.log(
          `[TRANSCRIPT_GET] ts=${new Date().toISOString()} user=${userId} status=not_found durationMs=${durationMs}`,
        );
        res.json({ transcript: null });
      }
    } catch (error: any) {
      const durationMs = Date.now() - requestStart;
      console.error(
        `[TRANSCRIPT_GET] ts=${new Date().toISOString()} user=${req.user?.id || "unknown"} status=error durationMs=${durationMs} error="${error.message}"`,
      );
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
      const { promoCode: sessionPromoCode, basePath: clientBasePath } = req.body || {};
      
      // Use the base path from the client to maintain /app routing (sanitized for security)
      const basePath = sanitizeBasePath(clientBasePath);

      // Get the price to check currency
      const price = await stripe.prices.retrieve(priceId);
      const priceCurrency = price.currency || "usd";

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

      // Build checkout session options with base path for /app routing
      const sessionOptions: any = {
        mode: "payment",
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        success_url: `${baseUrl}${basePath}/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}${basePath}/interview`,
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
            sessionOptions.discounts = [
              { promotion_code: promoCodes.data[0].id },
            ];
            console.log(
              `Applied promo code: ${promoCode} (user-specific: ${isUserSpecificPromo})`,
            );
          } else {
            console.log(
              `Promo code not found or inactive: ${promoCode}, falling back to default`,
            );
            // Fall back to standard promo or allow manual entry
            const promo = await findActivePromoCode(priceCurrency);
            if (promo.promoCodeId) {
              sessionOptions.discounts = [
                { promotion_code: promo.promoCodeId },
              ];
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

      // Save stripeSessionId to transcript so bootstrap can detect CHECKOUT_PENDING phase
      if (user?.id) {
        const transcript = await storage.getTranscriptByUserId(user.id);
        if (transcript) {
          await storage.updateTranscript(transcript.sessionToken, {
            stripeSessionId: session.id,
          });
          console.log(`[CHECKOUT] Saved stripeSessionId=${session.id.slice(0, 20)}... for user=${user.id}`);
        }
      }

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
      const userId = user?.id || "anonymous";

      console.log(
        `[VERIFY_SESSION] ts=${new Date().toISOString()} user=${userId} status=started stripeSessionId=${sessionId?.slice(0, 20)}...`,
      );

      if (!sessionId) {
        const durationMs = Date.now() - requestStart;
        console.log(
          `[VERIFY_SESSION] ts=${new Date().toISOString()} user=${userId} status=failed_missing_session durationMs=${durationMs}`,
        );
        return res.status(400).json({ ok: false, error: "Missing session_id" });
      }

      const stripe = await getStripeClient();
      // Expand total_details.breakdown to get coupon info
      const session = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ["total_details.breakdown"],
      });

      console.log(
        `[VERIFY_SESSION] ts=${new Date().toISOString()} user=${userId} stripePaymentStatus=${session.payment_status}`,
      );

      if (session.payment_status === "paid") {
        // If user is authenticated, mark their transcript as payment verified
        if (user?.id) {
          const transcript = await storage.getTranscriptByUserId(user.id);
          if (transcript && transcript.sessionToken) {
            await storage.updateTranscript(transcript.sessionToken, {
              paymentVerified: true,
              stripeSessionId: sessionId,
            });
            console.log(
              `[VERIFY_SESSION] ts=${new Date().toISOString()} user=${userId} status=state_change paymentVerified=true hasDossier=${!!transcript.clientDossier}`,
            );
          }

          // Check if a friends & family coupon was used
          const FRIENDS_FAMILY_COUPONS = ["uEW83Os5", "h8TgzjXR", "klpY3iUM"];
          const discounts = session.total_details?.breakdown?.discounts || [];
          const usedCouponId =
            discounts.length > 0
              ? (discounts[0].discount as any)?.coupon?.id
              : null;

          if (usedCouponId && FRIENDS_FAMILY_COUPONS.includes(usedCouponId)) {
            await storage.updateUser(user.id, { isFriendsAndFamily: true });
            console.log(
              `[VERIFY_SESSION] ts=${new Date().toISOString()} user=${userId} status=friends_family_flagged couponId=${usedCouponId}`,
            );
          }
        }
        const durationMs = Date.now() - requestStart;
        console.log(
          `[VERIFY_SESSION] ts=${new Date().toISOString()} user=${userId} status=success durationMs=${durationMs}`,
        );
        return res.json({ ok: true });
      } else {
        const durationMs = Date.now() - requestStart;
        console.log(
          `[VERIFY_SESSION] ts=${new Date().toISOString()} user=${userId} status=failed_not_paid stripePaymentStatus=${session.payment_status} durationMs=${durationMs}`,
        );
        return res
          .status(403)
          .json({ ok: false, error: "Payment not completed" });
      }
    } catch (error: any) {
      const durationMs = Date.now() - requestStart;
      console.error(
        `[VERIFY_SESSION] ts=${new Date().toISOString()} user=${(req as any).user?.id || "anonymous"} status=error durationMs=${durationMs} error="${error.message}"`,
      );
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
        console.log(
          `[INTERVIEW_COMPLETE] ts=${new Date().toISOString()} user=anonymous status=rejected_not_authenticated`,
        );
        return res.status(401).json({ error: "Not authenticated" });
      }

      console.log(
        `[INTERVIEW_COMPLETE] ts=${new Date().toISOString()} user=${user.id} status=started`,
      );

      const transcript = await storage.getTranscriptByUserId(user.id);
      if (!transcript) {
        const durationMs = Date.now() - requestStart;
        console.log(
          `[INTERVIEW_COMPLETE] ts=${new Date().toISOString()} user=${user.id} status=failed_no_transcript durationMs=${durationMs}`,
        );
        return res.status(400).json({ error: "No transcript found" });
      }

      const hasPlanCard = !!transcript.planCard;
      const hasDossier = !!transcript.clientDossier;

      // Already complete - return success
      if (transcript.interviewComplete) {
        const durationMs = Date.now() - requestStart;
        console.log(
          `[INTERVIEW_COMPLETE] ts=${new Date().toISOString()} user=${user.id} status=already_complete hasPlanCard=${hasPlanCard} hasDossier=${hasDossier} durationMs=${durationMs}`,
        );
        return res.json({ ok: true, alreadyComplete: true, hasDossier });
      }

      // Mark interview as complete in database
      await storage.updateTranscript(transcript.sessionToken, {
        interviewComplete: true,
        progress: 100,
      });

      const durationMs = Date.now() - requestStart;
      console.log(
        `[INTERVIEW_COMPLETE] ts=${new Date().toISOString()} user=${user.id} status=state_change interviewComplete=true progress=100 hasPlanCard=${hasPlanCard} hasDossier=${hasDossier} durationMs=${durationMs}`,
      );

      // Dossier should already exist (generated when planCard was saved)
      // Just report whether it's ready
      res.json({ ok: true, hasDossier });
    } catch (error: any) {
      const durationMs = Date.now() - requestStart;
      console.error(
        `[INTERVIEW_COMPLETE] ts=${new Date().toISOString()} user=${(req.user as any)?.id || "unknown"} status=error durationMs=${durationMs} error="${error.message}"`,
      );
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/interview/messages - Append a single message to the transcript
  // Lightweight persistence during the interview chat
  app.post("/api/interview/messages", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user?.id) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const { role, content, timestamp } = req.body;
      if (!role || !content) {
        return res.status(400).json({ error: "Missing role or content" });
      }

      // Get or create transcript for this user
      let transcript = await storage.getTranscriptByUserId(user.id);
      
      if (!transcript) {
        // Create a new transcript with this first message
        const sessionToken = `interview_${user.id}_${Date.now()}`;
        const newMessage = { role, content, timestamp: timestamp || new Date().toISOString() };
        transcript = await storage.createTranscript({
          sessionToken,
          userId: user.id,
          transcript: [newMessage] as any,
          currentModule: "Interview",
          progress: 0,
        });
      } else {
        // Append to existing transcript
        const existingMessages = Array.isArray(transcript.transcript) ? transcript.transcript : [];
        const newMessage = { role, content, timestamp: timestamp || new Date().toISOString() };
        const updatedMessages = [...existingMessages, newMessage] as any;
        
        await storage.updateTranscript(transcript.sessionToken, {
          transcript: updatedMessages,
        });
      }

      res.json({ ok: true });
    } catch (error: any) {
      console.error("[INTERVIEW_MESSAGES] Error:", error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/interview/state - Get current interview state (transcript + events)
  // If no transcript exists or transcript is completely blank (no messages AND no events), auto-initialize
  app.get("/api/interview/state", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user?.id) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      let transcript = await storage.getTranscriptByUserId(user.id);
      
      // Check if we need to auto-initialize
      const messages = transcript ? (Array.isArray(transcript.transcript) ? transcript.transcript : []) : [];
      let events = transcript ? await storage.listInterviewEvents(transcript.sessionToken) : [];
      
      // Auto-initialize ONLY if: no transcript OR (no messages AND no events at all)
      // This preserves dev-injected events and avoids corrupting test state
      const isCompletelyBlank = !transcript || (messages.length === 0 && events.length === 0);
      
      if (isCompletelyBlank) {
        console.log(`[INTERVIEW_STATE] Auto-initializing interview for user ${user.id}`);
        
        // Create transcript if it doesn't exist
        if (!transcript) {
          const sessionToken = `session_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
          transcript = await storage.createTranscript({
            sessionToken,
            userId: user.id,
            transcript: [] as any,
            currentModule: "Interview",
            progress: 0,
          });
        }
        
        // Call LLM to generate title card and first message
        const llmResult = await callInterviewLLM([], transcript.sessionToken, user.id);
        
        if (llmResult.reply) {
          // Persist the first assistant message
          const firstMessage = { role: "assistant", content: llmResult.reply, timestamp: new Date().toISOString() };
          await storage.updateTranscript(transcript.sessionToken, {
            transcript: [firstMessage] as any,
          });
          
          // Refresh transcript and events after initialization
          transcript = await storage.getTranscript(transcript.sessionToken);
          events = await storage.listInterviewEvents(transcript!.sessionToken);
          
          console.log(`[INTERVIEW_STATE] Auto-initialization complete for user ${user.id}`);
        }
      }

      const finalMessages = transcript ? (Array.isArray(transcript.transcript) ? transcript.transcript : []) : [];

      res.json({
        success: true,
        transcript: finalMessages,
        events,
      });
    } catch (error: any) {
      console.error("[INTERVIEW_STATE] Error:", error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/interview/turn - Send a message and get AI response
  // This replaces the dummy dialogue with real LLM-powered interview
  app.post("/api/interview/turn", requireAuth, async (req, res) => {
    await handleInterviewTurn(req.user as any, req.body, res);
  });

  // POST /api/interview/turn/stream - Streaming version of interview turn
  // Returns Server-Sent Events (SSE) for real-time response streaming
  app.post("/api/interview/turn/stream", requireAuth, async (req, res) => {
    await handleInterviewTurnStream(req.user as any, req.body, res);
  });

  // POST /api/interview/outcomes/select - Select a structured outcome option
  // Uses eventSeq (number) as the canonical identifier for outcomes events
  // Idempotency: same option = success (no-op), different option = 409 Conflict
  app.post("/api/interview/outcomes/select", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user?.id) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const { eventSeq: rawEventSeq, optionId } = req.body;
      if (rawEventSeq === undefined || rawEventSeq === null || !optionId) {
        return res.status(400).json({ error: "eventSeq and optionId are required" });
      }

      // Ensure eventSeq is a number
      const eventSeq = typeof rawEventSeq === "string" ? parseInt(rawEventSeq, 10) : rawEventSeq;
      if (typeof eventSeq !== "number" || isNaN(eventSeq)) {
        return res.status(400).json({ error: "eventSeq must be a valid number" });
      }

      // Get transcript
      const transcript = await storage.getTranscriptByUserId(user.id);
      if (!transcript) {
        return res.status(400).json({ error: "No interview session found" });
      }

      const sessionToken = transcript.sessionToken;
      const events = await storage.listInterviewEvents(sessionToken);

      // Find the structured outcomes event by eventSeq
      const outcomesEvent = events.find(e => e.eventSeq === eventSeq && e.type === "chat.structured_outcomes_added");
      if (!outcomesEvent) {
        return res.status(404).json({ error: "Outcomes event not found" });
      }

      // Check if already selected for this outcomes event
      const existingSelection = events.find(e => 
        e.type === "chat.structured_outcome_selected" && 
        (e.payload as any)?.eventSeq === eventSeq
      );
      
      if (existingSelection) {
        const existingOptionId = (existingSelection.payload as any)?.optionId;
        if (existingOptionId === optionId) {
          // Same option selected again - idempotent success, return current state
          const existingMessages = transcript.transcript || [];
          res.json({
            success: true,
            transcript: existingMessages,
            events,
            note: "Option already selected (idempotent)",
          });
          return;
        } else {
          // Different option selected - conflict
          return res.status(409).json({ error: "A different option was already selected for this event" });
        }
      }

      // Find the option
      const options = (outcomesEvent.payload as any)?.options || [];
      const selectedOption = options.find((opt: any) => opt.id === optionId);
      if (!selectedOption) {
        return res.status(404).json({ error: "Option not found" });
      }

      // Calculate afterMessageIndex for the selection event
      const existingMessages = transcript.transcript || [];
      const afterMessageIndex = existingMessages.length > 0 ? existingMessages.length - 1 : -1;

      // Append the selection event (using eventSeq as reference)
      await storage.appendInterviewEvent(sessionToken, "chat.structured_outcome_selected", {
        render: { afterMessageIndex },
        eventSeq,
        optionId,
        value: selectedOption.value,
      });

      // Append user message to transcript
      const userMessage = { role: "user", content: selectedOption.value };
      const updatedMessages = [...existingMessages, userMessage];
      await storage.updateTranscript(sessionToken, { transcript: updatedMessages as any });

      // Call LLM for response
      const llmResult = await callInterviewLLM(updatedMessages as any, sessionToken, user.id);

      // Append AI response to transcript
      const aiMessage = { role: "assistant", content: llmResult.reply };
      const finalMessages = [...updatedMessages, aiMessage];
      await storage.updateTranscript(sessionToken, { transcript: finalMessages as any });

      // Fetch updated events
      const updatedEvents = await storage.listInterviewEvents(sessionToken);

      res.json({
        success: true,
        transcript: finalMessages,
        reply: llmResult.reply,
        done: llmResult.done,
        progress: llmResult.progress,
        options: llmResult.options,
        planCard: llmResult.planCard,
        valueBullets: llmResult.valueBullets,
        socialProof: llmResult.socialProof,
        events: updatedEvents,
      });
    } catch (error: any) {
      console.error("[OUTCOMES_SELECT] Error:", error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // Streaming interview turn handler with SSE
  async function handleInterviewTurnStream(
    user: { id: string },
    body: { message: string },
    res: express.Response
  ) {
    try {
      if (!user?.id) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const { message } = body;
      if (!message || typeof message !== "string") {
        return res.status(400).json({ error: "Message is required" });
      }

      // Set up SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();

      // Helper to send SSE events
      const sendEvent = (type: string, data: any) => {
        res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
      };

      try {
        // Get or create transcript for this user
        let transcript = await storage.getTranscriptByUserId(user.id);
        const existingMessages: { role: string; content: string }[] = transcript
          ? (Array.isArray(transcript.transcript) ? transcript.transcript : [])
          : [];

        // If no transcript exists or it's empty, we need to get the first assistant message first
        let sessionToken: string;
        if (existingMessages.length === 0) {
          // Generate sessionToken first so we can pass it to callInterviewLLM for event persistence
          sessionToken = `interview_${user.id}_${Date.now()}`;

          // Call streaming LLM to get the initial greeting (with sessionToken for tool events)
          const initialReply = await callInterviewLLMStream([], sessionToken, user.id, sendEvent);
          const initialMessage = { role: "assistant", content: initialReply.reply };

          transcript = await storage.createTranscript({
            sessionToken,
            userId: user.id,
            transcript: [initialMessage] as any,
            currentModule: "Interview",
            progress: 0,
          });

          existingMessages.push(initialMessage);
        } else {
          sessionToken = transcript!.sessionToken;
        }

        // Append user message
        const userMessage = { role: "user", content: message };
        existingMessages.push(userMessage);

        // Call streaming LLM with full transcript and sessionToken for event persistence
        const llmResult = await callInterviewLLMStream(existingMessages, sessionToken, user.id, sendEvent);

        // Append assistant reply
        const assistantMessage = { role: "assistant", content: llmResult.reply };
        existingMessages.push(assistantMessage);

        // Persist updated transcript
        await storage.updateTranscript(transcript!.sessionToken, {
          transcript: existingMessages as any,
          progress: llmResult.progress ?? transcript!.progress,
        });

        // If planCard was returned, save it
        if (llmResult.planCard) {
          await storage.updateTranscript(transcript!.sessionToken, {
            planCard: llmResult.planCard as any,
          });
        }

        // Fetch events for this interview session
        const events = await storage.listInterviewEvents(sessionToken);

        // Send final "done" event with complete data
        sendEvent('done', {
          success: true,
          transcript: existingMessages,
          reply: llmResult.reply,
          done: llmResult.done,
          progress: llmResult.progress,
          options: llmResult.options,
          planCard: llmResult.planCard,
          valueBullets: llmResult.valueBullets,
          socialProof: llmResult.socialProof,
          events,
        });

        res.end();
      } catch (error: any) {
        console.error("[INTERVIEW_TURN_STREAM] Error:", error.message);
        sendEvent('error', { error: error.message });
        res.end();
      }
    } catch (error: any) {
      console.error("[INTERVIEW_TURN_STREAM] Setup error:", error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // Shared interview turn handler (used by both auth and dev endpoints)
  async function handleInterviewTurn(
    user: { id: string },
    body: { message: string },
    res: express.Response
  ) {
    try {
      if (!user?.id) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const { message } = body;
      if (!message || typeof message !== "string") {
        return res.status(400).json({ error: "Message is required" });
      }

      // Get or create transcript for this user
      let transcript = await storage.getTranscriptByUserId(user.id);
      const existingMessages: { role: string; content: string }[] = transcript
        ? (Array.isArray(transcript.transcript) ? transcript.transcript : [])
        : [];

      // If no transcript exists or it's empty, we need to get the first assistant message first
      let sessionToken: string;
      if (existingMessages.length === 0) {
        // Generate sessionToken first so we can pass it to callInterviewLLM for event persistence
        sessionToken = `interview_${user.id}_${Date.now()}`;
        
        // Call LLM to get the initial greeting (with sessionToken for tool events)
        const initialReply = await callInterviewLLM([], sessionToken, user.id);
        const initialMessage = { role: "assistant", content: initialReply.reply };
        
        transcript = await storage.createTranscript({
          sessionToken,
          userId: user.id,
          transcript: [initialMessage] as any,
          currentModule: "Interview",
          progress: 0,
        });
        
        existingMessages.push(initialMessage);
      } else {
        sessionToken = transcript!.sessionToken;
      }

      // Append user message
      const userMessage = { role: "user", content: message };
      existingMessages.push(userMessage);

      // Call LLM with full transcript and sessionToken for event persistence
      const llmResult = await callInterviewLLM(existingMessages, sessionToken, user.id);

      // Append assistant reply
      const assistantMessage = { role: "assistant", content: llmResult.reply };
      existingMessages.push(assistantMessage);

      // Persist updated transcript
      await storage.updateTranscript(transcript!.sessionToken, {
        transcript: existingMessages as any,
        progress: llmResult.progress ?? transcript!.progress,
      });

      // If planCard was returned, save it
      if (llmResult.planCard) {
        await storage.updateTranscript(transcript!.sessionToken, {
          planCard: llmResult.planCard as any,
        });
      }

      // Fetch events for this interview session
      const events = await storage.listInterviewEvents(sessionToken);

      res.json({
        success: true,
        transcript: existingMessages,
        reply: llmResult.reply,
        done: llmResult.done,
        progress: llmResult.progress,
        options: llmResult.options,
        planCard: llmResult.planCard,
        valueBullets: llmResult.valueBullets,
        socialProof: llmResult.socialProof,
        events,
      });
    } catch (error: any) {
      console.error("[INTERVIEW_TURN] Error:", error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // Handler for finalize_interview tool
  // Marks interview complete, triggers artifact generation, appends final next steps event
  async function handleFinalizeInterview(
    sessionToken: string, 
    userId: string,
    afterMessageIndex: number
  ): Promise<void> {
    const startTime = Date.now();
    console.log(`[FINALIZE_INTERVIEW] ts=${new Date().toISOString()} user=${userId} session=${sessionToken} status=started`);
    
    try {
      // Check for existing finalization (idempotency)
      const existingEvents = await storage.listInterviewEvents(sessionToken);
      if (existingEvents.some(e => e.type === "chat.final_next_steps_added")) {
        console.log(`[FINALIZE_INTERVIEW] ts=${new Date().toISOString()} user=${userId} status=skipped_already_finalized`);
        return;
      }
      
      // Get transcript for plan data
      const transcript = await storage.getTranscriptByUserId(userId);
      if (!transcript) {
        console.log(`[FINALIZE_INTERVIEW] ts=${new Date().toISOString()} user=${userId} status=error_no_transcript`);
        return;
      }
      
      // Mark interview as complete
      if (!transcript.interviewComplete) {
        await storage.updateTranscript(transcript.sessionToken, {
          interviewComplete: true,
          progress: 100,
        });
        console.log(`[FINALIZE_INTERVIEW] ts=${new Date().toISOString()} user=${userId} status=marked_complete`);
      }
      
      // Get coaching plan from transcript - required for finalization
      const coachingPlan = transcript.planCard as CoachingPlan | null;
      if (!coachingPlan?.modules || coachingPlan.modules.length === 0) {
        console.log(`[FINALIZE_INTERVIEW] ts=${new Date().toISOString()} user=${userId} status=error_no_plan_modules`);
        // Don't finalize without modules - the UI would show an empty card
        return;
      }
      
      // Trigger artifact generation (idempotent - initializeSeriousPlan checks for existing plan)
      const dossier = transcript.clientDossier as any || null;
      const result = await initializeSeriousPlan(
        userId,
        transcript.id,
        coachingPlan,
        dossier,
        transcript
      );
      console.log(`[FINALIZE_INTERVIEW] ts=${new Date().toISOString()} user=${userId} status=artifacts_init planId=${result.planId} success=${result.success}`);
      
      if (!result.success) {
        console.log(`[FINALIZE_INTERVIEW] ts=${new Date().toISOString()} user=${userId} status=error_artifacts_failed error="${result.error}"`);
        // Don't create final event if artifact initialization failed
        return;
      }
      
      // Build modules list for final card from coaching plan (coachingPlan guaranteed to have modules at this point)
      const modules = coachingPlan.modules.map((m, idx) => ({
        slug: `module-${idx + 1}`,
        title: m.name || `Module ${idx + 1}`,
        description: m.objective || m.outcome || '',
      }));
      
      // Append final next steps event
      await storage.appendInterviewEvent(sessionToken, "chat.final_next_steps_added", {
        render: { afterMessageIndex },
        modules,
      });
      
      const durationMs = Date.now() - startTime;
      console.log(`[FINALIZE_INTERVIEW] ts=${new Date().toISOString()} user=${userId} status=complete moduleCount=${modules.length} durationMs=${durationMs}`);
    } catch (error: any) {
      const durationMs = Date.now() - startTime;
      console.error(`[FINALIZE_INTERVIEW] ts=${new Date().toISOString()} user=${userId} status=error error="${error.message}" durationMs=${durationMs}`);
    }
  }

  // Tool definitions for interview LLM
  const interviewTools = {
    anthropic: [
      {
        name: "append_title_card",
        description: "Add a title card to the chat interface. Use this ONCE at the very start of the interview.",
        input_schema: {
          type: "object" as const,
          properties: {
            title: { type: "string", description: "The main title (e.g., 'Interview')" },
            subtitle: { type: "string", description: "Optional subtitle (e.g., 'Getting to know your situation')" },
          },
          required: ["title"],
        },
      },
      {
        name: "append_section_header",
        description: "Add a section header when transitioning to a new major topic.",
        input_schema: {
          type: "object" as const,
          properties: {
            title: { type: "string", description: "The section title" },
            subtitle: { type: "string", description: "Optional section subtitle" },
          },
          required: ["title"],
        },
      },
      {
        name: "set_provided_name",
        description: "Save the user's name to their profile. Call this when the user tells you their name.",
        input_schema: {
          type: "object" as const,
          properties: {
            name: { type: "string", description: "The user's name exactly as they provided it" },
          },
          required: ["name"],
        },
      },
      {
        name: "append_structured_outcomes",
        description: "Display clickable pill options for the user to choose from. Use this instead of writing options as plain text. When you use this tool, do NOT include the options in your message text.",
        input_schema: {
          type: "object" as const,
          properties: {
            prompt: { type: "string", description: "Optional prompt text above the options" },
            options: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string", description: "Optional unique ID for the option" },
                  label: { type: "string", description: "Short display text for the pill" },
                  value: { type: "string", description: "Full text sent as user message when clicked" },
                },
                required: ["label", "value"],
              },
              description: "Array of options to display as clickable pills",
            },
          },
          required: ["options"],
        },
      },
      {
        name: "finalize_interview",
        description: "Call this ONCE when the interview is complete and you have generated the coaching plan. This marks the interview as finished, triggers artifact generation, and displays a final next steps card to the user.",
        input_schema: {
          type: "object" as const,
          properties: {},
          required: [],
        },
      },
      {
        name: "append_value_bullets",
        description: "Display personalized value bullets that explain why this coaching plan is valuable for the user's specific situation. Call this IMMEDIATELY after generating the plan card.",
        input_schema: {
          type: "object" as const,
          properties: {
            bullets: {
              type: "array",
              items: { type: "string" },
              description: "Array of 3-4 value bullet strings, each highlighting a specific benefit tailored to their situation",
            },
          },
          required: ["bullets"],
        },
      },
      {
        name: "append_social_proof",
        description: "Display a single piece of relevant social proof or statistic. Call this after the value bullets.",
        input_schema: {
          type: "object" as const,
          properties: {
            content: { type: "string", description: "A single sentence with a relevant stat or insight about career coaching effectiveness" },
          },
          required: ["content"],
        },
      },
    ],
    openai: [
      {
        type: "function" as const,
        function: {
          name: "append_title_card",
          description: "Add a title card to the chat interface. Use this ONCE at the very start of the interview.",
          parameters: {
            type: "object",
            properties: {
              title: { type: "string", description: "The main title (e.g., 'Interview')" },
              subtitle: { type: "string", description: "Optional subtitle (e.g., 'Getting to know your situation')" },
            },
            required: ["title"],
          },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "append_section_header",
          description: "Add a section header when transitioning to a new major topic.",
          parameters: {
            type: "object",
            properties: {
              title: { type: "string", description: "The section title" },
              subtitle: { type: "string", description: "Optional section subtitle" },
            },
            required: ["title"],
          },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "set_provided_name",
          description: "Save the user's name to their profile. Call this when the user tells you their name.",
          parameters: {
            type: "object",
            properties: {
              name: { type: "string", description: "The user's name exactly as they provided it" },
            },
            required: ["name"],
          },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "append_structured_outcomes",
          description: "Display clickable pill options for the user to choose from. Use this instead of writing options as plain text. When you use this tool, do NOT include the options in your message text.",
          parameters: {
            type: "object",
            properties: {
              prompt: { type: "string", description: "Optional prompt text above the options" },
              options: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string", description: "Optional unique ID for the option" },
                    label: { type: "string", description: "Short display text for the pill" },
                    value: { type: "string", description: "Full text sent as user message when clicked" },
                  },
                  required: ["label", "value"],
                },
                description: "Array of options to display as clickable pills",
              },
            },
            required: ["options"],
          },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "finalize_interview",
          description: "Call this ONCE when the interview is complete and you have generated the coaching plan. This marks the interview as finished, triggers artifact generation, and displays a final next steps card to the user.",
          parameters: {
            type: "object",
            properties: {},
            required: [],
          },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "append_value_bullets",
          description: "Display personalized value bullets that explain why this coaching plan is valuable for the user's specific situation. Call this IMMEDIATELY after generating the plan card.",
          parameters: {
            type: "object",
            properties: {
              bullets: {
                type: "array",
                items: { type: "string" },
                description: "Array of 3-4 value bullet strings, each highlighting a specific benefit tailored to their situation",
              },
            },
            required: ["bullets"],
          },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "append_social_proof",
          description: "Display a single piece of relevant social proof or statistic. Call this after the value bullets.",
          parameters: {
            type: "object",
            properties: {
              content: { type: "string", description: "A single sentence with a relevant stat or insight about career coaching effectiveness" },
            },
            required: ["content"],
          },
        },
      },
    ],
  };

  // Module tool definitions for both providers
  const MODULE_TOOLS = {
    anthropic: [
      {
        name: "append_structured_outcomes",
        description: "Display clickable pill options for the user to choose from. Use this instead of writing options as plain text.",
        input_schema: {
          type: "object" as const,
          properties: {
            prompt: { type: "string", description: "Optional prompt text above the options" },
            options: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string", description: "Optional unique ID for the option" },
                  label: { type: "string", description: "Short display text for the pill" },
                  value: { type: "string", description: "Full text sent as user message when clicked" },
                },
                required: ["label", "value"],
              },
              description: "Array of options to display as clickable pills",
            },
          },
          required: ["options"],
        },
      },
      {
        name: "set_progress",
        description: "Update the module progress indicator. Call this on every turn.",
        input_schema: {
          type: "object" as const,
          properties: {
            progress: { type: "number", description: "Progress percentage from 5 to 100" },
          },
          required: ["progress"],
        },
      },
      {
        name: "complete_module",
        description: "Call this ONCE when the module is complete. Provide a structured summary of what was covered.",
        input_schema: {
          type: "object" as const,
          properties: {
            summary: {
              type: "object",
              properties: {
                insights: {
                  type: "array",
                  items: { type: "string" },
                  description: "Key insights from the module (3-5 items)",
                },
                assessment: { type: "string", description: "2-3 sentence summary of what was covered" },
                takeaway: { type: "string", description: "One concrete insight they can carry forward" },
              },
              required: ["insights", "assessment", "takeaway"],
            },
          },
          required: ["summary"],
        },
      },
    ],
    openai: [
      {
        type: "function" as const,
        function: {
          name: "append_structured_outcomes",
          description: "Display clickable pill options for the user to choose from. Use this instead of writing options as plain text.",
          parameters: {
            type: "object",
            properties: {
              prompt: { type: "string", description: "Optional prompt text above the options" },
              options: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string", description: "Optional unique ID for the option" },
                    label: { type: "string", description: "Short display text for the pill" },
                    value: { type: "string", description: "Full text sent as user message when clicked" },
                  },
                  required: ["label", "value"],
                },
                description: "Array of options to display as clickable pills",
              },
            },
            required: ["options"],
          },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "set_progress",
          description: "Update the module progress indicator. Call this on every turn.",
          parameters: {
            type: "object",
            properties: {
              progress: { type: "number", description: "Progress percentage from 5 to 100" },
            },
            required: ["progress"],
          },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "complete_module",
          description: "Call this ONCE when the module is complete. Provide a structured summary of what was covered.",
          parameters: {
            type: "object",
            properties: {
              summary: {
                type: "object",
                properties: {
                  insights: {
                    type: "array",
                    items: { type: "string" },
                    description: "Key insights from the module (3-5 items)",
                  },
                  assessment: { type: "string", description: "2-3 sentence summary of what was covered" },
                  takeaway: { type: "string", description: "One concrete insight they can carry forward" },
                },
                required: ["insights", "assessment", "takeaway"],
              },
            },
            required: ["summary"],
          },
        },
      },
    ],
  };

  // Helper to call the interview LLM with tool support
  async function callInterviewLLM(
    transcript: { role: string; content: string }[],
    sessionToken?: string,
    userId?: string
  ) {
    if (!useAnthropic && !process.env.OPENAI_API_KEY) {
      throw new Error("No AI API key configured");
    }

    // Check if user sent "testskip" command
    const lastUserMessage = [...transcript].reverse().find((t) => t.role === "user");
    const isTestSkip = lastUserMessage?.content?.toLowerCase().trim() === "testskip";

    const testSkipPrompt = isTestSkip
      ? `

IMPORTANT OVERRIDE - TESTSKIP MODE:
The user has entered "testskip" which is a testing command. Generate the full plan card and interview complete markers.
`
      : "";

    let reply: string = "";
    const systemPromptToUse = INTERVIEW_SYSTEM_PROMPT + testSkipPrompt;
    
    // Calculate afterMessageIndex: transcript.length is the index where the assistant message will be appended.
    // Events (like structured_outcomes) should render AFTER the assistant message, not after the user message.
    // Special case: title_card uses -1 to appear before all messages.
    const afterMessageIndex = transcript.length;

    if (useAnthropic && anthropic) {
      const claudeMessages: any[] = [];
      for (const turn of transcript) {
        if (turn?.role && turn?.content) {
          claudeMessages.push({
            role: turn.role as "user" | "assistant",
            content: turn.content,
          });
        }
      }
      if (transcript.length === 0) {
        claudeMessages.push({ role: "user", content: "Start the interview. Ask your first question." });
      }
      
      // Loop to handle tool calls until we get a final text response
      let maxIterations = 5;
      while (maxIterations-- > 0) {
        const response = await anthropic.messages.create({
          model: "claude-sonnet-4-5",
          max_tokens: 2048,
          system: systemPromptToUse,
          messages: claudeMessages,
          tools: interviewTools.anthropic,
        });
        
        // Collect tool uses and text from response
        const toolUses: { id: string; name: string; input: any }[] = [];
        let textContent = "";
        
        for (const block of response.content) {
          if (block.type === "text") {
            textContent += block.text;
          } else if (block.type === "tool_use") {
            toolUses.push({ id: block.id, name: block.name, input: block.input });
          }
        }
        
        // If no tool calls, we're done
        if (toolUses.length === 0) {
          reply = textContent;
          break;
        }
        
        // Process tool calls and build tool results
        const toolResults: { type: "tool_result"; tool_use_id: string; content: string }[] = [];
        
        for (const toolUse of toolUses) {
          const toolInput = toolUse.input as { title: string; subtitle?: string };
          
          if ((toolUse.name === "append_title_card" || toolUse.name === "append_section_header") && sessionToken) {
            const eventType = toolUse.name === "append_title_card" 
              ? "chat.title_card_added" 
              : "chat.section_header_added";
            
            // Idempotency: skip duplicate title cards
            let skipped = false;
            if (toolUse.name === "append_title_card") {
              const existingEvents = await storage.listInterviewEvents(sessionToken);
              if (existingEvents.some(e => e.type === "chat.title_card_added")) {
                console.log(`[INTERVIEW_TOOL] Skipping duplicate title card for session ${sessionToken}`);
                skipped = true;
              }
            }
            
            if (!skipped) {
              // Title card always uses -1 (before all messages), other headers use afterMessageIndex
              const eventAfterIndex = toolUse.name === "append_title_card" ? -1 : afterMessageIndex;
              const payload: AppEventPayload = {
                render: { afterMessageIndex: eventAfterIndex },
                title: toolInput.title,
                subtitle: toolInput.subtitle,
              };
              
              await storage.appendInterviewEvent(sessionToken, eventType, payload);
              console.log(`[INTERVIEW_TOOL] Appended ${eventType} for session ${sessionToken}`);
            }
          } else if (toolUse.name === "set_provided_name" && userId) {
            const nameInput = toolUse.input as { name: string };
            const rawName = nameInput.name;
            const name = rawName?.trim();
            
            if (process.env.NODE_ENV !== "production") {
              console.log(`[INTERVIEW_TOOL] set_provided_name called with input="${rawName}", trimmed="${name}"`);
            }
            
            // Validate name: 1-50 chars, not all punctuation
            if (name && name.length >= 1 && name.length <= 50 && /[a-zA-Z0-9]/.test(name)) {
              // Idempotency: skip if user already has a providedName
              const existingUser = await storage.getUser(userId);
              if (existingUser?.providedName) {
                console.log(`[INTERVIEW_TOOL] Skipping set_provided_name - user already has providedName="${existingUser.providedName}"`);
              } else {
                await storage.updateUser(userId, { providedName: name });
                console.log(`[INTERVIEW_TOOL] Persisted providedName="${name}" for user ${userId}`);
                
                // Append event for client tracking
                if (sessionToken) {
                  await storage.appendInterviewEvent(sessionToken, "user.provided_name_set", {
                    render: { afterMessageIndex },
                    name,
                  });
                  console.log(`[INTERVIEW_TOOL] Appended user.provided_name_set event with name="${name}"`);
                }
              }
            } else {
              console.log(`[INTERVIEW_TOOL] Rejected invalid name: "${name}"`);
            }
          } else if (toolUse.name === "append_structured_outcomes" && sessionToken) {
            const outcomesInput = toolUse.input as { prompt?: string; options: { id?: string; label: string; value: string }[] };
            
            // Validate options array
            if (!Array.isArray(outcomesInput.options) || outcomesInput.options.length === 0) {
              console.log(`[INTERVIEW_TOOL] Skipping structured_outcomes - invalid or empty options`);
            } else {
              // Validate each option has required fields
              const validOptions = outcomesInput.options.filter(opt => 
                opt && typeof opt.label === "string" && opt.label.trim() && 
                typeof opt.value === "string" && opt.value.trim()
              );
              
              if (validOptions.length === 0) {
                console.log(`[INTERVIEW_TOOL] Skipping structured_outcomes - no valid options`);
              } else {
                // Generate IDs for options that don't have them
                const optionsWithIds = validOptions.map((opt, idx) => ({
                  id: opt.id || `opt_${Date.now()}_${idx}`,
                  label: opt.label.trim(),
                  value: opt.value.trim(),
                }));
                
                await storage.appendInterviewEvent(sessionToken, "chat.structured_outcomes_added", {
                  render: { afterMessageIndex },
                  prompt: outcomesInput.prompt,
                  options: optionsWithIds,
                });
                console.log(`[INTERVIEW_TOOL] Appended structured_outcomes with ${optionsWithIds.length} options`);
              }
            }
          } else if (toolUse.name === "append_value_bullets" && sessionToken) {
            const bulletsInput = toolUse.input as { bullets: string[] };
            if (Array.isArray(bulletsInput.bullets) && bulletsInput.bullets.length > 0) {
              await storage.appendInterviewEvent(sessionToken, "chat.value_bullets_added", {
                render: { afterMessageIndex },
                bullets: bulletsInput.bullets,
              });
              console.log(`[INTERVIEW_TOOL] Appended value_bullets with ${bulletsInput.bullets.length} bullets`);
            }
          } else if (toolUse.name === "append_social_proof" && sessionToken) {
            const proofInput = toolUse.input as { content: string };
            if (proofInput.content && proofInput.content.trim()) {
              await storage.appendInterviewEvent(sessionToken, "chat.social_proof_added", {
                render: { afterMessageIndex },
                content: proofInput.content.trim(),
              });
              console.log(`[INTERVIEW_TOOL] Appended social_proof`);
            }
          } else if (toolUse.name === "finalize_interview" && sessionToken && userId) {
            await handleFinalizeInterview(sessionToken, userId, afterMessageIndex);
          }
          
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: JSON.stringify({ ok: true }),
          });
        }
        
        // Add assistant message with tool uses, then user message with tool results
        claudeMessages.push({ role: "assistant", content: response.content });
        claudeMessages.push({ role: "user", content: toolResults });
        
        // If there was text along with tool calls, capture it
        if (textContent) {
          reply = textContent;
        }
      }
    } else {
      const messages: any[] = [
        { role: "system", content: systemPromptToUse },
      ];
      for (const turn of transcript) {
        if (turn?.role && turn?.content) {
          messages.push({ role: turn.role as "user" | "assistant", content: turn.content });
        }
      }
      if (transcript.length === 0) {
        messages.push({ role: "user", content: "Start the interview. Ask your first question." });
      }
      
      // Loop to handle tool calls until we get a final text response
      let maxIterations = 5;
      while (maxIterations-- > 0) {
        const response = await openai.chat.completions.create({
          model: "gpt-4.1-mini",
          messages,
          max_completion_tokens: 1024,
          tools: interviewTools.openai,
        });
        
        const message = response.choices[0].message;
        
        // If no tool calls and we have content, we're done
        if (!message.tool_calls || message.tool_calls.length === 0) {
          if (message.content) {
            reply = message.content;
          }
          // Break if we have content OR if there are no tool calls to process
          break;
        }
        
        // Process tool calls
        const toolResults: { role: "tool"; tool_call_id: string; content: string }[] = [];
        
        for (const toolCall of message.tool_calls) {
          if (toolCall.type !== "function") continue;
          const toolName = (toolCall as any).function?.name;
          const toolArgs = (toolCall as any).function?.arguments;
          if (!toolName || !toolArgs) continue;
          const toolInput = JSON.parse(toolArgs) as { title: string; subtitle?: string };
          
          if ((toolName === "append_title_card" || toolName === "append_section_header") && sessionToken) {
            const eventType = toolName === "append_title_card" 
              ? "chat.title_card_added" 
              : "chat.section_header_added";
            
            // Idempotency: skip duplicate title cards
            let skipped = false;
            if (toolName === "append_title_card") {
              const existingEvents = await storage.listInterviewEvents(sessionToken);
              if (existingEvents.some(e => e.type === "chat.title_card_added")) {
                console.log(`[INTERVIEW_TOOL] Skipping duplicate title card for session ${sessionToken}`);
                skipped = true;
              }
            }
            
            if (!skipped) {
              // Title card always uses -1 (before all messages), other headers use afterMessageIndex
              const eventAfterIndex = toolName === "append_title_card" ? -1 : afterMessageIndex;
              const payload: AppEventPayload = {
                render: { afterMessageIndex: eventAfterIndex },
                title: toolInput.title,
                subtitle: toolInput.subtitle,
              };
              
              await storage.appendInterviewEvent(sessionToken, eventType, payload);
              console.log(`[INTERVIEW_TOOL] Appended ${eventType} for session ${sessionToken}`);
            }
          } else if (toolName === "set_provided_name" && userId) {
            const nameInput = JSON.parse(toolArgs) as { name: string };
            const rawName = nameInput.name;
            const name = rawName?.trim();
            
            if (process.env.NODE_ENV !== "production") {
              console.log(`[INTERVIEW_TOOL] set_provided_name called with input="${rawName}", trimmed="${name}"`);
            }
            
            // Validate name: 1-50 chars, not all punctuation
            if (name && name.length >= 1 && name.length <= 50 && /[a-zA-Z0-9]/.test(name)) {
              // Idempotency: skip if user already has a providedName
              const existingUser = await storage.getUser(userId);
              if (existingUser?.providedName) {
                console.log(`[INTERVIEW_TOOL] Skipping set_provided_name - user already has providedName="${existingUser.providedName}"`);
              } else {
                await storage.updateUser(userId, { providedName: name });
                console.log(`[INTERVIEW_TOOL] Persisted providedName="${name}" for user ${userId}`);
                
                // Append event for client tracking
                if (sessionToken) {
                  await storage.appendInterviewEvent(sessionToken, "user.provided_name_set", {
                    render: { afterMessageIndex },
                    name,
                  });
                  console.log(`[INTERVIEW_TOOL] Appended user.provided_name_set event with name="${name}"`);
                }
              }
            } else {
              console.log(`[INTERVIEW_TOOL] Rejected invalid name: "${name}"`);
            }
          } else if (toolName === "append_structured_outcomes" && sessionToken) {
            try {
              const outcomesInput = JSON.parse(toolArgs) as { prompt?: string; options: { id?: string; label: string; value: string }[] };
              
              // Validate options array
              if (!Array.isArray(outcomesInput.options) || outcomesInput.options.length === 0) {
                console.log(`[INTERVIEW_TOOL] Skipping structured_outcomes - invalid or empty options`);
              } else {
                // Validate each option has required fields
                const validOptions = outcomesInput.options.filter(opt => 
                  opt && typeof opt.label === "string" && opt.label.trim() && 
                  typeof opt.value === "string" && opt.value.trim()
                );
                
                if (validOptions.length === 0) {
                  console.log(`[INTERVIEW_TOOL] Skipping structured_outcomes - no valid options`);
                } else {
                  // Generate IDs for options that don't have them
                  const optionsWithIds = validOptions.map((opt, idx) => ({
                    id: opt.id || `opt_${Date.now()}_${idx}`,
                    label: opt.label.trim(),
                    value: opt.value.trim(),
                  }));
                  
                  await storage.appendInterviewEvent(sessionToken, "chat.structured_outcomes_added", {
                    render: { afterMessageIndex },
                    prompt: outcomesInput.prompt,
                    options: optionsWithIds,
                  });
                  console.log(`[INTERVIEW_TOOL] Appended structured_outcomes with ${optionsWithIds.length} options`);
                }
              }
            } catch (parseError: any) {
              console.log(`[INTERVIEW_TOOL] Failed to parse structured_outcomes args: ${parseError.message}`);
            }
          } else if (toolName === "append_value_bullets" && sessionToken) {
            try {
              const bulletsInput = JSON.parse(toolArgs) as { bullets: string[] };
              if (Array.isArray(bulletsInput.bullets) && bulletsInput.bullets.length > 0) {
                await storage.appendInterviewEvent(sessionToken, "chat.value_bullets_added", {
                  render: { afterMessageIndex },
                  bullets: bulletsInput.bullets,
                });
                console.log(`[INTERVIEW_TOOL] Appended value_bullets with ${bulletsInput.bullets.length} bullets`);
              }
            } catch (parseError: any) {
              console.log(`[INTERVIEW_TOOL] Failed to parse value_bullets args: ${parseError.message}`);
            }
          } else if (toolName === "append_social_proof" && sessionToken) {
            try {
              const proofInput = JSON.parse(toolArgs) as { content: string };
              if (proofInput.content && proofInput.content.trim()) {
                await storage.appendInterviewEvent(sessionToken, "chat.social_proof_added", {
                  render: { afterMessageIndex },
                  content: proofInput.content.trim(),
                });
                console.log(`[INTERVIEW_TOOL] Appended social_proof`);
              }
            } catch (parseError: any) {
              console.log(`[INTERVIEW_TOOL] Failed to parse social_proof args: ${parseError.message}`);
            }
          } else if (toolName === "finalize_interview" && sessionToken && userId) {
            await handleFinalizeInterview(sessionToken, userId, afterMessageIndex);
          }
          
          toolResults.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify({ ok: true }),
          });
        }
        
        // Add assistant message with tool calls, then tool results
        messages.push(message);
        messages.push(...toolResults);
        
        // If there was text along with tool calls, capture it
        if (message.content) {
          reply = message.content;
        }
      }
    }

    // Empty reply detection and retry (prevent empty assistant messages)
    const FALLBACK_MESSAGE = "Got it — keep going.";
    
    if (!reply || !reply.trim()) {
      console.log(`[INTERVIEW_LLM] Empty reply detected, attempting single retry without tools`);
      
      // Single retry without tools to get a text response
      try {
        if (useAnthropic && anthropic) {
          // Build messages for retry (simplified - just ask for text)
          const retryMessages: any[] = [];
          for (const turn of transcript) {
            if (turn?.role && turn?.content) {
              retryMessages.push({
                role: turn.role as "user" | "assistant",
                content: turn.content,
              });
            }
          }
          if (retryMessages.length === 0) {
            retryMessages.push({ role: "user", content: "Start the interview. Ask your first question." });
          }
          
          // Add instruction to just provide text
          retryMessages.push({
            role: "user",
            content: "[System: Please provide your response as text only, do not call any tools.]"
          });
          
          const retryResponse = await anthropic.messages.create({
            model: "claude-sonnet-4-5",
            max_tokens: 1024,
            system: INTERVIEW_SYSTEM_PROMPT,
            messages: retryMessages,
            // No tools on retry to force text response
          });
          
          for (const block of retryResponse.content) {
            if (block.type === "text" && block.text.trim()) {
              reply = block.text;
              console.log(`[INTERVIEW_LLM] Retry succeeded, reply length=${reply.length}`);
              break;
            }
          }
        } else if (openai) {
          // OpenAI retry without tools
          const retryMessages: any[] = [
            { role: "system", content: INTERVIEW_SYSTEM_PROMPT },
          ];
          for (const turn of transcript) {
            if (turn?.role && turn?.content) {
              retryMessages.push({ role: turn.role, content: turn.content });
            }
          }
          if (transcript.length === 0) {
            retryMessages.push({ role: "user", content: "Start the interview. Ask your first question." });
          }
          retryMessages.push({
            role: "user",
            content: "[System: Please provide your response as text only, do not call any tools.]"
          });
          
          const retryResponse = await openai.chat.completions.create({
            model: "gpt-4.1-mini",
            messages: retryMessages,
            max_completion_tokens: 1024,
            // No tools on retry
          });
          
          if (retryResponse.choices[0].message.content?.trim()) {
            reply = retryResponse.choices[0].message.content;
            console.log(`[INTERVIEW_LLM] Retry succeeded, reply length=${reply.length}`);
          }
        }
      } catch (retryError: any) {
        console.log(`[INTERVIEW_LLM] Retry failed: ${retryError.message}`);
      }
      
      // Final fallback if still empty
      if (!reply || !reply.trim()) {
        reply = FALLBACK_MESSAGE;
        console.log(`[INTERVIEW_LLM] Using fallback message after retry failed`);
      }
    }

    // Parse plancard JSON block from reply (new format replaces [[PLAN_CARD]] tokens)
    let planCard: any = null;
    const plancardMatch = reply.match(/```plancard\s*([\s\S]*?)\s*```/);
    if (plancardMatch) {
      try {
        planCard = JSON.parse(plancardMatch[1]);
        console.log(`[INTERVIEW] Parsed plancard JSON with ${planCard.modules?.length || 0} modules`);
      } catch (e: any) {
        console.log(`[INTERVIEW] Failed to parse plancard JSON: ${e.message}`);
      }
    }

    // Strip plancard block from visible output
    reply = reply.replace(/```plancard[\s\S]*?```/g, "").trim();

    return { reply, planCard };
  }

  // Streaming version of callInterviewLLM with SSE support
  async function callInterviewLLMStream(
    transcript: { role: string; content: string }[],
    sessionToken: string | undefined,
    userId: string | undefined,
    sendEvent: (type: string, data: any) => void
  ) {
    if (!useAnthropic && !process.env.OPENAI_API_KEY) {
      throw new Error("No AI API key configured");
    }

    // Check if user sent "testskip" command
    const lastUserMessage = [...transcript].reverse().find((t) => t.role === "user");
    const isTestSkip = lastUserMessage?.content?.toLowerCase().trim() === "testskip";

    const testSkipPrompt = isTestSkip
      ? `

IMPORTANT OVERRIDE - TESTSKIP MODE:
The user has entered "testskip" which is a testing command. Generate the full plan card and interview complete markers.
`
      : "";

    let reply: string = "";
    const systemPromptToUse = INTERVIEW_SYSTEM_PROMPT + testSkipPrompt;

    // Calculate afterMessageIndex: transcript.length is the index where the assistant message will be appended.
    // Events (like structured_outcomes) should render AFTER the assistant message, not after the user message.
    // Special case: title_card uses -1 to appear before all messages.
    const afterMessageIndex = transcript.length;

    if (useAnthropic && anthropic) {
      const claudeMessages: any[] = [];
      for (const turn of transcript) {
        if (turn?.role && turn?.content) {
          claudeMessages.push({
            role: turn.role as "user" | "assistant",
            content: turn.content,
          });
        }
      }
      if (transcript.length === 0) {
        claudeMessages.push({ role: "user", content: "Start the interview. Ask your first question." });
      }

      // Loop to handle tool calls until we get a final text response
      let maxIterations = 5;
      while (maxIterations-- > 0) {
        const stream = await anthropic.messages.stream({
          model: "claude-sonnet-4-5",
          max_tokens: 2048,
          system: systemPromptToUse,
          messages: claudeMessages,
          tools: interviewTools.anthropic,
        });

        // Accumulate chunks
        let fullText = "";
        const toolUses: { id: string; name: string; input: any; index: number }[] = [];
        let currentToolUse: { id: string; name: string; input: string; index: number } | null = null;

        for await (const event of stream) {
          if (event.type === 'content_block_start') {
            if (event.content_block.type === 'tool_use') {
              currentToolUse = {
                id: event.content_block.id,
                name: event.content_block.name,
                input: '',
                index: event.index,
              };
            }
          } else if (event.type === 'content_block_delta') {
            if (event.delta.type === 'text_delta') {
              const textDelta = event.delta.text;
              fullText += textDelta;
              // Send streaming text chunk to client
              sendEvent('text_delta', { content: textDelta });
            } else if (event.delta.type === 'input_json_delta' && currentToolUse) {
              // Accumulate tool input JSON
              currentToolUse.input += event.delta.partial_json;
            }
          } else if (event.type === 'content_block_stop') {
            if (currentToolUse) {
              // Tool use complete - parse input and add to list
              try {
                const parsedInput = JSON.parse(currentToolUse.input);
                toolUses.push({
                  id: currentToolUse.id,
                  name: currentToolUse.name,
                  input: parsedInput,
                  index: currentToolUse.index,
                });
              } catch (e: any) {
                console.error(`[STREAM] Failed to parse tool input: ${e.message}`);
              }
              currentToolUse = null;
            }
          }
        }

        // If no tool calls, we're done
        if (toolUses.length === 0) {
          reply = fullText;
          break;
        }

        // Process tool calls and build tool results
        const toolResults: { type: "tool_result"; tool_use_id: string; content: string }[] = [];

        for (const toolUse of toolUses) {
          const toolInput = toolUse.input as { title: string; subtitle?: string };

          if ((toolUse.name === "append_title_card" || toolUse.name === "append_section_header") && sessionToken) {
            const eventType = toolUse.name === "append_title_card"
              ? "chat.title_card_added"
              : "chat.section_header_added";

            // Idempotency: skip duplicate title cards
            let skipped = false;
            if (toolUse.name === "append_title_card") {
              const existingEvents = await storage.listInterviewEvents(sessionToken);
              if (existingEvents.some(e => e.type === "chat.title_card_added")) {
                console.log(`[INTERVIEW_TOOL_STREAM] Skipping duplicate title card for session ${sessionToken}`);
                skipped = true;
              }
            }

            if (!skipped) {
              // Title card always uses -1 (before all messages), other headers use afterMessageIndex
              const eventAfterIndex = toolUse.name === "append_title_card" ? -1 : afterMessageIndex;
              const payload: AppEventPayload = {
                render: { afterMessageIndex: eventAfterIndex },
                title: toolInput.title,
                subtitle: toolInput.subtitle,
              };

              await storage.appendInterviewEvent(sessionToken, eventType, payload);
              console.log(`[INTERVIEW_TOOL_STREAM] Appended ${eventType} for session ${sessionToken}`);

              // Notify client about event creation
              sendEvent('tool_executed', {
                toolName: toolUse.name,
                eventType,
                refetchEvents: true,
              });
            }
          } else if (toolUse.name === "set_provided_name" && userId) {
            const nameInput = toolUse.input as { name: string };
            const rawName = nameInput.name;
            const name = rawName?.trim();

            if (process.env.NODE_ENV !== "production") {
              console.log(`[INTERVIEW_TOOL_STREAM] set_provided_name called with input="${rawName}", trimmed="${name}"`);
            }

            // Validate name: 1-50 chars, not all punctuation
            if (name && name.length >= 1 && name.length <= 50 && /[a-zA-Z0-9]/.test(name)) {
              // Idempotency: skip if user already has a providedName
              const existingUser = await storage.getUser(userId);
              if (existingUser?.providedName) {
                console.log(`[INTERVIEW_TOOL_STREAM] Skipping set_provided_name - user already has providedName="${existingUser.providedName}"`);
              } else {
                await storage.updateUser(userId, { providedName: name });
                console.log(`[INTERVIEW_TOOL_STREAM] Persisted providedName="${name}" for user ${userId}`);

                // Append event for client tracking
                if (sessionToken) {
                  await storage.appendInterviewEvent(sessionToken, "user.provided_name_set", {
                    render: { afterMessageIndex },
                    name,
                  });
                  console.log(`[INTERVIEW_TOOL_STREAM] Appended user.provided_name_set event with name="${name}"`);

                  // Notify client
                  sendEvent('tool_executed', {
                    toolName: toolUse.name,
                    eventType: 'user.provided_name_set',
                    refetchEvents: true,
                  });
                }
              }
            } else {
              console.log(`[INTERVIEW_TOOL_STREAM] Rejected invalid name: "${name}"`);
            }
          } else if (toolUse.name === "append_structured_outcomes" && sessionToken) {
            const outcomesInput = toolUse.input as { prompt?: string; options: { id?: string; label: string; value: string }[] };

            // Validate options array
            if (!Array.isArray(outcomesInput.options) || outcomesInput.options.length === 0) {
              console.log(`[INTERVIEW_TOOL_STREAM] Skipping structured_outcomes - invalid or empty options`);
            } else {
              // Validate each option has required fields
              const validOptions = outcomesInput.options.filter(opt =>
                opt && typeof opt.label === "string" && opt.label.trim() &&
                typeof opt.value === "string" && opt.value.trim()
              );

              if (validOptions.length === 0) {
                console.log(`[INTERVIEW_TOOL_STREAM] Skipping structured_outcomes - no valid options`);
              } else {
                // Generate IDs for options that don't have them
                const optionsWithIds = validOptions.map((opt, idx) => ({
                  id: opt.id || `opt_${Date.now()}_${idx}`,
                  label: opt.label.trim(),
                  value: opt.value.trim(),
                }));

                await storage.appendInterviewEvent(sessionToken, "chat.structured_outcomes_added", {
                  render: { afterMessageIndex },
                  prompt: outcomesInput.prompt,
                  options: optionsWithIds,
                });
                console.log(`[INTERVIEW_TOOL_STREAM] Appended structured_outcomes with ${optionsWithIds.length} options`);

                // Notify client
                sendEvent('tool_executed', {
                  toolName: toolUse.name,
                  eventType: 'chat.structured_outcomes_added',
                  refetchEvents: true,
                });
              }
            }
          } else if (toolUse.name === "append_value_bullets" && sessionToken) {
            const bulletsInput = toolUse.input as { bullets: string[] };
            if (Array.isArray(bulletsInput.bullets) && bulletsInput.bullets.length > 0) {
              await storage.appendInterviewEvent(sessionToken, "chat.value_bullets_added", {
                render: { afterMessageIndex },
                bullets: bulletsInput.bullets,
              });
              console.log(`[INTERVIEW_TOOL_STREAM] Appended value_bullets with ${bulletsInput.bullets.length} bullets`);

              // Notify client
              sendEvent('tool_executed', {
                toolName: toolUse.name,
                eventType: 'chat.value_bullets_added',
                refetchEvents: true,
              });
            }
          } else if (toolUse.name === "append_social_proof" && sessionToken) {
            const proofInput = toolUse.input as { content: string };
            if (proofInput.content && proofInput.content.trim()) {
              await storage.appendInterviewEvent(sessionToken, "chat.social_proof_added", {
                render: { afterMessageIndex },
                content: proofInput.content.trim(),
              });
              console.log(`[INTERVIEW_TOOL_STREAM] Appended social_proof`);

              // Notify client
              sendEvent('tool_executed', {
                toolName: toolUse.name,
                eventType: 'chat.social_proof_added',
                refetchEvents: true,
              });
            }
          } else if (toolUse.name === "finalize_interview" && sessionToken && userId) {
            await handleFinalizeInterview(sessionToken, userId, afterMessageIndex);

            // Notify client
            sendEvent('tool_executed', {
              toolName: toolUse.name,
              eventType: 'chat.final_next_steps_added',
              refetchEvents: true,
            });
          }

          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: JSON.stringify({ ok: true }),
          });
        }

        // Build response content for next turn
        const responseContent: any[] = [];

        // Add text blocks and tool uses in order
        if (fullText) {
          responseContent.push({ type: 'text', text: fullText });
        }
        for (const toolUse of toolUses) {
          responseContent.push({
            type: 'tool_use',
            id: toolUse.id,
            name: toolUse.name,
            input: toolUse.input,
          });
        }

        // Add assistant message with tool uses, then user message with tool results
        claudeMessages.push({ role: "assistant", content: responseContent });
        claudeMessages.push({ role: "user", content: toolResults });

        // If there was text along with tool calls, capture it
        if (fullText) {
          reply = fullText;
        }
      }
    } else {
      // OpenAI streaming not implemented yet - fall back to non-streaming
      // For now, we'll call the regular callInterviewLLM and send the result as a single chunk
      console.log("[STREAM] OpenAI streaming not implemented, using non-streaming fallback");
      const result = await callInterviewLLM(transcript, sessionToken, userId);
      sendEvent('text_delta', { content: result.reply });
      return result;
    }

    // Empty reply detection and retry (prevent empty assistant messages)
    const FALLBACK_MESSAGE = "Got it — keep going.";

    if (!reply || !reply.trim()) {
      console.log(`[INTERVIEW_LLM_STREAM] Empty reply detected, attempting single retry without tools`);

      // Single retry without tools to get a text response
      try {
        if (useAnthropic && anthropic) {
          // Build messages for retry (simplified - just ask for text)
          const retryMessages: any[] = [];
          for (const turn of transcript) {
            if (turn?.role && turn?.content) {
              retryMessages.push({
                role: turn.role as "user" | "assistant",
                content: turn.content,
              });
            }
          }
          if (retryMessages.length === 0) {
            retryMessages.push({ role: "user", content: "Start the interview. Ask your first question." });
          }

          // Add instruction to just provide text
          retryMessages.push({
            role: "user",
            content: "[System: Please provide your response as text only, do not call any tools.]"
          });

          const stream = await anthropic.messages.stream({
            model: "claude-sonnet-4-5",
            max_tokens: 1024,
            system: INTERVIEW_SYSTEM_PROMPT,
            messages: retryMessages,
            // No tools on retry to force text response
          });

          let retryText = "";
          for await (const event of stream) {
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
              retryText += event.delta.text;
              sendEvent('text_delta', { content: event.delta.text });
            }
          }

          if (retryText.trim()) {
            reply = retryText;
            console.log(`[INTERVIEW_LLM_STREAM] Retry succeeded, reply length=${reply.length}`);
          }
        }
      } catch (retryError: any) {
        console.log(`[INTERVIEW_LLM_STREAM] Retry failed: ${retryError.message}`);
      }

      // Final fallback if still empty
      if (!reply || !reply.trim()) {
        reply = FALLBACK_MESSAGE;
        sendEvent('text_delta', { content: FALLBACK_MESSAGE });
        console.log(`[INTERVIEW_LLM_STREAM] Using fallback message after retry failed`);
      }
    }

    // Parse plancard JSON block from reply (new format replaces [[PLAN_CARD]] tokens)
    let planCard: any = null;
    const plancardMatch = reply.match(/```plancard\s*([\s\S]*?)\s*```/);
    if (plancardMatch) {
      try {
        planCard = JSON.parse(plancardMatch[1]);
        console.log(`[INTERVIEW_STREAM] Parsed plancard JSON with ${planCard.modules?.length || 0} modules`);
      } catch (e: any) {
        console.log(`[INTERVIEW_STREAM] Failed to parse plancard JSON: ${e.message}`);
      }
    }

    // Strip plancard block from visible output
    reply = reply.replace(/```plancard[\s\S]*?```/g, "").trim();

    return { reply, planCard };
  }

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

      console.log(
        `[REVISION] ts=${new Date().toISOString()} user=${user.id} revisionCount=${currentCount + 1}`,
      );
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
        console.log(
          `[DOSSIER_FALLBACK] ts=${new Date().toISOString()} user=anonymous status=rejected_not_authenticated`,
        );
        return res.status(401).json({ error: "Not authenticated" });
      }

      console.log(
        `[DOSSIER_FALLBACK] ts=${new Date().toISOString()} user=${user.id} status=started`,
      );

      // Get the user's transcript from the database
      const transcript = await storage.getTranscriptByUserId(user.id);
      if (
        !transcript ||
        !transcript.transcript ||
        !Array.isArray(transcript.transcript)
      ) {
        const durationMs = Date.now() - requestStart;
        console.log(
          `[DOSSIER_FALLBACK] ts=${new Date().toISOString()} user=${user.id} status=failed_no_transcript durationMs=${durationMs}`,
        );
        return res.status(400).json({ error: "No interview transcript found" });
      }

      // Check if dossier already exists
      if (transcript.clientDossier) {
        const durationMs = Date.now() - requestStart;
        console.log(
          `[DOSSIER_FALLBACK] ts=${new Date().toISOString()} user=${user.id} status=already_exists durationMs=${durationMs}`,
        );
        return res.json({ ok: true, message: "Dossier already exists" });
      }

      const messageCount = transcript.transcript.length;
      console.log(
        `[DOSSIER_FALLBACK] ts=${new Date().toISOString()} user=${user.id} status=generating messageCount=${messageCount}`,
      );

      // Use the shared helper with retry logic
      const transcriptMessages = transcript.transcript as {
        role: string;
        content: string;
      }[];
      const generateStart = Date.now();
      const result = await generateAndSaveDossier(user.id, transcriptMessages);
      const generateDurationMs = Date.now() - generateStart;

      const durationMs = Date.now() - requestStart;

      if (result.status === "in_progress") {
        // Generation is already in progress (another request is handling it)
        // Return success - the polling will pick up the dossier when it's ready
        console.log(
          `[DOSSIER_FALLBACK] ts=${new Date().toISOString()} user=${user.id} status=in_progress lockAgeMs=${result.lockAgeMs} durationMs=${durationMs}`,
        );
        return res.json({
          ok: true,
          message: "Generation in progress",
          inProgress: true,
        });
      }

      if (result.status === "failed") {
        console.error(
          `[DOSSIER_FALLBACK] ts=${new Date().toISOString()} user=${user.id} status=failed generateDurationMs=${generateDurationMs} durationMs=${durationMs} error="${result.error}"`,
        );
        return res
          .status(500)
          .json({ error: "Failed to generate dossier after retries" });
      }

      console.log(
        `[DOSSIER_FALLBACK] ts=${new Date().toISOString()} user=${user.id} status=success generateDurationMs=${generateDurationMs} durationMs=${durationMs}`,
      );
      res.json({ ok: true });
    } catch (error: any) {
      const durationMs = Date.now() - requestStart;
      console.error(
        `[DOSSIER_FALLBACK] ts=${new Date().toISOString()} user=${(req.user as any)?.id || "unknown"} status=error durationMs=${durationMs} error="${error.message}"`,
      );
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

      const {
        moduleNumber,
        moduleName,
        transcript: moduleTranscript,
      } = req.body;

      if (!moduleNumber || !moduleTranscript) {
        return res.status(400).json({ error: "Missing module data" });
      }

      // Get the user's current dossier
      const userTranscript = await storage.getTranscriptByUserId(user.id);
      if (!userTranscript?.clientDossier) {
        return res.status(400).json({ error: "No dossier found" });
      }

      console.log(
        `Updating dossier with module ${moduleNumber} for user ${user.id}...`,
      );

      // Generate the module analysis
      const analysis = await generateModuleAnalysis(
        moduleNumber,
        moduleName || `Module ${moduleNumber}`,
        moduleTranscript,
      );

      if (!analysis) {
        return res
          .status(500)
          .json({ error: "Failed to generate module analysis" });
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
          ...userTranscript.clientDossier.moduleRecords.filter(
            (m) => m.moduleNumber !== moduleNumber,
          ),
          moduleRecord,
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

        await storage.updateTranscript(
          userTranscript.sessionToken,
          moduleCompleteUpdate,
        );
        console.log(
          `Module ${moduleNumber} marked as complete for user ${user.id}`,
        );

        // Auto-start Serious Plan generation when Module 3 completes
        if (moduleNumber === 3) {
          // Check if plan already exists before starting
          const existingPlan = await storage.getSeriousPlanByUserId(user.id);
          if (existingPlan) {
            console.log(
              `[SERIOUS_PLAN] ts=${new Date().toISOString()} user=${user.id} status=skipped reason=plan_exists planId=${existingPlan.id} planStatus=${existingPlan.status}`,
            );
          } else {
            // Fire and forget - retry mechanism handles missing data
            attemptSeriousPlanInitWithRetry(
              user.id,
              userTranscript.sessionToken,
              1, // Start at attempt 1
            );
          }
        }
      }

      console.log(
        `Dossier updated with module ${moduleNumber} for user ${user.id}`,
      );
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
      const lastUserMessage = [...transcript]
        .reverse()
        .find((t: any) => t.role === "user");
      const isTestSkip =
        lastUserMessage?.content?.toLowerCase().trim() === "testskip";

      // Build testskip prompt override if needed
      const testSkipPrompt = isTestSkip
        ? `

IMPORTANT OVERRIDE - TESTSKIP MODE:
The user has entered "testskip" which is a testing command. You must now:
1. Review the conversation so far
2. Fabricate plausible, realistic answers for ALL remaining interview questions
3. Call the required tools to complete the interview

Generate everything in THIS SINGLE RESPONSE. Use fabricated but realistic details:
- Name: Sarah Chen
- Role: Senior Product Manager at a mid-size tech company
- Tenure: 3 years
- Situation: Feeling stuck at current level, manager seems supportive in 1-on-1s but doesn't advocate for promotions
- Constraints: Partner expecting first child in 6 months, needs stable health insurance
- Goals: Either get promoted here or find a role with more growth opportunity

In testskip mode, you MUST:
1. Call set_provided_name with name "Sarah"
2. Call append_value_bullets with these bullets:
   - "Get clarity on whether your manager is actually in your corner — we'll decode the 'supportive in 1-on-1s but doesn't advocate in calibrations' dynamic"
   - "Make a decision that accounts for your family timeline — this isn't just career moves, it's about planning around parental leave"
   - "Stop spinning on 'am I good enough?' — the vague feedback is designed to keep you guessing; we'll break that cycle"
3. Call append_social_proof with: "Research shows that 73% of people who feel 'stuck' at their level say the biggest barrier isn't skill — it's lack of clarity about what the organization actually wants."
4. Call finalize_interview to complete

Your visible message should include the plancard JSON block:

Skipping ahead for testing purposes. I've fabricated a realistic client story.

\`\`\`plancard
{
  "name": "Sarah",
  "modules": [
    {"name": "The Performance Paradox", "objective": "Understand why doing good work hasn't translated to advancement", "approach": "We'll examine the gap between your contributions and how they're perceived", "outcome": "Clarity on what's actually blocking your promotion"},
    {"name": "The Family Factor", "objective": "Map your options with realistic timelines and constraints", "approach": "We'll stress-test each path against your family timeline", "outcome": "A clear view of 2-3 paths that work with your life"},
    {"name": "The Decisive Move", "objective": "Build a concrete action plan for the next 90 days", "approach": "We'll sequence the conversations and decisions you need to make", "outcome": "A step-by-step plan with decision points and fallback options"}
  ],
  "careerBrief": "Senior PM at 3 years, stuck at current level despite strong performance, needs clarity before parental leave",
  "seriousPlanSummary": "Your personalized Serious Plan will include a decision framework, conversation scripts for your manager, and a 90-day action timeline.",
  "plannedArtifacts": ["decision_snapshot", "boss_conversation", "action_plan", "module_recap", "resources"]
}
\`\`\`

I've put together a personalized coaching plan for you.
`
        : "";

      let reply: string;
      const systemPromptToUse = INTERVIEW_SYSTEM_PROMPT + testSkipPrompt;

      if (useAnthropic && anthropic) {
        // Use Anthropic Claude
        const claudeMessages: {
          role: "user" | "assistant";
          content: string;
        }[] = [];

        for (const turn of transcript) {
          if (turn && turn.role && turn.content) {
            claudeMessages.push({
              role: turn.role as "user" | "assistant",
              content: turn.content,
            });
          }
        }

        if (transcript.length === 0) {
          claudeMessages.push({
            role: "user",
            content: "Start the interview. Ask your first question.",
          });
        }

        const response = await anthropic.messages.create({
          model: "claude-sonnet-4-5",
          max_tokens: 2048,
          system: systemPromptToUse,
          messages: claudeMessages,
        });

        reply =
          response.content[0].type === "text" ? response.content[0].text : "";
      } else {
        // Fall back to OpenAI
        const messages: {
          role: "system" | "user" | "assistant";
          content: string;
        }[] = [{ role: "system", content: systemPromptToUse }];

        for (const turn of transcript) {
          if (turn && turn.role && turn.content) {
            messages.push({
              role: turn.role as "user" | "assistant",
              content: turn.content,
            });
          }
        }

        if (transcript.length === 0) {
          messages.push({
            role: "user",
            content: "Start the interview. Ask your first question.",
          });
        }

        const response = await openai.chat.completions.create({
          model: "gpt-4.1-mini",
          messages,
          max_completion_tokens: isTestSkip ? 2048 : 1024,
        });

        reply = response.choices[0].message.content || "";
      }

      // Parse plancard JSON block from reply (new format replaces [[PLAN_CARD]] tokens)
      let planCard: any = null;
      const plancardMatch = reply.match(/```plancard\s*([\s\S]*?)\s*```/);
      if (plancardMatch) {
        try {
          const rawPlanCard = JSON.parse(plancardMatch[1]);
          
          // Convert plannedArtifacts array of strings to structured format
          const parseArtifacts = (artifactKeys: string[]): { key: string; title: string; type: string; description: string; importance: string }[] => {
            const artifactDefinitions: Record<string, { title: string; type: string; description: string; importance: string }> = {
              decision_snapshot: { title: "Decision Snapshot", type: "snapshot", description: "A concise summary of your situation, options, and recommended path forward", importance: "must_read" },
              action_plan: { title: "Action Plan", type: "plan", description: "A time-boxed plan with concrete steps and decision checkpoints", importance: "must_read" },
              boss_conversation: { title: "Boss Conversation Plan", type: "conversation", description: "Scripts and strategies for navigating your manager conversation", importance: "must_read" },
              partner_conversation: { title: "Partner Conversation Plan", type: "conversation", description: "Talking points for discussing this transition with your partner", importance: "recommended" },
              self_narrative: { title: "Clarity Memo", type: "narrative", description: "The story you tell yourself about this transition and what you want", importance: "recommended" },
              module_recap: { title: "Module Recap", type: "recap", description: "Key insights and decisions from each coaching session", importance: "recommended" },
              resources: { title: "Curated Resources", type: "resources", description: "Articles, books, and tools specifically chosen for your situation", importance: "optional" },
              risk_map: { title: "Risk & Fallback Map", type: "plan", description: "Identified risks with mitigation strategies and backup plans", importance: "recommended" },
              negotiation_toolkit: { title: "Negotiation Toolkit", type: "conversation", description: "Strategies and scripts for salary or terms negotiation", importance: "recommended" },
              networking_plan: { title: "Networking Plan", type: "plan", description: "A targeted approach to building connections for your next move", importance: "optional" },
            };
            return artifactKeys.map((key) => {
              const normalizedKey = key.trim().toLowerCase().replace(/\s+/g, "_");
              const def = artifactDefinitions[normalizedKey] || { title: key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()), type: "custom", description: "Custom artifact for your situation", importance: "recommended" };
              return { key: normalizedKey, ...def };
            });
          };
          
          planCard = {
            name: rawPlanCard.name || "",
            modules: rawPlanCard.modules || [],
            careerBrief: rawPlanCard.careerBrief || "",
            seriousPlanSummary: rawPlanCard.seriousPlanSummary || "Your personalized Serious Plan with tailored coaching artifacts",
            plannedArtifacts: parseArtifacts(rawPlanCard.plannedArtifacts || ["decision_snapshot", "action_plan", "module_recap", "resources"]),
          };
          console.log(`[INTERVIEW] Parsed plancard JSON with ${planCard.modules?.length || 0} modules`);
        } catch (e: any) {
          console.log(`[INTERVIEW] Failed to parse plancard JSON: ${e.message}`);
        }
      }

      // Strip plancard block from visible output
      reply = reply.replace(/```plancard[\s\S]*?```/g, "").trim();

      res.json({
        reply,
        planCard,
      });
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

### UI Tools (USE THESE FOR STRUCTURED UI ELEMENTS)

You have access to tools for injecting UI elements:

1. **append_structured_outcomes** - Use to present clickable option buttons. Call with an array of options (objects with label and value). Use this instead of writing options as plain text. Use liberally - at least every 2-3 turns.

2. **set_progress** - Call on every turn with progress percentage (5-100).

3. **complete_module** - Call ONCE when the module is complete. Provide a structured summary object with insights (array), assessment (string), and takeaway (string).

### Session Structure
1. **Opening (1 message)**: Start with a warm introduction. Call set_progress(5). Reference something specific from their interview.
2. **Deep Dive (4-6 exchanges)**: Ask questions that explore:
   - What specifically frustrates them day-to-day?
   - What aspects of the job did they used to enjoy (if any)?
   - Is the problem the role, the company, the manager, or something else?
   - What would need to change for them to want to stay?
3. **Wrap-up**: When you have a clear picture, call complete_module with a structured summary.

### First Message
On your first message, warmly introduce the module topic. Call set_progress(5).

### Progress Tracking
Call set_progress on every turn with a number from 5 to 100.`,

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

### UI Tools (USE THESE FOR STRUCTURED UI ELEMENTS)

You have access to tools for injecting UI elements:

1. **append_structured_outcomes** - Use to present clickable option buttons. Call with an array of options (objects with label and value). Use this instead of writing options as plain text. Use liberally - at least every 2-3 turns.

2. **set_progress** - Call on every turn with progress percentage (5-100).

3. **complete_module** - Call ONCE when the module is complete. Provide a structured summary object with insights (array), assessment (string), and takeaway (string).

### Session Structure
1. **Opening (1 message)**: Start with a warm intro. Call set_progress(5). Briefly recap Module 1 and introduce this module's focus.
2. **Options Exploration (4-6 exchanges)**: Ask questions that explore:
   - What are their actual options? (stay and negotiate, internal move, leave entirely)
   - What constraints are real vs. assumed?
   - What's the cost of staying another year?
   - What would make leaving worth the risk?
3. **Wrap-up**: When you've mapped their options, call complete_module with a structured summary.

### First Message
On your first message, warmly recap their situation and introduce the module topic. Call set_progress(5).

### Progress Tracking
Call set_progress on every turn with a number from 5 to 100.`,

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

### UI Tools (USE THESE FOR STRUCTURED UI ELEMENTS)

You have access to tools for injecting UI elements:

1. **append_structured_outcomes** - Use to present clickable option buttons. Call with an array of options (objects with label and value). Use this instead of writing options as plain text. Use liberally - at least every 2-3 turns.

2. **set_progress** - Call on every turn with progress percentage (5-100).

3. **complete_module** - Call ONCE when the module is complete. Provide a structured summary object with insights (array), assessment (string), and takeaway (string). **Do NOT write a personalized farewell letter or closing message** - just transition naturally to calling complete_module.

### Session Structure
1. **Opening (1 message)**: Start with a warm intro. Call set_progress(5). Briefly recap their options and which direction they're leaning.
2. **Action Planning (4-6 exchanges)**: Cover:
   - What's their timeline? What needs to happen first?
   - Who do they need to talk to and what will they say?
   - What's their backup plan if things don't go as expected?
   - What support do they need?
3. **Wrap-up**: When you have a clear action plan, call complete_module with a structured summary.

### First Message
On your first message, warmly recap where they landed and start building the plan. Call set_progress(5).

### Progress Tracking
Call set_progress on every turn with a number from 5 to 100.`,
  };

  // Helper function to format the dossier context for the AI
  function formatDossierContext(
    dossier: ClientDossier | null,
    moduleNumber: number,
  ): string {
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
${interviewAnalysis.keyFacts.map((f) => `- ${f}`).join("\n")}

**Key Relationships:**
${interviewAnalysis.relationships.map((r) => `- ${r.person} (${r.role}): ${r.dynamic}`).join("\n")}

**Emotional State:**
${interviewAnalysis.emotionalState}

**Communication Style:**
${interviewAnalysis.communicationStyle}

**Priorities:**
${interviewAnalysis.priorities.map((p) => `- ${p}`).join("\n")}

**Constraints:**
${interviewAnalysis.constraints.map((c) => `- ${c}`).join("\n")}

**Motivations:**
${interviewAnalysis.motivations.map((m) => `- ${m}`).join("\n")}

**Fears:**
${interviewAnalysis.fears.map((f) => `- ${f}`).join("\n")}

**Your Private Observations:**
${interviewAnalysis.observations}

## INTERVIEW TRANSCRIPT (VERBATIM)

${interviewTranscript.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join("\n\n")}
`;

    // Add prior module records if they exist
    const priorModules = moduleRecords.filter(
      (m) => m.moduleNumber < moduleNumber,
    );
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
${mod.decisions.map((d) => `- ${d}`).join("\n")}

**Insights:**
${mod.insights.map((i) => `- ${i}`).join("\n")}

**Action Items:**
${mod.actionItems.map((a) => `- ${a}`).join("\n")}

**Your Private Observations:**
${mod.observations}

**Full Transcript:**
${mod.transcript.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join("\n\n")}

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
  function generateModulePrompt(
    moduleNumber: number,
    planCard: any,
    dossier: ClientDossier | null = null,
  ): string {
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

    const moduleStructure: Record<
      number,
      { role: string; context: string; structure: string }
    > = {
      1: {
        role: "discovery/unpacking",
        context:
          "The user has completed an initial interview where they shared their career situation. They've paid for coaching and are now starting the first module. You have complete access to the interview transcript and your analysis of their situation.",
        structure: `1. **Opening (1 message)**: Introduce the module. Call set_progress(5). Reference something specific from their interview.
2. **Deep Dive (4-6 exchanges)**: ${approach}
3. **Wrap-up**: When you have a clear picture, call complete_module with a structured summary.`,
      },
      2: {
        role: "exploring motivations/options/constraints",
        context:
          "The user has completed Module 1. You have the full transcript and analysis from that module. Now they need to explore their motivations, constraints, and options.",
        structure: `1. **Opening (1 message)**: Recap Module 1 and introduce this module's focus. Call set_progress(5).
2. **Exploration (4-6 exchanges)**: ${approach}
3. **Wrap-up**: When you've mapped their options and constraints, call complete_module with a structured summary.`,
      },
      3: {
        role: "action planning",
        context:
          "The user has completed Modules 1 and 2. You have the full transcripts and analyses from both modules. Now it's time to build an action plan.",
        structure: `1. **Opening (1 message)**: Recap their situation and direction. Call set_progress(5).
2. **Action Planning (4-6 exchanges)**: ${approach}
3. **Wrap-up**: When you have a clear action plan, call complete_module with a structured summary.`,
      },
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

### UI Tools (USE THESE FOR STRUCTURED UI ELEMENTS)

You have access to tools for injecting UI elements:

1. **append_structured_outcomes** - Use to present clickable option buttons. Use this instead of writing options as plain text. Use liberally - at least every 2-3 turns.

2. **set_progress** - Call on every turn with progress percentage (5-100).

3. **complete_module** - Call ONCE when the module is complete. Provide a structured summary object with insights (array), assessment (string), and takeaway (string).

### Session Structure
${info.structure}

### First Message
On your first message, warmly introduce the module topic. Call set_progress(5).

### Progress Tracking
Call set_progress on every turn with a number from 5 to 100.

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
      const lastUserMessage = [...transcript]
        .reverse()
        .find((t: any) => t.role === "user");
      const isTestSkip =
        lastUserMessage?.content?.toLowerCase().trim() === "testskip";

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
        if (existingLock && now - existingLock < DOSSIER_LOCK_TIMEOUT_MS) {
          console.log(
            `[MODULE] Dossier generation already in progress for user ${userId}`,
          );
          return res.status(409).json({
            error: "Dossier generation in progress",
            message:
              "Your coaching context is being prepared. Please try again in a few seconds.",
            retryable: true,
          });
        }

        // Acquire lock and generate
        dossierGenerationLocks.set(userIdStr, now);
        console.log(
          `[MODULE] Dossier missing for user ${userId}, generating on-demand...`,
        );

        const rawTranscript = await storage.getTranscriptByUserId(userId);
        if (
          rawTranscript?.transcript &&
          Array.isArray(rawTranscript.transcript)
        ) {
          const transcriptMessages = rawTranscript.transcript as {
            role: string;
            content: string;
          }[];

          try {
            const interviewAnalysis =
              await generateInterviewAnalysis(transcriptMessages);
            if (interviewAnalysis) {
              const dossier: ClientDossier = {
                interviewTranscript: transcriptMessages,
                interviewAnalysis,
                moduleRecords: [],
                lastUpdated: new Date().toISOString(),
              };
              await storage.updateClientDossier(userId, dossier);
              console.log(
                `[MODULE] On-demand dossier generated for user ${userId}`,
              );

              // Retry loading after generation
              loadResult = await loadUserTranscriptWithRetry(userId, {
                requireDossier: true,
                requirePlanCard: true,
                maxAttempts: 1,
                delayMs: 0,
              });
            }
          } catch (dossierErr) {
            console.error(
              `[MODULE] Failed to generate on-demand dossier:`,
              dossierErr,
            );
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
      let systemPrompt = generateModulePrompt(
        moduleNumber,
        planCard,
        clientDossier,
      );

      // Add testskip override if needed
      if (isTestSkip) {
        systemPrompt += `

IMPORTANT OVERRIDE - TESTSKIP MODE:
The user has entered "testskip" which is a testing command. You must now:
1. Review the conversation so far and the client dossier
2. Fabricate plausible, realistic answers for ALL remaining module questions
3. Start your response with: "Skipping ahead for testing purposes..."
4. List bullet points of fabricated insights and decisions for this module
5. Call set_progress(95) immediately.
6. Ask for confirmation: "Does this summary capture your situation correctly? If so, I'll wrap up this module."

After the user confirms (or on the next message), immediately call complete_module with a fabricated but realistic summary.
`;
      }

      // Module stream key for event persistence
      const moduleStreamKey = `module:${userId}:${moduleNumber}`;
      const afterMessageIndex = transcript.length > 0 ? transcript.length - 1 : -1;

      let reply: string = "";
      let done = false;
      let summary: string | null = null;
      let options: { id: string; label: string; value: string }[] | null = null;
      let progress: number | null = null;

      if (useAnthropic && anthropic) {
        // Use Anthropic Claude with tools
        const claudeMessages: any[] = [];

        for (const turn of transcript) {
          if (turn && turn.role && turn.content) {
            claudeMessages.push({
              role: turn.role as "user" | "assistant",
              content: turn.content,
            });
          }
        }

        if (transcript.length === 0) {
          claudeMessages.push({
            role: "user",
            content: "Start the module. Introduce it and ask your first question.",
          });
        }

        const response = await anthropic.messages.create({
          model: "claude-sonnet-4-5",
          max_tokens: isTestSkip ? 2048 : 1024,
          system: systemPrompt,
          messages: claudeMessages,
          tools: MODULE_TOOLS.anthropic,
        });

        // Process response content - handle text and tool_use blocks
        for (const block of response.content) {
          if (block.type === "text") {
            reply += block.text;
          } else if (block.type === "tool_use") {
            const toolUse = block as { id: string; name: string; input: any };
            
            if (toolUse.name === "append_structured_outcomes") {
              const input = toolUse.input as { prompt?: string; options: { id?: string; label: string; value: string }[] };
              const optionsWithIds = input.options.map((opt, idx) => ({
                id: opt.id || `opt_${idx}`,
                label: opt.label,
                value: opt.value,
              }));
              options = optionsWithIds;
              
              // Persist event
              const event = await storage.appendEvent(moduleStreamKey, {
                type: "module.structured_outcomes_added",
                payload: { prompt: input.prompt, options: optionsWithIds, afterMessageIndex },
              });
              console.log(`[MODULE_TOOL] append_structured_outcomes: ${optionsWithIds.length} options, eventSeq=${event.eventSeq}`);
              
            } else if (toolUse.name === "set_progress") {
              const input = toolUse.input as { progress: number };
              progress = Math.min(100, Math.max(0, input.progress));
              
              // Persist event
              await storage.appendEvent(moduleStreamKey, {
                type: "module.progress_updated",
                payload: { progress, afterMessageIndex },
              });
              console.log(`[MODULE_TOOL] set_progress: ${progress}%`);
              
            } else if (toolUse.name === "complete_module") {
              const input = toolUse.input as { summary: { insights: string[]; assessment: string; takeaway: string } };
              done = true;
              
              // Format summary for storage
              const summaryText = `**Key Insights**\n${input.summary.insights.map(i => `- ${i}`).join('\n')}\n\n**Assessment**\n${input.summary.assessment}\n\n**Key Takeaway**\n${input.summary.takeaway}`;
              summary = summaryText;
              
              // Persist event
              await storage.appendEvent(moduleStreamKey, {
                type: "module.complete",
                payload: { summary: input.summary, afterMessageIndex },
              });
              
              // Mark module as complete in database
              try {
                await storage.updateModuleComplete(userId, moduleNumber as 1 | 2 | 3, true);
                console.log(`[MODULE_TOOL] complete_module: Module ${moduleNumber} marked complete for user ${userId}`);
              } catch (err) {
                console.error("[MODULE_TOOL] Failed to mark module complete:", err);
              }
            }
          }
        }
      } else {
        // Fall back to OpenAI with tools
        const messages: any[] = [{ role: "system", content: systemPrompt }];

        for (const turn of transcript) {
          if (turn && turn.role && turn.content) {
            messages.push({
              role: turn.role as "user" | "assistant",
              content: turn.content,
            });
          }
        }

        if (transcript.length === 0) {
          messages.push({
            role: "user",
            content: "Start the module. Introduce it and ask your first question.",
          });
        }

        const response = await openai.chat.completions.create({
          model: "gpt-4.1-mini",
          messages,
          max_completion_tokens: isTestSkip ? 2048 : 1024,
          tools: MODULE_TOOLS.openai,
        });

        const choice = response.choices[0];
        reply = choice.message.content || "";
        
        // Handle tool calls
        if (choice.message.tool_calls) {
          for (const toolCall of choice.message.tool_calls) {
            const toolName = toolCall.function.name;
            const toolArgs = JSON.parse(toolCall.function.arguments || "{}");
            
            if (toolName === "append_structured_outcomes") {
              const optionsWithIds = (toolArgs.options || []).map((opt: any, idx: number) => ({
                id: opt.id || `opt_${idx}`,
                label: opt.label,
                value: opt.value,
              }));
              options = optionsWithIds;
              
              // Persist event
              const event = await storage.appendEvent(moduleStreamKey, {
                type: "module.structured_outcomes_added",
                payload: { prompt: toolArgs.prompt, options: optionsWithIds, afterMessageIndex },
              });
              console.log(`[MODULE_TOOL] append_structured_outcomes: ${optionsWithIds.length} options, eventSeq=${event.eventSeq}`);
              
            } else if (toolName === "set_progress") {
              progress = Math.min(100, Math.max(0, toolArgs.progress || 0));
              
              // Persist event
              await storage.appendEvent(moduleStreamKey, {
                type: "module.progress_updated",
                payload: { progress, afterMessageIndex },
              });
              console.log(`[MODULE_TOOL] set_progress: ${progress}%`);
              
            } else if (toolName === "complete_module") {
              done = true;
              
              // Format summary for storage
              const summaryInput = toolArgs.summary || { insights: [], assessment: "", takeaway: "" };
              const summaryText = `**Key Insights**\n${summaryInput.insights.map((i: string) => `- ${i}`).join('\n')}\n\n**Assessment**\n${summaryInput.assessment}\n\n**Key Takeaway**\n${summaryInput.takeaway}`;
              summary = summaryText;
              
              // Persist event
              await storage.appendEvent(moduleStreamKey, {
                type: "module.complete",
                payload: { summary: summaryInput, afterMessageIndex },
              });
              
              // Mark module as complete in database
              try {
                await storage.updateModuleComplete(userId, moduleNumber as 1 | 2 | 3, true);
                console.log(`[MODULE_TOOL] complete_module: Module ${moduleNumber} marked complete for user ${userId}`);
              } catch (err) {
                console.error("[MODULE_TOOL] Failed to mark module complete:", err);
              }
            }
          }
        }
      }

      // Clean reply text
      reply = reply.trim();

      // Empty reply detection and retry for modules (prevent empty assistant messages)
      const MODULE_FALLBACK_MESSAGE = "Got it — keep going.";
      
      if (!reply) {
        console.log(`[MODULE_LLM] Empty reply detected for module ${moduleNumber}, attempting single retry without tools`);
        
        try {
          if (useAnthropic && anthropic) {
            const retryMessages: any[] = [];
            for (const turn of transcript) {
              if (turn?.role && turn?.content) {
                retryMessages.push({ role: turn.role, content: turn.content });
              }
            }
            if (retryMessages.length === 0) {
              retryMessages.push({ role: "user", content: "Start the module. Introduce it and ask your first question." });
            }
            retryMessages.push({
              role: "user",
              content: "[System: Please provide your response as text only, do not call any tools.]"
            });
            
            const retryResponse = await anthropic.messages.create({
              model: "claude-sonnet-4-5",
              max_tokens: 1024,
              system: systemPrompt,
              messages: retryMessages,
            });
            
            for (const block of retryResponse.content) {
              if (block.type === "text" && block.text.trim()) {
                reply = block.text.trim();
                console.log(`[MODULE_LLM] Retry succeeded, reply length=${reply.length}`);
                break;
              }
            }
          } else if (openai) {
            const retryMessages: any[] = [{ role: "system", content: systemPrompt }];
            for (const turn of transcript) {
              if (turn?.role && turn?.content) {
                retryMessages.push({ role: turn.role, content: turn.content });
              }
            }
            if (transcript.length === 0) {
              retryMessages.push({ role: "user", content: "Start the module. Introduce it and ask your first question." });
            }
            retryMessages.push({
              role: "user",
              content: "[System: Please provide your response as text only, do not call any tools.]"
            });
            
            const retryResponse = await openai.chat.completions.create({
              model: "gpt-4.1-mini",
              messages: retryMessages,
              max_completion_tokens: 1024,
            });
            
            if (retryResponse.choices[0].message.content?.trim()) {
              reply = retryResponse.choices[0].message.content.trim();
              console.log(`[MODULE_LLM] Retry succeeded, reply length=${reply.length}`);
            }
          }
        } catch (retryError: any) {
          console.log(`[MODULE_LLM] Retry failed: ${retryError.message}`);
        }
        
        // Final fallback
        if (!reply) {
          reply = MODULE_FALLBACK_MESSAGE;
          console.log(`[MODULE_LLM] Using fallback message after retry failed`);
        }
      }

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

      if (
        !transcript ||
        !Array.isArray(transcript) ||
        transcript.length === 0
      ) {
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

        text =
          response.content[0].type === "text" ? response.content[0].text : null;
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
        console.log(
          `[TRANSCRIPT_POST] ts=${new Date().toISOString()} user=anonymous status=rejected_not_authenticated`,
        );
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
        planCard,
      } = req.body;

      const messageCount = transcript?.length || 0;
      console.log(
        `[TRANSCRIPT_POST] ts=${new Date().toISOString()} user=${userId} status=started module=${currentModule} progress=${progress} interviewComplete=${interviewComplete} hasPlanCard=${!!planCard} messageCount=${messageCount}`,
      );

      if (!transcript || !Array.isArray(transcript)) {
        const durationMs = Date.now() - requestStart;
        console.log(
          `[TRANSCRIPT_POST] ts=${new Date().toISOString()} user=${userId} status=failed_invalid_format durationMs=${durationMs}`,
        );
        return res.status(400).json({ error: "Invalid transcript format" });
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
        const planCardChanged =
          !existingPlanCard ||
          JSON.stringify(existingPlanCard) !== JSON.stringify(planCard);

        console.log(
          `[TRANSCRIPT_POST] ts=${new Date().toISOString()} user=${userId} planCardCheck existingPlanCard=${!!existingPlanCard} planCardChanged=${planCardChanged} hasDossier=${existingHasDossier}`,
        );

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
        console.log(
          `[TRANSCRIPT_POST] ts=${new Date().toISOString()} user=${userId} status=triggering_dossier_background`,
        );

        // Trigger dossier generation in BACKGROUND (fire-and-forget)
        // This allows the POST to complete immediately so the user can proceed to payment
        const transcriptMessages = transcript as {
          role: string;
          content: string;
        }[];
        generateAndSaveDossier(userId, transcriptMessages)
          .then((result) => {
            console.log(
              `[DOSSIER_BACKGROUND] ts=${new Date().toISOString()} user=${userId} status=${result.status}`,
            );
          })
          .catch((err) => {
            console.error(
              `[DOSSIER_BACKGROUND] ts=${new Date().toISOString()} user=${userId} status=error error="${err.message}"`,
            );
          });

        dossierTriggered = true;
      } else if (planCard && existingHasDossier) {
        console.log(
          `[TRANSCRIPT_POST] ts=${new Date().toISOString()} user=${userId} status=skipping_dossier reason=already_exists`,
        );
      }

      const durationMs = Date.now() - requestStart;
      console.log(
        `[TRANSCRIPT_POST] ts=${new Date().toISOString()} user=${userId} status=success upsertDurationMs=${upsertDurationMs} dossierTriggered=${dossierTriggered} durationMs=${durationMs}`,
      );

      res.json({
        success: true,
        id: result.id,
        dossierTriggered,
      });
    } catch (error: any) {
      const durationMs = Date.now() - requestStart;
      console.error(
        `[TRANSCRIPT_POST] ts=${new Date().toISOString()} user=${(req.user as any)?.id || "unknown"} status=error durationMs=${durationMs} error="${error.message}"`,
      );
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
          {
            number: 1,
            complete: transcript.module1Complete || false,
            summary: transcript.module1Summary || null,
          },
          {
            number: 2,
            complete: transcript.module2Complete || false,
            summary: transcript.module2Summary || null,
          },
          {
            number: 3,
            complete: transcript.module3Complete || false,
            summary: transcript.module3Summary || null,
          },
        ],
      });
    } catch (error: any) {
      console.error("Get modules status error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/module/:moduleNumber/state - Get module state (transcript + events) for deterministic rendering
  app.get("/api/module/:moduleNumber/state", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const moduleNumber = parseInt(req.params.moduleNumber) as 1 | 2 | 3;

      if (![1, 2, 3].includes(moduleNumber)) {
        return res.status(400).json({ error: "Invalid module number" });
      }

      // Get module transcript data
      const moduleData = await storage.getModuleData(userId, moduleNumber);
      const transcript = moduleData?.transcript || [];

      // Get events from app_events using module stream key
      const moduleStreamKey = `module:${userId}:${moduleNumber}`;
      const events = await storage.listEvents(moduleStreamKey);

      res.json({
        success: true,
        transcript,
        events,
        complete: moduleData?.complete || false,
        summary: moduleData?.summary || null,
      });
    } catch (error: any) {
      console.error("[MODULE_STATE] Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/module/:moduleNumber/outcomes/select - Select a module outcome option
  app.post("/api/module/:moduleNumber/outcomes/select", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const moduleNumber = parseInt(req.params.moduleNumber) as 1 | 2 | 3;

      if (![1, 2, 3].includes(moduleNumber)) {
        return res.status(400).json({ error: "Invalid module number" });
      }

      const { eventSeq: rawEventSeq, optionId } = req.body;
      if (rawEventSeq === undefined || rawEventSeq === null || !optionId) {
        return res.status(400).json({ error: "eventSeq and optionId are required" });
      }

      const eventSeq = typeof rawEventSeq === "string" ? parseInt(rawEventSeq, 10) : rawEventSeq;
      if (typeof eventSeq !== "number" || isNaN(eventSeq)) {
        return res.status(400).json({ error: "eventSeq must be a valid number" });
      }

      const moduleStreamKey = `module:${userId}:${moduleNumber}`;
      const events = await storage.listEvents(moduleStreamKey);

      // Find the structured outcomes event by eventSeq
      const outcomesEvent = events.find(e => e.eventSeq === eventSeq && e.type === "module.structured_outcomes_added");
      if (!outcomesEvent) {
        return res.status(404).json({ error: "Outcomes event not found" });
      }

      // Check if already selected
      const existingSelection = events.find(e => 
        e.type === "module.outcome_selected" && 
        (e.payload as any)?.eventSeq === eventSeq
      );
      
      if (existingSelection) {
        const existingOptionId = (existingSelection.payload as any)?.optionId;
        if (existingOptionId === optionId) {
          // Idempotent success
          const moduleData = await storage.getModuleData(userId, moduleNumber);
          return res.json({
            success: true,
            transcript: moduleData?.transcript || [],
            events,
            note: "Option already selected (idempotent)",
          });
        } else {
          return res.status(409).json({ error: "A different option was already selected for this event" });
        }
      }

      // Find the option
      const options = (outcomesEvent.payload as any)?.options || [];
      const selectedOption = options.find((opt: any) => opt.id === optionId);
      if (!selectedOption) {
        return res.status(404).json({ error: "Option not found" });
      }

      // Get module transcript for afterMessageIndex calculation
      const moduleData = await storage.getModuleData(userId, moduleNumber);
      const transcript = moduleData?.transcript || [];
      const afterMessageIndex = transcript.length > 0 ? transcript.length - 1 : -1;

      // Append selection event
      await storage.appendEvent(moduleStreamKey, {
        type: "module.outcome_selected",
        payload: {
          eventSeq,
          optionId,
          value: selectedOption.value,
          afterMessageIndex,
        },
      });

      console.log(`[MODULE_TOOL] outcome_selected: eventSeq=${eventSeq}, optionId=${optionId}`);

      // Append user message to transcript
      const userMessage = { role: "user", content: selectedOption.value };
      const updatedTranscript = [...transcript, userMessage];
      await storage.updateModuleData(userId, moduleNumber, { transcript: updatedTranscript as any });

      const updatedEvents = await storage.listEvents(moduleStreamKey);

      res.json({
        success: true,
        transcript: updatedTranscript,
        events: updatedEvents,
        selectedValue: selectedOption.value,
      });
    } catch (error: any) {
      console.error("[MODULE_OUTCOME_SELECT] Error:", error);
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
      const originalTo = Array.isArray(emailData.to)
        ? emailData.to.join(", ")
        : emailData.to || "Unknown recipient";
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

      console.log(
        "Forwarding email from:",
        senderEmail,
        "to: seriouspeople@noahlevin.com",
      );
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
          error: result.error.message,
        });
      }

      console.log("Email forwarded successfully:", result.data?.id);
      res.status(200).json({
        message: "Email forwarded successfully",
        emailId: result.data?.id,
      });
    } catch (error: any) {
      console.error("Webhook processing error:", error);
      // Still return 200 to acknowledge receipt
      res.status(200).json({
        message: "Received but processing failed",
        error: error.message,
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
      if (
        !transcript.clientDossier &&
        transcript.transcript &&
        Array.isArray(transcript.transcript)
      ) {
        const transcriptMessages = transcript.transcript as {
          role: string;
          content: string;
        }[];
        console.log(
          `[ADMIN] Generating client dossier for ${email}... (${transcriptMessages.length} messages)`,
        );

        let interviewAnalysis: InterviewAnalysis | null = null;
        try {
          interviewAnalysis =
            await generateInterviewAnalysis(transcriptMessages);
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
          console.log(
            `[ADMIN] Creating minimal dossier without AI analysis for ${email}`,
          );
          const minimalAnalysis: InterviewAnalysis = {
            clientName: "Client",
            currentRole: "See transcript",
            company: "See transcript",
            tenure: "See transcript",
            situation: "Interview completed - see transcript for details",
            bigProblem: "See transcript for details",
            desiredOutcome: "See transcript for details",
            clientFacingSummary:
              "You're ready to take the next step in your career. Together we'll map out your path forward and build the clarity you need to make your next move.",
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
            observations:
              "Dossier created via admin fix - AI analysis was unavailable. The coach should read the full interview transcript to understand this client's situation.",
          };

          const dossier: ClientDossier = {
            interviewTranscript: transcriptMessages,
            interviewAnalysis: minimalAnalysis,
            moduleRecords: [],
            lastUpdated: new Date().toISOString(),
          };

          await storage.updateClientDossier(user.id, dossier);
          fixes.push(
            `Created minimal dossier (AI unavailable) with ${transcriptMessages.length} transcript messages`,
          );
        }
      } else if (transcript.clientDossier) {
        fixes.push("Dossier already exists (no action needed)");
      } else {
        fixes.push(
          `No transcript data to generate dossier from (transcript: ${typeof transcript.transcript})`,
        );
      }

      console.log(`[ADMIN] Fixes applied for ${email}:`, fixes);

      res.json({
        ok: true,
        email,
        userId: user.id,
        fixes,
      });
    } catch (error: any) {
      console.error("[ADMIN] Fix user error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ==========================================================================
  // DEV-ONLY TEST ENDPOINTS (gated by NODE_ENV and secret)
  // ==========================================================================
  
  function requireDevTools(req: express.Request, res: express.Response): boolean {
    if (process.env.NODE_ENV === "production") {
      // Return 404 in production to hide existence of dev endpoints
      res.status(404).json({ error: "Not found" });
      return false;
    }
    const secret = req.headers["x-dev-tools-secret"];
    if (!process.env.DEV_TOOLS_SECRET || secret !== process.env.DEV_TOOLS_SECRET) {
      res.status(403).json({ error: "Invalid or missing x-dev-tools-secret header" });
      return false;
    }
    return true;
  }

  async function resolveTargetUser(body: { userId?: string; email?: string }) {
    if (body.userId) {
      return storage.getUser(body.userId);
    }
    if (body.email) {
      return storage.getUserByEmail(body.email);
    }
    return storage.getMostRecentUser();
  }

  // POST /api/dev/interview/turn - Dev-only interview turn (no auth cookie required)
  // Allows testing interview chat from shell without browser session
  app.post("/api/dev/interview/turn", async (req, res) => {
    if (!requireDevTools(req, res)) return;

    try {
      const user = await resolveTargetUser(req.body);
      if (!user) {
        return res.status(404).json({ error: "No user found" });
      }

      await handleInterviewTurn(user, req.body, res);
    } catch (error: any) {
      console.error("[DEV] interview/turn error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/dev/interview/outcomes/select - Dev-only outcome selection (no auth)
  // Uses eventSeq (number) as the canonical identifier for outcomes events
  // Idempotency: same option = success (no-op), different option = 409 Conflict
  app.post("/api/dev/interview/outcomes/select", async (req, res) => {
    if (!requireDevTools(req, res)) return;

    try {
      const user = await resolveTargetUser(req.body);
      if (!user) {
        return res.status(404).json({ error: "No user found" });
      }

      const { eventSeq: rawEventSeq, optionId } = req.body;
      if (rawEventSeq === undefined || rawEventSeq === null || !optionId) {
        return res.status(400).json({ error: "eventSeq and optionId are required" });
      }

      // Ensure eventSeq is a number
      const eventSeq = typeof rawEventSeq === "string" ? parseInt(rawEventSeq, 10) : rawEventSeq;
      if (typeof eventSeq !== "number" || isNaN(eventSeq)) {
        return res.status(400).json({ error: "eventSeq must be a valid number" });
      }

      const transcript = await storage.getTranscriptByUserId(user.id);
      if (!transcript) {
        return res.status(400).json({ error: "No interview session found" });
      }

      const sessionToken = transcript.sessionToken;
      const eventsData = await storage.listInterviewEvents(sessionToken);

      // Find the structured outcomes event by eventSeq
      const outcomesEvent = eventsData.find(e => e.eventSeq === eventSeq && e.type === "chat.structured_outcomes_added");
      if (!outcomesEvent) {
        return res.status(404).json({ error: "Outcomes event not found" });
      }

      // Check if already selected for this outcomes event
      const existingSelection = eventsData.find(e => 
        e.type === "chat.structured_outcome_selected" && 
        (e.payload as any)?.eventSeq === eventSeq
      );
      
      if (existingSelection) {
        const existingOptionId = (existingSelection.payload as any)?.optionId;
        if (existingOptionId === optionId) {
          // Same option selected again - idempotent success, return current state
          const existingMessages = transcript.transcript || [];
          res.json({
            success: true,
            transcript: existingMessages,
            events: eventsData,
            note: "Option already selected (idempotent)",
          });
          return;
        } else {
          // Different option selected - conflict
          return res.status(409).json({ error: "A different option was already selected for this event" });
        }
      }

      const options = (outcomesEvent.payload as any)?.options || [];
      const selectedOption = options.find((opt: any) => opt.id === optionId);
      if (!selectedOption) {
        return res.status(404).json({ error: "Option not found" });
      }

      const existingMessages = transcript.transcript || [];
      const afterMessageIndex = existingMessages.length > 0 ? existingMessages.length - 1 : -1;

      // Append the selection event (using eventSeq as reference)
      await storage.appendInterviewEvent(sessionToken, "chat.structured_outcome_selected", {
        render: { afterMessageIndex },
        eventSeq,
        optionId,
        value: selectedOption.value,
      });

      const userMessage = { role: "user", content: selectedOption.value };
      const updatedMessages = [...existingMessages, userMessage];
      await storage.updateTranscript(sessionToken, { transcript: updatedMessages as any });

      const llmResult = await callInterviewLLM(updatedMessages as any, sessionToken, user.id);

      const aiMessage = { role: "assistant", content: llmResult.reply };
      const finalMessages = [...updatedMessages, aiMessage];
      await storage.updateTranscript(sessionToken, { transcript: finalMessages as any });

      const updatedEvents = await storage.listInterviewEvents(sessionToken);

      res.json({
        success: true,
        transcript: finalMessages,
        reply: llmResult.reply,
        done: llmResult.done,
        progress: llmResult.progress,
        options: llmResult.options,
        planCard: llmResult.planCard,
        valueBullets: llmResult.valueBullets,
        socialProof: llmResult.socialProof,
        events: updatedEvents,
      });
    } catch (error: any) {
      console.error("[DEV] outcomes/select error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/dev/interview/state - Dev-only endpoint to get interview state for a user
  // Used by smoke tests to verify state without auth
  app.get("/api/dev/interview/state", async (req, res) => {
    if (!requireDevTools(req, res)) return;

    try {
      const email = req.query.email as string;
      if (!email) {
        return res.status(400).json({ error: "email query parameter required" });
      }

      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(404).json({ error: "No user found for email" });
      }

      const transcript = await storage.getTranscriptByUserId(user.id);
      if (!transcript) {
        return res.json({
          success: true,
          hasSession: false,
          transcript: [],
          events: [],
        });
      }

      const sessionToken = transcript.sessionToken;
      const allEvents = await storage.listInterviewEvents(sessionToken);

      res.json({
        success: true,
        hasSession: true,
        transcript: transcript.transcript || [],
        events: allEvents,
        interviewComplete: transcript.interviewComplete || false,
      });
    } catch (error: any) {
      console.error("[DEV] interview/state error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/dev/interview/inject-outcomes - Dev-only endpoint to inject test outcomes event
  // Used by smoke tests since LLM tool calls are not deterministic
  app.post("/api/dev/interview/inject-outcomes", async (req, res) => {
    if (!requireDevTools(req, res)) return;

    try {
      const user = await resolveTargetUser(req.body);
      if (!user) {
        return res.status(404).json({ error: "No user found" });
      }

      const transcript = await storage.getTranscriptByUserId(user.id);
      if (!transcript) {
        return res.status(400).json({ error: "No interview session found" });
      }

      const sessionToken = transcript.sessionToken;
      const existingMessages = transcript.transcript || [];
      // Outcomes should appear after the last assistant message (not user message)
      // The last message in transcript is typically the assistant's reply
      const afterMessageIndex = existingMessages.length > 0 ? existingMessages.length - 1 : 0;

      // Create test outcomes with deterministic IDs
      const testOptions = [
        { id: "test_opt_1", label: "Option A", value: "I choose option A" },
        { id: "test_opt_2", label: "Option B", value: "I choose option B" },
        { id: "test_opt_3", label: "Option C", value: "I choose option C" },
      ];

      const event = await storage.appendInterviewEvent(sessionToken, "chat.structured_outcomes_added", {
        render: { afterMessageIndex },
        options: testOptions,
      });

      const allEvents = await storage.listInterviewEvents(sessionToken);

      res.json({
        success: true,
        event,
        eventSeq: event.eventSeq,
        options: testOptions,
        events: allEvents,
      });
    } catch (error: any) {
      console.error("[DEV] inject-outcomes error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/dev/interview/finalize - Dev-only endpoint to force finalize interview
  // Used by smoke tests since LLM tool calls are not deterministic
  app.post("/api/dev/interview/finalize", async (req, res) => {
    if (!requireDevTools(req, res)) return;

    try {
      const user = await resolveTargetUser(req.body);
      if (!user) {
        return res.status(404).json({ error: "No user found" });
      }

      const transcript = await storage.getTranscriptByUserId(user.id);
      if (!transcript) {
        return res.status(400).json({ error: "No interview session found" });
      }

      const sessionToken = transcript.sessionToken;
      const existingMessages = transcript.transcript || [];
      const afterMessageIndex = existingMessages.length > 0 ? existingMessages.length - 1 : -1;

      // Call the finalize handler
      await handleFinalizeInterview(sessionToken, user.id, afterMessageIndex);

      // Fetch updated state
      const updatedTranscript = await storage.getTranscriptByUserId(user.id);
      const allEvents = await storage.listInterviewEvents(sessionToken);
      
      // Check if serious plan was created
      const seriousPlan = await storage.getSeriousPlanByUserId(user.id);
      const artifacts = seriousPlan ? await storage.getArtifactsByPlanId(seriousPlan.id) : [];
      
      // Find final next steps event
      const finalEvent = allEvents.find(e => e.type === "chat.final_next_steps_added");

      res.json({
        success: true,
        interviewComplete: updatedTranscript?.interviewComplete || false,
        hasSeriousPlan: !!seriousPlan,
        planId: seriousPlan?.id || null,
        planStatus: seriousPlan?.status || null,
        artifactsCount: artifacts.length,
        artifacts: artifacts.map(a => ({
          key: a.artifactKey,
          status: a.generationStatus,
        })),
        finalEvent: finalEvent ? {
          eventSeq: finalEvent.eventSeq,
          modulesCount: (finalEvent.payload as any)?.modules?.length || 0,
          modules: (finalEvent.payload as any)?.modules || [],
        } : null,
        events: allEvents,
      });
    } catch (error: any) {
      console.error("[DEV] interview/finalize error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // MODULE DEV ENDPOINTS (404 in production)
  // ============================================

  // POST /api/dev/module/inject-outcomes - Dev-only endpoint to inject test outcomes event for a module
  app.post("/api/dev/module/inject-outcomes", async (req, res) => {
    if (!requireDevTools(req, res)) return;

    try {
      const user = await resolveTargetUser(req.body);
      if (!user) {
        return res.status(404).json({ error: "No user found" });
      }

      const { moduleNumber } = req.body;
      if (!moduleNumber || ![1, 2, 3].includes(moduleNumber)) {
        return res.status(400).json({ error: "moduleNumber must be 1, 2, or 3" });
      }

      const moduleStreamKey = `module:${user.id}:${moduleNumber}`;
      const moduleData = await storage.getModuleData(user.id, moduleNumber as 1 | 2 | 3);
      const transcript = moduleData?.transcript || [];
      const afterMessageIndex = transcript.length > 0 ? transcript.length - 1 : -1;

      // Create test outcomes with deterministic IDs
      const testOptions = [
        { id: "mod_opt_1", label: "Explore more", value: "I'd like to explore this more deeply" },
        { id: "mod_opt_2", label: "Move on", value: "I'm ready to move on to the next topic" },
        { id: "mod_opt_3", label: "Something else", value: "I have something else in mind" },
      ];

      // Create the event
      const event = await storage.appendEvent(moduleStreamKey, {
        type: "module.structured_outcomes_added",
        payload: {
          prompt: "What would you like to do next?",
          options: testOptions,
          afterMessageIndex,
        },
      });

      const allEvents = await storage.listEvents(moduleStreamKey);

      res.json({
        success: true,
        eventSeq: event.eventSeq,
        options: testOptions,
        events: allEvents,
      });
    } catch (error: any) {
      console.error("[DEV] module/inject-outcomes error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/dev/module/outcomes/select - Dev-only endpoint to select an option (no auth required)
  app.post("/api/dev/module/outcomes/select", async (req, res) => {
    if (!requireDevTools(req, res)) return;

    try {
      const user = await resolveTargetUser(req.body);
      if (!user) {
        return res.status(404).json({ error: "No user found" });
      }

      const { moduleNumber, eventSeq: rawEventSeq, optionId } = req.body;
      if (!moduleNumber || ![1, 2, 3].includes(moduleNumber)) {
        return res.status(400).json({ error: "moduleNumber must be 1, 2, or 3" });
      }

      if (rawEventSeq === undefined || rawEventSeq === null || !optionId) {
        return res.status(400).json({ error: "eventSeq and optionId are required" });
      }

      const eventSeq = typeof rawEventSeq === "string" ? parseInt(rawEventSeq, 10) : rawEventSeq;
      const moduleStreamKey = `module:${user.id}:${moduleNumber}`;
      const events = await storage.listEvents(moduleStreamKey);

      // Find the outcomes event
      const outcomesEvent = events.find(e => e.eventSeq === eventSeq && e.type === "module.structured_outcomes_added");
      if (!outcomesEvent) {
        return res.status(404).json({ error: "Outcomes event not found" });
      }

      // Check if already selected
      const existingSelection = events.find(e => 
        e.type === "module.outcome_selected" && 
        (e.payload as any)?.eventSeq === eventSeq
      );
      
      if (existingSelection) {
        const existingOptionId = (existingSelection.payload as any)?.optionId;
        if (existingOptionId === optionId) {
          const moduleData = await storage.getModuleData(user.id, moduleNumber as 1 | 2 | 3);
          return res.json({
            success: true,
            transcript: moduleData?.transcript || [],
            events,
            note: "Option already selected (idempotent)",
          });
        } else {
          return res.status(409).json({ error: "A different option was already selected" });
        }
      }

      // Find the option
      const options = (outcomesEvent.payload as any)?.options || [];
      const selectedOption = options.find((opt: any) => opt.id === optionId);
      if (!selectedOption) {
        return res.status(404).json({ error: "Option not found" });
      }

      // Get module data
      const moduleData = await storage.getModuleData(user.id, moduleNumber as 1 | 2 | 3);
      const transcript = moduleData?.transcript || [];
      const afterMessageIndex = transcript.length > 0 ? transcript.length - 1 : -1;

      // Append selection event
      await storage.appendEvent(moduleStreamKey, {
        type: "module.outcome_selected",
        payload: {
          eventSeq,
          optionId,
          value: selectedOption.value,
          afterMessageIndex,
        },
      });

      // Append user message to transcript
      const userMessage = { role: "user", content: selectedOption.value };
      const updatedTranscript = [...transcript, userMessage];
      await storage.updateModuleData(user.id, moduleNumber as 1 | 2 | 3, { transcript: updatedTranscript as any });

      const updatedEvents = await storage.listEvents(moduleStreamKey);

      res.json({
        success: true,
        transcript: updatedTranscript,
        events: updatedEvents,
        selectedValue: selectedOption.value,
      });
    } catch (error: any) {
      console.error("[DEV] module/outcomes/select error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/dev/module/complete - Dev-only endpoint to force complete a module
  app.post("/api/dev/module/complete", async (req, res) => {
    if (!requireDevTools(req, res)) return;

    try {
      const user = await resolveTargetUser(req.body);
      if (!user) {
        return res.status(404).json({ error: "No user found" });
      }

      const { moduleNumber } = req.body;
      if (!moduleNumber || ![1, 2, 3].includes(moduleNumber)) {
        return res.status(400).json({ error: "moduleNumber must be 1, 2, or 3" });
      }

      const moduleStreamKey = `module:${user.id}:${moduleNumber}`;
      const moduleData = await storage.getModuleData(user.id, moduleNumber as 1 | 2 | 3);
      const transcript = moduleData?.transcript || [];
      const afterMessageIndex = transcript.length > 0 ? transcript.length - 1 : -1;

      // Create test summary
      const testSummary = {
        insights: [
          "You identified a key pattern in your work situation",
          "Your values and priorities became clearer",
          "You recognized what needs to change",
        ],
        assessment: "Through this conversation, you've gained clarity on your situation and the path forward.",
        takeaway: "Trust your instincts about what you need next.",
      };

      // Create completion event
      await storage.appendEvent(moduleStreamKey, {
        type: "module.complete",
        payload: { summary: testSummary, afterMessageIndex },
      });

      // Mark module complete in database
      await storage.updateModuleComplete(user.id, moduleNumber as 1 | 2 | 3, true);

      // Format summary text
      const summaryText = `**Key Insights**\n${testSummary.insights.map(i => `- ${i}`).join('\n')}\n\n**Assessment**\n${testSummary.assessment}\n\n**Key Takeaway**\n${testSummary.takeaway}`;
      await storage.updateModuleData(user.id, moduleNumber as 1 | 2 | 3, { summary: summaryText, complete: true });

      const allEvents = await storage.listEvents(moduleStreamKey);

      res.json({
        success: true,
        moduleNumber,
        complete: true,
        summary: testSummary,
        events: allEvents,
      });
    } catch (error: any) {
      console.error("[DEV] module/complete error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/dev/journey - Get journey state for a user (for smoke testing plan-derived modules)
  app.post("/api/dev/journey", async (req, res) => {
    if (!requireDevTools(req, res)) return;

    try {
      const user = await resolveTargetUser(req.body);
      if (!user) {
        return res.status(404).json({ error: "No user found" });
      }

      const journeyState = await storage.getJourneyState(user.id);
      const state: JourneyState = journeyState || {
        interviewComplete: false,
        paymentVerified: false,
        module1Complete: false,
        module2Complete: false,
        module3Complete: false,
        hasSeriousPlan: false,
      };

      // Get plan-derived modules if interview is complete
      let modules = null;
      if (state.interviewComplete) {
        const transcript = await storage.getTranscriptByUserId(user.id);
        if (transcript?.planCard?.modules) {
          modules = transcript.planCard.modules.map((mod: any, i: number) => ({
            moduleNumber: i + 1,
            title: mod.name,
            description: mod.objective,
          }));
        }
      }

      res.json({
        state,
        modules,
      });
    } catch (error: any) {
      console.error("[DEV] journey error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/dev/reset-user-name - Reset user's providedName to null and clear events for testing
  app.post("/api/dev/reset-user-name", async (req, res) => {
    if (!requireDevTools(req, res)) return;

    try {
      const user = await resolveTargetUser(req.body);
      if (!user) {
        return res.status(404).json({ error: "No user found" });
      }

      // Reset providedName
      await storage.updateUser(user.id, { providedName: null });
      console.log(`[DEV] Reset providedName to null for user ${user.id}`);

      // Also clear interview events if there's a transcript with a session token
      const transcript = await storage.getTranscriptByUserId(user.id);
      if (transcript?.sessionToken) {
        await storage.clearInterviewEvents(transcript.sessionToken);
        console.log(`[DEV] Cleared interview events for session ${transcript.sessionToken}`);
      }

      res.json({ success: true, userId: user.id });
    } catch (error: any) {
      console.error("[DEV] reset-user-name error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/dev/simulate-checkout-pending
  // Sets user to CHECKOUT_PENDING phase (interviewComplete=true, paymentVerified=false, stripeSessionId set)
  app.post("/api/dev/simulate-checkout-pending", async (req, res) => {
    if (!requireDevTools(req, res)) return;

    try {
      const user = await resolveTargetUser(req.body);
      if (!user) {
        return res.status(404).json({ error: "No user found" });
      }

      // Ensure transcript exists with interviewComplete=true, paymentVerified=false, stripeSessionId set
      let transcript = await storage.getTranscriptByUserId(user.id);
      if (!transcript) {
        // Create minimal transcript
        transcript = await storage.upsertTranscriptByUserId(user.id, {
          transcript: [{ role: "assistant", content: "Dev test transcript" }],
          currentModule: "complete",
          progress: 100,
          interviewComplete: true,
          paymentVerified: false,
        });
      }
      
      // Update flags
      await storage.updateTranscriptFlagsByUserId(user.id, {
        interviewComplete: true,
        paymentVerified: false,
        stripeSessionId: "dev_dummy_session_" + Date.now(),
      });

      const routing = await computeRoutingForUser(user.id);

      res.json({
        success: true,
        userId: user.id,
        email: user.email,
        routing,
      });
    } catch (error: any) {
      console.error("[DEV] simulate-checkout-pending error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/dev/simulate-payment-verified
  // Sets user to PURCHASED phase (paymentVerified=true)
  app.post("/api/dev/simulate-payment-verified", async (req, res) => {
    if (!requireDevTools(req, res)) return;

    try {
      const user = await resolveTargetUser(req.body);
      if (!user) {
        return res.status(404).json({ error: "No user found" });
      }

      // Update flags
      await storage.updateTranscriptFlagsByUserId(user.id, {
        paymentVerified: true,
      });

      const routing = await computeRoutingForUser(user.id);

      res.json({
        success: true,
        userId: user.id,
        email: user.email,
        routing,
      });
    } catch (error: any) {
      console.error("[DEV] simulate-payment-verified error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/dev/modules/complete
  // Sets moduleNComplete flag for testing without UI
  app.post("/api/dev/modules/complete", async (req, res) => {
    if (!requireDevTools(req, res)) return;

    try {
      const { moduleNumber } = req.body;
      if (![1, 2, 3].includes(moduleNumber)) {
        return res.status(400).json({ error: "moduleNumber must be 1, 2, or 3" });
      }

      const user = await resolveTargetUser(req.body);
      if (!user) {
        return res.status(404).json({ error: "No user found" });
      }

      // Set the module complete flag
      await storage.updateModuleComplete(user.id, moduleNumber as 1 | 2 | 3, true);

      const routing = await computeRoutingForUser(user.id);

      res.json({
        success: true,
        userId: user.id,
        email: user.email,
        moduleNumber,
        routing,
      });
    } catch (error: any) {
      console.error("[DEV] modules/complete error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/dev/serious-plan/complete
  // Sets hasSeriousPlan=true by marking coach letter as seen (for testing)
  app.post("/api/dev/serious-plan/complete", async (req, res) => {
    if (!requireDevTools(req, res)) return;

    try {
      const user = await resolveTargetUser(req.body);
      if (!user) {
        return res.status(404).json({ error: "No user found" });
      }

      // Get the user's plan
      const plan = await storage.getSeriousPlanByUserId(user.id);
      if (!plan) {
        // Create a minimal plan if none exists
        const transcript = await storage.getTranscriptByUserId(user.id);
        if (!transcript) {
          return res.status(400).json({ error: "User has no transcript - cannot create plan" });
        }
        
        const newPlan = await storage.createSeriousPlan({
          userId: user.id,
          transcriptId: transcript.id,
          status: 'ready',
          coachLetterStatus: 'complete',
          coachNoteContent: 'Dev-generated coach letter for testing.',
          coachLetterSeenAt: new Date(),
        });
        
        const routing = await computeRoutingForUser(user.id);
        return res.json({
          ok: true,
          userId: user.id,
          planId: newPlan.id,
          routing,
        });
      }

      // Mark letter as seen (this triggers hasSeriousPlan=true)
      await storage.markCoachLetterSeen(plan.id);
      
      // Also ensure plan status is ready
      if (plan.status !== 'ready') {
        await storage.updateSeriousPlanStatus(plan.id, 'ready');
      }

      const routing = await computeRoutingForUser(user.id);

      res.json({
        ok: true,
        userId: user.id,
        planId: plan.id,
        routing,
      });
    } catch (error: any) {
      console.error("[DEV] serious-plan/complete error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/dev/most-recent-user
  // Returns the most recent user (for smoke testing)
  app.get("/api/dev/most-recent-user", async (req, res) => {
    if (!requireDevTools(req, res)) return;

    try {
      const user = await storage.getMostRecentUser();
      if (!user) {
        return res.status(404).json({ error: "No users found" });
      }
      res.json({ id: user.id, email: user.email });
    } catch (error: any) {
      console.error("[DEV] most-recent-user error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/dev/serious-plan/ensure-artifacts
  // Ensures a user has a serious plan with at least one artifact (creates if needed)
  // Uses REAL artifact generation pipeline (LLM calls) if artifacts need to be created
  // Returns: { userId, planId, artifactCount, created, artifactKeys }
  app.post("/api/dev/serious-plan/ensure-artifacts", async (req, res) => {
    if (!requireDevTools(req, res)) return;

    try {
      const user = await resolveTargetUser(req.body);
      if (!user) {
        return res.status(404).json({ error: "No user found" });
      }

      // Check for existing plan
      let plan = await storage.getSeriousPlanByUserId(user.id);
      let created = false;

      if (!plan) {
        // Create a minimal plan for testing
        plan = await storage.createSeriousPlan({
          userId: user.id,
          transcriptId: null,
          status: 'generating',
          coachLetterStatus: 'pending',
        });
        created = true;
      }

      // Check existing artifacts
      let artifacts = await storage.getArtifactsByPlanId(plan.id);
      
      // Force regenerate if requested - delete existing non-transcript artifacts
      const forceRegenerate = req.body.forceRegenerate === true;
      if (forceRegenerate && artifacts.length > 0) {
        console.log(`[DEV] Force regenerate requested - deleting ${artifacts.length} existing artifacts`);
        // Delete existing non-transcript artifacts
        for (const artifact of artifacts) {
          if (!artifact.artifactKey.startsWith('transcript_')) {
            await db.delete(seriousPlanArtifacts).where(eq(seriousPlanArtifacts.id, artifact.id));
          }
        }
        // Re-fetch to get only transcript artifacts (if any)
        artifacts = await storage.getArtifactsByPlanId(plan.id);
        created = true;
      }

      if (artifacts.length === 0) {
        // Create placeholder artifacts for testing the real generation lifecycle
        const testArtifactKeys = ['decision_snapshot', 'action_plan', 'module_recap'];
        const placeholders = testArtifactKeys.map((key, idx) => ({
          planId: plan!.id,
          artifactKey: key,
          title: key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          type: 'generated' as const,
          importanceLevel: 'must_read' as const,
          whyImportant: `Test artifact for ${key}`,
          contentRaw: null,
          generationStatus: 'pending' as const,
          displayOrder: idx + 1,
          pdfStatus: 'not_started' as const,
        }));

        artifacts = await storage.createArtifacts(placeholders);
        created = true;

        // Build minimal coaching plan and dossier for real generation
        const clientName = user.name || user.email?.split('@')[0] || 'Test User';
        const testCoachingPlan: CoachingPlan = {
          name: clientName,
          careerBrief: 'Career transition coaching',
          seriousPlanSummary: 'Your personalized career plan with actionable steps',
          plannedArtifacts: testArtifactKeys.map((key) => ({
            key,
            title: key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
            type: 'generated',
            description: `Generated artifact for ${key}`,
            importance: 'must_read' as const,
          })),
          modules: [
            { name: 'Job Autopsy', objective: 'Analyze current career', approach: 'Interview-based', outcome: 'Clear picture of situation' },
            { name: 'Fork in the Road', objective: 'Explore options', approach: 'Decision framework', outcome: 'Path forward identified' },
            { name: 'Great Escape Plan', objective: 'Create action plan', approach: 'Step-by-step planning', outcome: 'Actionable roadmap' },
          ],
        };

        const testDossier: ClientDossier = {
          interviewTranscript: [{ role: 'assistant', content: 'Welcome to coaching.' }, { role: 'user', content: 'Thanks!' }],
          lastUpdated: new Date().toISOString(),
          interviewAnalysis: {
            clientName,
            currentRole: 'Software Engineer',
            company: 'Tech Corp',
            tenure: '5 years',
            situation: 'Looking to transition careers',
            bigProblem: 'Feeling stuck in current role',
            desiredOutcome: 'Career transition to product management',
            clientFacingSummary: 'A skilled engineer ready for the next chapter.',
            keyFacts: ['5 years experience', 'Strong technical background'],
            relationships: [{ person: 'Manager', role: 'Supervisor', dynamic: 'Supportive' }],
            emotionalState: 'Motivated but uncertain',
            communicationStyle: 'Direct and clear',
            priorities: ['Career growth', 'Work-life balance'],
            constraints: ['Time availability', 'Financial considerations'],
            motivations: ['Learning new skills', 'Making an impact'],
            fears: ['Starting over', 'Uncertainty'],
            questionsAsked: ['What do you want?'],
            optionsOffered: [{ option: 'PM role', chosen: true }],
            observations: 'Client is well-prepared and engaged.',
          },
          moduleRecords: testCoachingPlan.modules.map((m, idx) => ({
            moduleNumber: idx + 1,
            moduleName: m.name,
            transcript: [{ role: 'assistant', content: `Module ${idx + 1}` }],
            summary: `Completed ${m.name}`,
            decisions: ['Move forward with plan'],
            insights: [`Key insight from ${m.name}`],
            actionItems: [`Action item from ${m.name}`],
            questionsAsked: ['How do you feel?'],
            optionsPresented: [{ option: 'Continue', chosen: true }],
            observations: 'Good progress',
            completedAt: new Date().toISOString(),
          })),
        };

        // Fire off REAL artifact generation (uses LLM to generate content)
        console.log(`[DEV] Starting real artifact generation for plan=${plan!.id} artifacts=${testArtifactKeys.join(',')}`);
        generateArtifactsAsync(plan!.id, testCoachingPlan.name, testCoachingPlan, testDossier, testArtifactKeys);
      }

      res.json({
        ok: true,
        userId: user.id,
        planId: plan.id,
        artifactCount: artifacts.length,
        created,
        artifactKeys: artifacts.map(a => a.artifactKey),
        initialStatuses: artifacts.map(a => ({ key: a.artifactKey, status: a.generationStatus })),
      });
    } catch (error: any) {
      console.error("[DEV] ensure-artifacts error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/dev/serious-plan/latest
  // Returns the serious plan for a user (same shape as /api/serious-plan/latest)
  app.get("/api/dev/serious-plan/latest", async (req, res) => {
    if (!requireDevTools(req, res)) return;

    try {
      const userId = req.query.userId as string;
      if (!userId) {
        return res.status(400).json({ error: "userId query param required" });
      }

      const plan = await getLatestSeriousPlan(userId);
      if (!plan) {
        return res.status(404).json({ error: "No Serious Plan found" });
      }

      res.json(plan);
    } catch (error: any) {
      console.error("[DEV] serious-plan/latest error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/dev/routing/:userId
  // Returns routing for a specific user (for testing without auth)
  app.get("/api/dev/routing/:userId", async (req, res) => {
    if (!requireDevTools(req, res)) return;

    try {
      const userId = req.params.userId;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const routing = await computeRoutingForUser(userId);

      res.json({
        userId,
        email: user.email,
        routing,
      });
    } catch (error: any) {
      console.error("[DEV] routing error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ==========================================================================
  // SEO Routes (served before SPA catch-all)
  // ==========================================================================
  
  // Marketing landing page at root - serves static for logged-out, redirects logged-in to /app
  app.get("/", async (req, res, next) => {
    // Check if user is authenticated
    if (req.isAuthenticated() && req.user) {
      try {
        // Get user's journey state to determine where to redirect
        const journeyState = await storage.getJourneyState(req.user.id);
        
        if (journeyState) {
          const currentStep = getCurrentJourneyStep(journeyState);
          const currentPath = getStepPath(currentStep);
          // Redirect to /app + their journey path
          return res.redirect(`/app${currentPath}`);
        } else {
          // No journey state yet - redirect to /app (SPA will handle routing)
          return res.redirect("/app");
        }
      } catch (error) {
        console.error("[Landing] Error getting journey state:", error);
        // Fall through to serve landing page if error
      }
    }
    
    // Serve static marketing landing page for logged-out users
    try {
      const templatePath = path.join(process.cwd(), "seo", "templates", "landing.ejs");
      const baseUrl = getBaseUrl();
      const posthogKey = process.env.VITE_POSTHOG_KEY || "";
      
      // Get pricing for display
      let price = 19; // Default price
      try {
        const stripe = await getStripeClient();
        const priceId = await getProductPrice();
        const priceData = await stripe.prices.retrieve(priceId);
        if (priceData.unit_amount) {
          price = priceData.unit_amount / 100;
        }
      } catch (priceError) {
        console.error("[Landing] Error getting price:", priceError);
      }
      
      const html = await ejs.renderFile(templatePath, {
        baseUrl,
        price,
        posthogKey,
      });
      
      res.set("Content-Type", "text/html");
      res.set("X-SP-SEO", "1");
      res.send(html);
    } catch (error) {
      console.error("[Landing] Error rendering landing page:", error);
      // Fall through to SPA if template fails
      next();
    }
  });
  
  app.get("/robots.txt", seoController.robots);
  app.get("/sitemap.xml", seoController.sitemap);
  app.get("/resources", seoController.renderContentHub);
  app.get("/guides", seoController.renderGuidesIndex);
  app.get("/guides/:slug", seoController.renderGuide);
  app.get("/roles", seoController.renderRolesIndex);
  app.get("/roles/:role", seoController.renderRolePage);
  app.get("/roles/:role/situations/:situation", seoController.renderProgrammaticPage);
  app.get("/tools/stay-or-go-calculator", seoController.renderStayOrGoCalculator);

  return httpServer;
}
