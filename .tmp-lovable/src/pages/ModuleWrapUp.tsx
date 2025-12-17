import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, Download, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";

const ModuleWrapUp = () => {
  const [expandedInsight, setExpandedInsight] = useState<number | null>(0);

  // This would come from the completed module context
  const module = {
    number: 1,
    title: "The Visibility Gap",
    completed: true,
    duration: "12 min",
    nextModule: {
      number: 2,
      title: "The Strategic Pivot",
    },
  };

  const userName = "Sarah";

  const insights = [
    {
      title: "Your manager is an ally, not an advocate",
      summary: "There's a difference between someone who likes your work and someone who fights for your promotion. Your manager falls into the first category.",
      detail: "In calibration meetings, your manager describes you as 'solid' and 'reliable'—words that maintain the status quo rather than push for advancement. This isn't malicious; they may not realize the impact. But the result is the same: you're invisible when it matters.",
      action: "Shift from expecting advocacy to building your own visibility upward.",
    },
    {
      title: "The skip-level gap is your biggest blocker",
      summary: "Your director doesn't know who you are beyond a name on an org chart.",
      detail: "When promotion decisions happen, your skip-level has no data points about you except what your manager provides. And your manager—perhaps unconsciously—isn't providing the right narrative. You need direct exposure.",
      action: "Create 2-3 legitimate touchpoints with your skip-level over the next 6 weeks.",
    },
    {
      title: "You've been optimizing for the wrong metrics",
      summary: "Execution quality doesn't equal promotion readiness.",
      detail: "You've focused on being excellent at your current level. But promotions aren't rewards for doing your job well—they're bets on your ability to operate at the next level. You need to demonstrate director-level thinking, not senior PM excellence.",
      action: "Start framing your work in terms of business impact and strategic decisions, not deliverables.",
    },
  ];

  const decisions = [
    "I will not wait for my manager to advocate for me",
    "I will create direct visibility with my skip-level",
    "I will reframe how I communicate my work",
  ];

  const progress = {
    completed: 1,
    total: 3,
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="sp-container py-6 flex items-center justify-between">
          <Link to="/" className="font-display text-xl tracking-tight hover:text-primary transition-colors duration-300">
            Serious People
          </Link>
          
          {/* Progress indicator */}
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">
              Module {progress.completed} of {progress.total}
            </span>
            <div className="flex gap-1">
              {Array.from({ length: progress.total }).map((_, i) => (
                <div 
                  key={i}
                  className={`w-8 h-1 rounded-full transition-colors ${
                    i < progress.completed ? 'bg-primary' : 'bg-border'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="py-12 md:py-16 border-b border-border">
        <div className="sp-container-medium">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Check className="w-5 h-5 text-primary" />
            </div>
            <p className="sp-eyebrow text-primary">Module {module.number} Complete</p>
          </div>
          
          <h1 className="font-display text-3xl md:text-4xl text-foreground mb-4">
            {module.title}
          </h1>
          <p className="text-lg text-muted-foreground max-w-xl">
            Here's what we uncovered about your situation, {userName}.
          </p>
        </div>
      </section>

      {/* Key Insights */}
      <section className="py-12 md:py-16 border-b border-border">
        <div className="sp-container-medium">
          <p className="sp-eyebrow text-muted-foreground mb-6">Key Insights</p>
          
          <div className="space-y-4">
            {insights.map((insight, index) => (
              <div 
                key={index}
                className="border border-border bg-card overflow-hidden transition-colors hover:border-primary/30"
              >
                <button
                  onClick={() => setExpandedInsight(expandedInsight === index ? null : index)}
                  className="w-full p-6 text-left flex items-start justify-between gap-4"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="w-6 h-6 rounded-full bg-foreground text-background text-xs flex items-center justify-center font-medium">
                        {index + 1}
                      </span>
                      <h3 className="font-display text-lg text-foreground">
                        {insight.title}
                      </h3>
                    </div>
                    <p className="text-muted-foreground text-sm pl-9">
                      {insight.summary}
                    </p>
                  </div>
                  {expandedInsight === index ? (
                    <ChevronUp className="w-5 h-5 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-muted-foreground shrink-0" />
                  )}
                </button>
                
                {expandedInsight === index && (
                  <div className="px-6 pb-6 animate-fade-in">
                    <div className="pl-9 pt-4 border-t border-border">
                      <p className="text-foreground leading-relaxed mb-4">
                        {insight.detail}
                      </p>
                      <div className="bg-primary/5 border-l-2 border-primary p-4">
                        <p className="text-sm font-medium text-foreground mb-1">Your action:</p>
                        <p className="text-sm text-muted-foreground">{insight.action}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Decisions Made */}
      <section className="py-12 md:py-16 bg-foreground text-background">
        <div className="sp-container-medium">
          <p className="sp-eyebrow text-background/60 mb-6">Decisions You Made</p>
          <h2 className="font-display text-2xl md:text-3xl mb-8">
            Your commitments from this module:
          </h2>
          
          <div className="space-y-4 mb-8">
            {decisions.map((decision, index) => (
              <div 
                key={index}
                className="flex items-center gap-4 p-4 bg-background/5 border border-background/10"
              >
                <div className="w-6 h-6 rounded-full bg-background/20 flex items-center justify-center shrink-0">
                  <Check className="w-4 h-4 text-background" />
                </div>
                <p className="text-background">{decision}</p>
              </div>
            ))}
          </div>
          
          <p className="text-sm text-background/60">
            These decisions have been saved to your action plan.
          </p>
        </div>
      </section>

      {/* What's Next */}
      <section className="py-12 md:py-16 border-b border-border">
        <div className="sp-container-medium">
          <div className="grid md:grid-cols-2 gap-8">
            {/* Next Module */}
            <div className="p-6 border border-border bg-card">
              <p className="sp-eyebrow text-muted-foreground mb-3">Up Next</p>
              <p className="text-sm text-muted-foreground mb-1">Module {module.nextModule.number}</p>
              <h3 className="font-display text-xl text-foreground mb-4">
                {module.nextModule.title}
              </h3>
              <p className="text-sm text-muted-foreground mb-6">
                Now that we understand the visibility gap, let's build a strategy to close it—without burning bridges.
              </p>
              <Link to="/app/module/2">
                <Button className="w-full bg-foreground text-background hover:bg-foreground/90 h-12">
                  <span className="flex items-center">
                    Continue to Module 2
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </span>
                </Button>
              </Link>
            </div>
            
            {/* Download Summary */}
            <div className="p-6 border border-border bg-muted/30">
              <p className="sp-eyebrow text-muted-foreground mb-3">Your Takeaways</p>
              <h3 className="font-display text-xl text-foreground mb-4">
                Module 1 Summary
              </h3>
              <p className="text-sm text-muted-foreground mb-6">
                A PDF with your key insights, decisions, and action items from this module. Reference it anytime.
              </p>
              <Button variant="outline" className="w-full h-12">
                <Download className="mr-2 h-4 w-4" />
                Download Summary
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Take a break */}
      <section className="py-12 md:py-16">
        <div className="sp-container-medium text-center">
          <p className="text-muted-foreground mb-4">
            Need a break? Your progress is saved.
          </p>
          <Link 
            to="/"
            className="text-sm text-foreground underline underline-offset-4 hover:text-foreground/80 transition-colors"
          >
            Save and exit — come back anytime
          </Link>
        </div>
      </section>
    </div>
  );
};

export default ModuleWrapUp;
