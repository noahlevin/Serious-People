import { useEffect, useState, useCallback } from "react";
import { Link, useSearch, useLocation } from "wouter";
import "@/styles/serious-people.css";
import { UserMenu } from "@/components/UserMenu";
import { ModulesProgressCard, DEFAULT_COACHING_MODULES } from "@/components/ModulesProgressCard";
import type { PlanCard } from "@/components/ChatComponents";

interface Message {
  role: "user" | "assistant";
  content: string;
}

type PageState = "verifying" | "error" | "transcript-error" | "ready" | "generating" | "results";

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
  
  const handleStartCoaching = () => {
    sessionStorage.setItem("payment_verified", "true");
    setLocation("/module/1");
  };

  useEffect(() => {
    const savedPlan = sessionStorage.getItem(PLAN_CARD_KEY);
    if (savedPlan) {
      try {
        setCoachingPlan(JSON.parse(savedPlan));
      } catch (e) {
        console.error("Failed to load coaching plan:", e);
      }
    }
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

  const verifyPayment = useCallback(async () => {
    if (!sessionId) {
      setState("error");
      return;
    }

    try {
      const response = await fetch(`/verify-session?session_id=${encodeURIComponent(sessionId)}`);
      const data = await response.json();

      if (data.ok) {
        if (loadTranscript()) {
          setState("ready");
        } else {
          setState("transcript-error");
        }
      } else {
        setState("error");
      }
    } catch (error) {
      console.error("Verification error:", error);
      setState("error");
    }
  }, [sessionId, loadTranscript]);

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
            <img src="/logan-roy.png" alt="Serious People" className="sp-logo-icon" />
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
