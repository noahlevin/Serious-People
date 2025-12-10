import { useEffect, useState, useCallback } from "react";
import { Link, useSearch, useLocation } from "wouter";
import { queryClient } from "@/lib/queryClient";
import { analytics } from "@/lib/posthog";
import "@/styles/serious-people.css";
import { UserMenu } from "@/components/UserMenu";
import { ModulesProgressCard, DEFAULT_COACHING_MODULES } from "@/components/ModulesProgressCard";
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
  
  // Set page title
  useEffect(() => {
    document.title = "Payment Confirmed - Serious People";
  }, []);
  
  const handleStartCoaching = () => {
    sessionStorage.setItem("payment_verified", "true");
    // Invalidate journey cache to ensure fresh state when navigating
    queryClient.invalidateQueries({ queryKey: ['/api/journey'] });
    setLocation("/module/1");
  };

  useEffect(() => {
    const loadPlan = async () => {
      try {
        // Try sessionStorage first
        const savedPlan = sessionStorage.getItem(PLAN_CARD_KEY);
        if (savedPlan) {
          setCoachingPlan(JSON.parse(savedPlan));
          return;
        }
        
        // Try loading from server
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

  // Poll for dossier existence - redirects when ready or times out
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
      
      // Wait before next poll
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
          // First check if dossier already exists in database
          const checkRes = await fetch("/api/transcript", { credentials: "include" });
          const transcriptData = checkRes.ok ? await checkRes.json() : null;
          
          if (transcriptData?.clientDossier) {
            // Dossier already exists - redirect immediately
            console.log("Client dossier ready, redirecting to Module 1");
            sessionStorage.setItem("payment_verified", "true");
            queryClient.invalidateQueries({ queryKey: ['/api/journey'] });
            setLocation("/module/1");
            return;
          }
          
          // No dossier found - check if we have a transcript
          const hasTranscript = loadTranscript() || (transcriptData?.transcript && transcriptData.transcript.length > 0);
          
          if (!hasTranscript) {
            setState("transcript-error");
            return;
          }
          
          // Trigger fallback generation in the background (fire-and-forget)
          // This ensures generation starts even if the pre-paywall attempt failed
          console.log("Dossier not ready, triggering fallback generation...");
          fetch("/api/generate-dossier", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
          }).catch(err => console.error("Fallback generation error:", err));
          
          // Poll for dossier existence - this will redirect when ready
          // or timeout after 60 seconds and show manual button
          const dossierReady = await pollForDossier(60000, 2000);
          
          if (!dossierReady) {
            // Timeout - show manual start button
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
    <div className="sp-page">
      <header className="sp-success-header">
        <div className="sp-header-content">
          <Link href="/" className="sp-logo-link">
            <img src="/favicon.png" alt="Serious People" className="sp-logo-icon" />
            <span className="sp-logo">Serious People</span>
          </Link>
          <UserMenu />
        </div>
      </header>

      <div className="sp-container">
        {state === "verifying" && (
          <div className="sp-state-container">
            <div className="sp-spinner-large"></div>
            <p className="sp-state-text">Verifying your payment...</p>
          </div>
        )}

        {state === "error" && (
          <div className="sp-state-container">
            <div className="sp-error-card">
              <h2>Payment Verification Failed</h2>
              <p>We couldn't verify your payment. Please contact <a href="mailto:support@example.com">support@example.com</a> for assistance.</p>
            </div>
          </div>
        )}

        {state === "transcript-error" && (
          <div className="sp-state-container">
            <div className="sp-error-card">
              <h2>Interview Not Found</h2>
              <p>Looks like I can't find your interview on this device. For now this tool assumes you complete the interview and payment on the same device/browser.</p>
              <p style={{ marginTop: "1rem" }}><Link href="/interview">Start a new interview</Link></p>
            </div>
          </div>
        )}

        {state === "preparing-coaching" && (
          <div className="sp-state-container">
            <div className="sp-spinner-large"></div>
            <p className="sp-state-text">Preparing your coaching experience...</p>
            <p className="sp-state-subtext" style={{ marginTop: "0.5rem", opacity: 0.7 }}>Reviewing your interview and creating a personalized plan</p>
          </div>
        )}

        {state === "ready" && (
          <div className="sp-state-container">
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
          <div className="sp-state-container">
            <div className="sp-spinner-large"></div>
            <p className="sp-state-text">Writing your Career Brief... this may take a moment.</p>
          </div>
        )}

        {state === "results" && (
          <div>
            <div className="sp-results-header">
              <h1>Your Career Brief</h1>
              <p>Use this as your roadmap. Adjust the language to fit your voice.</p>
            </div>

            <button
              className={`sp-copy-all-btn ${copied ? "copied" : ""}`}
              data-testid="button-copy-all"
              onClick={copyToClipboard}
            >
              {copied ? "Copied!" : "Copy All to Clipboard"}
            </button>

            <div className="sp-scripts-output">
              <pre className="sp-scripts-content" data-testid="scripts-output">
                {scriptsContent}
              </pre>
            </div>
          </div>
        )}
      </div>

      <footer className="sp-footer">
        <p>Questions? Contact <a href="mailto:support@example.com">support@example.com</a></p>
      </footer>
    </div>
  );
}
