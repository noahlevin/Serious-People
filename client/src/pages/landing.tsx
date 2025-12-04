import { useEffect, useState, useRef } from "react";
import { Link } from "wouter";
import "@/styles/serious-people.css";

const phrases = [
  'quitting.',
  'getting promoted.',
  'not being micromanaged.',
  'my career development.',
  'being recognized.',
  'finding balance.'
];

export default function Landing() {
  const [displayText, setDisplayText] = useState("");
  const phraseIndexRef = useRef(0);
  const charIndexRef = useRef(0);
  const isDeletingRef = useRef(false);

  useEffect(() => {
    const typeSpeed = 80;
    const deleteSpeed = 40;
    const pauseDuration = 2000;

    const type = () => {
      const currentPhrase = phrases[phraseIndexRef.current];

      if (isDeletingRef.current) {
        charIndexRef.current--;
        setDisplayText(currentPhrase.substring(0, charIndexRef.current));

        if (charIndexRef.current === 0) {
          isDeletingRef.current = false;
          phraseIndexRef.current = (phraseIndexRef.current + 1) % phrases.length;
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
    <div className="sp-page">
      <main style={{ maxWidth: "680px", margin: "0 auto", padding: "3rem 1.5rem 2rem" }}>
        <div className="sp-masthead">
          <h2 className="sp-masthead-title">Serious People</h2>
          <p className="sp-masthead-date">Serious Career Coaching</p>
        </div>

        <div className="sp-quote-box">
          <img src="/logan-roy.png" alt="Logan Roy" className="sp-quote-image" />
          <div className="sp-quote-content">
            <p className="sp-quote-text">"I love you, but you are not serious people."</p>
            <p className="sp-quote-attribution">— Logan Roy</p>
          </div>
        </div>

        <section className="sp-hero">
          <h1>
            <span className="sp-headline-static">Get serious about</span>
            <span className="sp-headline-dynamic">
              <span className="sp-typewriter-text">{displayText}</span>
            </span>
          </h1>
          <p className="sp-hero-text">
            Turn your messy thoughts about work into a clear story with a short interview with our AI coach. Sharpen what you want, see the real trade-offs, and walk into big conversations—with your boss, your partner, and yourself—knowing exactly what you're asking for.
          </p>
          <Link href="/interview">
            <button className="sp-cta-button" data-testid="button-start-interview">
              Start the Interview
            </button>
          </Link>
          <p className="sp-pricing-note">
            The interview is free. Scripts and memo are $19.
          </p>
        </section>

        <div className="sp-section-divider">
          <span className="sp-section-divider-diamond"></span>
        </div>

        <section className="sp-features-section">
          <h2>What You Get for $19</h2>
          <ul className="sp-features-list">
            <li>
              <span className="sp-feature-number">1.</span>
              <div className="sp-feature-content">
                <h3>Boss Script</h3>
                <p>A 2–3 minute conversation script for talking to your manager. Honest but non-destructive.</p>
              </div>
            </li>
            <li>
              <span className="sp-feature-number">2.</span>
              <div className="sp-feature-content">
                <h3>Partner Script</h3>
                <p>A script for your spouse or partner about money, risk, and what happens if you stay or leave.</p>
              </div>
            </li>
            <li>
              <span className="sp-feature-number">3.</span>
              <div className="sp-feature-content">
                <h3>Clarity Memo</h3>
                <p>A one-page write-up of your situation, options, risks, and a concrete 30-day experiment.</p>
              </div>
            </li>
          </ul>
        </section>
      </main>

      <footer className="sp-footer">
        <p>Questions? Contact <a href="mailto:support@example.com">support@example.com</a></p>
      </footer>
    </div>
  );
}
