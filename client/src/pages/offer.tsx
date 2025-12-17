import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useJourney } from "@/hooks/useJourney";
import { UserMenu } from "@/components/UserMenu";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { 
  ChevronDown, 
  Circle,
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
  RefreshCw,
  ArrowLeft
} from "lucide-react";

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

interface ClientDossier {
  clientName: string;
  currentRole: string;
  company: string;
  tenure: string;
  situation: string;
  bigProblem: string;
  desiredOutcome: string;
  clientFacingSummary: string;
  keyFacts: string[];
  relationships: { person: string; role: string; dynamic: string }[];
  emotionalState: string;
}

interface TranscriptData {
  planCard: CoachingPlan | null;
  valueBullets: string | null;
  clientDossier: ClientDossier | null;
}

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

const defaultValueBullets = [
  "Get unstuck from the analysis paralysis that's keeping you in place",
  "See your situation clearly without the fog of everyday stress",
  "Know exactly what to say in difficult conversations with your boss or team",
  "Have a concrete plan instead of vague intentions",
  "Feel confident about your next move, whatever it is"
];

const defaultArtifacts = [
  { key: "decision_snapshot", title: "Decision Snapshot", type: "snapshot", description: "A clear summary of your situation, options, and recommended path forward" },
  { key: "conversation_scripts", title: "Conversation Scripts", type: "conversation", description: "Word-for-word scripts for difficult discussions you'll need to have" },
  { key: "action_plan", title: "30-90 Day Action Plan", type: "plan", description: "Specific steps with deadlines and accountability checkpoints" },
  { key: "risk_map", title: "Risk Assessment", type: "strategic", description: "What could go wrong and how to prepare for it" },
  { key: "resources", title: "Curated Resources", type: "reference", description: "Books, tools, and connections relevant to your path" },
  { key: "coach_letter", title: "Coach Graduation Note", type: "personal", description: "A personal message capturing your journey and next steps" }
];

export default function Offer() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { journeyState, isLoading: journeyLoading } = useJourney();
  const [, setLocation] = useLocation();
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [isCheckoutLoading, setIsCheckoutLoading] = useState(false);

  useEffect(() => {
    document.title = "Your Coaching Plan - Serious People";
    document.body.classList.remove('page-transition-out');
  }, []);

  const { data: pricing } = useQuery<PricingData>({
    queryKey: ["/api/pricing"],
    staleTime: 60000,
  });

  const { data: transcriptData, isLoading: transcriptLoading } = useQuery<TranscriptData>({
    queryKey: ["/api/transcript"],
    enabled: isAuthenticated,
  });

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      setLocation("/login");
    }
  }, [authLoading, isAuthenticated, setLocation]);

  useEffect(() => {
    if (!journeyLoading && journeyState && !journeyState.interviewComplete) {
      setLocation("/interview");
    }
  }, [journeyLoading, journeyState, setLocation]);

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

      const basePath = window.location.pathname.startsWith('/app') ? '/app' : '';
      
      const response = await fetch("/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          promoCode: promoCode || undefined,
          basePath: basePath || undefined,
        }),
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
  const dossier = transcriptData?.clientDossier;
  const parsedValueBullets = transcriptData?.valueBullets
    ? transcriptData.valueBullets.trim().split("\n").filter(line => line.trim().startsWith("-")).map(line => line.replace(/^-\s*/, "").trim())
    : [];
  
  const displayModules = planCard?.modules || defaultModules;
  const displayName = dossier?.clientName || planCard?.name || user?.providedName || "Your";
  const firstName = displayName.split(' ')[0];
  const valueBullets = parsedValueBullets.length > 0 ? parsedValueBullets : defaultValueBullets;
  const plannedArtifacts = planCard?.plannedArtifacts || defaultArtifacts;
  
  const hasPersonalization = !!(dossier?.situation || dossier?.bigProblem);
  const roleContext = dossier?.currentRole && dossier?.company 
    ? `${dossier.currentRole} at ${dossier.company}` 
    : null;

  if (authLoading || journeyLoading || transcriptLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading your coaching plan...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-container mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <img src="/favicon.png" alt="Serious People" className="w-8 h-8" />
            <span className="font-serif text-lg font-bold text-foreground">Serious People</span>
          </Link>
          <UserMenu />
        </div>
      </header>

      <motion.section 
        className="py-section-lg bg-sage-wash"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8 }}
      >
        <div className="max-w-content mx-auto px-6 text-center">
          <motion.div 
            className="flex items-center justify-center gap-4 mb-8"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <img src="/logan-roy.png" alt="Logan Roy" className="w-16 h-16 rounded-full object-cover border-2 border-primary/20" />
            <blockquote className="text-left">
              <p className="font-serif text-lg italic text-foreground">"You make your own reality."</p>
              <cite className="text-sm text-muted-foreground not-italic">— Logan Roy</cite>
            </blockquote>
          </motion.div>
          
          <motion.h1 
            className="font-serif text-display-lg text-foreground mb-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            {firstName !== "Your" ? `${firstName}, Your Plan is Ready` : "Your Coaching Plan is Ready"}
          </motion.h1>
          
          {hasPersonalization && (
            <motion.div 
              className="mb-6"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.5 }}
              data-testid="personalized-context"
            >
              <p className="text-muted-foreground">
                {roleContext && <span className="font-medium text-foreground">{roleContext}</span>}
                {dossier?.bigProblem && (
                  <span>
                    {roleContext ? " · " : ""}Navigating: <em className="text-primary">{dossier.bigProblem}</em>
                  </span>
                )}
              </p>
            </motion.div>
          )}
          
          <motion.p 
            className="text-body-lg text-muted-foreground max-w-xl mx-auto mb-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: hasPersonalization ? 0.6 : 0.5 }}
          >
            {hasPersonalization 
              ? "Based on what you shared, we've designed a session specifically for your situation."
              : "We've designed a personalized session based on your situation."
            }
            <br />
            <span className="font-medium text-foreground">30 minutes to clarity. Pause and return anytime.</span>
          </motion.p>
          
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: hasPersonalization ? 0.7 : 0.6 }}
          >
            <Button
              size="lg"
              className="text-lg px-8 py-6"
              data-testid="button-checkout-hero"
              onClick={handleCheckout}
              disabled={isCheckoutLoading}
            >
              {isCheckoutLoading ? "Loading..." : (
                <>
                  Start Your Session — {hasDiscount ? (
                    <>
                      <span className="line-through opacity-60 mr-1">${originalPrice}</span>
                      ${displayPrice}
                    </>
                  ) : (
                    `$${displayPrice}`
                  )}
                </>
              )}
            </Button>
          </motion.div>
        </div>
      </motion.section>

      <motion.section 
        className="py-section bg-background"
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
      >
        <div className="max-w-content-wide mx-auto px-6">
          <h2 className="font-serif text-headline text-foreground text-center mb-4">{firstName}'s Coaching Journey</h2>
          
          {dossier?.clientFacingSummary && (
            <p className="text-muted-foreground text-center max-w-2xl mx-auto mb-12" data-testid="text-journey-summary">
              {dossier.clientFacingSummary}
            </p>
          )}
          
          <div className="grid md:grid-cols-4 gap-6">
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0 }}
            >
              <Card className="p-6 border-primary/30 bg-sage-wash/50">
                <div className="flex items-center gap-2 mb-3">
                  <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
                    <CheckCircle2 size={12} />
                    <span>Complete</span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Interview</p>
                <h3 className="font-serif text-lg font-semibold text-foreground mb-2">Discovery Session</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  {dossier?.situation 
                    ? dossier.situation.length > 120 
                      ? dossier.situation.substring(0, 117) + "..." 
                      : dossier.situation
                    : "We explored your current situation, constraints, and what you're looking for next."}
                </p>
                <div className="flex items-center gap-2 text-xs text-primary mb-4">
                  <CheckCircle2 size={14} />
                  <span>Completed today</span>
                </div>
                <div className="border-t border-border pt-4">
                  <p className="text-xs font-medium text-muted-foreground mb-2">What you shared:</p>
                  <div className="flex items-start gap-2 text-sm text-foreground">
                    <CheckCircle2 size={16} className="text-primary mt-0.5 flex-shrink-0" />
                    <span>Your situation, goals, and constraints</span>
                  </div>
                </div>
              </Card>
            </motion.div>

            {displayModules.map((module, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: (i + 1) * 0.15 }}
              >
                <Card className={cn(
                  "p-6",
                  i === 0 ? "border-primary/30" : "border-border"
                )}>
                  <div className="flex items-center gap-2 mb-3">
                    {i === 0 ? (
                      <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-terracotta-wash text-terracotta-foreground text-xs font-medium">
                        <span className="w-2 h-2 rounded-full bg-terracotta animate-pulse" />
                        <span>Up Next</span>
                      </div>
                    ) : (
                      <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-muted text-muted-foreground text-xs font-medium">
                        <Circle size={12} />
                        <span>Not Started</span>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Module {i + 1}</p>
                  <h3 className="font-serif text-lg font-semibold text-foreground mb-2">{module.name}</h3>
                  <p className="text-sm text-muted-foreground mb-4">{module.objective}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-4">
                    <Clock size={14} />
                    <span>10–15 min</span>
                  </div>
                  <div className="border-t border-border pt-4">
                    <p className="text-xs font-medium text-muted-foreground mb-2">What you'll get:</p>
                    <div className="flex items-start gap-2 text-sm text-foreground">
                      <Circle size={16} className="text-muted-foreground mt-0.5 flex-shrink-0" />
                      <span>{module.outcome}</span>
                    </div>
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>

          <motion.div 
            className="flex flex-col items-center mt-8"
            initial={{ opacity: 0, y: -10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.8 }}
          >
            <div className="w-px h-8 bg-border" />
            <ChevronDown size={20} className="text-muted-foreground" />
          </motion.div>
        </div>
      </motion.section>

      <motion.section 
        className="py-section bg-card"
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
      >
        <div className="max-w-content-wide mx-auto px-6">
          <h2 className="font-serif text-headline text-foreground text-center mb-4">{firstName}'s Tools to Take Away</h2>
          <p className="text-muted-foreground text-center max-w-2xl mx-auto mb-12">
            After completing the session, you'll receive a comprehensive package of personalized deliverables:
          </p>
          
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {plannedArtifacts.map((artifact, i) => {
              const IconComponent = artifactIcons[artifact.type] || FileText;
              return (
                <motion.div 
                  key={i} 
                  className="bg-background rounded-lg border border-border p-6"
                  initial={{ opacity: 0, scale: 0.95 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: i * 0.05 }}
                >
                  <IconComponent className="w-8 h-8 text-primary mb-4" />
                  <h4 className="font-serif text-lg font-semibold text-foreground mb-2">{artifact.title}</h4>
                  <p className="text-sm text-muted-foreground">{artifact.description}</p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </motion.section>

      <motion.section 
        className="py-section bg-background"
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
      >
        <div className="max-w-content mx-auto px-6">
          <h2 className="font-serif text-headline text-foreground text-center mb-12">Why This Matters for {firstName !== "Your" ? firstName : "You"}</h2>
          <div className="space-y-4">
            {valueBullets.map((bullet, i) => (
              <motion.div 
                key={i} 
                className="flex items-start gap-4"
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.1 }}
              >
                <CheckCircle2 className="w-6 h-6 text-primary flex-shrink-0 mt-0.5" />
                <span className="text-body-lg text-foreground">{bullet}</span>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.section>

      <motion.section 
        className="py-section bg-muted"
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
      >
        <div className="max-w-content-wide mx-auto px-6">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature, i) => (
              <motion.div 
                key={i} 
                className="text-center"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.1 }}
              >
                <feature.icon className="w-10 h-10 text-primary mx-auto mb-3" />
                <h4 className="font-semibold text-foreground mb-1">{feature.title}</h4>
                <p className="text-sm text-muted-foreground">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.section>

      <motion.section 
        className="py-section-lg bg-primary text-primary-foreground"
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
      >
        <div className="max-w-content mx-auto px-6 text-center">
          <h2 className="font-serif text-headline mb-4">Ready to Start?</h2>
          <p className="text-primary-foreground/80 mb-8 max-w-lg mx-auto">
            Begin your 30-minute coaching session now. Pause and return anytime.
          </p>
          
          <Button
            size="lg"
            variant="secondary"
            className="text-lg px-8 py-6"
            data-testid="button-checkout-primary"
            onClick={handleCheckout}
            disabled={isCheckoutLoading}
          >
            {isCheckoutLoading ? (
              <>
                <span className="w-4 h-4 border-2 border-secondary-foreground/30 border-t-secondary-foreground rounded-full animate-spin mr-2" />
                <span>Redirecting to checkout...</span>
              </>
            ) : (
              <>
                Start Coaching Session — {hasDiscount ? (
                  <>
                    <span className="line-through opacity-60 mr-1">${originalPrice}</span>
                    ${displayPrice}
                  </>
                ) : (
                  `$${displayPrice}`
                )}
              </>
            )}
          </Button>
          
          <p className="text-sm text-primary-foreground/60 mt-4">
            Secure checkout via Stripe{hasDiscount && " · Discount pre-applied"} · 7-day refund guarantee
          </p>
        </div>
      </motion.section>

      <motion.section 
        className="py-section bg-background"
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
      >
        <div className="max-w-content mx-auto px-6">
          <h2 className="font-serif text-headline text-foreground text-center mb-12">Frequently Asked Questions</h2>
          
          <div className="space-y-4">
            {faqs.map((faq, i) => (
              <motion.div 
                key={i} 
                className="border border-border rounded-lg overflow-hidden"
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.3, delay: i * 0.03 }}
              >
                <button
                  className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/50 transition-colors"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  data-testid={`faq-toggle-${i}`}
                >
                  <span className="font-medium text-foreground pr-4">{faq.question}</span>
                  <ChevronDown className={cn(
                    "w-5 h-5 text-muted-foreground flex-shrink-0 transition-transform duration-200",
                    openFaq === i && "rotate-180"
                  )} />
                </button>
                <div className={cn(
                  "overflow-hidden transition-all duration-200",
                  openFaq === i ? "max-h-96" : "max-h-0"
                )}>
                  <p className="px-4 pb-4 text-muted-foreground">{faq.answer}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.section>

      <motion.section 
        className="py-section-lg bg-sage-wash"
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
      >
        <div className="max-w-content mx-auto px-6 text-center">
          <h2 className="font-serif text-headline text-foreground mb-8">Your clarity is waiting.</h2>
          
          <Button
            size="lg"
            className="text-lg px-8 py-6 mb-6"
            data-testid="button-checkout-secondary"
            onClick={handleCheckout}
            disabled={isCheckoutLoading}
          >
            {isCheckoutLoading ? "Loading..." : (
              <>
                Begin Session — {hasDiscount ? (
                  <>
                    <span className="line-through opacity-60 mr-1">${originalPrice}</span>
                    ${displayPrice}
                  </>
                ) : (
                  `$${displayPrice}`
                )}
              </>
            )}
          </Button>
          
          <div>
            <Link 
              href="/interview" 
              className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
              data-testid="link-back-interview"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to interview
            </Link>
          </div>
        </div>
      </motion.section>

      <footer className="py-8 bg-background border-t border-border">
        <div className="max-w-content mx-auto px-6 text-center text-sm text-muted-foreground">
          <p>© 2024 Serious People · <a href="mailto:hello@seriouspeople.com" className="hover:text-foreground transition-colors">hello@seriouspeople.com</a></p>
        </div>
      </footer>
    </div>
  );
}
