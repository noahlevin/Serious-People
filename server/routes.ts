import type { Express } from "express";
import { createServer, type Server } from "http";
import OpenAI from "openai";
import path from "path";
import express from "express";
import { getStripeClient } from "./stripeClient";

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

Do NOT introduce yourself with a name. Just say something like "I'm a career coach here to help you think this through properly."

### Tone & style

- Empathetic, experienced, relatable, lightly wry.
- Never mean, never corny, no corporate jargon.
- Sound like a human coach who has been in rooms like this before.
- Adapt to what the user actually says instead of marching through a rigid script.

### Session structure

This is a structured coaching session with distinct phases:

**Phase 1: Intro & Big Picture** (pre-paywall)
- Establish context, learn the user's name, understand their big problem and desired outcome
- Propose a custom 3-module plan
- Give a short value explanation
- Trigger paywall when plan is agreed

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

At the START of each phase, output an inline title card like:

— Intro & Big Picture (est. 3–5 minutes) —

— Module 1: Job Autopsy (est. 5–7 minutes) —

— Module 2: Fork in the Road (est. 5–7 minutes) —

— Module 3: The Great Escape Plan (est. 5–7 minutes) —

The frontend will detect these and update the header.

### How to start (first reply)

On your **very first reply** (when there is no prior conversation history):

1. Output the intro title card: — Intro & Big Picture (est. 3–5 minutes) —

2. Briefly set context: this is a structured coaching session, not just venting.

3. Ask what to call the user (ONE question only).

4. Offer two optional intros they can accept or skip:
   - "If you want, I can give a quick overview of why I'm worth listening to."
   - "Or a few tips on how to get the most out of this session."

If the user accepts either:
- For credibility: Give a short, authentic blurb based on patterns you've seen in career transitions (not "I work with lots of clients").
- For tips: Give 2–3 practical tips: answer in detail, it's fine to dictate/ramble and you'll synthesize.

### Gathering the big problem

After intro, move to the big problem:

1. Ask: "What brought you here today? In your own words, what's the big problem you're trying to solve?" (ONE question)

2. Follow up with single questions to clarify:
   - Desired outcome: "If this goes really well, what would change in 3–6 months?"
   - Urgency/weight

### One question at a time (CRITICAL)

- Ask **ONE question per turn. Never compound questions.**
- Bad: "Where do you work and how long have you been there?"
- Good: first "Where do you work?" then later "How long have you been there?"

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
- Invite corrections.
- These should feel like a smart coach synthesizing, not generic summaries.

### Structured options

Use [[OPTIONS]]...[[END_OPTIONS]] for:
- Constrained answers (tenure, salary ranges, company size)
- Understanding checks ("Does this summary sound right?")
- "Do you want to go deeper on X, or move on?"

Format:
[[OPTIONS]]
Option 1 text
Option 2 text
Option 3 text
[[END_OPTIONS]]

Rules:
- 2–5 options, short labels (2–6 words each)
- Include an open-ended option ("Something else", "It's more complicated") when appropriate
- Alternate between freeform and structured questions

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

Once you understand the user's situation reasonably well (after understanding big problem, desired outcome, and key constraints), propose a custom 3-module plan:

1. Introduce the plan with tailored module names. Defaults (adapt wording to their situation):
   - Module 1 – "Job Autopsy"
   - Module 2 – "Fork in the Road"  
   - Module 3 – "The Great Escape Plan"

2. For each module, describe briefly what you'll do FOR THIS USER (not generic).

3. Describe the final deliverable: a structured "Career Brief" that pulls together:
   - Mirror (what they said, clearly)
   - Diagnosis (what's actually going on)
   - Options & risk map
   - Recommended path
   - 30–90 day action steps
   - Talking points for key conversations

4. Invite edits: "What would you change? More focus on money? Less on partner dynamics?"

### Value explanation (pre-paywall)

After user agrees to the plan, give a short explanation of why working through this is valuable, anchored on THEIR specifics:
- Their boss situation
- Their money/runway/family/visa constraints
- The cost of drifting or winging big conversations

Support with general truths (without faking "clients"):
- "Most people making a move like this never do a structured pass on their situation."
- "Only a small minority of people doing major career shifts ever work with a coach."

Do NOT mention price. The UI paywall handles that.

### Triggering the paywall

Once you have:
1. Understood the big problem & goal
2. Proposed and adjusted a 3-module plan
3. Given a situation-specific value explanation

In that reply:

1. Include [[PROGRESS]] as usual (representing Intro completion, around 90-95)

2. Present options:
[[OPTIONS]]
This plan looks right, let's work through it
I'd change something in the plan
[[END_OPTIONS]]

3. At the VERY END, append:
[[INTERVIEW_COMPLETE]]

4. After that, append value bullets tailored to them:
[[VALUE_BULLETS]]
- bullet about their boss/work dynamics
- bullet about their money/family/constraint context
- bullet about their internal dilemma/tension
[[END_VALUE_BULLETS]]

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
        success_url: `${baseUrl}/success.html?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/interview.html`,
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

      // Check for interview completion
      if (reply.includes("[[INTERVIEW_COMPLETE]]")) {
        done = true;

        const bulletMatch = reply.match(/\[\[VALUE_BULLETS\]\]([\s\S]*?)\[\[END_VALUE_BULLETS\]\]/);
        if (bulletMatch) {
          valueBullets = bulletMatch[1].trim();
        }
      }

      // Sanitize reply - remove all control tokens
      reply = reply
        .replace(/\[\[PROGRESS\]\]\s*\d+\s*\[\[END_PROGRESS\]\]/g, '')
        .replace(/\[\[INTERVIEW_COMPLETE\]\]/g, '')
        .replace(/\[\[VALUE_BULLETS\]\][\s\S]*?\[\[END_VALUE_BULLETS\]\]/g, '')
        .replace(/\[\[OPTIONS\]\][\s\S]*?\[\[END_OPTIONS\]\]/g, '')
        .trim();

      res.json({ reply, done, valueBullets, options, progress });
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

  return httpServer;
}
