import { useEffect } from "react";
import { Link } from "wouter";
import { Header, Footer } from "@/components/layout";
import { ProcessPath } from "@/components/graphics";
import { StepNumber, DecorativeRule } from "@/components/graphics/TypographicAccents";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import { cn } from "@/lib/utils";
import { ArrowRight, Clock, FileText, MessageCircle, Target } from "lucide-react";

const steps = [
  {
    number: 1,
    title: "Free Coaching Interview",
    duration: "5–10 minutes",
    icon: MessageCircle,
    description: "You answer the questions a good career coach would ask: What's actually happening? What have you tried? What's at stake?",
    outcome: "By the end, you'll see a plain-language coaching plan tailored to your situation. Review it, adjust it, then decide if you want to continue.",
    highlight: "100% free, no commitment",
  },
  {
    number: 2,
    title: "Guided Working Session",
    duration: "~30 minutes",
    icon: Target,
    description: "Your coach walks you through three focused modules. First, you go deep on what's really going on—the stuff you haven't fully articulated, even to yourself.",
    outcome: "Then you map your options, constraints, and trade-offs. Finally, you turn your thinking into a concrete plan with real next steps.",
    modules: [
      { name: "Job Autopsy", desc: "Understand what's actually happening" },
      { name: "Fork in the Road", desc: "Map your options and trade-offs" },
      { name: "The Great Escape Plan", desc: "Build your concrete action plan" },
    ],
  },
  {
    number: 3,
    title: "Your Serious Plan",
    duration: "Instant delivery",
    icon: FileText,
    description: "We generate a comprehensive document package tailored to your specific situation. These aren't generic templates—they're built from your actual conversation.",
    artifacts: [
      "Decision Snapshot",
      "Conversation Scripts",
      "Action Plan (30–90 days)",
      "Risk Map",
      "Resources & Prompts",
      "Coach Graduation Letter",
    ],
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

export default function HowItWorks() {
  useEffect(() => {
    document.title = "How It Works | Serious People";
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="pt-24 pb-16">
        <section className="max-w-content-wide mx-auto px-6 lg:px-8 py-section">
          <RevealSection className="text-center mb-16">
            <h1 className="font-serif text-display-lg text-foreground mb-6">
              How It Works
            </h1>
            <p className="text-body-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              A structured coaching process that turns career confusion into a decision you trust. 
              Three focused steps. One clear outcome.
            </p>
          </RevealSection>

          <RevealSection delay={200}>
            <ProcessPath steps={3} className="max-w-xl mx-auto mb-20" />
          </RevealSection>

          <div className="space-y-24">
            {steps.map((step, index) => (
              <RevealSection key={step.number} delay={300 + index * 100}>
                <div className={cn(
                  "grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start",
                  index % 2 === 1 && "lg:flex-row-reverse"
                )}>
                  <div className={cn(
                    "lg:col-span-4",
                    index % 2 === 1 && "lg:order-2"
                  )}>
                    <StepNumber number={step.number} className="mb-4" />
                    <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground mb-4">
                      <Clock className="w-4 h-4" />
                      <span>{step.duration}</span>
                    </div>
                    <h2 className="font-serif text-headline text-foreground mb-4">
                      {step.title}
                    </h2>
                    {step.highlight && (
                      <span className="inline-block px-3 py-1.5 text-xs font-medium bg-sage-wash text-primary rounded-full">
                        {step.highlight}
                      </span>
                    )}
                  </div>

                  <div className={cn(
                    "lg:col-span-8",
                    index % 2 === 1 && "lg:order-1"
                  )}>
                    <div className="bg-card rounded-lg border border-border p-8">
                      <step.icon className="w-10 h-10 text-primary mb-6" />
                      
                      <p className="text-body-lg text-foreground leading-relaxed mb-4">
                        {step.description}
                      </p>
                      
                      <p className="text-body text-muted-foreground leading-relaxed">
                        {step.outcome}
                      </p>

                      {step.modules && (
                        <div className="mt-8 pt-6 border-t border-border">
                          <p className="text-sm font-medium text-muted-foreground mb-4 uppercase tracking-wider">
                            Coaching Modules
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            {step.modules.map((mod, i) => (
                              <div key={i} className="p-4 bg-sage-wash/50 rounded-lg">
                                <p className="font-serif font-semibold text-foreground text-sm mb-1">
                                  {mod.name}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {mod.desc}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {step.artifacts && (
                        <div className="mt-8 pt-6 border-t border-border">
                          <p className="text-sm font-medium text-muted-foreground mb-4 uppercase tracking-wider">
                            Your Serious Plan Includes
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {step.artifacts.map((artifact, i) => (
                              <span 
                                key={i} 
                                className="px-3 py-1.5 text-sm bg-terracotta-wash text-terracotta-foreground rounded-full"
                              >
                                {artifact}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </RevealSection>
            ))}
          </div>
        </section>

        <DecorativeRule className="max-w-content mx-auto" />

        <section className="max-w-content mx-auto px-6 lg:px-8 py-section text-center">
          <RevealSection>
            <h2 className="font-serif text-headline text-foreground mb-4">
              Ready to get clarity?
            </h2>
            <p className="text-body-lg text-muted-foreground mb-8 max-w-xl mx-auto">
              The free interview takes 5–10 minutes. You'll know if this is right for you before paying anything.
            </p>
            <Link
              href="/login"
              className={cn(
                "inline-flex items-center gap-2 px-8 py-4 rounded-lg",
                "bg-primary text-primary-foreground font-medium text-lg",
                "hover:bg-primary-hover transition-colors duration-200"
              )}
              data-testid="button-start-interview"
            >
              Start the free interview
              <ArrowRight className="w-5 h-5" />
            </Link>
          </RevealSection>
        </section>
      </main>

      <Footer />
    </div>
  );
}
