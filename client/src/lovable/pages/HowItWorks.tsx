import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/lovable/components/ui/button";
import { ArrowRight, Menu, X } from "lucide-react";
import { useScrollReveal } from "@/lovable/hooks/useScrollReveal";

const HowItWorks = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const heroReveal = useScrollReveal();
  const stepsReveal = useScrollReveal();
  const differentiatorReveal = useScrollReveal();
  const audienceReveal = useScrollReveal();
  const ctaReveal = useScrollReveal();

  const steps = [
    {
      number: "01",
      title: "The Interview",
      duration: "15–20 min · Free",
      description: "A structured conversation about where you are, what's happening, and what's at stake. We ask the questions your friends are too polite to ask.",
      detail: "No prep required. Just show up and be honest.",
    },
    {
      number: "02",
      title: "The Analysis",
      duration: "Instant",
      description: "We identify patterns in your situation—the real blockers, the hidden dynamics, the things you might be avoiding.",
      detail: "You'll see your situation with fresh eyes.",
    },
    {
      number: "03",
      title: "The Coaching",
      duration: "30 min · $48",
      description: "A personalized session built around your specific situation. We work through the hard questions and build a concrete plan.",
      detail: "Pause anytime. Return when you're ready.",
    },
    {
      number: "04",
      title: "The Deliverables",
      duration: "Yours to keep",
      description: "Walk away with actionable artifacts—conversation scripts, decision frameworks, week-by-week action plans tailored to your situation.",
      detail: "Everything you need to execute, not just insights.",
    },
  ];

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      {/* Navigation */}
      <nav className="sp-container py-6 flex items-center justify-between animate-fade-in" style={{ animationDelay: "0.1s" }}>
        <Link to="/" className="font-display text-xl tracking-tight hover:text-primary transition-colors duration-300">
          Serious People
        </Link>
        
        {/* Desktop navigation */}
        <div className="hidden md:flex items-center gap-8">
          <Link to="/how-it-works" className="sp-link text-sm text-foreground font-medium">
            How It Works
          </Link>
          <a href="/guides" className="sp-link text-sm text-muted-foreground hover:text-foreground transition-colors">
            Guides
          </a>
          <Link to="/app/login" className="text-sm font-medium hover:text-primary transition-colors relative group">
            Log in
            <span className="absolute -bottom-1 left-0 w-0 h-px bg-primary transition-all duration-300 group-hover:w-full" />
          </Link>
        </div>
        
        {/* Mobile hamburger */}
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
            <Link to="/how-it-works" className="text-sm font-medium py-2">
              How It Works
            </Link>
            <a href="/guides" className="text-sm text-muted-foreground hover:text-foreground transition-colors py-2">
              Guides
            </a>
            <Link to="/app/login" className="text-sm font-medium hover:text-primary transition-colors py-2">
              Log in
            </Link>
          </div>
        </div>
      )}

      {/* Hero */}
      <section className="sp-container sp-section">
        <div 
          ref={heroReveal.ref}
          className={`max-w-3xl reveal ${heroReveal.isRevealed ? "revealed" : ""}`}
        >
          <p className="sp-eyebrow mb-6 text-primary">How It Works</p>
          <h1 className="font-display text-4xl md:text-5xl lg:text-6xl text-balance mb-8">
            Career coaching that respects your time.
          </h1>
          <p className="text-lg text-muted-foreground max-w-xl leading-relaxed">
            No fluff. No six-week programs. Just a focused conversation, a clear diagnosis, and a concrete plan you can actually execute.
          </p>
        </div>
      </section>

      {/* Table of Contents */}
      <section className="sp-container py-12 md:py-16 border-t border-border">
        <div 
          ref={stepsReveal.ref}
          className={`reveal ${stepsReveal.isRevealed ? "revealed" : ""}`}
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
            {steps.map((step, index) => (
              <div 
                key={step.number}
                className={`group relative transition-all duration-500 ${
                  stepsReveal.isRevealed 
                    ? "opacity-100 translate-y-0" 
                    : "opacity-0 translate-y-4"
                }`}
                style={{ transitionDelay: `${0.1 + index * 0.1}s` }}
              >
                {/* Connector line */}
                {index < steps.length - 1 && (
                  <div className="hidden md:block absolute top-6 left-full w-full h-px bg-border z-0" />
                )}
                
                <div className="relative z-10 bg-background">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-12 h-12 rounded-full border-2 border-border group-hover:border-primary group-hover:bg-primary/5 transition-colors duration-300 flex items-center justify-center">
                      <span className="font-display text-sm text-muted-foreground group-hover:text-primary transition-colors">
                        {step.number}
                      </span>
                    </div>
                  </div>
                  <h3 className="font-display text-base md:text-lg text-foreground mb-1 group-hover:text-primary transition-colors">
                    {step.title}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {step.duration}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Steps Detail */}
      <section className="sp-container sp-section border-t border-border">
        <div className="space-y-16 md:space-y-24">
          {steps.map((step, index) => (
            <div 
              key={step.number}
              className="grid lg:grid-cols-12 gap-8 lg:gap-12 items-start"
            >
              {/* Number */}
              <div className="lg:col-span-2">
                <span className="font-display text-5xl md:text-6xl text-primary/20">
                  {step.number}
                </span>
              </div>
              
              {/* Content */}
              <div className="lg:col-span-6">
                <p className="sp-eyebrow text-terracotta mb-3">{step.duration}</p>
                <h2 className="font-display text-2xl md:text-3xl mb-4">
                  {step.title}
                </h2>
                <p className="text-muted-foreground leading-relaxed mb-3">
                  {step.description}
                </p>
                <p className="text-sm text-foreground/60 italic">
                  {step.detail}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* What this isn't */}
      <section className="sp-section-sage border-t border-sage-light">
        <div className="sp-container py-16 md:py-24">
          <div 
            ref={differentiatorReveal.ref}
            className={`grid lg:grid-cols-12 gap-12 reveal ${differentiatorReveal.isRevealed ? "revealed" : ""}`}
          >
            <div className="lg:col-span-4">
              <p className="sp-eyebrow mb-4 text-primary">What this isn't</p>
              <h2 className="font-display text-balance">
                Not therapy. Not generic advice.
              </h2>
            </div>
            
            <div className="lg:col-span-7 lg:col-start-6">
              <div className="space-y-8">
                {[
                  {
                    title: "Not therapy",
                    description: "We're not here to explore your feelings. We're here to help you make a decision and execute it."
                  },
                  {
                    title: "Not generic advice",
                    description: "Every recommendation is based on your specific situation, constraints, and goals. No frameworks that 'work for everyone.'"
                  },
                  {
                    title: "Not a quick fix",
                    description: "Real career moves take time. We give you a 90-day plan, not a motivational quote."
                  }
                ].map((item, index) => (
                  <div 
                    key={index} 
                    className={`border-l-2 border-primary/20 pl-6 hover:border-primary transition-all duration-500 ${
                      differentiatorReveal.isRevealed 
                        ? "opacity-100 translate-x-0" 
                        : "opacity-0 translate-x-4"
                    }`}
                    style={{ transitionDelay: `${0.3 + index * 0.1}s` }}
                  >
                    <h3 className="font-display text-lg mb-2">{item.title}</h3>
                    <p className="text-muted-foreground text-sm leading-relaxed">{item.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Who it's for */}
      <section className="sp-container sp-section border-t border-border">
        <div 
          ref={audienceReveal.ref}
          className={`grid lg:grid-cols-12 gap-12 reveal ${audienceReveal.isRevealed ? "revealed" : ""}`}
        >
          <div className="lg:col-span-4">
            <p className="sp-eyebrow mb-4 text-primary">Who it's for</p>
            <h2 className="font-display text-balance">
              People at an inflection point.
            </h2>
            <p className="text-muted-foreground mt-4 leading-relaxed">
              You're not lost—you're stuck. You know something needs to change, but you're not sure what move to make.
            </p>
          </div>
          
          <div className="lg:col-span-7 lg:col-start-6 stagger-children">
            <div className="space-y-4">
              {[
                "I've been passed over for promotion twice and I don't know why.",
                "I need to make a decision about this offer but I can't think clearly.",
                "My manager says I'm doing great but nothing is changing.",
                "I'm burning out but I can't afford to quit."
              ].map((quote, index) => (
                <div 
                  key={index} 
                  className={`sp-card group transition-all duration-500 hover:border-primary/30 ${
                    audienceReveal.isRevealed 
                      ? "opacity-100 translate-y-0" 
                      : "opacity-0 translate-y-4"
                  }`}
                  style={{ transitionDelay: `${0.2 + index * 0.1}s` }}
                >
                  <p className="text-foreground italic">"{quote}"</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="sp-section-sage border-t border-sage-light">
        <div 
          ref={ctaReveal.ref}
          className={`sp-container py-16 md:py-24 text-center reveal-scale ${ctaReveal.isRevealed ? "revealed" : ""}`}
        >
          <h2 className="font-display text-2xl md:text-3xl mb-4">
            Ready to get unstuck?
          </h2>
          <p className="text-muted-foreground mb-8 max-w-md mx-auto">
            Start with the free interview. We'll give you clarity on your situation—no commitment required.
          </p>
          <Link to="/interview">
            <Button 
              size="lg" 
              className="group bg-foreground text-background hover:bg-foreground/90 px-8 h-12 text-base"
            >
              <span className="flex items-center">
                Start free interview
                <ArrowRight className="ml-2 h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
              </span>
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="sp-container py-12 flex flex-col md:flex-row items-center justify-between gap-6 text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} Serious People</p>
          <div className="flex items-center gap-8">
            <Link to="/how-it-works" className="hover:text-foreground transition-colors">
              How It Works
            </Link>
            <a href="/guides" className="hover:text-foreground transition-colors">
              Guides
            </a>
            <Link to="/app/login" className="hover:text-foreground transition-colors">
              Log In
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default HowItWorks;
