import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Menu, X, Calculator, BookOpen, Users } from "lucide-react";
import { Button } from "@/lovable/components/ui/button";
import { useScrollReveal } from "@/lovable/hooks/useScrollReveal";

const Resources = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const heroReveal = useScrollReveal();
  const toolsReveal = useScrollReveal();
  const guidesReveal = useScrollReveal();
  const rolesReveal = useScrollReveal();

  const guides = [
    { title: "The Stay-or-Go Decision Framework", slug: "stay-or-go-framework" },
    { title: "Burnout vs. Misfit vs. Bad Manager", slug: "burnout-vs-misfit-vs-bad-manager" },
    { title: "How to Resign Without Burning Bridges", slug: "how-to-resign-without-burning-bridges" },
    { title: "The Severance Negotiation Playbook", slug: "severance-negotiation-playbook" },
    { title: "Executive Job Search Is Different", slug: "executive-job-search-is-different" },
    { title: "How to Explain Your Departure", slug: "how-to-explain-your-departure" },
    { title: "What to Do in the First 14 Days", slug: "what-to-do-in-the-first-14-days" },
    { title: "How to Talk to Your Boss About Changing Your Role", slug: "how-to-talk-to-your-boss-about-changing-your-role" },
    { title: "How to Evaluate an Offer Like an Adult", slug: "how-to-evaluate-an-offer-like-an-adult" },
    { title: "When to Use a Coach (And What Kind)", slug: "when-to-use-a-coach" },
    { title: "The Layoff Risk Survival Plan", slug: "layoff-risk-plan" },
    { title: "Toxic Boss: Survive or Exit?", slug: "toxic-boss-survival-or-exit" },
  ];

  const roles = [
    { title: "VP Product", slug: "vp-product" },
    { title: "Director of Product", slug: "director-product" },
    { title: "VP Engineering", slug: "vp-engineering" },
    { title: "Director of Engineering", slug: "director-engineering" },
    { title: "Chief of Staff", slug: "chief-of-staff" },
    { title: "VP Operations", slug: "vp-operations" },
  ];

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      {/* Navigation */}
      <nav className="sp-container py-6 flex items-center justify-between animate-fade-in">
        <Link to="/" className="font-display text-xl tracking-tight hover:text-primary transition-colors duration-300">
          Serious People
        </Link>
        
        <div className="hidden md:flex items-center gap-8">
          <Link to="/resources" className="text-sm text-foreground font-medium">
            Resources
          </Link>
          <Link to="/guides" className="sp-link text-sm text-muted-foreground hover:text-foreground transition-colors">
            Guides
          </Link>
          <Link to="/app/login" className="text-sm font-medium hover:text-primary transition-colors">
            Log in
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
            <Link to="/resources" className="text-sm font-medium py-2">Resources</Link>
            <Link to="/guides" className="text-sm text-muted-foreground py-2">Guides</Link>
            <Link to="/app/login" className="text-sm font-medium py-2">Log in</Link>
          </div>
        </div>
      )}

      {/* Hero */}
      <section className="sp-container sp-section">
        <div 
          ref={heroReveal.ref}
          className={`max-w-3xl reveal ${heroReveal.isRevealed ? "revealed" : ""}`}
        >
          <p className="sp-eyebrow mb-6 text-primary">Resources</p>
          <h1 className="font-display text-4xl md:text-5xl lg:text-6xl text-balance mb-8">
            Career Resources Hub
          </h1>
          <p className="text-lg text-muted-foreground max-w-xl leading-relaxed">
            Everything you need to navigate serious career decisions. Frameworks, scripts, and practical guidance—no fluff.
          </p>
        </div>
      </section>

      {/* Interactive Tools */}
      <section className="sp-container pb-16 md:pb-24">
        <div 
          ref={toolsReveal.ref}
          className={`reveal ${toolsReveal.isRevealed ? "revealed" : ""}`}
        >
          <div className="flex items-center gap-3 mb-6">
            <Calculator className="w-5 h-5 text-primary" />
            <h2 className="font-display text-2xl">Interactive Tools</h2>
          </div>
          <p className="text-muted-foreground mb-8">Quick assessments to clarify your thinking</p>
          
          <Link to="/tools/stay-or-go-calculator">
            <div className="group bg-primary text-primary-foreground p-6 md:p-8 hover:bg-primary/90 transition-colors cursor-pointer max-w-md">
              <h3 className="font-display text-xl mb-2 group-hover:translate-x-1 transition-transform">
                Stay-or-Go Calculator
              </h3>
              <p className="text-primary-foreground/80 text-sm mb-4">
                A 2-minute quiz to help you decide whether to stay or leave
              </p>
              <span className="text-sm flex items-center gap-2">
                Take the quiz <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </span>
            </div>
          </Link>
        </div>
      </section>

      {/* Career Guides */}
      <section className="sp-section-sage border-t border-sage-light">
        <div className="sp-container py-16 md:py-24">
          <div 
            ref={guidesReveal.ref}
            className={`reveal ${guidesReveal.isRevealed ? "revealed" : ""}`}
          >
            <div className="flex items-center gap-3 mb-6">
              <BookOpen className="w-5 h-5 text-primary" />
              <h2 className="font-display text-2xl">Career Guides</h2>
            </div>
            <p className="text-muted-foreground mb-8">In-depth frameworks for major career decisions</p>
            
            <div className="grid md:grid-cols-2 gap-4">
              {guides.map((guide, index) => (
                <Link 
                  key={guide.slug} 
                  to={`/guides/${guide.slug}`}
                  className={`group sp-card bg-background hover:border-primary/30 transition-all duration-300 ${
                    guidesReveal.isRevealed ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
                  }`}
                  style={{ transitionDelay: `${0.1 + index * 0.05}s` }}
                >
                  <div className="flex items-center justify-between">
                    <h3 className="font-display text-lg group-hover:text-primary transition-colors">
                      {guide.title}
                    </h3>
                    <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                  </div>
                </Link>
              ))}
            </div>
            
            <div className="mt-8">
              <Link to="/guides">
                <Button variant="outline" className="group">
                  View all guides
                  <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Role-Specific Guidance */}
      <section className="sp-container sp-section border-t border-border">
        <div 
          ref={rolesReveal.ref}
          className={`reveal ${rolesReveal.isRevealed ? "revealed" : ""}`}
        >
          <div className="flex items-center gap-3 mb-6">
            <Users className="w-5 h-5 text-primary" />
            <h2 className="font-display text-2xl">Role-Specific Guidance</h2>
          </div>
          <p className="text-muted-foreground mb-8">Tailored advice for your specific role and seniority</p>
          
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
            {roles.map((role, index) => (
              <Link 
                key={role.slug} 
                to={`/roles/${role.slug}`}
                className={`group p-6 border border-border hover:border-primary/30 hover:bg-muted/30 transition-all duration-300 ${
                  rolesReveal.isRevealed ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
                }`}
                style={{ transitionDelay: `${0.1 + index * 0.05}s` }}
              >
                <h3 className="font-display text-lg group-hover:text-primary transition-colors">
                  {role.title}
                </h3>
                <p className="text-sm text-muted-foreground mt-1">10 situations</p>
              </Link>
            ))}
          </div>
          
          <div className="mt-8">
            <Link to="/roles">
              <Button variant="outline" className="group">
                Browse all roles
                <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="sp-section-sage border-t border-sage-light">
        <div className="sp-container py-16 md:py-24 text-center">
          <h2 className="font-display text-2xl md:text-3xl mb-4">
            Want personalized guidance?
          </h2>
          <p className="text-muted-foreground mb-8 max-w-md mx-auto">
            Get tailored advice for your specific situation with our AI-powered coaching interview.
          </p>
          <Link to="/interview">
            <Button size="lg" className="bg-foreground text-background hover:bg-foreground/90">
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

export default Resources;
