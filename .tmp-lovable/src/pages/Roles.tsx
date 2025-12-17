import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Menu, X, ChevronRight } from "lucide-react";
import { useScrollReveal } from "@/hooks/useScrollReveal";

const situations = [
  "stay-or-go",
  "burnout", 
  "bad-manager",
  "toxic-culture",
  "severance",
  "internal-pivot",
  "job-search",
  "offer-evaluation",
  "resignation",
  "layoff-risk"
];

const situationLabels: Record<string, string> = {
  "stay-or-go": "Stay or Go",
  "burnout": "Burnout",
  "bad-manager": "Bad Manager",
  "toxic-culture": "Toxic Culture",
  "severance": "Severance",
  "internal-pivot": "Internal Pivot",
  "job-search": "Job Search",
  "offer-evaluation": "Offer Evaluation",
  "resignation": "Resignation",
  "layoff-risk": "Layoff Risk"
};

const Roles = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const heroReveal = useScrollReveal();
  const rolesReveal = useScrollReveal();

  const roles = [
    { title: "VP Product", slug: "vp-product", description: "Strategic product leadership" },
    { title: "Director of Product", slug: "director-product", description: "Product team management" },
    { title: "VP Engineering", slug: "vp-engineering", description: "Engineering organization leadership" },
    { title: "Director of Engineering", slug: "director-engineering", description: "Engineering team management" },
    { title: "Chief of Staff", slug: "chief-of-staff", description: "Executive operations" },
    { title: "VP Operations", slug: "vp-operations", description: "Operational excellence" },
  ];

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      {/* Navigation */}
      <nav className="sp-container py-6 flex items-center justify-between animate-fade-in">
        <Link to="/" className="font-display text-xl tracking-tight hover:text-primary transition-colors duration-300">
          Serious People
        </Link>
        
        <div className="hidden md:flex items-center gap-8">
          <Link to="/guides" className="sp-link text-sm text-muted-foreground hover:text-foreground transition-colors">
            Guides
          </Link>
          <Link to="/roles" className="text-sm text-foreground font-medium">
            Roles
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
            <Link to="/guides" className="text-sm text-muted-foreground py-2">Guides</Link>
            <Link to="/roles" className="text-sm font-medium py-2">Roles</Link>
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
          <p className="sp-eyebrow mb-4 text-primary">By Role</p>
          <h1 className="font-display text-4xl md:text-5xl text-balance mb-6">
            Career Guidance by Role
          </h1>
          <p className="text-lg text-muted-foreground leading-relaxed">
            Find guidance tailored to your specific role and situation. Because a VP's burnout looks different than a Director's.
          </p>
        </div>
      </section>

      {/* Roles Grid */}
      <section className="sp-container pb-24">
        <div 
          ref={rolesReveal.ref}
          className={`reveal ${rolesReveal.isRevealed ? "revealed" : ""}`}
        >
          <div className="space-y-12">
            {roles.map((role, roleIndex) => (
              <div 
                key={role.slug}
                className={`transition-all duration-700 ${
                  rolesReveal.isRevealed ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
                }`}
                style={{ transitionDelay: `${0.1 + roleIndex * 0.1}s` }}
              >
                <div className="border-b border-border pb-4 mb-6">
                  <h2 className="font-display text-2xl md:text-3xl">{role.title}</h2>
                  <p className="text-muted-foreground text-sm mt-1">{role.description}</p>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  {situations.map((situation) => (
                    <Link
                      key={situation}
                      to={`/roles/${role.slug}/situations/${situation}`}
                      className="group p-4 border border-border hover:border-primary/30 hover:bg-muted/30 transition-all text-center"
                    >
                      <span className="text-sm group-hover:text-primary transition-colors">
                        {situationLabels[situation]}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-foreground text-background">
        <div className="sp-container py-16 md:py-20 text-center">
          <h2 className="font-display text-2xl md:text-3xl mb-4">
            Not sure which situation fits?
          </h2>
          <p className="text-background/70 mb-8 max-w-md mx-auto">
            Start with our interview. We'll help you figure out what's actually going on.
          </p>
          <Link to="/interview">
            <button className="px-8 py-4 bg-background text-foreground font-medium hover:bg-background/90 transition-colors inline-flex items-center gap-2">
              Start Your Free Interview
              <ArrowRight className="w-4 h-4" />
            </button>
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

export default Roles;
