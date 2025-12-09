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
import { generateSeriousPlan, getSeriousPlanWithArtifacts, getLatestSeriousPlan } from "./seriousPlanService";
import { generateArtifactPdf, generateBundlePdf, generateAllArtifactPdfs } from "./pdfService";

// Use Anthropic Claude if API key is available, otherwise fall back to OpenAI
const useAnthropic = !!process.env.ANTHROPIC_API_KEY;
const anthropic = useAnthropic ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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

Analyze the module transcript and output a JSON object with the following structure:

{
  "summary": "A detailed summary of everything discussed in this module - multiple paragraphs if needed",
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

Output ONLY valid JSON. No markdown, no explanation, just the JSON object.`;

// Helper function to generate interview analysis using AI
async function generateInterviewAnalysis(transcript: { role: string; content: string }[]): Promise<InterviewAnalysis | null> {
  try {
    const transcriptText = transcript.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n');
    
    let response: string;
    
    if (useAnthropic && anthropic) {
      const result = await anthropic.messages.create({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 4096,
        system: INTERVIEW_ANALYSIS_PROMPT,
        messages: [{ role: "user", content: transcriptText }],
      });
      response = result.content[0].type === 'text' ? result.content[0].text : '';
    } else {
      const result = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: [
          { role: "system", content: INTERVIEW_ANALYSIS_PROMPT },
          { role: "user", content: transcriptText }
        ],
        max_completion_tokens: 4096,
      });
      response = result.choices[0].message.content || '';
    }
    
    // Parse JSON response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as InterviewAnalysis;
    }
    return null;
  } catch (error) {
    console.error("Failed to generate interview analysis:", error);
    return null;
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
        model: "claude-sonnet-4-5-20250929",
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
- **Avoid effusive affirmations** like "That's it!", "You nailed it!", "That's brilliant!", "Exactly!" These feel condescending or performative. Instead, respond as one adult would to another — acknowledging what they said and moving forward naturally.
- When responding to user input, avoid the pattern of "That's [positive adjective]" or excessive validation. A simple acknowledgment or jumping straight to the substance is better.

### Formatting for readability

When you write longer responses:
- Use **bold text** to highlight key phrases and important takeaways
- Example: "The real issue here is **your manager doesn't see your growth potential**, which means..."

IMPORTANT: Do NOT use bullet points (- or *) or numbered lists (1. 2. 3.) in your responses. The chat interface cannot render these properly. Instead:
- Use line breaks and **bold headers** to separate sections
- Write in flowing paragraphs with bold emphasis for key points
- For lists of items, use inline formatting like: "There are three main issues: **first**, the timeline; **second**, the money; **third**, the relationship."

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

Greet them warmly by name. Then offer structured options with natural phrasing:

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

Every **3–4 user answers**, pause and reflect back what you heard. Cover what's working, what's not, and what they want. Use **bold** for key phrases. Invite corrections. These should feel like a smart coach synthesizing, not generic summaries. Write in flowing prose, not bullet points.

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
          name: req.user.name 
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
  
  // POST /api/serious-plan - Generate a new Serious Plan
  app.post("/api/serious-plan", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      
      // Get user's transcript
      const transcript = await storage.getTranscriptByUserId(userId);
      if (!transcript) {
        return res.status(400).json({ error: "No transcript found for user" });
      }
      
      // Check if all modules are complete
      if (!transcript.module1Complete || !transcript.module2Complete || !transcript.module3Complete) {
        return res.status(400).json({ error: "All modules must be completed before generating Serious Plan" });
      }
      
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
      
      // Get dossier and coaching plan from transcript
      const dossier = transcript.clientDossier as ClientDossier | null;
      const planCard = transcript.planCard as CoachingPlan | null;
      
      if (!planCard) {
        return res.status(400).json({ error: "No coaching plan found in transcript" });
      }
      
      // Generate the plan
      const result = await generateSeriousPlan(userId, transcript.id, planCard, dossier);
      
      if (result.success) {
        res.json({ success: true, planId: result.planId });
      } else {
        res.status(500).json({ error: result.error || "Failed to generate Serious Plan" });
      }
    } catch (error: any) {
      console.error("Serious Plan generation error:", error);
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
      
      // Get user's coaching context from the interview transcript
      const transcript = await storage.getTranscriptByUserId(userId);
      const clientDossier = transcript?.clientDossier || null;
      const coachingPlan = transcript?.planCard || null;
      
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
          model: "claude-sonnet-4-20250514",
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
  app.get("/auth/google", passport.authenticate("google", { 
    scope: ["email", "profile"] 
  }));
  
  // GET /auth/google/callback - Google OAuth callback
  app.get("/auth/google/callback",
    passport.authenticate("google", { 
      failureRedirect: "/login?error=google_auth_failed" 
    }),
    (req, res) => {
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
      const { email } = req.body;
      
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
      
      // Store token in database
      await storage.createMagicLinkToken({
        email: email.toLowerCase(),
        tokenHash,
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
        });
      }
      
      // Log user in
      req.login({ id: user.id, email: user.email, name: user.name }, (err) => {
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
      req.login({ id: user.id, email: user.email, name: user.name }, (err) => {
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
    try {
      const userId = req.user!.id;
      const transcript = await storage.getTranscriptByUserId(userId);
      
      if (transcript) {
        res.json({
          transcript: transcript.transcript,
          currentModule: transcript.currentModule,
          progress: transcript.progress,
          interviewComplete: transcript.interviewComplete,
          paymentVerified: transcript.paymentVerified,
          valueBullets: transcript.valueBullets,
          socialProof: transcript.socialProof,
          planCard: transcript.planCard,
        });
      } else {
        res.json({ transcript: null });
      }
    } catch (error: any) {
      console.error("Get transcript error:", error);
      res.status(500).json({ error: "Failed to fetch transcript" });
    }
  });
  
  // POST /api/transcript - Save user's transcript
  app.post("/api/transcript", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
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
      
      // Check if user already has a transcript
      let existingTranscript = await storage.getTranscriptByUserId(userId);
      
      if (existingTranscript) {
        // Update existing transcript
        await storage.updateTranscript(existingTranscript.sessionToken, {
          transcript,
          currentModule,
          progress,
          interviewComplete,
          paymentVerified,
          valueBullets,
          socialProof,
          planCard,
        });
      } else {
        // Create new transcript with a session token
        const sessionToken = crypto.randomBytes(32).toString("hex");
        await storage.createTranscript({
          sessionToken,
          userId,
          transcript: transcript || [],
          currentModule: currentModule || "Interview",
          progress: progress || 0,
          interviewComplete: interviewComplete || false,
          paymentVerified: paymentVerified || false,
          valueBullets,
          socialProof,
          planCard,
        });
      }
      
      res.json({ success: true });
    } catch (error: any) {
      console.error("Save transcript error:", error);
      res.status(500).json({ error: "Failed to save transcript" });
    }
  });
  
  // ============== EXISTING ROUTES ==============
  
  // POST /checkout - Create Stripe Checkout session
  app.post("/checkout", async (req, res) => {
    try {
      const stripe = await getStripeClient();
      const priceId = await getProductPrice();
      const baseUrl = getBaseUrl();
      const { promoCode } = req.body || {};
      
      // Get the price to check currency
      const price = await stripe.prices.retrieve(priceId);
      const priceCurrency = price.currency || 'usd';
      
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
      
      // If a custom promo code was provided via URL, look it up and apply it
      if (promoCode) {
        try {
          const promoCodes = await stripe.promotionCodes.list({
            code: promoCode,
            active: true,
            limit: 1,
          });
          
          if (promoCodes.data.length > 0) {
            sessionOptions.discounts = [{ promotion_code: promoCodes.data[0].id }];
            console.log(`Applied custom promo code: ${promoCode}`);
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
    try {
      const sessionId = req.query.session_id as string;
      
      if (!sessionId) {
        return res.status(400).json({ ok: false, error: "Missing session_id" });
      }

      const stripe = await getStripeClient();
      const session = await stripe.checkout.sessions.retrieve(sessionId);

      if (session.payment_status === "paid") {
        // If user is authenticated, mark their transcript as payment verified
        const user = (req as any).user;
        if (user?.id) {
          const transcript = await storage.getTranscriptByUserId(user.id);
          if (transcript && transcript.sessionToken) {
            await storage.updateTranscript(transcript.sessionToken, {
              paymentVerified: true,
              stripeSessionId: sessionId,
            });
          }
        }
        return res.json({ ok: true });
      } else {
        return res.status(403).json({ ok: false, error: "Payment not completed" });
      }
    } catch (error: any) {
      console.error("Verify session error:", error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // POST /api/generate-dossier - Generate initial client dossier after payment
  // This runs in the background after payment verification
  app.post("/api/generate-dossier", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user?.id) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      // Get the user's transcript from the database
      const transcript = await storage.getTranscriptByUserId(user.id);
      if (!transcript || !transcript.transcript || !Array.isArray(transcript.transcript)) {
        return res.status(400).json({ error: "No interview transcript found" });
      }

      // Check if dossier already exists
      if (transcript.clientDossier) {
        return res.json({ ok: true, message: "Dossier already exists" });
      }

      console.log(`Generating client dossier for user ${user.id}...`);

      // Generate the interview analysis
      const interviewAnalysis = await generateInterviewAnalysis(transcript.transcript as { role: string; content: string }[]);
      
      if (!interviewAnalysis) {
        return res.status(500).json({ error: "Failed to generate interview analysis" });
      }

      // Create the initial dossier
      const dossier: ClientDossier = {
        interviewTranscript: transcript.transcript as { role: string; content: string }[],
        interviewAnalysis,
        moduleRecords: [],
        lastUpdated: new Date().toISOString(),
      };

      // Save to database
      await storage.updateClientDossier(user.id, dossier);

      console.log(`Client dossier generated successfully for user ${user.id}`);
      res.json({ ok: true });
    } catch (error: any) {
      console.error("Generate dossier error:", error);
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
          claudeMessages.push({ role: "user", content: "Start the interview. Ask your first question." });
        }

        const response = await anthropic.messages.create({
          model: "claude-sonnet-4-5-20250929",
          max_tokens: 1024,
          system: INTERVIEW_SYSTEM_PROMPT,
          messages: claudeMessages,
        });

        reply = response.content[0].type === 'text' ? response.content[0].text : '';
      } else {
        // Fall back to OpenAI
        const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
          { role: "system", content: INTERVIEW_SYSTEM_PROMPT }
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
          max_completion_tokens: 1024,
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

      // Parse structured options
      const optionsMatch = reply.match(/\[\[OPTIONS\]\]([\s\S]*?)\[\[END_OPTIONS\]\]/);
      if (optionsMatch) {
        options = optionsMatch[1]
          .trim()
          .split('\n')
          .map(opt => opt.trim())
          .filter(opt => opt.length > 0);
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
- **Avoid effusive affirmations** like "That's it!", "You nailed it!", "Exactly!" — respond as one adult to another, not with performative enthusiasm
- Keep acknowledgments simple and move to substance quickly

### Formatting (CRITICAL)
Do NOT use bullet points (- or *) or numbered lists (1. 2. 3.) in your responses. The chat interface cannot render these properly. Use flowing prose with **bold text** for emphasis. For multiple points, use inline formatting like: "There are three issues: **first**, X; **second**, Y; **third**, Z."

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
On your first message, output a title card:
— Job Autopsy (est. 10–20 minutes) —

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
- **Avoid effusive affirmations** like "That's it!", "You nailed it!", "Exactly!" — respond as one adult to another, not with performative enthusiasm
- Keep acknowledgments simple and move to substance quickly

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
On your first message, output a title card:
— Fork in the Road (est. 10–20 minutes) —

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
- **Avoid effusive affirmations** like "That's it!", "You nailed it!", "Exactly!" — respond as one adult to another, not with performative enthusiasm
- Keep acknowledgments simple and move to substance quickly

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
3. **Wrap-up**: When you have a clear action plan, output [[MODULE_COMPLETE]] with a summary.

### First Message Format
On your first message, output a title card:
— The Great Escape Plan (est. 10–20 minutes) —

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

### Formatting (CRITICAL)
Do NOT use bullet points or numbered lists in your responses. The chat interface cannot render these. Use flowing prose with **bold text** for emphasis. For multiple points, use inline formatting like: "There are three issues: **first**, X; **second**, Y; **third**, Z."

### Session Structure
${info.structure}

### First Message Format
On your first message, output a title card:
— ${name} (est. 10–20 minutes) —

Then introduce the module and ask your first probing question based on what you know about their situation.

### Progress Tracking
Include [[PROGRESS]]<number>[[END_PROGRESS]] in each response (5-100).

### Completion
When the module is complete, include:
[[MODULE_COMPLETE]]
[[SUMMARY]]
**Key Insights**
- Insight 1
- Insight 2
- Insight 3

**Summary**
Your assessment of what was covered in 2-3 sentences.

**Key Takeaway**
One concrete insight they can carry forward.
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

      // Try to get the user's coaching plan and dossier from the database
      let planCard = null;
      let clientDossier: ClientDossier | null = null;
      if (req.user && (req.user as any).id) {
        const userTranscript = await storage.getTranscriptByUserId((req.user as any).id);
        if (userTranscript) {
          if (userTranscript.planCard) {
            planCard = userTranscript.planCard;
          }
          if (userTranscript.clientDossier) {
            clientDossier = userTranscript.clientDossier;
          }
        }
      }

      // Generate dynamic system prompt based on the coaching plan and dossier
      const systemPrompt = generateModulePrompt(moduleNumber, planCard, clientDossier);

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
          model: "claude-sonnet-4-5-20250929",
          max_tokens: 1024,
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
          max_completion_tokens: 1024,
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

      // Parse structured options
      const optionsMatch = reply.match(/\[\[OPTIONS\]\]([\s\S]*?)\[\[END_OPTIONS\]\]/);
      if (optionsMatch) {
        options = optionsMatch[1]
          .trim()
          .split('\n')
          .map(opt => opt.trim())
          .filter(opt => opt.length > 0);
      }

      // Check for module completion
      if (reply.includes("[[MODULE_COMPLETE]]")) {
        done = true;

        const summaryMatch = reply.match(/\[\[SUMMARY\]\]([\s\S]*?)\[\[END_SUMMARY\]\]/);
        if (summaryMatch) {
          summary = summaryMatch[1].trim();
        }
        
        // Mark module as complete in database if user is authenticated
        if (req.user && (req.user as any).id) {
          try {
            await storage.updateModuleComplete((req.user as any).id, moduleNumber as 1 | 2 | 3, true);
            console.log(`Module ${moduleNumber} marked complete for user ${(req.user as any).id}`);
          } catch (err) {
            console.error("Failed to mark module complete:", err);
          }
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
          model: "claude-sonnet-4-5-20250929",
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

  // GET /api/transcript - Load user's transcript from database
  app.get("/api/transcript", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any)?.id;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const transcript = await storage.getTranscriptByUserId(userId);
      if (!transcript) {
        return res.json({ 
          transcript: [],
          progress: 0,
          currentModule: "Interview",
          interviewComplete: false,
          paymentVerified: false
        });
      }

      res.json({
        transcript: transcript.transcript,
        progress: transcript.progress || 0,
        currentModule: transcript.currentModule || "Interview",
        interviewComplete: transcript.interviewComplete || false,
        paymentVerified: transcript.paymentVerified || false,
        valueBullets: transcript.valueBullets,
        socialProof: transcript.socialProof,
        planCard: transcript.planCard,
      });
    } catch (error: any) {
      console.error("Load transcript error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/transcript - Save user's transcript to database
  app.post("/api/transcript", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any)?.id;
      if (!userId) {
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

      if (!transcript || !Array.isArray(transcript)) {
        return res.status(400).json({ error: "Invalid transcript format" });
      }

      // Upsert transcript for this user
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

      res.json({ success: true, id: result.id });
    } catch (error: any) {
      console.error("Save transcript error:", error);
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

  // POST /api/dev/auto-client - Development-only endpoint for auto-generating client responses
  // This is a testing helper that generates realistic client responses for roleplay scenarios
  app.post("/api/dev/auto-client", async (req, res) => {
    // Only available in development mode
    if (process.env.NODE_ENV === "production") {
      return res.status(404).json({ error: "Not found" });
    }

    try {
      if (!useAnthropic && !process.env.OPENAI_API_KEY) {
        return res.status(500).json({ error: "No AI API key configured" });
      }

      const { stage, moduleNumber, transcript = [], planCard, coachingPlan } = req.body;

      if (!stage || (stage !== "interview" && stage !== "module")) {
        return res.status(400).json({ error: "Invalid stage. Must be 'interview' or 'module'" });
      }

      // Try to load dossier and plan from database if user is authenticated
      let clientDossier: ClientDossier | null = null;
      let serverPlanCard = planCard;
      
      if (req.user && (req.user as any).id) {
        const userTranscript = await storage.getTranscriptByUserId((req.user as any).id);
        if (userTranscript) {
          if (userTranscript.clientDossier) {
            clientDossier = userTranscript.clientDossier;
          }
          if (userTranscript.planCard && !serverPlanCard) {
            serverPlanCard = userTranscript.planCard;
          }
        }
      }

      // Build context for the auto-client AI
      let contextInfo = "";
      
      if (clientDossier) {
        contextInfo += `
=== CLIENT DOSSIER (Use this to stay in character) ===
${clientDossier.interviewAnalysis ? `
**Key Facts About You:**
${clientDossier.interviewAnalysis.keyFacts?.join('\n') || 'Not available'}

**Your Emotional State:**
${clientDossier.interviewAnalysis.emotionalState || 'Not specified'}

**Your Communication Style:**
${clientDossier.interviewAnalysis.communicationStyle || 'Not specified'}

**Your Priorities:**
${clientDossier.interviewAnalysis.priorities?.join(', ') || 'Not specified'}

**Your Constraints:**
${clientDossier.interviewAnalysis.constraints?.join(', ') || 'Not specified'}

**Key Relationships:**
${clientDossier.interviewAnalysis.relationships?.join(', ') || 'Not specified'}
` : ''}
=== END DOSSIER ===
`;
      }

      if (serverPlanCard && stage === "module") {
        const moduleInfo = serverPlanCard.modules?.[moduleNumber - 1];
        if (moduleInfo) {
          contextInfo += `
=== CURRENT MODULE CONTEXT ===
Module ${moduleNumber}: ${moduleInfo.name}
Objective: ${moduleInfo.objective}
=== END MODULE CONTEXT ===
`;
        }
      }

      // Build the system prompt for the auto-client - optimized for brevity
      const systemPrompt = `You are a coaching client. Give SHORT realistic responses (1 word to 1 short paragraph max).

${contextInfo}

RULES:
- Be brief like real people text/chat
- Stay in character
- No jargon, be casual
- Sometimes just say "yeah" or "I guess so" or ask a short question

${stage === "interview" ? "Interview phase - share your situation briefly." : `Module ${moduleNumber}.`}

Reply as the client. Be concise.`;

      // Format the conversation for the AI
      const conversationMessages = transcript.map((msg: any) => ({
        role: msg.role === "assistant" ? "assistant" : "user",
        content: msg.content
      }));

      // Flip the perspective - assistant messages become what the "coach" said
      // User messages become what the "client" said
      const flippedMessages = conversationMessages.map((msg: any) => ({
        role: msg.role === "assistant" ? "user" : "assistant",
        content: msg.content
      }));

      let reply: string;

      if (useAnthropic && anthropic) {
        // Use Anthropic Claude Haiku for speed and cost
        const response = await anthropic.messages.create({
          model: "claude-3-5-haiku-20241022",
          max_tokens: 150,
          system: systemPrompt,
          messages: flippedMessages.length > 0 ? flippedMessages : [{ role: "user", content: "The coach just started the session. How would you respond?" }],
        });

        reply = response.content[0].type === 'text' ? response.content[0].text : '';
      } else {
        // Fall back to OpenAI GPT-4o-mini for speed and cost
        const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
          { role: "system", content: systemPrompt },
          ...flippedMessages
        ];

        if (flippedMessages.length === 0) {
          messages.push({ role: "user", content: "The coach just started the session. How would you respond?" });
        }

        const response = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages,
          max_tokens: 150,
        });

        reply = response.choices[0]?.message?.content || "";
      }

      // Clean up the reply - remove any quotes if the AI wrapped it
      reply = reply.replace(/^["']|["']$/g, '').trim();

      res.json({ reply });
    } catch (error: any) {
      console.error("Auto-client error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/dev/skip - Development-only endpoint to skip to different stages
  // This sets up the database state to simulate having completed earlier stages
  app.post("/api/dev/skip", requireAuth, async (req, res) => {
    // Only available in development mode
    if (process.env.NODE_ENV === "production") {
      return res.status(404).json({ error: "Not found" });
    }

    try {
      const { stage } = req.body;
      const userId = req.user!.id;
      const userEmail = req.user!.email;
      const userName = req.user!.name || userEmail?.split('@')[0] || 'Test User';

      const validStages = ['interview', 'paywall', 'module1', 'module2', 'module3', 'serious_plan', 'coach_chat'];
      if (!stage || !validStages.includes(stage)) {
        return res.status(400).json({ 
          error: `Invalid stage. Must be one of: ${validStages.join(', ')}` 
        });
      }

      // Generate a unique session token for this skip
      const sessionToken = `skip_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Sample plan card data
      const samplePlanCard = {
        name: userName,
        modules: [
          {
            name: "Job Autopsy",
            description: "Understand what went wrong and what to avoid",
            objective: "Identify patterns in your work history that led to dissatisfaction",
            approach: "We'll examine your past roles to find what energized vs. drained you",
            outcome: "A clear picture of your non-negotiables for future roles"
          },
          {
            name: "Fork in the Road",
            description: "Clarify your two main options: stay or go",
            objective: "Weigh the realistic pros and cons of each path",
            approach: "We'll stress-test each option against your values and constraints",
            outcome: "A decision framework you can trust"
          },
          {
            name: "The Great Escape Plan",
            description: "Build your exit strategy",
            objective: "Create a step-by-step action plan",
            approach: "We'll map out timeline, conversations, and milestones",
            outcome: "A concrete 90-day roadmap with conversation scripts"
          }
        ],
        briefDescription: "Your personalized Career Brief with actionable scripts"
      };

      // Sample value bullets
      const sampleValueBullets = [
        "Navigate your relationship with your current manager",
        "Balance financial security with career growth",
        "Build confidence for difficult conversations"
      ];

      // Sample client dossier with all required fields for formatDossierContext
      // Must match ClientDossier interface exactly
      const sampleClientDossier: ClientDossier = {
        interviewTranscript: [
          { role: "assistant", content: "Hi! I'm your career coach. Let's figure out what's going on at work and how to move forward. What's the main thing that's been weighing on you?" },
          { role: "user", content: "I've been at my job for a while and I'm feeling stuck. Not sure if I should stay and try to make things better or start looking elsewhere." },
          { role: "assistant", content: "That feeling of being stuck is really common, and it's smart that you're taking time to think it through. Tell me more - what's making you feel stuck?" },
          { role: "user", content: "I've been doing great work but not getting recognized. My manager is supportive but doesn't have much influence. I'm considering either pushing for a promotion or looking for external opportunities." }
        ],
        interviewAnalysis: {
          clientName: userName,
          currentRole: "Product Manager",
          company: "Tech Company Inc.",
          tenure: "3 years",
          situation: "Mid-level employee feeling stuck and undervalued, considering whether to push for promotion or explore external opportunities.",
          bigProblem: "Lack of growth opportunities and feeling underappreciated by leadership despite consistent high performance.",
          desiredOutcome: "Find a path forward that balances financial security with career fulfillment and personal growth.",
          keyFacts: [
            "Works in tech industry as a product manager",
            "3+ years at current company",
            "Considering career transition",
            "Has financial responsibilities including mortgage"
          ],
          relationships: [
            { person: "Sarah", role: "Direct Manager", dynamic: "Supportive but not influential in promotion decisions" },
            { person: "Mike", role: "VP of Product", dynamic: "Limited interaction, seems unaware of contributions" },
            { person: "Team", role: "Direct Reports", dynamic: "Strong relationships, would be hard to leave" }
          ],
          emotionalState: "Feeling uncertain but hopeful about change. Some frustration with lack of recognition.",
          communicationStyle: "Direct and analytical. Prefers data-driven conversations.",
          priorities: ["Work-life balance", "Career growth", "Financial stability", "Meaningful work"],
          constraints: ["Family obligations", "Current income level", "Geographic location"],
          motivations: ["Recognition for good work", "Leadership opportunities", "Learning and growth", "Making an impact"],
          fears: ["Making the wrong decision", "Financial instability", "Burning bridges", "Starting over"],
          questionsAsked: ["What's weighing on you?", "What's making you feel stuck?"],
          optionsOffered: [],
          observations: "Client shows strong analytical skills but may be overthinking the decision. Would benefit from structured framework to evaluate options objectively."
        },
        moduleRecords: [],
        lastUpdated: new Date().toISOString()
      };

      // Sample planned artifacts
      const samplePlannedArtifacts = [
        {
          type: "decision_snapshot",
          name: "Career Decision Snapshot",
          whyImportant: "A clear visual of your options and their trade-offs"
        },
        {
          type: "action_plan",
          name: "90-Day Career Roadmap",
          whyImportant: "Step-by-step actions with realistic timelines"
        },
        {
          type: "conversation_script",
          name: "Manager Conversation Script",
          whyImportant: "Exact words for the conversation you've been dreading"
        },
        {
          type: "risk_map",
          name: "Risk & Mitigation Map",
          whyImportant: "Every concern addressed with a backup plan"
        }
      ];

      // Build transcript state based on stage
      let transcriptData: any = {
        sessionToken,
        userId,
        transcript: [
          { role: "assistant", content: "Hi! I'm your career coach. Let's figure out what's going on at work and how to move forward. What's the main thing that's been weighing on you?" },
          { role: "user", content: "I've been at my job for a while and I'm feeling stuck. Not sure if I should stay and try to make things better or start looking elsewhere." }
        ],
        progress: 10,
        interviewComplete: false,
        paymentVerified: false,
        currentModule: "interview",
        valueBullets: null,
        socialProof: null,
        planCard: null,
        clientDossier: null,
        plannedArtifacts: null
      };

      let redirectPath = "/interview";

      // Set state based on stage
      if (stage === 'paywall' || stage === 'module1' || stage === 'module2' || stage === 'module3' || stage === 'serious_plan' || stage === 'coach_chat') {
        transcriptData.interviewComplete = true;
        transcriptData.progress = 95;
        transcriptData.valueBullets = sampleValueBullets;
        transcriptData.socialProof = "Research shows 78% of professionals who work with a coach report higher job satisfaction.";
        transcriptData.planCard = samplePlanCard;
        transcriptData.clientDossier = sampleClientDossier;
        transcriptData.plannedArtifacts = samplePlannedArtifacts;
        transcriptData.currentModule = "paywall";
        redirectPath = "/interview"; // They'll see the paywall
      }

      if (stage === 'module1' || stage === 'module2' || stage === 'module3' || stage === 'serious_plan' || stage === 'coach_chat') {
        transcriptData.paymentVerified = true;
        transcriptData.currentModule = "module1";
        transcriptData.stripeSessionId = `skip_session_${Date.now()}`;
        redirectPath = "/module/1";
      }

      if (stage === 'module2' || stage === 'module3' || stage === 'serious_plan' || stage === 'coach_chat') {
        transcriptData.currentModule = "module2";
        redirectPath = "/module/2";
      }

      if (stage === 'module3' || stage === 'serious_plan' || stage === 'coach_chat') {
        transcriptData.currentModule = "module3";
        redirectPath = "/module/3";
      }

      if (stage === 'serious_plan' || stage === 'coach_chat') {
        transcriptData.currentModule = "graduation";
        transcriptData.module1Complete = true;
        transcriptData.module2Complete = true;
        transcriptData.module3Complete = true;
        transcriptData.hasSeriousPlan = true;
        redirectPath = "/serious-plan";

        // Delete any existing Serious Plan for this user first
        const existingPlan = await storage.getSeriousPlanByUserId(userId);
        if (existingPlan) {
          // Delete existing artifacts first
          const existingArtifacts = await storage.getArtifactsByPlanId(existingPlan.id);
          for (const artifact of existingArtifacts) {
            await db.delete(seriousPlanArtifacts).where(eq(seriousPlanArtifacts.id, artifact.id));
          }
          // Delete the plan
          await db.delete(seriousPlans).where(eq(seriousPlans.id, existingPlan.id));
        }

        // Create a new Serious Plan with artifacts
        const plan = await storage.createSeriousPlan({
          userId,
          status: 'ready',
          coachNoteContent: `${userName}, you came to me at a crossroads, and I want you to know—that took real courage. Through our work together, you've done something most people never manage: you've gotten honest with yourself about what you actually want.\n\nYou've built something valuable here. This isn't just a plan—it's a map you made yourself, with your own insights lighting the way. Trust it.\n\nThe conversations ahead won't be easy. But you're ready. You've already had the hardest conversation—the one with yourself.\n\nI'm proud of the work you've done. Now go do the thing.`,
          summaryMetadata: {
            clientName: userName,
            planHorizonType: '90_days',
            planHorizonRationale: 'A 90-day window provides enough time for meaningful career transition while maintaining urgency.',
            keyConstraints: ['Family obligations', 'Current income level'],
            primaryRecommendation: "Pursue the career transition with a 90-day structured approach",
            emotionalTone: 'supportive and encouraging'
          }
        });

        // Create sample artifacts
        const artifactTypes = [
          { artifactKey: 'decision_snapshot', type: 'snapshot', title: 'Your Decision Snapshot', importanceLevel: 'must_read', whyImportant: 'See your options clearly laid out', order: 1 },
          { artifactKey: 'action_plan', type: 'plan', title: 'Your 90-Day Roadmap', importanceLevel: 'must_read', whyImportant: 'Know exactly what to do and when', order: 2 },
          { artifactKey: 'conversation_scripts', type: 'conversation', title: 'Conversation Scripts', importanceLevel: 'must_read', whyImportant: 'Have the exact words for difficult talks', order: 3 },
          { artifactKey: 'risk_map', type: 'plan', title: 'Risk & Mitigation Map', importanceLevel: 'recommended', whyImportant: 'Feel prepared for any obstacle', order: 4 },
          { artifactKey: 'module_recap', type: 'recap', title: 'Your Coaching Journey', importanceLevel: 'recommended', whyImportant: 'Remember key insights from each module', order: 5 },
          { artifactKey: 'resources', type: 'resources', title: 'Curated Resources', importanceLevel: 'optional', whyImportant: 'Continue your growth with vetted materials', order: 6 }
        ];

        for (const artifact of artifactTypes) {
          await storage.createArtifact({
            planId: plan.id,
            artifactKey: artifact.artifactKey,
            type: artifact.type,
            title: artifact.title,
            importanceLevel: artifact.importanceLevel as 'must_read' | 'recommended' | 'optional',
            whyImportant: artifact.whyImportant,
            contentRaw: `# ${artifact.title}\n\nThis is placeholder content that would normally be AI-generated based on your coaching sessions.\n\n## Key Points\n\n- First important insight from your coaching journey\n- Second important insight about your career transition\n- Third important insight about your next steps\n\n## Next Steps\n\n1. Review this document thoroughly\n2. Apply the insights to your situation\n3. Follow up with your coach if needed`,
            displayOrder: artifact.order,
            pdfStatus: 'not_started'
          });
        }
      }

      if (stage === 'coach_chat') {
        redirectPath = "/coach-chat";
      }

      // Delete any existing transcript for this user and create new one
      const existingTranscript = await storage.getTranscriptByUserId(userId);
      if (existingTranscript) {
        await storage.deleteTranscript(existingTranscript.id);
      }

      await storage.createTranscript(transcriptData);

      res.json({ 
        success: true, 
        stage,
        redirectPath,
        message: `Skipped to ${stage}. Database state has been set up.`
      });
    } catch (error: any) {
      console.error("Dev skip error:", error);
      res.status(500).json({ error: error.message });
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

  return httpServer;
}
