import { useEffect, useState, useCallback } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { UserMenu } from "@/components/UserMenu";
import "@/styles/serious-people.css";

type PageState = "loading" | "ready" | "generating" | "results" | "error";

const INTERVIEW_STORAGE_KEY = "serious_people_transcript";
const MODULE_STORAGE_PREFIX = "serious_people_module_";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export default function CareerBrief() {
  const { isAuthenticated, isLoading: authLoading, refetch } = useAuth();
  const [, setLocation] = useLocation();
  
  const [state, setState] = useState<PageState>("loading");
  const [careerBrief, setCareerBrief] = useState("");
  const [copied, setCopied] = useState(false);

  // Set page title
  useEffect(() => {
    document.title = "Career Brief - Serious People";
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);
  
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      setLocation("/login");
    }
  }, [authLoading, isAuthenticated, setLocation]);

  const gatherAllTranscripts = useCallback((): Message[] => {
    const allMessages: Message[] = [];
    
    try {
      const interview = sessionStorage.getItem(INTERVIEW_STORAGE_KEY);
      if (interview) {
        allMessages.push(...JSON.parse(interview));
      }
      
      for (let i = 1; i <= 3; i++) {
        const moduleTranscript = sessionStorage.getItem(`${MODULE_STORAGE_PREFIX}${i}`);
        if (moduleTranscript) {
          allMessages.push(...JSON.parse(moduleTranscript));
        }
      }
    } catch (e) {
      console.error("Failed to gather transcripts:", e);
    }
    
    return allMessages;
  }, []);

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      const transcripts = gatherAllTranscripts();
      if (transcripts.length > 0) {
        setState("ready");
      } else {
        setState("error");
      }
    }
  }, [authLoading, isAuthenticated, gatherAllTranscripts]);

  const generateCareerBrief = async () => {
    setState("generating");

    try {
      const transcript = gatherAllTranscripts();
      
      const response = await fetch("/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript }),
      });

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      setCareerBrief(data.text);
      setState("results");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      console.error("Generate error:", error);
      alert("Something went wrong generating your Career Brief. Please try again.");
      setState("ready");
    }
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(careerBrief);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Copy failed:", error);
    }
  };

  if (authLoading) {
    return (
      <div className="sp-page">
        <div className="sp-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh' }}>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

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
        {state === "loading" && (
          <div className="sp-state-container">
            <div className="sp-spinner-large"></div>
            <p className="sp-state-text">Loading...</p>
          </div>
        )}

        {state === "error" && (
          <div className="sp-state-container">
            <div className="sp-error-card">
              <h2>Session Not Found</h2>
              <p>We couldn't find your coaching session data. Please complete the coaching modules first.</p>
              <p style={{ marginTop: "1rem" }}><Link href="/progress">Go to Your Progress</Link></p>
            </div>
          </div>
        )}

        {state === "ready" && (
          <div className="sp-state-container">
            <div className="sp-ready-card">
              <div className="sp-success-badge">Coaching Complete</div>
              <h2>Ready to Generate Your Career Brief</h2>
              <p>Based on your coaching session, I'll create your personalized Career Brief with diagnosis, action plan, and conversation scripts.</p>
              <button
                className="sp-generate-btn"
                data-testid="button-generate"
                onClick={generateCareerBrief}
              >
                Generate My Career Brief
              </button>
            </div>
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
                {careerBrief}
              </pre>
            </div>
          </div>
        )}
      </div>

      <footer className="sp-footer">
        <p>Questions? Contact <a href="mailto:hello@seriouspeople.com">hello@seriouspeople.com</a></p>
      </footer>
    </div>
  );
}
