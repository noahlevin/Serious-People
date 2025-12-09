import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import "@/styles/serious-people.css";

const PrepareItems = [
  "Make space. Give it 20–30 minutes without multitasking.",
  "Be honest and specific. The more detail you share, the sharper the advice.",
  "Expect pushback. The coach may challenge fuzzy thinking—that's a feature, not a bug."
];

export default function Prepare() {
  const [, setLocation] = useLocation();
  const [itemsVisible, setItemsVisible] = useState(false);

  // Animate items in on mount
  useEffect(() => {
    const timer = setTimeout(() => setItemsVisible(true), 200);
    return () => clearTimeout(timer);
  }, []);

  const handleStartInterview = () => {
    setLocation("/interview");
  };

  const handleSaveLater = () => {
    setLocation("/");
  };

  return (
    <div className="sp-prepare-page">
      <div className="sp-prepare-container">
        <div className="sp-prepare-card">
          <h1 className="sp-prepare-title">Welcome to Serious People</h1>

          <div className="sp-prepare-body">
            <p className="sp-prepare-intro">
              This is a real coaching session, not a quick quiz. Treat it like a trusted coach who's on your side.
            </p>

            <p className="sp-prepare-subtitle">To get the most out of it:</p>

            <div className="sp-prepare-items">
              {PrepareItems.map((item, index) => (
                <div
                  key={index}
                  className={`sp-prepare-item ${itemsVisible ? "sp-prepare-item-visible" : ""}`}
                  style={{ "--item-delay": `${index * 100}ms` } as React.CSSProperties}
                >
                  <span className="sp-prepare-number">{index + 1}</span>
                  <span className="sp-prepare-text">{item}</span>
                </div>
              ))}
            </div>

            <p className="sp-prepare-closing">
              When you're ready, we'll start by getting a clear picture of what's going on and what's at stake.
            </p>
          </div>

          <div className="sp-prepare-actions">
            <button
              className="sp-prepare-cta-primary"
              onClick={handleStartInterview}
              data-testid="button-start-interview-prepare"
            >
              I'm ready, start the interview
            </button>
            <button
              className="sp-prepare-cta-secondary"
              onClick={handleSaveLater}
              data-testid="button-save-later"
            >
              Not ready yet? Save and come back later →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
