import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowRight, Menu, X, ChevronRight } from "lucide-react";
import { Button } from "@/lovable/components/ui/button";
import { useScrollReveal } from "@/lovable/hooks/useScrollReveal";

const roleLabels: Record<string, string> = {
  "vp-product": "VP Product",
  "director-product": "Director of Product",
  "vp-engineering": "VP Engineering",
  "director-engineering": "Director of Engineering",
  "chief-of-staff": "Chief of Staff",
  "vp-operations": "VP Operations",
};

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

const RoleSituation = () => {
  const { role, situation } = useParams();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const heroReveal = useScrollReveal();
  const contentReveal = useScrollReveal();

  const roleTitle = roleLabels[role || ""] || "VP Product";
  const situationTitle = situationLabels[situation || ""] || "Stay or Go";

  // Sample content structure
  const content = {
    title: `${situationTitle} for ${roleTitle}: A Practical Framework`,
    subtitle: `Practical guidance for ${roleTitle} professionals facing ${situationTitle.toLowerCase()} situations.`,
    sections: [
      {
        title: "The Decision Matrix Approach",
        content: `When emotions run high, structure helps. Here's a systematic way to evaluate your situation.

**The Four Quadrants**

Map your situation across two dimensions: your energy level (depleted vs. sufficient) and the problem's fixability (structural vs. situational).

• **High Energy + Situational Problem:** Stay and address it directly. You have the resources.
• **High Energy + Structural Problem:** Consider a strategic exit. You can afford to be choosy.
• **Low Energy + Situational Problem:** Dangerous zone. Fix the problem first, or you'll regret leaving.
• **Low Energy + Structural Problem:** Exit, but protect yourself. Secure your landing before you leap.`
      },
      {
        title: "The Timeline Test",
        content: `Ask yourself: "If nothing changes, can I sustain this for 18 more months?"

If the answer is no, you have your answer. If yes, you have time to be strategic.

**The Authenticity Check**

Are you staying because you're scared to leave, or because you genuinely believe things can improve? Be honest. Fear is not a strategy.`
      },
      {
        title: "What This Looks Like in Practice",
        content: `**The Scenario:** Sarah, a ${roleTitle} at a Series D fintech company, had been struggling for months. The CEO kept changing priorities, her counterpart was difficult to work with, and she hadn't shipped a major feature in two quarters.

**What She Did:** Instead of resigning in frustration or suffering in silence, she got clarity on what was actually happening:

1. She documented the pattern of changing priorities—not to assign blame, but to understand if it was solvable
2. She had a direct conversation with her CEO about decision-making processes
3. She set a 6-week timeline to see if things would change

**The Result:** Armed with clarity—she'd done the work to fix it and it hadn't worked—she started looking. She had an offer within 10 weeks at a company where the role was explicitly structured to give her the autonomy she needed.`
      }
    ],
    relatedSituations: [
      { title: "Burnout", slug: "burnout" },
      { title: "Bad Manager", slug: "bad-manager" },
      { title: "Internal Pivot", slug: "internal-pivot" },
    ]
  };

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
            <Link to="/interview" className="text-sm font-medium py-2">Start Session</Link>
          </div>
        </div>
      )}

      {/* Breadcrumb */}
      <div className="sp-container pt-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
          <Link to="/roles" className="hover:text-foreground transition-colors">Roles</Link>
          <ChevronRight className="w-4 h-4" />
          <Link to={`/roles/${role}`} className="hover:text-foreground transition-colors">{roleTitle}</Link>
          <ChevronRight className="w-4 h-4" />
          <span className="text-foreground">{situationTitle}</span>
        </div>
      </div>

      {/* Hero */}
      <section className="sp-container py-12 md:py-16">
        <div 
          ref={heroReveal.ref}
          className={`max-w-2xl mx-auto reveal ${heroReveal.isRevealed ? "revealed" : ""}`}
        >
          <div className="flex items-center gap-3 mb-4">
            <span className="px-3 py-1 text-xs font-medium bg-primary/10 text-primary rounded-sm">
              {roleTitle}
            </span>
            <span className="px-3 py-1 text-xs font-medium bg-muted text-muted-foreground rounded-sm">
              {situationTitle}
            </span>
          </div>
          <h1 className="font-display text-3xl md:text-4xl text-balance mb-6">
            {content.title}
          </h1>
          <p className="text-lg text-muted-foreground leading-relaxed">
            {content.subtitle}
          </p>
        </div>
      </section>

      {/* Content */}
      <article className="sp-container pb-16">
        <div 
          ref={contentReveal.ref}
          className={`max-w-2xl mx-auto reveal ${contentReveal.isRevealed ? "revealed" : ""}`}
        >
          {content.sections.map((section, index) => (
            <section key={index} className="mb-12">
              <h2 className="font-display text-2xl mb-6 border-b border-border pb-4">
                {section.title}
              </h2>
              <div className="space-y-4">
                {section.content.split('\n\n').map((paragraph, pIndex) => {
                  if (paragraph.startsWith('**') && paragraph.endsWith('**')) {
                    return (
                      <h3 key={pIndex} className="font-display text-lg mt-6 mb-2">
                        {paragraph.replace(/\*\*/g, '')}
                      </h3>
                    );
                  }
                  if (paragraph.startsWith('•')) {
                    return (
                      <ul key={pIndex} className="space-y-3">
                        {paragraph.split('\n').map((item, iIndex) => (
                          <li key={iIndex} className="text-muted-foreground flex items-start gap-3">
                            <span className="w-1.5 h-1.5 rounded-full bg-primary mt-2.5 shrink-0" />
                            <span dangerouslySetInnerHTML={{ __html: item.replace('• ', '').replace(/\*\*(.*?)\*\*/g, '<strong class="text-foreground">$1</strong>') }} />
                          </li>
                        ))}
                      </ul>
                    );
                  }
                  if (paragraph.match(/^\d\./)) {
                    return (
                      <ol key={pIndex} className="space-y-2 list-decimal list-inside text-muted-foreground">
                        {paragraph.split('\n').map((item, iIndex) => (
                          <li key={iIndex}>{item.replace(/^\d\.\s/, '')}</li>
                        ))}
                      </ol>
                    );
                  }
                  return (
                    <p key={pIndex} className="text-muted-foreground leading-relaxed" 
                       dangerouslySetInnerHTML={{ __html: paragraph.replace(/\*\*(.*?)\*\*/g, '<strong class="text-foreground">$1</strong>') }} />
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </article>

      {/* CTA */}
      <section className="sp-container pb-16">
        <div className="max-w-2xl mx-auto">
          <div className="bg-foreground text-background p-8 md:p-10">
            <h3 className="font-display text-2xl mb-4">Want personalized guidance?</h3>
            <p className="text-background/70 mb-6">
              Every {roleTitle.toLowerCase()} situation is different. Get tailored advice for yours.
            </p>
            <Link to="/interview">
              <Button className="bg-background text-foreground hover:bg-background/90">
                Start Your Free Interview
                <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Related Situations */}
      <section className="sp-section-sage border-t border-sage-light">
        <div className="sp-container py-16">
          <div className="max-w-2xl mx-auto">
            <h3 className="font-display text-xl mb-6">Other Situations for {roleTitle}</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {content.relatedSituations.map((related) => (
                <Link
                  key={related.slug}
                  to={`/roles/${role}/situations/${related.slug}`}
                  className="group p-4 border border-border bg-background hover:border-primary/30 transition-colors text-center"
                >
                  <span className="text-sm group-hover:text-primary transition-colors">
                    {related.title}
                  </span>
                </Link>
              ))}
            </div>
          </div>
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

export default RoleSituation;
