import { useEffect } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Header, Footer } from "@/components/layout";
import { DecorativeRule, PullQuote } from "@/components/graphics/TypographicAccents";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import { cn } from "@/lib/utils";
import { Check, ArrowRight, MessageCircle, FileText, Users } from "lucide-react";

interface PricingData {
  originalPrice: number;
  discountedPrice: number | null;
  percentOff: number | null;
  amountOff: number | null;
  currency: string;
}

const included = [
  {
    title: "Free Coaching Interview",
    description: "5–10 minutes to understand your situation and build your personalized coaching plan",
    icon: MessageCircle,
    included: true,
    free: true,
  },
  {
    title: "Guided Working Session",
    description: "~30 minutes across three focused modules with your AI coach",
    icon: Users,
    included: true,
  },
  {
    title: "Your Serious Plan",
    description: "6 personalized artifacts including scripts, action plans, and risk maps",
    icon: FileText,
    included: true,
  },
  {
    title: "Ongoing Coach Access",
    description: "Return anytime to chat with your coach about progress and new challenges",
    icon: MessageCircle,
    included: true,
  },
];

const comparisons = [
  {
    what: "Human career coach",
    price: "$200–500/hour",
    note: "Weeks to book, multi-session commitments",
  },
  {
    what: "Executive coaching package",
    price: "$3,000–10,000",
    note: "6-month minimum, corporate budgets only",
  },
  {
    what: "Generic AI tools",
    price: "Free–$20/mo",
    note: "Polite yes-men that validate your first instinct",
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

function PriceDisplay({ pricing, size = "large" }: { pricing: PricingData | undefined; size?: "small" | "large" }) {
  if (!pricing) {
    return (
      <div className="animate-pulse">
        <div className={cn(
          "bg-muted rounded",
          size === "large" ? "h-16 w-24" : "h-8 w-16"
        )} />
      </div>
    );
  }
  
  const hasDiscount = pricing.discountedPrice !== null && pricing.discountedPrice < pricing.originalPrice;
  
  if (size === "large") {
    return (
      <div className="flex items-baseline gap-3">
        {hasDiscount && (
          <span className="text-2xl text-muted-foreground line-through">
            ${pricing.originalPrice}
          </span>
        )}
        <span className="font-serif text-6xl font-bold text-foreground">
          ${hasDiscount ? pricing.discountedPrice : pricing.originalPrice}
        </span>
        {hasDiscount && pricing.percentOff && (
          <span className="px-2 py-1 text-sm font-medium bg-terracotta-wash text-terracotta-foreground rounded">
            {pricing.percentOff}% off
          </span>
        )}
      </div>
    );
  }
  
  return (
    <span className={cn(hasDiscount && "text-primary font-semibold")}>
      ${hasDiscount ? pricing.discountedPrice : pricing.originalPrice}
    </span>
  );
}

export default function Pricing() {
  useEffect(() => {
    document.title = "Pricing | Serious People";
  }, []);

  const { data: pricing, isLoading } = useQuery<PricingData>({
    queryKey: ["/api/pricing"],
    staleTime: 60000,
  });

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="pt-24 pb-16">
        <section className="max-w-content-wide mx-auto px-6 lg:px-8 py-section">
          <RevealSection className="text-center mb-16">
            <h1 className="font-serif text-display-lg text-foreground mb-6">
              Simple, Transparent Pricing
            </h1>
            <p className="text-body-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              No subscriptions. No hidden fees. Just one straightforward price for everything you need 
              to make a career decision you trust.
            </p>
          </RevealSection>

          <RevealSection delay={200}>
            <div className="max-w-xl mx-auto bg-card rounded-2xl border-2 border-primary shadow-lg overflow-hidden">
              <div className="bg-primary text-primary-foreground px-8 py-6 text-center">
                <p className="text-sm font-medium uppercase tracking-wider opacity-80 mb-2">
                  Complete Package
                </p>
                <h2 className="font-serif text-2xl font-bold">
                  Serious Coaching Session
                </h2>
              </div>

              <div className="p-8">
                <div className="text-center mb-8">
                  <PriceDisplay pricing={pricing} size="large" />
                  <p className="text-sm text-muted-foreground mt-2">
                    One-time payment. Keep your plan forever.
                  </p>
                </div>

                <ul className="space-y-4 mb-8">
                  {included.map((item, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <Check className={cn(
                        "w-5 h-5 mt-0.5 flex-shrink-0",
                        item.free ? "text-muted-foreground" : "text-primary"
                      )} />
                      <div>
                        <p className="font-medium text-foreground flex items-center gap-2">
                          {item.title}
                          {item.free && (
                            <span className="text-xs px-2 py-0.5 bg-sage-wash text-primary rounded-full">
                              Free
                            </span>
                          )}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {item.description}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>

                <Link
                  href="/login"
                  className={cn(
                    "flex items-center justify-center gap-2 w-full py-4 rounded-lg",
                    "bg-primary text-primary-foreground font-medium text-lg",
                    "hover:bg-primary-hover transition-colors duration-200"
                  )}
                  data-testid="button-start-free"
                >
                  Start with free interview
                  <ArrowRight className="w-5 h-5" />
                </Link>

                <p className="text-center text-sm text-muted-foreground mt-4">
                  No payment required until you see your personalized plan.
                </p>
              </div>
            </div>
          </RevealSection>
        </section>

        <DecorativeRule className="max-w-content mx-auto" />

        <section className="max-w-content mx-auto px-6 lg:px-8 py-section">
          <RevealSection className="text-center mb-12">
            <h2 className="font-serif text-headline text-foreground mb-4">
              The Cost of Alternatives
            </h2>
            <p className="text-body text-muted-foreground max-w-xl mx-auto">
              Serious People costs less than a single session with most human coaches—and you can start right now.
            </p>
          </RevealSection>

          <RevealSection delay={200}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {comparisons.map((item, i) => (
                <div 
                  key={i} 
                  className="p-6 bg-card rounded-lg border border-border text-center"
                >
                  <p className="font-serif text-lg font-semibold text-foreground mb-2">
                    {item.what}
                  </p>
                  <p className="text-2xl font-bold text-muted-foreground mb-2">
                    {item.price}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {item.note}
                  </p>
                </div>
              ))}
            </div>
          </RevealSection>

          <RevealSection delay={400}>
            <div className="mt-12 p-8 bg-sage-wash/50 rounded-lg border border-border text-center">
              <p className="font-serif text-lg font-semibold text-foreground mb-2">
                Serious People
              </p>
              <p className="text-3xl font-bold text-primary mb-2">
                <PriceDisplay pricing={pricing} size="small" /> one-time
              </p>
              <p className="text-sm text-muted-foreground">
                Start in minutes. Keep your Serious Plan forever. Return to your coach anytime.
              </p>
            </div>
          </RevealSection>
        </section>

        <DecorativeRule className="max-w-content mx-auto" />

        <section className="max-w-content mx-auto px-6 lg:px-8 py-section">
          <RevealSection>
            <PullQuote 
              quote="I spent $4,000 on an executive coach and got less actionable output than I did from one afternoon with Serious People."
              author={{ name: "Director of Product", title: "Fortune 500" }}
              className="max-w-2xl mx-auto"
            />
          </RevealSection>
        </section>

        <section className="max-w-content mx-auto px-6 lg:px-8 py-section text-center">
          <RevealSection>
            <h2 className="font-serif text-headline text-foreground mb-4">
              Questions?
            </h2>
            <p className="text-body text-muted-foreground mb-8 max-w-xl mx-auto">
              The free interview will answer most of them. See your personalized coaching plan before you decide.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/login"
                className={cn(
                  "inline-flex items-center gap-2 px-8 py-4 rounded-lg",
                  "bg-primary text-primary-foreground font-medium text-lg",
                  "hover:bg-primary-hover transition-colors duration-200"
                )}
                data-testid="button-start-interview-bottom"
              >
                Start the free interview
                <ArrowRight className="w-5 h-5" />
              </Link>
              <Link
                href="/how-it-works"
                className="text-muted-foreground hover:text-foreground link-animated transition-colors"
                data-testid="link-how-it-works"
              >
                Learn how it works →
              </Link>
            </div>
          </RevealSection>
        </section>
      </main>

      <Footer />
    </div>
  );
}
