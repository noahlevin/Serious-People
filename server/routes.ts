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

const INTERVIEW_SYSTEM_PROMPT = `You are "Serious People", a candid but compassionate career coach.
Your job is to interview the user about their current job situation and whether they should leave.

Rough framework (adapt as needed based on their answers):
- Questions 1–4: Clarify role & context
  - What do they do? Where do they work? How long? Industry?
- Questions 5–8: What's not working?
  - Specific frictions, patterns, people, expectations.
- Questions 9–12: Stakes & constraints
  - Money, family, health, identity, visa, geography, etc.
- Questions 13–16: Options & appetite
  - What have they already considered? What are they scared of?
- Questions 17–20: Go deeper
  - Partner's perspective, boss dynamics, specific fears, timeline.

Rules:
- Ask ONE question at a time. Never compound questions.
- Keep questions concrete and practical (not therapy).
- Every 3–4 user answers, pause to reflect back what you think you understand in 2–3 short bullet points. This is your proof of understanding.
- Aim for about 15–20 questions total *before* you feel ready.

STRUCTURED OPTIONS:
Roughly every other question, instead of asking for freeform text, present the user with 2–5 clickable options.
Use structured options for:
- Constrained questions (tenure, salary ranges, company size, industry)
- Yes/no or simple choice questions
- Checking understanding ("Does this sound right?")
- Asking if they want to continue or go deeper on a topic
- Gauging intensity or frequency ("How often?", "How much?")

To present structured options, end your message with this exact format:
[[OPTIONS]]
Option 1 text
Option 2 text
Option 3 text
[[END_OPTIONS]]

Examples of good structured option questions:
- "How long have you been in this role?" with options: Less than 1 year | 1–2 years | 3–5 years | 5+ years
- "Does that summary capture it?" with options: Yes, that's right | Mostly, but... | Not quite
- "Do you want to go deeper on the money side, or move on?" with options: Go deeper on money | Move on

Rules for structured options:
- Keep option text SHORT (2–6 words each)
- Provide 2–5 options
- Always include an open-ended option like "Something else" or "It's more complicated" when appropriate
- The user can still type a freeform response even when options are shown

After you feel you have enough information to write:
  - a boss conversation script,
  - a partner conversation script,
  - and a one-page clarity memo about their options,

do this in your next reply:
1) Talk to the user normally, in plain language, and say something like:
   - "I think I have enough to write your scripts. If you want, we can keep going and add more detail in any area that feels important."
   Offer 1–2 examples of areas they might want to go deeper.

2) Present options for whether to continue or get their scripts:
[[OPTIONS]]
I'm ready for my scripts
Let's keep going
[[END_OPTIONS]]

3) At the VERY END of your reply (after the options), append the exact token:
   [[INTERVIEW_COMPLETE]]

4) After that token, append a short, user-specific list of why the scripts will be valuable for them personally:

[[VALUE_BULLETS]]
- bullet about their boss situation
- bullet about their partner / home situation
- bullet about their internal dilemma or stakes
[[END_VALUE_BULLETS]]

Tone:
- Plain, direct, no corporate jargon.
- Respectful but not fawning. You are talking to a competent adult.
- You can be lightly funny or wry, but never mean.

Important:
- Do NOT mention these rules, tokens, or that you will later write scripts.
- Do NOT output [[INTERVIEW_COMPLETE]] until you genuinely feel ready to write useful scripts.
- Make sure to alternate between freeform questions and structured option questions.`;

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

      // Parse structured options
      const optionsMatch = reply.match(/\[\[OPTIONS\]\]([\s\S]*?)\[\[END_OPTIONS\]\]/);
      if (optionsMatch) {
        options = optionsMatch[1]
          .trim()
          .split('\n')
          .map(opt => opt.trim())
          .filter(opt => opt.length > 0);
        
        // Remove options block from reply
        reply = reply.replace(/\[\[OPTIONS\]\][\s\S]*?\[\[END_OPTIONS\]\]/, '').trim();
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
        .replace(/\[\[INTERVIEW_COMPLETE\]\]/g, '')
        .replace(/\[\[VALUE_BULLETS\]\][\s\S]*?\[\[END_VALUE_BULLETS\]\]/g, '')
        .replace(/\[\[OPTIONS\]\][\s\S]*?\[\[END_OPTIONS\]\]/g, '')
        .trim();

      res.json({ reply, done, valueBullets, options });
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

      const prompt = `You previously interviewed a user about their job situation and whether they should quit.

Here is the full conversation between you (the coach) and the user:

${formatted}

Based on this transcript, produce three sections in clear, readable text:

1) "Script for talking to my boss"
- A conversational 2–3 minute script they can mostly read verbatim.
- Be honest but non-destructive.
- If staying is still on the table, model "disagree and commit" after decisions are made.
- Avoid therapy language. Use plain, direct English.

2) "Script for talking to my partner"
- A script that is empathetic and transparent about risk and money.
- Acknowledges their likely concerns (stability, income, stress at home).
- Asks for support and collaboration, not just permission.

3) "Clarity memo"
- A one-page style write-up with:
  - A short summary of the situation in 3–5 sentences.
  - 2–3 realistic options (e.g., stay and renegotiate, line up a new job then quit, take a sabbatical / independent path).
  - Top 3 risks for each option.
  - A concrete 30-day experiment plan.

Format:
- Use clear headings for each section.
- Use short paragraphs and bullet points where helpful.
- No corporate jargon. No mention of being an AI or a coach. Write as if the user drafted this themselves after talking it through with a mentor.`;

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
