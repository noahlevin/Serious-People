import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useJourney, getNextStep } from "@/hooks/useJourney";
import { useQuery } from "@tanstack/react-query";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import { Header, Footer } from "@/components/layout";
import { cn } from "@/lib/utils";
import { 
  Accordion, 
  AccordionContent, 
  AccordionItem, 
  AccordionTrigger 
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Zap, Target, Shield, Lock } from "lucide-react";

interface PricingData {
  originalPrice: number;
  discountedPrice: number | null;
  percentOff: number | null;
  amountOff: number | null;
  currency: string;
}

const situationCards = [
  {
    id: "stay-or-go",
    title: "Stay or go?",
    description: "You've been thinking about leaving for months, but can't decide if it's the right move.",
  },
  {
    id: "bad-manager",
    title: "Bad manager",
    description: "Your boss is making your life difficult. You're not sure if it's fixable or time to exit.",
  },
  {
    id: "burnout",
    title: "Burnout",
    description: "You're exhausted and know something needs to change, but what? A new job? A break? A career shift?",
  },
  {
    id: "negotiating-exit",
    title: "Negotiating an exit",
    description: "You've decided to leave. Now you need to navigate the conversation without burning bridges.",
  },
  {
    id: "counter-offer",
    title: "Counter-offer dilemma",
    description: "They matched your offer. Now you're second-guessing everything.",
  },
  {
    id: "two-opportunities",
    title: "Two opportunities",
    description: "You have options, but comparing them feels impossible. Different roles, different tradeoffs.",
  },
];

const processSteps = [
  {
    number: "01",
    title: "The Interview",
    description: "A free 15-minute AI conversation to understand your situation. We'll map out what's really going on.",
    badge: "Free, no commitment",
  },
  {
    number: "02",
    title: "The Coaching",
    description: "Three focused modules tailored to your situation. Not generic advice—specific to you.",
    badge: "Personalized curriculum",
  },
  {
    number: "03",
    title: "The Plan",
    description: "Walk away with scripts, timelines, and decision frameworks. Everything you need to act.",
    badge: "Concrete deliverables",
  },
];

const stats = [
  { value: "500+", label: "Coaching sessions" },
  { value: "4.9/5", label: "Average rating" },
  { value: "VP+", label: "Senior professionals" },
];

const valueProps = [
  {
    id: "speed",
    title: "Speed",
    description: "Most people ruminate for months. Our clients get clarity in days. The AI interview alone surfaces insights that take weeks to reach in traditional coaching.",
    icon: Zap,
  },
  {
    id: "specificity",
    title: "Specificity",
    description: "No generic frameworks. Every recommendation is tailored to your exact situation, company context, and career goals. Scripts, timelines, decision trees—ready to use.",
    icon: Target,
  },
  {
    id: "stakes",
    title: "Stakes",
    description: "At the VP+ level, career mistakes are expensive. A bad exit, a missed negotiation, or a wrong move can cost hundreds of thousands. This is insurance.",
    icon: Shield,
  },
  {
    id: "discretion",
    title: "Discretion",
    description: "No paper trail. No HR involvement. No awkward conversations with colleagues. Just you, working through your situation with complete privacy.",
    icon: Lock,
  },
];

const faqs = [
  {
    id: "ai-or-human",
    question: "Is this AI or human coaching?",
    answer: "Both. The initial interview and situation analysis are AI-powered, but the coaching sessions include human oversight and review. You get the speed and availability of AI with the judgment of experienced career coaches.",
  },
  {
    id: "different-from-friends",
    question: "How is this different from talking to a friend or mentor?",
    answer: "Friends tell you what you want to hear. Mentors give advice based on their experience, not yours. We give you structured frameworks, specific scripts, and concrete action plans based on your exact situation and goals.",
  },
  {
    id: "not-sure-leave",
    question: "What if I'm not sure I want to leave?",
    answer: "Perfect. Most of our clients start unsure. The process is designed to help you think clearly, not push you in any direction. Many people decide to stay—but with a much clearer understanding of why.",
  },
  {
    id: "how-long",
    question: "How long does it take?",
    answer: "The free interview takes about 15 minutes. The full coaching program is three sessions over 1-2 weeks. Most clients have their complete action plan within 10 days.",
  },
  {
    id: "confidential",
    question: "Is this confidential?",
    answer: "Completely. We don't share any information with employers, and there's no record of your participation. Many clients specifically choose us because there's no HR involvement or paper trail.",
  },
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
  
  const getJourneyPath = () => {
    if (!isAuthenticated || !journeyState) {
      return "/login";
    }
    return getNextStep(journeyState).path;
  };
  
  useEffect(() => {
    document.title = "Serious People - Career Coaching for Senior Professionals";
    
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
  
  const handleStartInterview = () => {
    if (isAuthenticated && journeyState) {
      setLocation(getNextStep(journeyState).path);
    } else if (isAuthenticated && journeyLoading) {
      setLocation("/interview");
    } else {
      setLocation("/login");
    }
  };

  const scrollToHowItWorks = () => {
    const element = document.getElementById("process-section");
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      {/* HERO SECTION */}
      <section className="pt-32 pb-20 md:pt-40 md:pb-28">
        <div className="max-w-content-wide mx-auto px-6 lg:px-8">
          <RevealSection className="text-center">
            <h1 className="font-serif text-display-lg md:text-display-xl text-foreground mb-6">
              You're wondering if it's time to leave
            </h1>
            
            <p className="text-body-lg text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
              A structured coaching experience that helps you think clearly about your career—and leave with a concrete plan, not vague advice.
            </p>
            
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
              <Button 
                size="lg"
                className="text-base px-8"
                data-testid="button-start-interview"
                onClick={handleStartInterview}
              >
                Start free interview
                <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
              
              <button 
                onClick={scrollToHowItWorks}
                className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                data-testid="link-how-it-works"
              >
                See how it works
              </button>
            </div>
            
            {/* Testimonial Quote */}
            <div className="max-w-2xl mx-auto">
              <blockquote className="relative">
                <p className="font-serif text-title md:text-headline text-foreground italic mb-4">
                  "I spent months going in circles. One hour with this process gave me more clarity than a year of overthinking."
                </p>
                <footer className="text-sm text-muted-foreground">
                  — <span className="font-medium">VP of Engineering</span> · Series C startup
                </footer>
              </blockquote>
            </div>
          </RevealSection>
        </div>
      </section>

      {/* WHAT BRINGS PEOPLE HERE SECTION */}
      <section className="py-20 md:py-28 bg-card border-y border-border">
        <div className="max-w-content-wide mx-auto px-6 lg:px-8">
          <RevealSection className="mb-4">
            <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider text-center">
              What brings people here
            </p>
          </RevealSection>
          
          <RevealSection className="text-center mb-12" delay={100}>
            <h2 className="font-serif text-headline md:text-display text-foreground">
              Career decisions shouldn't feel like guesswork
            </h2>
          </RevealSection>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {situationCards.map((card, index) => (
              <RevealSection key={card.id} delay={150 + index * 50}>
                <Card className="h-full hover-elevate">
                  <CardContent className="p-6">
                    <h3 className="font-serif text-title text-foreground mb-3">
                      {card.title}
                    </h3>
                    <p className="text-body text-muted-foreground mb-4 leading-relaxed">
                      {card.description}
                    </p>
                    <Link 
                      href="/how-it-works"
                      className="text-sm font-medium text-primary hover:text-primary-hover transition-colors inline-flex items-center gap-1"
                      data-testid={`link-learn-more-${card.id}`}
                    >
                      Learn more
                      <ArrowRight className="w-3 h-3" />
                    </Link>
                  </CardContent>
                </Card>
              </RevealSection>
            ))}
          </div>
        </div>
      </section>

      {/* THE PROCESS SECTION */}
      <section id="process-section" className="py-20 md:py-28">
        <div className="max-w-content-wide mx-auto px-6 lg:px-8">
          <RevealSection className="mb-4">
            <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider text-center">
              The process
            </p>
          </RevealSection>
          
          <RevealSection className="text-center mb-16" delay={100}>
            <h2 className="font-serif text-headline md:text-display text-foreground">
              Three sessions. One clear plan.
            </h2>
          </RevealSection>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
            {processSteps.map((step, index) => (
              <RevealSection key={step.number} delay={150 + index * 100}>
                <div className="text-center">
                  <div className="font-serif text-display text-primary/20 mb-4">
                    {step.number}
                  </div>
                  <h3 className="font-serif text-title text-foreground mb-3">
                    {step.title}
                  </h3>
                  <p className="text-body text-muted-foreground mb-4 leading-relaxed">
                    {step.description}
                  </p>
                  <Badge variant="secondary" className="text-xs">
                    {step.badge}
                  </Badge>
                </div>
              </RevealSection>
            ))}
          </div>
          
          {/* Stats Row */}
          <RevealSection delay={400}>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-8 sm:gap-16 pt-8 border-t border-border">
              {stats.map((stat, index) => (
                <div key={index} className="text-center">
                  <div className="font-serif text-headline text-foreground mb-1">
                    {stat.value}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>
          </RevealSection>
        </div>
      </section>

      {/* WHY PEOPLE PAY SECTION */}
      <section className="py-20 md:py-28 bg-sage-wash border-y border-border">
        <div className="max-w-content-wide mx-auto px-6 lg:px-8">
          <RevealSection className="mb-4">
            <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider text-center">
              Why people pay
            </p>
          </RevealSection>
          
          <RevealSection className="text-center mb-12" delay={100}>
            <h2 className="font-serif text-headline md:text-display text-foreground">
              This isn't therapy. It's strategy.
            </h2>
          </RevealSection>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {valueProps.map((prop, index) => (
              <RevealSection key={prop.id} delay={150 + index * 50}>
                <Card className="h-full">
                  <CardContent className="p-6">
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <prop.icon className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-serif text-title text-foreground mb-2">
                          {prop.title}
                        </h3>
                        <p className="text-body text-muted-foreground leading-relaxed">
                          {prop.description}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </RevealSection>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ SECTION */}
      <section className="py-20 md:py-28">
        <div className="max-w-content mx-auto px-6 lg:px-8">
          <RevealSection className="mb-4">
            <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider text-center">
              FAQ
            </p>
          </RevealSection>
          
          <RevealSection className="text-center mb-12" delay={100}>
            <h2 className="font-serif text-headline md:text-display text-foreground">
              Common questions
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
        </div>
      </section>

      {/* FINAL CTA SECTION */}
      <section className="py-20 md:py-28 bg-card border-t border-border">
        <div className="max-w-content mx-auto px-6 lg:px-8 text-center">
          <RevealSection>
            <h2 className="font-serif text-headline md:text-display text-foreground mb-6">
              Ready to think clearly about your career?
            </h2>
            <p className="text-body-lg text-muted-foreground mb-10 max-w-xl mx-auto">
              Start with a free interview. In 15 minutes, you'll have more clarity than months of ruminating.
            </p>
            
            <Button 
              size="lg"
              className="text-base px-8 mb-4"
              data-testid="button-start-interview-bottom"
              onClick={handleStartInterview}
            >
              Start free interview
              <ArrowRight className="ml-2 w-4 h-4" />
            </Button>
            
            <p className="text-sm text-muted-foreground">
              No credit card required
            </p>
          </RevealSection>
        </div>
      </section>

      <Footer />
    </div>
  );
}
