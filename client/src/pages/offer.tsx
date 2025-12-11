import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useJourney } from "@/hooks/useJourney";
import { UserMenu } from "@/components/UserMenu";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { 
  ChevronDown, 
  Clock, 
  FileText, 
  MessageSquare, 
  Target, 
  Shield, 
  BookOpen,
  CheckCircle2,
  Pause,
  Zap,
  Lock,
  RefreshCw
} from "lucide-react";
import "@/styles/serious-people.css";

interface PricingData {
  originalPrice: number;
  discountedPrice: number | null;
  percentOff: number | null;
  amountOff: number | null;
  currency: string;
}

interface CoachingPlan {
  name: string;
  modules: { name: string; objective: string; approach: string; outcome: string }[];
  careerBrief: string;
  seriousPlanSummary?: string;
  plannedArtifacts?: { key: string; title: string; type: string; description: string }[];
}

interface TranscriptData {
  planCard: CoachingPlan | null;
  valueBullets: string | null;
}

// Artifact type to icon mapping
const artifactIcons: Record<string, typeof FileText> = {
  snapshot: Target,
  conversation: MessageSquare,
  plan: FileText,
  strategic: Shield,
  reference: BookOpen,
  personal: Zap,
};

const faqs = [
  {
    question: "How long does the coaching session take?",
    answer: "The full session takes about 30 minutes, split across three focused modules. You can pause and return anytime—your progress is saved automatically."
  },
  {
    question: "What exactly do I get at the end?",
    answer: "You'll receive your Serious Plan—a comprehensive package including a Decision Snapshot, personalized conversation scripts, a 30-90 day action plan, risk assessment, and curated resources. All tailored to your specific situation."
  },
  {
    question: "Can I really pause and come back later?",
    answer: "Absolutely. Your conversation is saved at every step. Close the browser, come back tomorrow—you'll pick up right where you left off."
  },
  {
    question: "Is this a real coach or just AI?",
    answer: "It's AI-powered coaching built on proven coaching methodologies. It won't pretend to be human, but it follows a structured curriculum designed by experienced coaches—asking hard questions, pushing back on fuzzy thinking, and helping you reach clarity."
  },
  {
    question: "What if I'm not sure what I want to change?",
    answer: "That's exactly what Module 2 (Fork in the Road) is for. Many people arrive unclear about their options. The coaching process helps you explore paths you might not have considered."
  },
  {
    question: "Is my information private?",
    answer: "Yes. Your conversation and plan are stored securely and never shared with anyone. We don't sell your data or use it to train AI models."
  },
  {
    question: "Can I get a refund if I'm not satisfied?",
    answer: "If the coaching session doesn't help you gain clarity on your situation, reach out to hello@seriouspeople.com within 7 days for a full refund. No questions asked."
  },
  {
    question: "What makes this different from ChatGPT?",
    answer: "Generic AI validates whatever you say. Serious People follows a specific coaching philosophy: it asks harder questions, reflects back what it hears, and sometimes disagrees with you. It's designed to help you think, not just feel heard."
  },
  {
    question: "Will this replace my need for a human coach?",
    answer: "It's a powerful first step. For many situations, it provides the clarity you need. For complex ongoing challenges, your Serious Plan becomes an excellent starting brief for a human coach."
  },
  {
    question: "What if my situation changes before I finish?",
    answer: "Your coach adapts. If new information comes up during the session, mention it—the conversation will adjust. Your final plan reflects your situation as of when you complete it."
  }
];

const features = [
  { icon: Clock, title: "30 Minutes", description: "Focused, structured session" },
  { icon: Pause, title: "Pause Anytime", description: "Return when you're ready" },
  { icon: Lock, title: "Private & Secure", description: "Your data stays yours" },
  { icon: RefreshCw, title: "Tailored to You", description: "Not a generic template" },
];

// Default modules when planCard is missing
const defaultModules = [
  {
    name: "Job Autopsy",
    objective: "Understand what's really driving your desire for change",
    approach: "We'll dig into your current situation—beyond surface frustrations—to identify the core issues.",
    outcome: "Crystal clarity on why now is the time for a change"
  },
  {
    name: "Fork in the Road",
    objective: "Explore your realistic options without magical thinking",
    approach: "We'll map out paths you might not have considered, stress-test assumptions, and narrow to viable options.",
    outcome: "A clear view of 2-3 realistic paths forward"
  },
  {
    name: "The Great Escape Plan",
    objective: "Build a concrete action plan you'll actually follow",
    approach: "We'll create specific next steps, conversation scripts, and contingency plans.",
    outcome: "A 30-90 day roadmap with clear milestones"
  }
];

// Default value bullets when valueBullets is missing
const defaultValueBullets = [
  "Get unstuck from the analysis paralysis that's keeping you in place",
  "See your situation clearly without the fog of everyday stress",
  "Know exactly what to say in difficult conversations with your boss or team",
  "Have a concrete plan instead of vague intentions",
  "Feel confident about your next move, whatever it is"
];

// Default planned artifacts when planCard.plannedArtifacts is missing
const defaultArtifacts = [
  { key: "decision_snapshot", title: "Decision Snapshot", type: "snapshot", description: "A clear summary of your situation, options, and recommended path forward" },
  { key: "conversation_scripts", title: "Conversation Scripts", type: "conversation", description: "Word-for-word scripts for difficult discussions you'll need to have" },
  { key: "action_plan", title: "30-90 Day Action Plan", type: "plan", description: "Specific steps with deadlines and accountability checkpoints" },
  { key: "risk_map", title: "Risk Assessment", type: "strategic", description: "What could go wrong and how to prepare for it" },
  { key: "resources", title: "Curated Resources", type: "reference", description: "Books, tools, and connections relevant to your path" },
  { key: "coach_letter", title: "Coach Graduation Note", type: "personal", description: "A personal message capturing your journey and next steps" }
];

export default function Offer() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { journeyState, isLoading: journeyLoading } = useJourney();
  const [, setLocation] = useLocation();
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [isCheckoutLoading, setIsCheckoutLoading] = useState(false);

  // Set page title
  useEffect(() => {
    document.title = "Your Coaching Plan - Serious People";
    // Remove page transition class if present
    document.body.classList.remove('page-transition-out');
  }, []);

  // Fetch pricing
  const { data: pricing } = useQuery<PricingData>({
    queryKey: ["/api/pricing"],
    staleTime: 60000,
  });

  // Fetch transcript data for plan card and value bullets
  const { data: transcriptData, isLoading: transcriptLoading } = useQuery<TranscriptData>({
    queryKey: ["/api/transcript"],
    enabled: isAuthenticated,
  });

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      setLocation("/login");
    }
  }, [authLoading, isAuthenticated, setLocation]);

  // Redirect if interview not complete
  useEffect(() => {
    if (!journeyLoading && journeyState && !journeyState.interviewComplete) {
      setLocation("/interview");
    }
  }, [journeyLoading, journeyState, setLocation]);

  // Redirect if already paid
  useEffect(() => {
    if (!journeyLoading && journeyState?.paymentVerified) {
      setLocation("/module/1");
    }
  }, [journeyLoading, journeyState, setLocation]);

  const handleCheckout = async () => {
    setIsCheckoutLoading(true);

    try {
      const urlParams = new URLSearchParams(window.location.search);
      let promoCode = urlParams.get('promo');
      if (!promoCode) {
        promoCode = sessionStorage.getItem('sp_promo_code');
      }

      const response = await fetch("/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ promoCode: promoCode || undefined }),
      });

      const data = await response.json();

      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error(data.error || "Failed to create checkout session");
      }
    } catch (error) {
      console.error("Checkout error:", error);
      alert("Something went wrong. Please try again.");
      setIsCheckoutLoading(false);
    }
  };

  const hasDiscount = pricing && pricing.discountedPrice !== null && pricing.discountedPrice < pricing.originalPrice;
  const displayPrice = hasDiscount ? pricing.discountedPrice : (pricing?.originalPrice ?? 49);
  const originalPrice = pricing?.originalPrice ?? 49;

  const planCard = transcriptData?.planCard;
  const parsedValueBullets = transcriptData?.valueBullets
    ? transcriptData.valueBullets.trim().split("\n").filter(line => line.trim().startsWith("-")).map(line => line.replace(/^-\s*/, "").trim())
    : [];
  
  // Use fallbacks when personalized data is missing
  const displayModules = planCard?.modules || defaultModules;
  const displayName = planCard?.name || "Your";
  const valueBullets = parsedValueBullets.length > 0 ? parsedValueBullets : defaultValueBullets;
  const plannedArtifacts = planCard?.plannedArtifacts || defaultArtifacts;

  if (authLoading || journeyLoading || transcriptLoading) {
    return (
      <div className="sp-offer-page">
        <div className="sp-offer-loading">
          <div className="sp-spinner-large" />
          <p>Loading your coaching plan...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="sp-offer-page">
      {/* Header */}
      <header className="sp-offer-header">
        <div className="sp-offer-header-content">
          <Link href="/" className="sp-logo-link">
            <img src="/favicon.png" alt="Serious People" className="sp-logo-icon" />
            <span className="sp-logo">Serious People</span>
          </Link>
          <UserMenu />
        </div>
      </header>

      {/* Hero Section with Logan Roy Quote */}
      <motion.section 
        className="sp-offer-hero"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8 }}
      >
        <div className="sp-offer-hero-content">
          <motion.div 
            className="sp-offer-quote-box"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <img src="/logan-roy.png" alt="Logan Roy" className="sp-offer-quote-image" />
            <blockquote className="sp-offer-quote">
              <p>"You make your own reality."</p>
              <cite>— Logan Roy</cite>
            </blockquote>
          </motion.div>
          
          <motion.h1 
            className="sp-offer-hero-title"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            Your Coaching Plan is Ready
          </motion.h1>
          
          <motion.p 
            className="sp-offer-hero-subtitle"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.5 }}
          >
            We've designed a personalized session based on your situation. <br />
            <span className="sp-highlight">30 minutes to clarity. Pause and return anytime.</span>
          </motion.p>
        </div>
      </motion.section>

      {/* Program Overview */}
      <motion.section 
        className="sp-offer-section sp-offer-program"
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
      >
        <div className="sp-offer-container">
          <h2 className="sp-offer-section-title">{displayName}'s Coaching Journey</h2>
          
          <div className="sp-offer-modules-grid">
            {displayModules.map((mod, i) => (
              <motion.div 
                key={i} 
                className="sp-offer-module-card"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
              >
                <div className="sp-offer-module-number">Module {i + 1}</div>
                <h3 className="sp-offer-module-name">{mod.name}</h3>
                <p className="sp-offer-module-objective">{mod.objective}</p>
                <div className="sp-offer-module-outcome">
                  <CheckCircle2 size={16} />
                  <span>{mod.outcome}</span>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.section>

      {/* Value Propositions */}
      <motion.section 
        className="sp-offer-section sp-offer-value"
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
      >
        <div className="sp-offer-container">
          <h2 className="sp-offer-section-title">Why This Matters for You</h2>
          <div className="sp-offer-value-list">
            {valueBullets.map((bullet, i) => (
              <motion.div 
                key={i} 
                className="sp-offer-value-item"
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.1 }}
              >
                <CheckCircle2 className="sp-offer-value-icon" />
                <span>{bullet}</span>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.section>

      {/* Artifact Preview */}
      <motion.section 
        className="sp-offer-section sp-offer-artifacts"
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
      >
        <div className="sp-offer-container">
          <h2 className="sp-offer-section-title">Your Serious Plan Includes</h2>
          <p className="sp-offer-section-subtitle">
            After completing the session, you'll receive a comprehensive package of personalized deliverables:
          </p>
          
          <div className="sp-offer-artifacts-grid">
            {plannedArtifacts.map((artifact, i) => {
              const IconComponent = artifactIcons[artifact.type] || FileText;
              return (
                <motion.div 
                  key={i} 
                  className="sp-offer-artifact-card"
                  initial={{ opacity: 0, scale: 0.95 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: i * 0.05 }}
                >
                  <IconComponent className="sp-offer-artifact-icon" />
                  <h4 className="sp-offer-artifact-title">{artifact.title}</h4>
                  <p className="sp-offer-artifact-desc">{artifact.description}</p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </motion.section>

      {/* Features Grid */}
      <motion.section 
        className="sp-offer-section sp-offer-features"
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
      >
        <div className="sp-offer-container">
          <div className="sp-offer-features-grid">
            {features.map((feature, i) => (
              <motion.div 
                key={i} 
                className="sp-offer-feature"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.1 }}
              >
                <feature.icon className="sp-offer-feature-icon" />
                <h4>{feature.title}</h4>
                <p>{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.section>

      {/* CTA Section */}
      <motion.section 
        className="sp-offer-section sp-offer-cta"
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
      >
        <div className="sp-offer-container">
          <div className="sp-offer-cta-box">
            <h2>Ready to Start?</h2>
            <p className="sp-offer-cta-subtitle">
              Begin your 30-minute coaching session now. Pause and return anytime.
            </p>
            
            <button
              className="sp-offer-cta-button"
              data-testid="button-checkout-primary"
              onClick={handleCheckout}
              disabled={isCheckoutLoading}
            >
              {isCheckoutLoading ? (
                <>
                  <span className="sp-spinner"></span>
                  <span>Redirecting to checkout...</span>
                </>
              ) : (
                <>
                  Start Coaching Session — {hasDiscount ? (
                    <>
                      <span className="sp-cta-price-original">${originalPrice}</span>
                      <span className="sp-cta-price-discounted">${displayPrice}</span>
                    </>
                  ) : (
                    `$${displayPrice}`
                  )}
                </>
              )}
            </button>
            
            <p className="sp-offer-cta-note">
              Secure checkout via Stripe{hasDiscount && " · Discount pre-applied"} · 7-day refund guarantee
            </p>
          </div>
        </div>
      </motion.section>

      {/* FAQs */}
      <motion.section 
        className="sp-offer-section sp-offer-faqs"
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
      >
        <div className="sp-offer-container">
          <h2 className="sp-offer-section-title">Frequently Asked Questions</h2>
          
          <div className="sp-offer-faq-list">
            {faqs.map((faq, i) => (
              <motion.div 
                key={i} 
                className={`sp-offer-faq-item ${openFaq === i ? 'open' : ''}`}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.3, delay: i * 0.03 }}
              >
                <button
                  className="sp-offer-faq-question"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  data-testid={`faq-toggle-${i}`}
                >
                  <span>{faq.question}</span>
                  <ChevronDown className={`sp-offer-faq-chevron ${openFaq === i ? 'rotated' : ''}`} />
                </button>
                <div className={`sp-offer-faq-answer ${openFaq === i ? 'visible' : ''}`}>
                  <p>{faq.answer}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.section>

      {/* Final CTA */}
      <motion.section 
        className="sp-offer-section sp-offer-final-cta"
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
      >
        <div className="sp-offer-container">
          <h2>Your clarity is waiting.</h2>
          
          <button
            className="sp-offer-cta-button-secondary"
            data-testid="button-checkout-secondary"
            onClick={handleCheckout}
            disabled={isCheckoutLoading}
          >
            {isCheckoutLoading ? "Loading..." : (
              <>
                Begin Session — {hasDiscount ? (
                  <>
                    <span className="sp-cta-price-original">${originalPrice}</span>
                    <span className="sp-cta-price-discounted">${displayPrice}</span>
                  </>
                ) : (
                  `$${displayPrice}`
                )}
              </>
            )}
          </button>
          
          <Link href="/interview" className="sp-offer-back-link" data-testid="link-back-interview">
            ← Back to interview
          </Link>
        </div>
      </motion.section>

      {/* Footer */}
      <footer className="sp-offer-footer">
        <p>© 2024 Serious People · <a href={`mailto:hello@seriouspeople.com`}>hello@seriouspeople.com</a></p>
      </footer>
    </div>
  );
}
