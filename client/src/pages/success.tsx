import { useEffect, useState, useCallback } from "react";
import { Link, useSearch, useLocation } from "wouter";
import { queryClient } from "@/lib/queryClient";
import { analytics } from "@/lib/posthog";
import { UserMenu } from "@/components/UserMenu";
import { ModulesProgressCard, DEFAULT_COACHING_MODULES } from "@/components/ModulesProgressCard";
import { Button } from "@/components/ui/button";
import { Check, Copy, Loader2 } from "lucide-react";
import type { PlanCard } from "@/components/ChatComponents";

interface Message {
  role: "user" | "assistant";
  content: string;
}

type PageState = "verifying" | "error" | "transcript-error" | "preparing-coaching" | "ready" | "generating" | "results";

const STORAGE_KEY = "serious_people_transcript";
const PLAN_CARD_KEY = "serious_people_plan_card";

export default function Success() {
  const search = useSearch();
  const [, setLocation] = useLocation();
  const sessionId = new URLSearchParams(search).get("session_id");

  const [state, setState] = useState<PageState>("verifying");
  const [transcript, setTranscript] = useState<Message[] | null>(null);
  const [coachingPlan, setCoachingPlan] = useState<PlanCard | null>(null);
  const [scriptsContent, setScriptsContent] = useState("");
  const [copied, setCopied] = useState(false);
  
  useEffect(() => {
    document.title = "Payment Confirmed - Serious People";
  }, []);
  
  const handleStartCoaching = () => {
    sessionStorage.setItem("payment_verified", "true");
    queryClient.invalidateQueries({ queryKey: ['/api/journey'] });
    setLocation("/module/1");
  };

  useEffect(() => {
    const loadPlan = async () => {
      try {
        const savedPlan = sessionStorage.getItem(PLAN_CARD_KEY);
        if (savedPlan) {
          setCoachingPlan(JSON.parse(savedPlan));
          return;
        }
        
        const response = await fetch("/api/transcript", { credentials: "include" });
        if (response.ok) {
          const data = await response.json();
          if (data.planCard) {
            setCoachingPlan(data.planCard);
            sessionStorage.setItem(PLAN_CARD_KEY, JSON.stringify(data.planCard));
          }
        }
      } catch (e) {
        console.error("Failed to load coaching plan:", e);
      }
    };
    
    loadPlan();
  }, []);

  const loadTranscript = useCallback((): boolean => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.length > 0) {
          setTranscript(parsed);
          return true;
        }
      }
    } catch (e) {
      console.error("Failed to load transcript:", e);
    }
    return false;
  }, []);

  const pollForDossier = useCallback(async (maxWaitMs: number = 60000, pollIntervalMs: number = 2000) => {
    const startTime = Date.now();
    let pollCount = 0;
    
    while (Date.now() - startTime < maxWaitMs) {
      pollCount++;
      try {
        const checkRes = await fetch("/api/transcript", { credentials: "include" });
        if (checkRes.ok) {
          const data = await checkRes.json();
          if (data?.clientDossier) {
            console.log(`Dossier ready after ${pollCount} polls (${Date.now() - startTime}ms)`);
            sessionStorage.setItem("payment_verified", "true");
            queryClient.invalidateQueries({ queryKey: ['/api/journey'] });
            setLocation("/module/1");
            return true;
          }
        }
      } catch (err) {
        console.error("Poll error:", err);
      }
      
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }
    
    console.log(`Dossier not ready after ${maxWaitMs}ms, showing manual start button`);
    return false;
  }, [setLocation]);

  const verifyPayment = useCallback(async () => {
    if (!sessionId) {
      setState("error");
      return;
    }

    try {
      const response = await fetch(`/verify-session?session_id=${encodeURIComponent(sessionId)}`, {
        credentials: "include",
      });
      const data = await response.json();

      if (data.ok) {
        analytics.paymentCompleted();
        setState("preparing-coaching");
        
        try {
          const checkRes = await fetch("/api/transcript", { credentials: "include" });
          const transcriptData = checkRes.ok ? await checkRes.json() : null;
          
          if (transcriptData?.clientDossier) {
            console.log("Client dossier ready, redirecting to Module 1");
            sessionStorage.setItem("payment_verified", "true");
            queryClient.invalidateQueries({ queryKey: ['/api/journey'] });
            setLocation("/module/1");
            return;
          }
          
          const hasTranscript = loadTranscript() || (transcriptData?.transcript && transcriptData.transcript.length > 0);
          
          if (!hasTranscript) {
            setState("transcript-error");
            return;
          }
          
          console.log("Dossier not ready, triggering fallback generation...");
          fetch("/api/generate-dossier", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
          }).catch(err => console.error("Fallback generation error:", err));
          
          const dossierReady = await pollForDossier(60000, 2000);
          
          if (!dossierReady) {
            setState("ready");
          }
        } catch (err) {
          console.error("Error checking/generating client dossier:", err);
          setState("ready");
        }
      } else {
        setState("error");
      }
    } catch (error) {
      console.error("Verification error:", error);
      setState("error");
    }
  }, [sessionId, loadTranscript, pollForDossier, setLocation]);

  useEffect(() => {
    verifyPayment();
  }, [verifyPayment]);

  const generateScripts = async () => {
    setState("generating");

    try {
      const response = await fetch("/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript }),
      });

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      setScriptsContent(data.text);
      setState("results");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      console.error("Generate error:", error);
      alert("Something went wrong generating your scripts. Please try again.");
      setState("ready");
    }
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(scriptsContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Copy failed:", error);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <img src="/favicon.png" alt="Serious People" className="w-8 h-8" />
            <span className="font-serif text-xl font-bold text-foreground">Serious People</span>
          </Link>
          <UserMenu />
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-2xl">
          {state === "verifying" && (
            <div className="flex flex-col items-center justify-center py-20 animate-fade-in" data-testid="state-verifying">
              <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" />
              <p className="text-lg text-muted-foreground font-sans">Verifying your payment...</p>
            </div>
          )}

          {state === "error" && (
            <div className="flex flex-col items-center justify-center py-20 animate-fade-in" data-testid="state-error">
              <div className="bg-card border border-border rounded-xl p-8 text-center max-w-md">
                <h2 className="font-serif text-2xl font-bold text-foreground mb-4">Payment Verification Failed</h2>
                <p className="text-muted-foreground font-sans">
                  We couldn't verify your payment. Please contact{" "}
                  <a href="mailto:hello@seriouspeople.com" className="text-primary hover:underline">
                    hello@seriouspeople.com
                  </a>{" "}
                  for assistance.
                </p>
              </div>
            </div>
          )}

          {state === "transcript-error" && (
            <div className="flex flex-col items-center justify-center py-20 animate-fade-in" data-testid="state-transcript-error">
              <div className="bg-card border border-border rounded-xl p-8 text-center max-w-md">
                <h2 className="font-serif text-2xl font-bold text-foreground mb-4">Interview Not Found</h2>
                <p className="text-muted-foreground font-sans mb-4">
                  Looks like I can't find your interview on this device. For now this tool assumes you complete the interview and payment on the same device/browser.
                </p>
                <Link href="/interview">
                  <Button data-testid="link-start-interview">Start a new interview</Button>
                </Link>
              </div>
            </div>
          )}

          {state === "preparing-coaching" && (
            <div className="flex flex-col items-center justify-center py-20 animate-fade-in" data-testid="state-preparing">
              <div className="w-16 h-16 rounded-full bg-sage-wash flex items-center justify-center mb-6">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
              </div>
              <p className="text-lg text-foreground font-sans mb-2">Preparing your coaching experience...</p>
              <p className="text-sm text-muted-foreground font-sans">Reviewing your interview and creating a personalized plan</p>
            </div>
          )}

          {state === "ready" && (
            <div className="animate-fade-in" data-testid="state-ready">
              <ModulesProgressCard
                currentModule={1}
                showBadge={true}
                badgeText="Payment Confirmed"
                title="Let's Start Your Coaching Program"
                subtitle="Your personalized three-module coaching journey awaits. At the end, you'll receive your Career Brief with diagnosis, action plan, and conversation scripts."
                ctaText={`Start Module 1: ${coachingPlan?.modules?.[0]?.name || DEFAULT_COACHING_MODULES[0].name}`}
                onCtaClick={handleStartCoaching}
                customModules={coachingPlan?.modules}
              />
            </div>
          )}

          {state === "generating" && (
            <div className="flex flex-col items-center justify-center py-20 animate-fade-in" data-testid="state-generating">
              <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" />
              <p className="text-lg text-muted-foreground font-sans">Writing your Career Brief... this may take a moment.</p>
            </div>
          )}

          {state === "results" && (
            <div className="animate-fade-in" data-testid="state-results">
              <div className="text-center mb-8">
                <div className="w-16 h-16 rounded-full bg-sage-wash flex items-center justify-center mx-auto mb-4">
                  <Check className="w-8 h-8 text-primary" />
                </div>
                <h1 className="font-serif text-3xl font-bold text-foreground mb-2">Your Career Brief</h1>
                <p className="text-muted-foreground font-sans">Use this as your roadmap. Adjust the language to fit your voice.</p>
              </div>

              <div className="flex justify-center mb-6">
                <Button
                  variant={copied ? "secondary" : "outline"}
                  data-testid="button-copy-all"
                  onClick={copyToClipboard}
                  className="gap-2"
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      Copy All to Clipboard
                    </>
                  )}
                </Button>
              </div>

              <div className="bg-card border border-border rounded-xl p-6 md:p-8">
                <pre 
                  className="whitespace-pre-wrap font-sans text-foreground leading-relaxed text-sm md:text-base" 
                  data-testid="scripts-output"
                >
                  {scriptsContent}
                </pre>
              </div>
            </div>
          )}
        </div>
      </main>

      <footer className="border-t border-border py-8">
        <p className="text-center text-sm text-muted-foreground font-sans">
          Questions? Contact{" "}
          <a href="mailto:hello@seriouspeople.com" className="text-primary hover:underline">
            hello@seriouspeople.com
          </a>
        </p>
      </footer>
    </div>
  );
}
