import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useJourney, getNextStep } from "@/hooks/useJourney";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

const PrepareItems = [
  "Make space. Give it 20–30 minutes without multitasking.",
  "Be honest and specific. The more detail you share, the sharper the advice.",
  "Expect pushback. The coach may challenge fuzzy thinking—that's a feature, not a bug."
];

export default function Prepare() {
  const [, setLocation] = useLocation();
  const [itemsVisible, setItemsVisible] = useState(false);
  const { journeyState, isLoading } = useJourney();

  useEffect(() => {
    document.title = "Get Ready - Serious People";
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setItemsVisible(true), 200);
    return () => clearTimeout(timer);
  }, []);
  
  useEffect(() => {
    if (!isLoading && journeyState) {
      if (journeyState.interviewComplete) {
        const next = getNextStep(journeyState);
        setLocation(next.path);
      }
    }
  }, [isLoading, journeyState, setLocation]);

  const handleStartInterview = () => {
    if (journeyState) {
      const next = getNextStep(journeyState);
      setLocation(next.path);
    } else {
      setLocation("/interview");
    }
  };

  const handleSaveLater = () => {
    setLocation("/");
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="p-6">
        <Link 
          href="/" 
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
          data-testid="link-home"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="font-serif text-lg font-bold text-foreground">Serious People</span>
        </Link>
      </header>
      
      <main className="flex-1 flex items-center justify-center px-6 pb-12">
        <div 
          className="w-full max-w-lg bg-card border border-border rounded-xl p-8 shadow-sm animate-fade-in"
          data-testid="prepare-card"
        >
          <h1 className="font-serif text-2xl font-bold text-foreground text-center mb-6">
            Welcome to Serious People
          </h1>

          <div className="space-y-6">
            <p className="text-muted-foreground text-center">
              This is a real coaching session, not a quick quiz. Treat it like a trusted coach who's on your side.
            </p>

            <div>
              <p className="text-sm font-medium text-foreground mb-4">To get the most out of it:</p>

              <div className="space-y-3">
                {PrepareItems.map((item, index) => (
                  <div
                    key={index}
                    className={`flex gap-3 items-start transition-all duration-300 ${
                      itemsVisible 
                        ? "opacity-100 translate-y-0" 
                        : "opacity-0 translate-y-2"
                    }`}
                    style={{ transitionDelay: `${index * 100}ms` }}
                    data-testid={`prepare-item-${index}`}
                  >
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground text-sm font-medium flex items-center justify-center">
                      {index + 1}
                    </span>
                    <span className="text-sm text-muted-foreground leading-relaxed">{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <p className="text-sm text-muted-foreground text-center border-t border-border pt-6">
              When you're ready, we'll start by getting a clear picture of what's going on and what's at stake.
            </p>
          </div>

          <div className="mt-8 space-y-3">
            <Button
              className="w-full py-6 text-base"
              onClick={handleStartInterview}
              data-testid="button-start-interview-prepare"
            >
              I'm ready, start the interview
            </Button>
            <Button
              variant="ghost"
              className="w-full"
              onClick={handleSaveLater}
              data-testid="button-save-later"
            >
              Not ready yet? Save and come back later
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
