import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useJourney, getNextStep } from "@/hooks/useJourney";
import { useQuery } from "@tanstack/react-query";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import { Header, Footer } from "@/components/layout";
import { HeroShapes, DecorativeRule, StepNumber, PullQuote } from "@/components/graphics";
import { cn } from "@/lib/utils";
import { 
  Accordion, 
  AccordionContent, 
  AccordionItem, 
  AccordionTrigger 
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { ArrowRight, FileText, MessageCircle, Target, Check } from "lucide-react";

const PUBLIC_EMAIL = "hello@seriouspeople.app";

const rotatingQuestions = [
  "should I quit?",
  "is this fixable?",
  "what do I even want?",
  "how do I say this?",
  "am I overreacting?",
  "is it worth the risk?"
];

interface PricingData {
  originalPrice: number;
  discountedPrice: number | null;
  percentOff: number | null;
  amountOff: number | null;
  currency: string;
}

function PriceDisplay({ pricing, className }: { pricing: PricingData | undefined; className?: string }) {
  if (!pricing) {
    return <span className={className}>$19</span>;
  }
  
  const hasDiscount = pricing.discountedPrice !== null && pricing.discountedPrice < pricing.originalPrice;
  
  if (hasDiscount) {
    return (
      <span className={cn("inline-flex items-center gap-2", className)}>
        <span className="text-muted-foreground line-through">${pricing.originalPrice}</span>
        <span className="text-accent font-semibold">${pricing.discountedPrice}</span>
      </span>
    );
  }
  
  return <span className={className}>${pricing.originalPrice}</span>;
}

const scenarios = [
  "You're on the fence about quitting and don't want to make a decision you'll regret.",
  "Your role has drifted into something you never signed up for. You need to renegotiate—or leave.",
  "You're stuck in a bad dynamic with your boss and can't tell if it's fixable.",
  "You're about to have a hard conversation with your partner about money, risk, and timing.",
  "You've written a dozen draft emails in your head. None of them feel right."
];

const artifacts = [
  {
    title: "Decision Snapshot",
    description: "A one-page summary of your situation, your options, and the trade-offs. This is the map you keep coming back to when you're second-guessing yourself at 2am."
  },
  {
    title: "Conversation Scripts",
    description: "Word-for-word scripts for the conversations that matter most—your manager, your partner, HR, mentors. Clear, honest, non-destructive."
  },
  {
    title: "Action Plan (30–90 days)",
    description: "Concrete next moves with timing. What to try first. What to document. How to know if things are actually improving. When to draw a line."
  },
  {
    title: "Risk Map",
    description: "A candid look at what could go wrong—whether you stay, reshape the role, or leave. Includes \"if X happens, say Y\" playbooks so you're not improvising when it counts."
  },
  {
    title: "Resources & Prompts",
    description: "Curated exercises and reflection prompts based on your exact situation. Not a generic reading list."
  }
];

const comparisons = [
  {
    title: "vs. Journaling or venting to friends",
    content: "Your friends will validate you. Journaling helps you process. Neither will give you a script for Monday's meeting or a 90-day plan. Serious People turns feelings into a document you can act on."
  },
  {
    title: "vs. Generic AI (ChatGPT, etc.)",
    content: "Most AI tools act like polite yes-men—they validate your first idea and dress it up in nicer words. Serious People follows a structured coaching curriculum. It will push back on fuzzy thinking, ask harder questions, and sometimes disagree with you."
  },
  {
    title: "vs. A human career coach",
    content: "A good coach costs $200–500/hour and takes weeks to book. Serious People works on your schedule. It's not a replacement for deep, ongoing coaching—but it's a powerful starting point."
  },
  {
    title: "vs. Doing nothing",
    content: "You already know how that goes. The situation festers. You make a reactive decision when you're fed up instead of a strategic one when you're clear. Serious People is the forcing function that gets you unstuck."
  }
];

const steps = [
  {
    number: 1,
    title: "Free coaching interview",
    duration: "5–10 min",
    icon: MessageCircle,
    description: "You answer the questions a good career coach would ask: What's actually happening? What have you tried? What's at stake? By the end, you'll see a plain-language coaching plan tailored to your situation. Review it, adjust it, then decide if you want to continue."
  },
  {
    number: 2,
    title: "Guided working session",
    duration: "~30 min",
    icon: Target,
    description: "Your coach walks you through three modules. First, you go deep on what's really going on—the stuff you haven't fully articulated, even to yourself. Then you map your options, constraints, and trade-offs. Finally, you turn your thinking into a concrete plan with real next steps."
  },
  {
    number: 3,
    title: "Your Serious Plan",
    duration: "Instant",
    icon: FileText,
    description: "You leave with a set of documents you can actually use. Decision summary. Conversation scripts. A 30–90 day action plan. A risk map for what could go wrong. No inspirational posters. No vague frameworks. Just clear language you can copy into an email tonight."
  }
];

function RevealSection({ children, className, delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const { ref, isVisible } = useScrollReveal();
  
  return (
    <div 
      ref={ref}
      className={cn(
        "transition-all duration-700 ease-out",
        isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8",
        className
      )}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

export default function Landing() {
  const { isAuthenticated } = useAuth();
  const { journeyState, isLoading: journeyLoading } = useJourney();
  const [, setLocation] = useLocation();
  const [displayText, setDisplayText] = useState("");
  const phraseIndexRef = useRef(0);
  const charIndexRef = useRef(0);
  const isDeletingRef = useRef(false);
  
  const getJourneyPath = () => {
    if (!isAuthenticated || !journeyState) {
      return "/login";
    }
    return getNextStep(journeyState).path;
  };
  
  useEffect(() => {
    document.title = "Serious People - Career Coaching";
    
    const urlParams = new URLSearchParams(window.location.search);
    const promoCode = urlParams.get('promo');
    if (promoCode) {
      sessionStorage.setItem('sp_promo_code', promoCode);
    }
  }, []);
  
  const { data: pricing } = useQuery<PricingData>({
    queryKey: ["/api/pricing"],
    staleTime: 60000,
  });

  const faqs = [
    {
      id: "cost",
      question: "How much does this cost?",
      answer: <>The interview is completely free. You'll see your personalized coaching plan before paying anything. The full coaching session and Serious Plan cost <PriceDisplay pricing={pricing} />—less than an hour with a human coach.</>
    },
    {
      id: "ai",
      question: "Is this really \"just AI\"?",
      answer: "Serious People is AI-powered, but it's not a generic chatbot. It uses large language models guided by a specific coaching philosophy: ask hard questions, reflect back what it hears, push toward clear decisions. It won't pretend to be human, but it will behave like an experienced, no-nonsense coach—one that knows when to slow you down and when to back your instincts."
    },
    {
      id: "privacy",
      question: "Will my information be private?",
      answer: "Yes. Your interview and plan are stored securely and used only to generate your Serious Plan. We don't sell or share your stories with anyone."
    },
    {
      id: "time",
      question: "How long does this take?",
      answer: "Most people finish the free interview in 5–10 minutes. The full coaching session takes about 30 minutes. Your Serious Plan is generated within a few minutes after that."
    },
    {
      id: "replacement",
      question: "Does this replace working with a human coach?",
      answer: "It doesn't have to. Serious People is a great first step—or a complement to human coaching. You can start right now, on your own schedule, without committing to a multi-session package. If you decide to work with a coach later, your Serious Plan becomes a powerful starting brief."
    }
  ];
  
  const handleStartInterview = () => {
    if (isAuthenticated && journeyState) {
      setLocation(getNextStep(journeyState).path);
    } else if (isAuthenticated && journeyLoading) {
      setLocation("/interview");
    } else {
      setLocation("/login");
    }
  };

  useEffect(() => {
    const typeSpeed = 80;
    const deleteSpeed = 40;
    const pauseDuration = 2000;

    const type = () => {
      const currentPhrase = rotatingQuestions[phraseIndexRef.current];

      if (isDeletingRef.current) {
        charIndexRef.current--;
        setDisplayText(currentPhrase.substring(0, charIndexRef.current));

        if (charIndexRef.current === 0) {
          isDeletingRef.current = false;
          phraseIndexRef.current = (phraseIndexRef.current + 1) % rotatingQuestions.length;
          return setTimeout(type, 300);
        }

        return setTimeout(type, deleteSpeed);
      } else {
        charIndexRef.current++;
        setDisplayText(currentPhrase.substring(0, charIndexRef.current));

        if (charIndexRef.current === currentPhrase.length) {
          return setTimeout(() => {
            isDeletingRef.current = true;
            type();
          }, pauseDuration);
        }

        return setTimeout(type, typeSpeed);
      }
    };

    const timer = type();
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      {/* HERO SECTION */}
      <section className="relative min-h-[90vh] flex items-center pt-24">
        <HeroShapes />
        <div className="max-w-content-wide mx-auto px-6 lg:px-8 py-section relative z-10">
          <RevealSection className="text-center">
            <h1 className="font-serif text-display-lg md:text-display-xl text-foreground mb-8">
              <span className="block">Turn</span>
              <span className="block text-primary">
                "<span className="inline-block min-w-[3ch]">{displayText}</span>
                <span className="animate-pulse">|</span>"
              </span>
              <span className="block">into a decision you trust.</span>
            </h1>
            
            <p className="text-body-lg text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
              <strong className="text-foreground">Serious People</strong> helps you think clearly and act decisively on major career decisions.
            </p>
            
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-6">
              <Button 
                size="lg"
                className="text-base px-8"
                data-testid="button-start-interview"
                onClick={handleStartInterview}
              >
                Start the free interview
                <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
              
              {isAuthenticated ? (
                <Link 
                  href={getJourneyPath()} 
                  className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors link-animated"
                  data-testid="link-resume"
                >
                  Already started? Continue →
                </Link>
              ) : (
                <Link 
                  href="/login" 
                  className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors link-animated"
                  data-testid="link-resume"
                >
                  Already started? Log back in →
                </Link>
              )}
            </div>
            
            <p className="text-sm text-muted-foreground">
              Free interview takes 5–10 minutes. Full coaching session is <PriceDisplay pricing={pricing} />.
            </p>
          </RevealSection>
        </div>
      </section>

      {/* BRAND QUOTE */}
      <section className="bg-sage-wash border-y border-border">
        <div className="max-w-content mx-auto px-6 lg:px-8 py-section">
          <RevealSection>
            <div className="flex flex-col md:flex-row items-center gap-8 md:gap-12">
              <img 
                src="/logan-roy.png" 
                alt="Logan Roy" 
                className="w-24 h-24 md:w-32 md:h-32 rounded-full object-cover border-2 border-border shadow-md"
              />
              <blockquote className="text-center md:text-left">
                <p className="font-serif text-headline md:text-display text-foreground italic mb-4">
                  "I love you, but you are not serious people."
                </p>
                <cite className="text-sm text-muted-foreground not-italic">
                  — Logan Roy, Waystar Royco
                </cite>
              </blockquote>
            </div>
          </RevealSection>
        </div>
      </section>

      {/* SCENARIOS SECTION */}
      <section className="max-w-content-wide mx-auto px-6 lg:px-8 py-section">
        <RevealSection className="text-center mb-12">
          <h2 className="font-serif text-headline md:text-display text-foreground mb-6">
            This is for the decisions that keep you up at night.
          </h2>
        </RevealSection>
        
        <RevealSection delay={200}>
          <ul className="space-y-4 max-w-2xl mx-auto">
            {scenarios.map((scenario, index) => (
              <li 
                key={index} 
                className="flex items-start gap-4 p-4 rounded-lg bg-card border border-border"
              >
                <Check className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                <span className="text-body text-foreground">{scenario}</span>
              </li>
            ))}
          </ul>
        </RevealSection>
      </section>

      <DecorativeRule className="max-w-content mx-auto" />

      {/* HOW IT WORKS */}
      <section className="bg-card border-y border-border">
        <div className="max-w-content-wide mx-auto px-6 lg:px-8 py-section">
          <RevealSection className="text-center mb-16">
            <h2 className="font-serif text-headline md:text-display text-foreground mb-6">
              Here's what happens.
            </h2>
          </RevealSection>
          
          <div className="space-y-16">
            {steps.map((step, index) => (
              <RevealSection key={step.number} delay={100 * index}>
                <div className="grid grid-cols-1 md:grid-cols-12 gap-6 md:gap-8 items-start">
                  <div className="md:col-span-4">
                    <StepNumber number={step.number} className="mb-2" />
                    <h3 className="font-serif text-title text-foreground mb-2">
                      {step.title}
                    </h3>
                    <span className="text-sm text-muted-foreground">{step.duration}</span>
                  </div>
                  
                  <div className="md:col-span-8">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-lg bg-sage-wash flex items-center justify-center flex-shrink-0">
                        <step.icon className="w-6 h-6 text-primary" />
                      </div>
                      <p className="text-body-lg text-muted-foreground leading-relaxed">
                        {step.description}
                      </p>
                    </div>
                  </div>
                </div>
              </RevealSection>
            ))}
          </div>
        </div>
      </section>

      {/* ARTIFACTS SECTION */}
      <section className="max-w-content-wide mx-auto px-6 lg:px-8 py-section">
        <RevealSection className="text-center mb-12">
          <h2 className="font-serif text-headline md:text-display text-foreground mb-6">
            What you actually get.
          </h2>
          <p className="text-body-lg text-muted-foreground max-w-2xl mx-auto">
            Every Serious Plan is different because every situation is different. But yours will include artifacts like these:
          </p>
        </RevealSection>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {artifacts.map((artifact, index) => (
            <RevealSection key={index} delay={100 * index}>
              <div className="bg-card rounded-lg border border-border p-6 h-full">
                <h3 className="font-serif text-title text-foreground mb-3">
                  {artifact.title}
                </h3>
                <p className="text-body text-muted-foreground leading-relaxed">
                  {artifact.description}
                </p>
              </div>
            </RevealSection>
          ))}
        </div>
      </section>

      {/* COMPARISONS SECTION */}
      <section className="bg-sage-wash border-y border-border">
        <div className="max-w-content-wide mx-auto px-6 lg:px-8 py-section">
          <RevealSection className="text-center mb-12">
            <h2 className="font-serif text-headline md:text-display text-foreground mb-6">
              Why people pay <PriceDisplay pricing={pricing} className="text-accent" /> for this instead of just thinking it through.
            </h2>
          </RevealSection>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {comparisons.map((comparison, index) => (
              <RevealSection key={index} delay={100 * index}>
                <div className="bg-card rounded-lg border border-border p-6 h-full">
                  <h3 className="font-serif text-title text-foreground mb-3">
                    {comparison.title}
                  </h3>
                  <p className="text-body text-muted-foreground leading-relaxed">
                    {comparison.content}
                  </p>
                </div>
              </RevealSection>
            ))}
          </div>
        </div>
      </section>

      {/* WHO THIS IS FOR */}
      <section className="max-w-content mx-auto px-6 lg:px-8 py-section">
        <RevealSection className="text-center">
          <h2 className="font-serif text-headline md:text-display text-foreground mb-8">
            This is for people who are ready to decide.
          </h2>
          
          <div className="text-body-lg text-muted-foreground space-y-6 leading-relaxed">
            <p>
              If you're mid-career or senior, your choices affect real money and real people, and you want to walk away with a plan—not just reassurance—this will help.
            </p>
            <p>
              If you're looking for therapy, legal advice, or someone to make the decision for you, this isn't that. If you're not planning to actually have the conversations this prepares you for, save your money.
            </p>
          </div>
        </RevealSection>
      </section>

      <DecorativeRule className="max-w-content mx-auto" />

      {/* FAQ */}
      <section className="max-w-content mx-auto px-6 lg:px-8 py-section">
        <RevealSection className="text-center mb-12">
          <h2 className="font-serif text-headline md:text-display text-foreground mb-6">
            Questions people ask before getting serious.
          </h2>
        </RevealSection>
        
        <RevealSection delay={200}>
          <Accordion type="single" collapsible className="space-y-4">
            {faqs.map((faq, index) => (
              <AccordionItem 
                key={faq.id} 
                value={faq.id}
                className="bg-card rounded-lg border border-border px-6 py-2 data-[state=open]:bg-sage-wash/50"
              >
                <AccordionTrigger 
                  className="text-left font-serif text-lg font-medium text-foreground hover:no-underline py-4"
                  data-testid={`button-faq-${index}`}
                >
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-body text-muted-foreground pb-4 leading-relaxed">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </RevealSection>
      </section>

      {/* FINAL CTA */}
      <section className="bg-primary text-primary-foreground">
        <div className="max-w-content mx-auto px-6 lg:px-8 py-section text-center">
          <RevealSection>
            <h2 className="font-serif text-headline md:text-display mb-6">
              Ready to get serious?
            </h2>
            <p className="text-body-lg opacity-90 mb-8 max-w-xl mx-auto">
              The free interview takes 5–10 minutes. You'll see your coaching plan before you pay anything.
            </p>
            
            <Button 
              size="lg"
              variant="secondary"
              className="text-base px-8"
              data-testid="button-start-interview-bottom"
              onClick={handleStartInterview}
            >
              Start the free interview
              <ArrowRight className="ml-2 w-4 h-4" />
            </Button>
            
            <p className="text-sm opacity-75 mt-8">
              Questions? Email <a href={`mailto:${PUBLIC_EMAIL}`} className="underline hover:opacity-100">{PUBLIC_EMAIL}</a>
            </p>
          </RevealSection>
        </div>
      </section>

      <Footer />
    </div>
  );
}
