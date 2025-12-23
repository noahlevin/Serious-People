import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight, Menu, X } from "lucide-react";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import situationIcons from "@/components/graphics/SituationIcons";
import ProcessPath from "@/components/graphics/ProcessPath";

const situations = [
  "wondering if it's time to leave",
  "dealing with a difficult manager",
  "burned out but unsure what's next",
  "negotiating your exit",
  "considering a counter-offer",
  "stuck between two opportunities",
];

const Landing = () => {
  const [currentSituation, setCurrentSituation] = useState(0);
  const [isVisible, setIsVisible] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Scroll reveal hooks for each section
  const heroReveal = useScrollReveal();
  const quoteReveal = useScrollReveal({ rootMargin: "0px 0px -100px 0px" });
  const situationsHeaderReveal = useScrollReveal();
  const situationsCardsReveal = useScrollReveal();
  const processReveal = useScrollReveal();
  const statsReveal = useScrollReveal();
  const ctaReveal = useScrollReveal();

  useEffect(() => {
    const interval = setInterval(() => {
      setIsVisible(false);
      setTimeout(() => {
        setCurrentSituation((prev) => (prev + 1) % situations.length);
        setIsVisible(true);
      }, 400);
    }, 3500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      {/* Navigation */}
      <nav className="sp-container py-6 flex items-center justify-between animate-fade-in" style={{ animationDelay: "0.1s" }}>
        <div className="font-display text-xl tracking-tight hover:text-primary transition-colors duration-300 cursor-pointer">
          Serious People
        </div>
        
        {/* Desktop navigation */}
        <div className="hidden md:flex items-center gap-8">
          <a href="/guides" className="sp-link text-sm text-muted-foreground hover:text-foreground transition-colors">
            Guides
          </a>
          <a href="/resources" className="sp-link text-sm text-muted-foreground hover:text-foreground transition-colors">
            Resources
          </a>
          <a href="/login" className="text-sm font-medium hover:text-primary transition-colors relative group">
            Log in
            <span className="absolute -bottom-1 left-0 w-0 h-px bg-primary transition-all duration-300 group-hover:w-full" />
          </a>
        </div>
        
        {/* Mobile hamburger button */}
        <button 
          className="md:hidden p-2 -mr-2 text-foreground"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="Toggle menu"
        >
          {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </nav>
      
      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-border bg-background animate-fade-in">
          <div className="sp-container py-4 flex flex-col gap-4">
            <a href="/guides" className="text-sm text-muted-foreground hover:text-foreground transition-colors py-2">
              Guides
            </a>
            <a href="/resources" className="text-sm text-muted-foreground hover:text-foreground transition-colors py-2">
              Resources
            </a>
            <a href="/login" className="text-sm font-medium hover:text-primary transition-colors py-2">
              Log in
            </a>
          </div>
        </div>
      )}

      {/* Hero - Asymmetric Layout */}
      <section className="sp-container sp-section relative">
        
        <div className="grid lg:grid-cols-12 gap-12 lg:gap-8 items-start relative z-10">
          {/* Main content - offset to the left */}
          <div 
            ref={heroReveal.ref}
            className={`lg:col-span-7 lg:col-start-1 reveal-left ${heroReveal.isRevealed ? "revealed" : ""}`}
          >
            <p className="sp-eyebrow mb-6 text-primary">
              Career coaching for senior professionals
            </p>
            
            <h1 className="font-display text-4xl md:text-5xl lg:text-6xl text-balance mb-8">
              You're{" "}
              <span 
                className={`text-terracotta inline-block transition-all duration-500 ${
                  isVisible 
                    ? "opacity-100 translate-y-0" 
                    : "opacity-0 translate-y-2"
                }`}
              >
                {situations[currentSituation]}
              </span>
            </h1>
            
            <p className="text-lg text-muted-foreground max-w-xl mb-10">
              A structured coaching experience that helps you think clearly about 
              your career—and leave with a concrete plan, not vague advice.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4">
              <Button 
                size="lg" 
                className="group bg-foreground text-background hover:bg-foreground/90 px-8 h-12 text-base"
              >
                <span className="flex items-center">
                  Start free interview
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                </span>
              </Button>
              <Button 
                variant="ghost" 
                size="lg"
                className="text-muted-foreground h-12 text-base group"
              >
                <span className="relative">
                  See how it works
                  <span className="absolute -bottom-1 left-0 w-0 h-px bg-foreground transition-all duration-300 group-hover:w-full" />
                </span>
              </Button>
            </div>
          </div>
          
        </div>
      </section>

      {/* Pull Quote Section - separate with different background */}
      <section className="border-t border-border">
        <div className="sp-container py-16 md:py-20">
          <div 
            ref={quoteReveal.ref}
            className={`max-w-content-medium mx-auto reveal ${quoteReveal.isRevealed ? "revealed" : ""}`}
          >
            <div className="sp-quote-elegant text-center">
              <blockquote className="text-xl md:text-2xl">
                I spent months going in circles. One hour with this process gave me more clarity than a year of overthinking.
              </blockquote>
              <cite className="mt-6 block">
                <span className="text-foreground font-medium">— VP of Engineering</span>
                <span className="mx-2 text-muted-foreground">·</span>
                <span className="text-muted-foreground">Series C startup</span>
              </cite>
            </div>
          </div>
        </div>
      </section>

      {/* Situations Section - with sage wash background */}
      <section className="sp-section-sage border-t border-sage-light">
        <div className="sp-container py-16 md:py-24 lg:py-32">
          <div className="grid lg:grid-cols-12 gap-12">
            <div 
              ref={situationsHeaderReveal.ref}
              className={`lg:col-span-4 reveal ${situationsHeaderReveal.isRevealed ? "revealed" : ""}`}
            >
              <p className="sp-eyebrow mb-4 text-primary">What brings people here</p>
              <h2 className="font-display text-balance">
                Career decisions shouldn't feel like guesswork
              </h2>
            </div>
            
            <div 
              ref={situationsCardsReveal.ref}
              className={`lg:col-span-7 lg:col-start-6 stagger-children ${situationsCardsReveal.isRevealed ? "revealed" : ""}`}
            >
              <div className="grid sm:grid-cols-2 gap-6">
                {[
                  {
                    title: "Stay or go?",
                    description: "You've been thinking about leaving for months, but can't decide if it's the right move."
                  },
                  {
                    title: "Bad manager",
                    description: "Your boss is making your life difficult. You're not sure if it's fixable or time to exit."
                  },
                  {
                    title: "Burnout",
                    description: "You're exhausted and know something needs to change, but what? A new job? A break? A career shift?"
                  },
                  {
                    title: "Negotiating an exit",
                    description: "You've decided to leave. Now you need to navigate the conversation without burning bridges."
                  },
                  {
                    title: "Counter-offer dilemma",
                    description: "They matched your offer. Now you're second-guessing everything."
                  },
                  {
                    title: "Two opportunities",
                    description: "You have options, but comparing them feels impossible. Different roles, different tradeoffs."
                  }
                ].map((situation, index) => {
                  const IconComponent = situationIcons[situation.title as keyof typeof situationIcons];
                  return (
                    <div 
                      key={index} 
                      className="sp-card cursor-pointer group transition-all duration-500 hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-1 border-l-2 border-l-transparent hover:border-l-primary bg-background"
                    >
                      <div className="flex items-start gap-4">
                        <div className="flex-shrink-0 p-2 rounded-lg bg-sage-wash/50 group-hover:bg-primary/10 transition-colors duration-300">
                          {IconComponent && <IconComponent />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-display text-lg mb-2 transition-colors duration-300 group-hover:text-primary">
                            {situation.title}
                          </h3>
                          <p className="text-sm text-muted-foreground leading-relaxed transition-colors duration-300 group-hover:text-foreground/70">
                            {situation.description}
                          </p>
                        </div>
                      </div>
                      <div className="mt-4 flex items-center text-sm text-primary opacity-0 translate-x-[-10px] transition-all duration-300 group-hover:opacity-100 group-hover:translate-x-0 pl-16">
                        Learn more <ArrowRight className="ml-1 h-3 w-3" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="sp-container sp-section border-t border-border relative overflow-hidden">
        <div 
          ref={processReveal.ref}
          className={`max-w-content-medium mx-auto reveal relative z-10 ${processReveal.isRevealed ? "revealed" : ""}`}
        >
          <p className="sp-eyebrow mb-4 text-center text-primary">The process</p>
          <h2 className="font-display text-balance text-center mb-16">
            Three sessions. One clear plan.
          </h2>
          
          <div className="relative min-h-[300px]">
            {/* Connected path illustration */}
            <ProcessPath />
            
            <div className="grid md:grid-cols-3 gap-12 md:gap-8 relative z-10 pt-20 lg:pt-32">
              {[
                {
                  step: "01",
                  title: "The Interview",
                  description: "A free 15-minute AI conversation to understand your situation. We'll map out what's really going on.",
                  note: "Free, no commitment"
                },
                {
                  step: "02",
                  title: "The Coaching",
                  description: "Three focused modules tailored to your situation. Not generic advice—specific to you.",
                  note: "Personalized curriculum"
                },
                {
                  step: "03",
                  title: "The Plan",
                  description: "Walk away with scripts, timelines, and decision frameworks. Everything you need to act.",
                  note: "Concrete deliverables"
                }
              ].map((step, index) => (
                <div 
                  key={index} 
                  className={`relative text-center md:text-left transition-all duration-700 ${
                    processReveal.isRevealed 
                      ? "opacity-100 translate-y-0" 
                      : "opacity-0 translate-y-8"
                  }`}
                  style={{ transitionDelay: `${0.3 + index * 0.2}s` }}
                >
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 text-primary font-display text-lg mb-6 relative z-10 transition-all duration-500 hover:bg-primary hover:text-primary-foreground hover:scale-110 cursor-default group border border-primary/20">
                    <span className="transition-transform duration-300 group-hover:scale-110">{step.step}</span>
                  </div>
                  <h3 className="font-display text-xl mb-3">{step.title}</h3>
                  <p className="text-muted-foreground text-sm mb-3 leading-relaxed">
                    {step.description}
                  </p>
                  <p className="sp-eyebrow text-terracotta">{step.note}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Social proof */}
      <section className="sp-section-sage border-t border-sage-light">
        <div 
          ref={statsReveal.ref}
          className={`sp-container py-16 md:py-24 reveal-scale ${statsReveal.isRevealed ? "revealed" : ""}`}
        >
          <div className="flex flex-col md:flex-row items-center justify-center gap-8 md:gap-16 text-center">
            {[
              { value: "500+", label: "Coaching sessions" },
              { value: "4.9/5", label: "Average rating" },
              { value: "VP+", label: "Senior professionals" }
            ].map((stat, index) => (
              <div key={index} className="flex items-center gap-8 md:gap-16">
                <div 
                  className={`transition-all duration-700 ${
                    statsReveal.isRevealed 
                      ? "opacity-100 translate-y-0" 
                      : "opacity-0 translate-y-4"
                  }`}
                  style={{ transitionDelay: `${0.2 + index * 0.15}s` }}
                >
                  <p className="font-display text-3xl mb-1 text-primary">
                    {stat.value}
                  </p>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                </div>
                {index < 2 && (
                  <div 
                    className={`hidden md:block w-px h-12 bg-sage-medium transition-all duration-500 ${
                      statsReveal.isRevealed ? "opacity-100 scale-y-100" : "opacity-0 scale-y-0"
                    }`}
                    style={{ transitionDelay: `${0.5 + index * 0.1}s` }}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why people pay section */}
      <section className="sp-container sp-section border-t border-border">
        <div className="grid lg:grid-cols-12 gap-12">
          <div className="lg:col-span-4">
            <p className="sp-eyebrow mb-4 text-primary">Why people pay</p>
            <h2 className="font-display text-balance">
              This isn't therapy. It's strategy.
            </h2>
          </div>
          
          <div className="lg:col-span-7 lg:col-start-6">
            <div className="space-y-8">
              {[
                {
                  title: "Speed",
                  description: "Most people ruminate for months. Our clients get clarity in days. The AI interview alone surfaces insights that take weeks to reach in traditional coaching."
                },
                {
                  title: "Specificity",
                  description: "No generic frameworks. Every recommendation is tailored to your exact situation, company context, and career goals. Scripts, timelines, decision trees—ready to use."
                },
                {
                  title: "Stakes",
                  description: "At the VP+ level, career mistakes are expensive. A bad exit, a missed negotiation, or a wrong move can cost hundreds of thousands. This is insurance."
                },
                {
                  title: "Discretion",
                  description: "No paper trail. No HR involvement. No awkward conversations with colleagues. Just you, working through your situation with complete privacy."
                }
              ].map((item, index) => (
                <div key={index} className="border-l-2 border-primary/20 pl-6 hover:border-primary transition-colors duration-300">
                  <h3 className="font-display text-lg mb-2">{item.title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="sp-section-sage border-t border-sage-light">
        <div className="sp-container py-16 md:py-24">
          <div className="grid lg:grid-cols-12 gap-12">
            <div className="lg:col-span-4">
              <p className="sp-eyebrow mb-4 text-primary">FAQ</p>
              <h2 className="font-display text-balance">
                Common questions
              </h2>
            </div>
            
            <div className="lg:col-span-7 lg:col-start-6">
              <div className="space-y-6">
                {[
                  {
                    question: "Is this AI or human coaching?",
                    answer: "Both. The initial interview and situation analysis are AI-powered, but the coaching sessions include human oversight and review. You get the speed and availability of AI with the judgment of experienced career coaches."
                  },
                  {
                    question: "How is this different from talking to a friend or mentor?",
                    answer: "Friends tell you what you want to hear. Mentors give advice based on their experience, not yours. We give you structured frameworks, specific scripts, and concrete action plans based on your exact situation and goals."
                  },
                  {
                    question: "What if I'm not sure I want to leave?",
                    answer: "Perfect. Most of our clients start unsure. The process is designed to help you think clearly, not push you in any direction. Many people decide to stay—but with a much clearer understanding of why."
                  },
                  {
                    question: "How long does it take?",
                    answer: "The free interview takes about 15 minutes. The full coaching program is three sessions over 1-2 weeks. Most clients have their complete action plan within 10 days."
                  },
                  {
                    question: "Is this confidential?",
                    answer: "Completely. We don't share any information with employers, and there's no record of your participation. Many clients specifically choose us because there's no HR involvement or paper trail."
                  }
                ].map((faq, index) => (
                  <div key={index} className="border-b border-sage-light pb-6 last:border-b-0">
                    <h3 className="font-display text-lg mb-3">{faq.question}</h3>
                    <p className="text-muted-foreground text-sm leading-relaxed">{faq.answer}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="sp-container sp-section border-t border-border relative">
        
        <div 
          ref={ctaReveal.ref}
          className={`max-w-content-narrow mx-auto text-center reveal relative z-10 ${ctaReveal.isRevealed ? "revealed" : ""}`}
        >
          <h2 className="font-display text-balance mb-6">
            Ready to think clearly about your career?
          </h2>
          <p className="text-muted-foreground mb-8 max-w-md mx-auto">
            Start with a free interview. In 15 minutes, you'll have more clarity than months of ruminating.
          </p>
          <Button 
            size="lg" 
            className="group bg-foreground text-background hover:bg-foreground/90 px-10 h-12 text-base transition-all duration-300 hover:shadow-xl hover:shadow-foreground/10 hover:-translate-y-0.5"
          >
            Start free interview
            <ArrowRight className="ml-2 h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
          </Button>
          <p className="mt-4 text-xs text-muted-foreground">
            No credit card required
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="sp-container py-12">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="font-display text-lg hover:text-primary transition-colors duration-300 cursor-pointer">
              Serious People
            </div>
            <div className="flex items-center gap-8">
              {["Guides", "Resources", "Contact"].map((item, index) => (
                <a 
                  key={index}
                  href={item === "Contact" ? "mailto:hello@seriouspeople.com" : `/${item.toLowerCase()}`} 
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors relative group"
                >
                  {item}
                  <span className="absolute -bottom-1 left-0 w-0 h-px bg-foreground transition-all duration-300 group-hover:w-full" />
                </a>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              © 2025 Serious People
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
