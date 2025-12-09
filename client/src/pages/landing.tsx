import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import "@/styles/serious-people.css";

const PUBLIC_EMAIL = "hello@seriouspeople.app";

const rotatingQuestions = [
  "should I quit?",
  "is this fixable?",
  "what do I even want?",
  "how do I say this?",
  "am I overreacting?",
  "is it worth the risk?"
];

interface PricingData {
  originalPrice: number;
  discountedPrice: number | null;
  percentOff: number | null;
  amountOff: number | null;
  currency: string;
}

function PriceDisplay({ pricing }: { pricing: PricingData | undefined }) {
  if (!pricing) {
    return <span>$19</span>;
  }
  
  const hasDiscount = pricing.discountedPrice !== null && pricing.discountedPrice < pricing.originalPrice;
  
  if (hasDiscount) {
    return (
      <span className="sp-price-display">
        <span className="sp-price-original">${pricing.originalPrice}</span>
        <span className="sp-price-discounted">${pricing.discountedPrice}</span>
      </span>
    );
  }
  
  return <span>${pricing.originalPrice}</span>;
}

const scenarios = [
  "You're on the fence about quitting and don't want to make a decision you'll regret.",
  "Your role has drifted into something you never signed up for. You need to renegotiate—or leave.",
  "You're stuck in a bad dynamic with your boss and can't tell if it's fixable.",
  "You're about to have a hard conversation with your partner about money, risk, and timing.",
  "You've written a dozen draft emails in your head. None of them feel right."
];

const artifacts = [
  {
    title: "Decision Snapshot",
    description: "A one-page summary of your situation, your options, and the trade-offs. This is the map you keep coming back to when you're second-guessing yourself at 2am."
  },
  {
    title: "Conversation Scripts",
    description: "Word-for-word scripts for the conversations that matter most—your manager, your partner, HR, mentors. Clear, honest, non-destructive."
  },
  {
    title: "Action Plan (30–90 days)",
    description: "Concrete next moves with timing. What to try first. What to document. How to know if things are actually improving. When to draw a line."
  },
  {
    title: "Risk Map",
    description: "A candid look at what could go wrong—whether you stay, reshape the role, or leave. Includes \"if X happens, say Y\" playbooks so you're not improvising when it counts."
  },
  {
    title: "Resources & Prompts",
    description: "Curated exercises and reflection prompts based on your exact situation. Not a generic reading list."
  }
];

const comparisons = [
  {
    title: "vs. Journaling or venting to friends",
    content: "Your friends will validate you. Journaling helps you process. Neither will give you a script for Monday's meeting or a 90-day plan. Serious People turns feelings into a document you can act on."
  },
  {
    title: "vs. Generic AI (ChatGPT, etc.)",
    content: "Most AI tools act like polite yes-men—they validate your first idea and dress it up in nicer words. Serious People follows a structured coaching curriculum. It will push back on fuzzy thinking, ask harder questions, and sometimes disagree with you."
  },
  {
    title: "vs. A human career coach",
    content: "A good coach costs $200–500/hour and takes weeks to book. Serious People works on your schedule. It's not a replacement for deep, ongoing coaching—but it's a powerful starting point."
  },
  {
    title: "vs. Doing nothing",
    content: "You already know how that goes. The situation festers. You make a reactive decision when you're fed up instead of a strategic one when you're clear. Serious People is the forcing function that gets you unstuck."
  }
];

export default function Landing() {
  const { isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [displayText, setDisplayText] = useState("");
  const phraseIndexRef = useRef(0);
  const charIndexRef = useRef(0);
  const isDeletingRef = useRef(false);
  
  const { data: pricing } = useQuery<PricingData>({
    queryKey: ["/api/pricing"],
    staleTime: 60000,
  });

  const faqs = [
    {
      question: "How much does this cost?",
      answer: <>The interview is completely free. You'll see your personalized coaching plan before paying anything. The full coaching session and Serious Plan cost <PriceDisplay pricing={pricing} />—less than an hour with a human coach.</>
    },
    {
      question: "Is this really \"just AI\"?",
      answer: "Serious People is AI-powered, but it's not a generic chatbot. It uses large language models guided by a specific coaching philosophy: ask hard questions, reflect back what it hears, push toward clear decisions. It won't pretend to be human, but it will behave like an experienced, no-nonsense coach—one that knows when to slow you down and when to back your instincts."
    },
    {
      question: "Will my information be private?",
      answer: "Yes. Your interview and plan are stored securely and used only to generate your Serious Plan. We don't sell or share your stories with anyone."
    },
    {
      question: "How long does this take?",
      answer: "Most people finish the free interview in 5–10 minutes. The full coaching session takes about 30 minutes. Your Serious Plan is generated within a few minutes after that."
    },
    {
      question: "Does this replace working with a human coach?",
      answer: "It doesn't have to. Serious People is a great first step—or a complement to human coaching. You can start right now, on your own schedule, without committing to a multi-session package. If you decide to work with a coach later, your Serious Plan becomes a powerful starting brief."
    }
  ];
  
  const handleStartInterview = () => {
    if (isAuthenticated) {
      setLocation("/interview");
    } else {
      setLocation("/login");
    }
  };

  useEffect(() => {
    const typeSpeed = 80;
    const deleteSpeed = 40;
    const pauseDuration = 2000;

    const type = () => {
      const currentPhrase = rotatingQuestions[phraseIndexRef.current];

      if (isDeletingRef.current) {
        charIndexRef.current--;
        setDisplayText(currentPhrase.substring(0, charIndexRef.current));

        if (charIndexRef.current === 0) {
          isDeletingRef.current = false;
          phraseIndexRef.current = (phraseIndexRef.current + 1) % rotatingQuestions.length;
          return setTimeout(type, 300);
        }

        return setTimeout(type, deleteSpeed);
      } else {
        charIndexRef.current++;
        setDisplayText(currentPhrase.substring(0, charIndexRef.current));

        if (charIndexRef.current === currentPhrase.length) {
          return setTimeout(() => {
            isDeletingRef.current = true;
            type();
          }, pauseDuration);
        }

        return setTimeout(type, typeSpeed);
      }
    };

    const timer = type();
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, []);

  return (
    <div className="sp-landing-page">
      {/* HERO SECTION */}
      <header className="sp-landing-hero">
        <div className="sp-landing-header-bar">
          <div className="sp-landing-logo">
            <img src="/favicon.png" alt="Serious People" className="sp-logo-icon" />
            <span>Serious People</span>
          </div>
          {isAuthenticated ? (
            <Link href="/interview" className="sp-landing-login-link" data-testid="link-continue">
              Continue →
            </Link>
          ) : (
            <Link href="/login" className="sp-landing-login-link" data-testid="link-login">
              Log in →
            </Link>
          )}
        </div>
        
        <div className="sp-landing-hero-content">
          <h1 className="sp-landing-headline">
            <span className="sp-headline-static">Turn</span>
            <br />
            <span className="sp-headline-static">"</span>
            <span className="sp-headline-dynamic">
              <span className="sp-typewriter-text">{displayText}</span>
            </span>
            <span className="sp-headline-static">"</span>
            <br />
            <span className="sp-headline-static">into a decision you trust.</span>
          </h1>
          <p className="sp-landing-subhead">
            You've drafted the resignation email three times. You've run the numbers. You've had the same circular conversation with your partner.
            <br />
            <br />
            Serious People helps you cut through the noise— in one thoughtful evening.
          </p>
          
          <div className="sp-landing-cta-group">
            <button 
              className="sp-landing-cta-primary" 
              data-testid="button-start-interview"
              onClick={handleStartInterview}
            >
              Start the free interview
            </button>
            <Link href="/login" className="sp-landing-cta-secondary" data-testid="link-resume">
              Already started? Log back in →
            </Link>
          </div>
          
          <p className="sp-landing-reassurance">
            Free interview takes 5–10 minutes. Full coaching session is <PriceDisplay pricing={pricing} />.
          </p>
        </div>
      </header>

      {/* BRAND QUOTE */}
      <section className="sp-landing-section sp-landing-section-alt">
        <div className="sp-landing-container">
          <div className="sp-landing-quote-box">
            <img src="/logan-roy.png" alt="Logan Roy" className="sp-landing-quote-image" />
            <blockquote className="sp-landing-quote">
              <p>"I love you, but you are not serious people."</p>
              <cite>— Logan Roy, Waystar Royco</cite>
            </blockquote>
          </div>
        </div>
      </section>

      {/* PROBLEM / USE CASES */}
      <section className="sp-landing-section">
        <div className="sp-landing-container">
          <h2 className="sp-landing-section-title">
            This is for the decisions that keep you up at night.
          </h2>
          <ul className="sp-landing-scenarios">
            {scenarios.map((scenario, index) => (
              <li key={index} className="sp-landing-scenario">
                <span className="sp-landing-scenario-bullet">•</span>
                <span>{scenario}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="sp-landing-section sp-landing-section-alt">
        <div className="sp-landing-container">
          <h2 className="sp-landing-section-title">Here's what happens.</h2>
          
          <div className="sp-landing-steps">
            <div className="sp-landing-step">
              <div className="sp-landing-step-number">1</div>
              <h3>Free coaching interview (5–10 min)</h3>
              <p>
                You answer the questions a good career coach would ask: What's actually happening? What have you tried? What's at stake? By the end, you'll see a plain-language coaching plan tailored to your situation. Review it, adjust it, then decide if you want to continue.
              </p>
            </div>
            
            <div className="sp-landing-step">
              <div className="sp-landing-step-number">2</div>
              <h3>Guided working session (~30 min)</h3>
              <p>
                Your coach walks you through three modules. First, you go deep on what's really going on—the stuff you haven't fully articulated, even to yourself. Then you map your options, constraints, and trade-offs. Finally, you turn your thinking into a concrete plan with real next steps.
              </p>
            </div>
            
            <div className="sp-landing-step">
              <div className="sp-landing-step-number">3</div>
              <h3>Your Serious Plan (instant)</h3>
              <p>
                You leave with a set of documents you can actually use. Decision summary. Conversation scripts. A 30–90 day action plan. A risk map for what could go wrong. No inspirational posters. No vague frameworks. Just clear language you can copy into an email tonight.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* WHAT'S IN YOUR SERIOUS PLAN */}
      <section className="sp-landing-section">
        <div className="sp-landing-container">
          <h2 className="sp-landing-section-title">What you actually get.</h2>
          <p className="sp-landing-section-intro">
            Every Serious Plan is different because every situation is different. But yours will include artifacts like these:
          </p>
          
          <div className="sp-landing-artifacts">
            {artifacts.map((artifact, index) => (
              <div key={index} className="sp-landing-artifact">
                <h3>{artifact.title}</h3>
                <p>{artifact.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* WHY THIS INSTEAD OF... */}
      <section className="sp-landing-section sp-landing-section-alt">
        <div className="sp-landing-container">
          <h2 className="sp-landing-section-title">
            Why people pay <PriceDisplay pricing={pricing} /> for this instead of just thinking it through.
          </h2>
          
          <div className="sp-landing-comparisons">
            {comparisons.map((comparison, index) => (
              <div key={index} className="sp-landing-comparison">
                <h3>{comparison.title}</h3>
                <p>{comparison.content}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* WHO THIS IS FOR */}
      <section className="sp-landing-section">
        <div className="sp-landing-container sp-landing-centered-text">
          <h2 className="sp-landing-section-title">This is for people who are ready to decide.</h2>
          
          <p>
            If you're mid-career or senior, your choices affect real money and real people, and you want to walk away with a plan—not just reassurance—this will help.
          </p>
          
          <p>
            If you're looking for therapy, legal advice, or someone to make the decision for you, this isn't that. If you're not planning to actually have the conversations this prepares you for, save your money.
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section className="sp-landing-section sp-landing-section-alt">
        <div className="sp-landing-container">
          <h2 className="sp-landing-section-title">Questions people ask before getting serious.</h2>
          
          <div className="sp-landing-faq">
            {faqs.map((faq, index) => (
              <div 
                key={index} 
                className={`sp-landing-faq-item ${openFaq === index ? 'sp-landing-faq-open' : ''}`}
              >
                <button 
                  className="sp-landing-faq-question"
                  onClick={() => setOpenFaq(openFaq === index ? null : index)}
                  data-testid={`button-faq-${index}`}
                  aria-expanded={openFaq === index}
                >
                  <span>{faq.question}</span>
                  <span className="sp-landing-faq-icon">{openFaq === index ? '−' : '+'}</span>
                </button>
                {openFaq === index && (
                  <div className="sp-landing-faq-answer">
                    <p>{faq.answer}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="sp-landing-section sp-landing-final-cta">
        <div className="sp-landing-container sp-landing-centered-text">
          <h2 className="sp-landing-section-title">Ready to get serious?</h2>
          <p>
            The free interview takes 5–10 minutes. You'll see your coaching plan before you pay anything.
          </p>
          
          <div className="sp-landing-cta-group">
            <button 
              className="sp-landing-cta-primary" 
              data-testid="button-start-interview-bottom"
              onClick={handleStartInterview}
            >
              Start the free interview
            </button>
          </div>
          
          <p className="sp-landing-contact">
            Questions? Email <a href={`mailto:${PUBLIC_EMAIL}`}>{PUBLIC_EMAIL}</a>
          </p>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="sp-landing-footer">
        <p>© Serious People Career Coaching</p>
      </footer>
    </div>
  );
}
