import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowRight, Menu, X, Clock, ChevronRight } from "lucide-react";
import { Button } from "@/lovable/components/ui/button";
import { useScrollReveal } from "@/lovable/hooks/useScrollReveal";

// This would come from a CMS or data file in production
const guideContent = {
  "stay-or-go-framework": {
    title: "The Stay-or-Go Decision Framework",
    subtitle: "You're not lazy. You're not ungrateful. You're facing a decision that will shape the next chapter of your career—and you deserve a clear way to think about it.",
    readTime: "12 min read",
    sections: [
      {
        title: "The Problem With How We Usually Make This Decision",
        content: `Most people spend months or years stuck in a loop: some days convinced they should leave, other days talking themselves into staying. They poll friends, read job listings at 2 AM, and oscillate between panic and paralysis.

This isn't a character flaw—it's a structural problem. The stay-or-go decision is genuinely hard because:

1. **The information is incomplete.** You can't know what the new job will actually be like until you're in it.
2. **The emotions are loud.** A bad week can make everything feel unbearable; a good week can make you forget why you wanted to leave.
3. **The stakes feel enormous.** And they are—your income, your identity, your relationships are all on the line.

What you need isn't more courage or less fear. You need a framework that separates signal from noise.`
      },
      {
        title: "The Stay-or-Go Framework",
        content: `This framework breaks the decision into three distinct questions. Answer them honestly, and the right path usually becomes clear.

### Question 1: Is the core problem fixable—and are you willing to do the work?

Before you start job searching, you need to know whether the thing that's making you unhappy is something that could change without you leaving.

**Fixable problems** (if you're willing to work on them):
- A specific difficult relationship with your manager
- Unclear expectations or scope
- Insufficient resources or headcount
- Missing skills or experience
- Boredom from having mastered your role

**Usually not fixable** (no matter how hard you try):
- Fundamental values mismatch with the company
- Industry decline or company trajectory you can't influence
- A culture of fear, blame, or dishonesty
- Systemic underinvestment in your function
- Your manager's manager is the problem

### Question 2: What does staying actually cost?

People underestimate the cost of staying because it feels like the "safe" choice. It isn't. Staying has compounding costs.

**Career costs:** Skills atrophy if you're not learning. Your network stagnates if you're not moving. Market value declines if your title or compensation lags.

**Personal costs:** Chronic stress affects your health and relationships. Cynicism seeps into how you show up. You model stuckness for your team or your kids.

### Question 3: What would make you confident enough to decide?

You will never have perfect information. The goal isn't certainty—it's having enough clarity that you can commit to a path and stop second-guessing.`
      },
      {
        title: "The Three Biggest Mistakes People Make",
        content: `### Mistake 1: Waiting for the "right time"

There's never a perfect time to leave a job. The right time is when you've done your due diligence and the cost of staying exceeds the cost of uncertainty.

### Mistake 2: Making the decision alone

The stay-or-go decision involves identity, money, and relationships. No one thinks clearly about all three at once. You need at least one person who can help you separate what's true from what feels true.

### Mistake 3: Optimizing for the wrong thing

Many people focus on salary or title when those aren't actually their biggest sources of dissatisfaction. Before you start looking, get clear on what's actually broken.`
      }
    ],
    relatedGuides: [
      { title: "Burnout vs. Misfit vs. Bad Manager", slug: "burnout-vs-misfit-vs-bad-manager" },
      { title: "How to Evaluate an Offer Like an Adult", slug: "how-to-evaluate-an-offer-like-an-adult" },
      { title: "When to Use a Coach", slug: "when-to-use-a-coach" },
    ],
    relatedRoles: [
      { title: "VP Product: Stay or Go", slug: "vp-product/situations/stay-or-go" },
      { title: "Director Product: Stay or Go", slug: "director-product/situations/stay-or-go" },
    ]
  }
};

const GuideDetail = () => {
  const { slug } = useParams();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const heroReveal = useScrollReveal();

  // Default to stay-or-go-framework for demo
  const guide = guideContent["stay-or-go-framework"];

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
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link to="/guides" className="hover:text-foreground transition-colors">Guides</Link>
          <ChevronRight className="w-4 h-4" />
          <span className="text-foreground">Stay or Go</span>
        </div>
      </div>

      {/* Hero */}
      <section className="sp-container py-12 md:py-16">
        <div 
          ref={heroReveal.ref}
          className={`max-w-2xl mx-auto reveal ${heroReveal.isRevealed ? "revealed" : ""}`}
        >
          <h1 className="font-display text-3xl md:text-4xl lg:text-5xl text-balance mb-6">
            {guide.title}
          </h1>
          <p className="text-lg text-muted-foreground leading-relaxed mb-6">
            {guide.subtitle}
          </p>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Clock className="w-4 h-4" />
              {guide.readTime}
            </span>
          </div>
        </div>
      </section>

      {/* Calculator CTA */}
      <section className="sp-container pb-12">
        <div className="max-w-2xl mx-auto">
          <Link to="/tools/stay-or-go-calculator">
            <div className="p-6 border border-border bg-muted/30 hover:border-primary/30 transition-colors group">
              <p className="text-sm text-muted-foreground mb-1">Not sure where you stand?</p>
              <p className="font-medium text-foreground group-hover:text-primary transition-colors flex items-center gap-2">
                Take the Stay-or-Go Calculator
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </p>
              <p className="text-sm text-muted-foreground mt-1">A 2-minute quiz that scores your situation</p>
            </div>
          </Link>
        </div>
      </section>

      {/* Content */}
      <article className="sp-container pb-16">
        <div className="max-w-2xl mx-auto">
          {guide.sections.map((section, index) => (
            <section key={index} className="mb-12">
              <h2 className="font-display text-2xl md:text-3xl mb-6 border-b border-border pb-4">
                {section.title}
              </h2>
              <div className="prose prose-lg max-w-none">
                {section.content.split('\n\n').map((paragraph, pIndex) => {
                  if (paragraph.startsWith('###')) {
                    return (
                      <h3 key={pIndex} className="font-display text-xl mt-8 mb-4">
                        {paragraph.replace('### ', '')}
                      </h3>
                    );
                  }
                  if (paragraph.startsWith('**') && paragraph.includes(':')) {
                    return (
                      <p key={pIndex} className="font-medium text-foreground mt-6 mb-2">
                        {paragraph.replace(/\*\*/g, '')}
                      </p>
                    );
                  }
                  if (paragraph.startsWith('- ')) {
                    return (
                      <ul key={pIndex} className="space-y-2 my-4">
                        {paragraph.split('\n').map((item, iIndex) => (
                          <li key={iIndex} className="text-muted-foreground flex items-start gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-primary mt-2.5 shrink-0" />
                            {item.replace('- ', '')}
                          </li>
                        ))}
                      </ul>
                    );
                  }
                  if (paragraph.match(/^\d\./)) {
                    return (
                      <ol key={pIndex} className="space-y-3 my-4">
                        {paragraph.split('\n').map((item, iIndex) => (
                          <li key={iIndex} className="text-muted-foreground">
                            {item}
                          </li>
                        ))}
                      </ol>
                    );
                  }
                  return (
                    <p key={pIndex} className="text-muted-foreground leading-relaxed mb-4">
                      {paragraph}
                    </p>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </article>

      {/* CTA Box */}
      <section className="sp-container pb-16">
        <div className="max-w-2xl mx-auto">
          <div className="bg-foreground text-background p-8 md:p-10">
            <h3 className="font-display text-2xl mb-4">Ready to make your decision?</h3>
            <p className="text-background/70 mb-6">
              In one structured session, you'll walk away with a clear recommendation, conversation scripts, and a 14-day action plan.
            </p>
            <Link to="/interview">
              <Button className="bg-background text-foreground hover:bg-background/90">
                Start Your Session
                <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Related Content */}
      <section className="sp-section-sage border-t border-sage-light">
        <div className="sp-container py-16">
          <div className="max-w-2xl mx-auto">
            <h3 className="font-display text-xl mb-6">Related Guides</h3>
            <div className="space-y-3 mb-10">
              {guide.relatedGuides.map((related) => (
                <Link 
                  key={related.slug}
                  to={`/guides/${related.slug}`}
                  className="group flex items-center justify-between py-3 border-b border-border hover:border-primary/30 transition-colors"
                >
                  <span className="group-hover:text-primary transition-colors">{related.title}</span>
                  <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
                </Link>
              ))}
            </div>

            <h3 className="font-display text-xl mb-6">Role-Specific Guidance</h3>
            <div className="space-y-3">
              {guide.relatedRoles.map((role) => (
                <Link 
                  key={role.slug}
                  to={`/roles/${role.slug}`}
                  className="group flex items-center justify-between py-3 border-b border-border hover:border-primary/30 transition-colors"
                >
                  <span className="group-hover:text-primary transition-colors">{role.title}</span>
                  <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
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

export default GuideDetail;
