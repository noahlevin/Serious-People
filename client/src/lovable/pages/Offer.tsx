import { Link } from "react-router-dom";
import { ArrowRight, Check, Clock, Pause, ShieldCheck } from "lucide-react";

const Offer = () => {
  // This would come from interview context
  const user = {
    name: "Sarah",
    situation: "Senior Product Manager at a Fortune 500, 7 years in, passed over twice for Director despite strong reviews.",
    coreConflict: "You're doing the work of a Director but being evaluated as an IC. The feedback you're getting is designed to keep you in place, not help you advance.",
    blindSpot: "You've been optimizing for the wrong audience. Your skip-level doesn't know you exist.",
  };

  const modules = [
    {
      number: 1,
      title: "The Visibility Gap",
      hook: "Why your manager's praise isn't translating to promotions",
      insight: "We'll map exactly who influences your promotion decision and what they currently think of you. Spoiler: it's not who you've been impressing.",
      duration: "12 min",
    },
    {
      number: 2,
      title: "The Strategic Pivot",
      hook: "Repositioning without burning bridges",
      insight: "A concrete plan to shift your visibility upward while keeping your manager as an ally, not an obstacle.",
      duration: "10 min",
    },
    {
      number: 3,
      title: "The 90-Day Play",
      hook: "From invisible contributor to obvious choice",
      insight: "Week-by-week actions that compound. By Q2, the promotion conversation will be inevitable.",
      duration: "15 min",
    },
  ];

  const deliverables = [
    "Promotion Stakeholder Map — who actually decides, and what they need to see",
    "Skip-Level Introduction Script — how to get on their radar without being obvious",
    "Weekly Visibility Checklist — small actions that compound over 90 days",
    "Manager Conversation Guide — reframe the relationship without conflict",
    "Decision Timeline — when to push, when to pivot, when to leave",
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border">
        <div className="sp-container py-6">
          <Link to="/" className="font-display text-xl tracking-tight hover:text-primary transition-colors duration-300">
            Serious People
          </Link>
        </div>
      </header>

      {/* Hero - The Hook */}
      <section className="py-16 md:py-24 border-b border-border">
        <div className="sp-container-medium">
          <p className="sp-eyebrow text-accent mb-6">Your Coaching Plan</p>
          
          <h1 className="font-display text-3xl md:text-4xl lg:text-5xl text-foreground mb-6 max-w-2xl">
            {user.name}, let's talk about what's actually happening.
          </h1>
          
          <div className="max-w-xl">
            <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
              {user.situation}
            </p>
            
            <div className="bg-foreground text-background p-6 md:p-8">
              <p className="font-display text-lg md:text-xl italic leading-relaxed">
                "{user.coreConflict}"
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* The Insight */}
      <section className="py-16 md:py-20 bg-muted/30 border-b border-border">
        <div className="sp-container-medium">
          <div className="max-w-xl">
            <p className="sp-eyebrow text-muted-foreground mb-4">What we discovered</p>
            <h2 className="font-display text-2xl md:text-3xl text-foreground mb-6">
              The Pattern We Noticed
            </h2>
            <p className="text-foreground text-lg leading-relaxed mb-6">
              {user.blindSpot}
            </p>
            <p className="text-muted-foreground leading-relaxed">
              This isn't about working harder or being more patient. It's about understanding the game you're actually playing—and playing it deliberately.
            </p>
          </div>
        </div>
      </section>

      {/* The Plan - Modules */}
      <section className="py-16 md:py-24 border-b border-border">
        <div className="sp-container-medium">
          <div className="mb-12">
            <p className="sp-eyebrow text-muted-foreground mb-4">Your Session</p>
            <h2 className="font-display text-2xl md:text-3xl text-foreground mb-3">
              Three Moves. Thirty Minutes.
            </h2>
            <p className="text-muted-foreground max-w-lg">
              A focused session designed around your specific situation. No generic advice.
            </p>
          </div>

          <div className="space-y-6">
            {modules.map((module, index) => (
              <div 
                key={module.number}
                className="group border border-border bg-card hover:border-foreground/20 transition-colors"
              >
                <div className="p-6 md:p-8">
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div>
                      <p className="sp-eyebrow text-muted-foreground mb-2">
                        Part {module.number}
                      </p>
                      <h3 className="font-display text-xl md:text-2xl text-foreground">
                        {module.title}
                      </h3>
                    </div>
                    <span className="text-sm text-muted-foreground shrink-0">
                      {module.duration}
                    </span>
                  </div>
                  
                  <p className="text-foreground font-medium mb-2">
                    {module.hook}
                  </p>
                  <p className="text-muted-foreground leading-relaxed">
                    {module.insight}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What You'll Leave With */}
      <section className="py-16 md:py-24 bg-muted/30 border-b border-border">
        <div className="sp-container-medium">
          <div className="grid md:grid-cols-2 gap-12 md:gap-16">
            <div>
              <p className="sp-eyebrow text-muted-foreground mb-4">Deliverables</p>
              <h2 className="font-display text-2xl md:text-3xl text-foreground mb-3">
                Walk away with a plan, not just insights.
              </h2>
              <p className="text-muted-foreground">
                Everything you need to execute, saved to your account and ready to reference.
              </p>
            </div>
            
            <div className="space-y-4">
              {deliverables.map((item, index) => (
                <div key={index} className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <p className="text-foreground">{item}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* The Offer */}
      <section className="py-16 md:py-24 border-b border-border">
        <div className="sp-container-medium">
          <div className="max-w-lg mx-auto text-center">
            <h2 className="font-display text-2xl md:text-3xl text-foreground mb-4">
              Ready when you are.
            </h2>
            <p className="text-muted-foreground mb-8">
              Your session is personalized and waiting. Start now or come back later—your progress is saved.
            </p>

            {/* Pricing Card */}
            <div className="bg-card border border-border p-8 mb-8">
              <div className="flex items-baseline justify-center gap-3 mb-6">
                <span className="text-3xl md:text-4xl font-display text-foreground">$48</span>
                <span className="text-lg text-muted-foreground line-through">$98</span>
              </div>
              
              <button className="w-full py-4 bg-foreground text-background text-base font-medium hover:bg-foreground/90 transition-colors flex items-center justify-center gap-2 mb-6">
                Start Your Session
                <ArrowRight className="w-4 h-4" />
              </button>

              <div className="flex items-center justify-center gap-6 text-sm text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4" />
                  <span>30 min</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Pause className="w-4 h-4" />
                  <span>Pause anytime</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Private</span>
                </div>
              </div>
            </div>

            <p className="text-sm text-muted-foreground">
              Not ready? No problem. Your personalized plan will be here when you are.
            </p>
          </div>
        </div>
      </section>

      {/* Quote / Closing */}
      <section className="py-16 md:py-20">
        <div className="sp-container-medium">
          <div className="max-w-lg mx-auto text-center">
            <blockquote className="font-display text-xl md:text-2xl text-foreground italic mb-4">
              "The question isn't whether you're good enough. It's whether the right people know it."
            </blockquote>
            <p className="text-sm text-muted-foreground">
              — Every executive who made Director before age 35
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Offer;
