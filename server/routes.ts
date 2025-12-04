import type { Express } from "express";
import { createServer, type Server } from "http";
import OpenAI from "openai";
import path from "path";
import express from "express";
import { getStripeClient } from "./stripeClient";
import { storage } from "./storage";

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

let testPriceId: string | null = null;

async function getOrCreateTestPrice(): Promise<string> {
  if (testPriceId) return testPriceId;
  
  const stripe = await getStripeClient();
  
  const existingProducts = await stripe.products.list({ limit: 100 });
  const existingProduct = existingProducts.data.find(
    p => p.metadata?.app === 'serious-people'
  );
  
  if (existingProduct) {
    const prices = await stripe.prices.list({ 
      product: existingProduct.id, 
      active: true,
      limit: 1 
    });
    if (prices.data.length > 0) {
      testPriceId = prices.data[0].id;
      console.log(`Using existing price: ${testPriceId}`);
      return testPriceId;
    }
  }
  
  const product = await stripe.products.create({
    name: 'Serious People - Career Scripts',
    description: 'Three personalized scripts: boss script, partner script, and clarity memo',
    metadata: { app: 'serious-people' }
  });
  
  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: 1900,
    currency: 'usd',
  });
  
  testPriceId = price.id;
  console.log(`Created new price: ${testPriceId}`);
  return testPriceId;
}

const INTERVIEW_SYSTEM_PROMPT = `You are an experienced, plain-spoken career coach. You help people navigate job crossroads with clarity and structure.

Do NOT introduce yourself with a name. Just say something warm and welcoming, like "Hi there! I'm excited to get to know you and start working with you on your career goals."

### Tone & style

- Warm, welcoming, and genuinely interested in establishing rapport.
- Empathetic, experienced, relatable, lightly wry.
- Never mean, never corny, no corporate jargon.
- Sound like a human coach who has been in rooms like this before.
- Adapt to what the user actually says instead of marching through a rigid script.

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

— Interview (est. 3–5 minutes) —

— Module 1: Job Autopsy (est. 5–7 minutes) —

— Module 2: Fork in the Road (est. 5–7 minutes) —

— Module 3: The Great Escape Plan (est. 5–7 minutes) —

The frontend will detect these, style them elegantly, and update the header.

### How to start (first reply)

On your **very first reply** (when there is no prior conversation history):

1. Output the intro title card on its own line: — Interview (est. 3–5 minutes) —

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

### Gathering the big problem

After intro, move to the big problem. Ask ONE clear question:

"What brought you here today?"

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

### Structured options (USE FREQUENTLY)

Use [[OPTIONS]]...[[END_OPTIONS]] liberally throughout the interview. They make responding easier and faster.

Use them for:
- Binary choices after reflections ("Does this sound right?" → Yes / Let me clarify)
- Navigation ("Go deeper on X" / "Move on to next topic")
- Constrained answers (tenure ranges, company size, salary bands)
- Plan confirmation ("This plan looks right" / "I'd change something")
- Any time you can anticipate 2–4 likely responses

Format:
[[OPTIONS]]
Option 1 text
Option 2 text
Option 3 text
[[END_OPTIONS]]

Rules:
- 2–5 options, short labels (2–8 words each)
- Include an open-ended option ("Something else", "It's more complicated") when appropriate
- Aim to use structured options at least every 2–3 turns
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

Once you understand the user's situation reasonably well (after understanding big problem, desired outcome, and key constraints), propose a custom 3-module plan.

**Present the plan in this specific order:**

1. Say: "Here's the custom plan I've built for you:"

2. Output the plan card using this EXACT format:

[[PLAN_CARD]]
NAME: [User's first name]
MODULE1_NAME: Job Autopsy
MODULE1_DESC: [1-2 sentence personalized description of what you'll cover for THIS user]
MODULE2_NAME: Fork in the Road
MODULE2_DESC: [1-2 sentence personalized description of what you'll cover for THIS user]
MODULE3_NAME: The Great Escape Plan
MODULE3_DESC: [1-2 sentence personalized description of what you'll cover for THIS user]
CAREER_BRIEF: [2-3 sentences describing the final deliverable - a structured document with their situation mirror, diagnosis, options map, action plan, and conversation scripts tailored to their specific people and dynamics]
[[END_PLAN_CARD]]

3. Then ask: "Does this look right to you, or is there something you'd like to change?"

4. End with structured options:
[[OPTIONS]]
This looks right, let's get started
I'd like to change something
[[END_OPTIONS]]

Adapt the module names if helpful (e.g., "The Boss Problem" instead of "Job Autopsy" if that fits better). The descriptions MUST be personalized to their situation, not generic.

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
A single sentence that either: references $19 vs. typical career coach fees ($150-300/hour), OR cites a relevant stat about career transitions/coaching effectiveness, OR provides context about why structured coaching helps in their specific situation. Make it feel natural and relevant to what they shared. Do NOT make up fake testimonials or specific client references.
[[END_SOCIAL_PROOF]]

CRITICAL: The paywall only appears after [[INTERVIEW_COMPLETE]]. This token should ONLY be emitted after the user explicitly confirms the plan.

### Post-paywall modules

After paywall, continue the session:

**Module 1: Job Autopsy**
- Output title card: — Module 1: Job Autopsy (est. 5–7 minutes) —
- Deep dive on current situation
- End with a clear Mirror (what they said) + short Diagnosis artifact

**Module 2: Fork in the Road**
- Output title card: — Module 2: Fork in the Road (est. 5–7 minutes) —
- Explore options and constraints
- End with Options & Risk Snapshot artifact

**Module 3: The Great Escape Plan**
- Output title card: — Module 3: The Great Escape Plan (est. 5–7 minutes) —
- Build action plan
- End with action outline + rough talking points artifact

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
  
  // POST /checkout - Create Stripe Checkout session
  app.post("/checkout", async (req, res) => {
    try {
      const stripe = await getStripeClient();
      const priceId = await getOrCreateTestPrice();
      const baseUrl = getBaseUrl();
      
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        success_url: `${baseUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/interview`,
        allow_promotion_codes: true,
      });

      res.json({ url: session.url });
    } catch (error: any) {
      console.error("Checkout error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /verify-session - Verify Stripe payment
  app.get("/verify-session", async (req, res) => {
    try {
      const sessionId = req.query.session_id as string;
      
      if (!sessionId) {
        return res.status(400).json({ ok: false, error: "Missing session_id" });
      }

      const stripe = await getStripeClient();
      const session = await stripe.checkout.sessions.retrieve(sessionId);

      if (session.payment_status === "paid") {
        return res.json({ ok: true });
      } else {
        return res.status(403).json({ ok: false, error: "Payment not completed" });
      }
    } catch (error: any) {
      console.error("Verify session error:", error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // POST /interview - AI interview endpoint
  app.post("/interview", async (req, res) => {
    try {
      if (!process.env.OPENAI_API_KEY) {
        return res.status(500).json({ error: "OpenAI API key not configured" });
      }

      const { transcript = [] } = req.body;

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

      let reply = response.choices[0].message.content || "";
      let done = false;
      let valueBullets: string | null = null;
      let socialProof: string | null = null;
      let options: string[] | null = null;
      let progress: number | null = null;
      let planCard: { name: string; modules: { name: string; desc: string }[]; careerBrief: string } | null = null;

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

      // Parse plan card
      const planCardMatch = reply.match(/\[\[PLAN_CARD\]\]([\s\S]*?)\[\[END_PLAN_CARD\]\]/);
      if (planCardMatch) {
        const cardContent = planCardMatch[1].trim();
        const nameMatch = cardContent.match(/NAME:\s*(.+)/);
        const module1NameMatch = cardContent.match(/MODULE1_NAME:\s*(.+)/);
        const module1DescMatch = cardContent.match(/MODULE1_DESC:\s*(.+)/);
        const module2NameMatch = cardContent.match(/MODULE2_NAME:\s*(.+)/);
        const module2DescMatch = cardContent.match(/MODULE2_DESC:\s*(.+)/);
        const module3NameMatch = cardContent.match(/MODULE3_NAME:\s*(.+)/);
        const module3DescMatch = cardContent.match(/MODULE3_DESC:\s*(.+)/);
        const careerBriefMatch = cardContent.match(/CAREER_BRIEF:\s*(.+)/);

        if (nameMatch) {
          planCard = {
            name: nameMatch[1].trim(),
            modules: [
              { name: module1NameMatch?.[1]?.trim() || 'Job Autopsy', desc: module1DescMatch?.[1]?.trim() || '' },
              { name: module2NameMatch?.[1]?.trim() || 'Fork in the Road', desc: module2DescMatch?.[1]?.trim() || '' },
              { name: module3NameMatch?.[1]?.trim() || 'The Great Escape Plan', desc: module3DescMatch?.[1]?.trim() || '' }
            ],
            careerBrief: careerBriefMatch?.[1]?.trim() || ''
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

  // POST /generate - Generate career coaching scripts from transcript
  app.post("/generate", async (req, res) => {
    try {
      if (!process.env.OPENAI_API_KEY) {
        return res.status(500).json({ error: "OpenAI API key not configured" });
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

      const response = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: [{ role: "user", content: prompt }],
        max_completion_tokens: 4096,
      });

      const text = response.choices[0].message.content;
      res.json({ text });
    } catch (error: any) {
      console.error("Generate error:", error);
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

  return httpServer;
}
