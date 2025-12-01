import type { Express } from "express";
import { createServer, type Server } from "http";
import OpenAI from "openai";
import path from "path";
import express from "express";
import { getStripeClient } from "./stripeClient";

// Using gpt-4.1-mini as specifically requested by the user
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

// Cache the price ID after creation
let testPriceId: string | null = null;

// Create or get a $19 test price
async function getOrCreateTestPrice(): Promise<string> {
  if (testPriceId) return testPriceId;
  
  const stripe = await getStripeClient();
  
  // Check for existing product with our metadata
  const existingProducts = await stripe.products.list({ limit: 100 });
  const existingProduct = existingProducts.data.find(
    p => p.metadata?.app === 'career-scripts'
  );
  
  if (existingProduct) {
    // Find an active price for this product
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
  
  // Create product and price if not found
  const product = await stripe.products.create({
    name: 'Career Coaching Scripts',
    description: 'Three personalized scripts to navigate your career transition',
    metadata: { app: 'career-scripts' }
  });
  
  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: 1900, // $19.00
    currency: 'usd',
  });
  
  testPriceId = price.id;
  console.log(`Created new price: ${testPriceId}`);
  return testPriceId;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Serve static files from public directory
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
        cancel_url: `${baseUrl}/`,
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

  // POST /generate - Generate career coaching scripts with OpenAI
  app.post("/generate", async (req, res) => {
    try {
      // Validate OpenAI API key is configured
      if (!process.env.OPENAI_API_KEY) {
        return res.status(500).json({ error: "OpenAI API key not configured" });
      }

      const {
        role,
        companyContext,
        whatsNotWorking,
        whatYouWant,
        bossAsk,
        partnerContext,
        runway,
        riskTolerance,
      } = req.body;

      // Validate required fields
      const requiredFields = ['role', 'companyContext', 'whatsNotWorking', 'whatYouWant', 'bossAsk', 'runway', 'riskTolerance'];
      for (const field of requiredFields) {
        if (!req.body[field] || typeof req.body[field] !== 'string' || req.body[field].trim() === '') {
          return res.status(400).json({ error: `Missing or invalid field: ${field}` });
        }
      }

      const prompt = `You are a candid but compassionate career coach.

User details:

Role: ${role}

Company context: ${companyContext}

What's not working: ${whatsNotWorking}

What they want instead: ${whatYouWant}

What they'd ask their boss for: ${bossAsk}

Partner context: ${partnerContext}

Financial runway: ${runway}

Risk tolerance (1-5): ${riskTolerance}

Produce three sections:

"Script for talking to my boss" – a conversational 2–3 minute script they can mostly read verbatim. Be honest but non-destructive. Model "disagree and commit" if staying is on the table.

"Script for talking to my partner" – empathetic, transparent about risk and money, asking for support, not just permission.

"Clarity memo" – one page with:

Summary of the situation

2–3 realistic options (e.g., stay and renegotiate, line up a new job then quit, sabbatical/independent)

Top 3 risks for each option

A concrete 30-day experiment.

Keep language plain, no corporate jargon, no AI-speak.`;

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
