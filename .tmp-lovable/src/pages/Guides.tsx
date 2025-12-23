import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useScrollReveal } from "@/hooks/useScrollReveal";

const Guides = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const heroReveal = useScrollReveal();
  const listReveal = useScrollReveal();

  const guides = [
    { title: "The Stay-or-Go Decision Framework", slug: "stay-or-go-framework", description: "A structured approach to the biggest career question" },
    { title: "Burnout vs. Misfit vs. Bad Manager", slug: "burnout-vs-misfit-vs-bad-manager", description: "Diagnose what's actually wrong before you act" },
    { title: "How to Resign Without Burning Bridges", slug: "how-to-resign-without-burning-bridges", description: "Leave gracefully, preserve relationships" },
    { title: "The Severance Negotiation Playbook", slug: "severance-negotiation-playbook", description: "Get what you deserve on the way out" },
    { title: "Executive Job Search Is Different", slug: "executive-job-search-is-different", description: "Why the rules change at the senior level" },
    { title: "How to Explain Your Departure", slug: "how-to-explain-your-departure", description: "Craft your narrative without lying" },
    { title: "What to Do in the First 14 Days After Leaving", slug: "what-to-do-in-the-first-14-days", description: "The critical window most people waste" },
    { title: "How to Talk to Your Boss About Changing Your Role", slug: "how-to-talk-to-your-boss-about-changing-your-role", description: "Scripts for the hardest conversations" },
    { title: "How to Evaluate an Offer Like an Adult", slug: "how-to-evaluate-an-offer-like-an-adult", description: "Beyond the comp package" },
    { title: "When to Use a Coach (And What Kind)", slug: "when-to-use-a-coach", description: "The ROI of professional guidance" },
    { title: "The Layoff Risk Survival Plan", slug: "layoff-risk-plan", description: "Prepare before it's too late" },
    { title: "Toxic Boss: Survive or Exit?", slug: "toxic-boss-survival-or-exit", description: "When to fight and when to flee" },
  ];

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      {/* Navigation */}
      <nav className="sp-container py-6 flex items-center justify-between animate-fade-in">
        <Link to="/" className="font-display text-xl tracking-tight hover:text-primary transition-colors duration-300">
          Serious People
        </Link>
        
        <div className="hidden md:flex items-center gap-8">
          <Link to="/guides" className="text-sm text-foreground font-medium">
            Guides
          </Link>
          <Link to="/resources" className="sp-link text-sm text-muted-foreground hover:text-foreground transition-colors">
            Resources
          </Link>
          <Link to="/interview" className="text-sm font-medium hover:text-primary transition-colors">
            Start Session
          </Link>
        </div>
        
        <button 
          className="md:hidden p-2 -mr-2"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </nav>

      {mobileMenuOpen && (
        <div className="md:hidden border-b border-border bg-background animate-fade-in">
          <div className="sp-container py-4 flex flex-col gap-4">
            <Link to="/guides" className="text-sm font-medium py-2">Guides</Link>
            <Link to="/resources" className="text-sm text-muted-foreground py-2">Resources</Link>
            <Link to="/interview" className="text-sm font-medium py-2">Start Session</Link>
          </div>
        </div>
      )}

      {/* Hero */}
      <section className="sp-container py-16 md:py-24">
        <div 
          ref={heroReveal.ref}
          className={`max-w-2xl reveal ${heroReveal.isRevealed ? "revealed" : ""}`}
        >
          <p className="sp-eyebrow mb-4 text-primary">Guides</p>
          <h1 className="font-display text-4xl md:text-5xl text-balance mb-6">
            Career Guides
          </h1>
          <p className="text-lg text-muted-foreground leading-relaxed">
            Practical frameworks for serious career decisions. No fluff, no platitudes—just clarity.
          </p>
        </div>
      </section>

      {/* Guide List */}
      <section className="sp-container pb-24">
        <div 
          ref={listReveal.ref}
          className={`max-w-2xl mx-auto reveal ${listReveal.isRevealed ? "revealed" : ""}`}
        >
          <div className="divide-y divide-border">
            {guides.map((guide, index) => (
              <Link 
                key={guide.slug} 
                to={`/guides/${guide.slug}`}
                className={`group block py-6 transition-all duration-500 ${
                  listReveal.isRevealed ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
                }`}
                style={{ transitionDelay: `${0.1 + index * 0.05}s` }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="font-display text-lg md:text-xl group-hover:text-primary transition-colors mb-1">
                      {guide.title}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {guide.description}
                    </p>
                  </div>
                  <ArrowRight className="w-5 h-5 text-muted-foreground opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all shrink-0 mt-1" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-foreground text-background">
        <div className="sp-container py-16 md:py-20 text-center">
          <h2 className="font-display text-2xl md:text-3xl mb-4">
            Want personalized guidance?
          </h2>
          <p className="text-background/70 mb-8 max-w-md mx-auto">
            Every situation is different. Get tailored advice for yours.
          </p>
          <Link to="/interview">
            <Button size="lg" className="bg-background text-foreground hover:bg-background/90">
              Start Your Free Interview
              <ArrowRight className="ml-2 w-4 h-4" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="sp-container py-12 flex flex-col md:flex-row items-center justify-between gap-6 text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} Serious People. Career coaching for serious decisions.</p>
          <div className="flex items-center gap-8">
            <Link to="/" className="hover:text-foreground transition-colors">Home</Link>
            <Link to="/guides" className="hover:text-foreground transition-colors">Guides</Link>
            <Link to="/interview" className="hover:text-foreground transition-colors">Start Session</Link>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Guides;
