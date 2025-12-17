import { useEffect, useState, useCallback } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { UserMenu } from "@/components/UserMenu";
import { Button } from "@/components/ui/button";
import { Copy, Check, Loader2 } from "lucide-react";

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
      <div className="min-h-screen bg-background">
        <div className="flex items-center justify-center min-h-[50vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="max-w-container mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2 hover-elevate rounded-md px-2 py-1 -ml-2">
            <img src="/favicon.png" alt="Serious People" className="h-8 w-8" />
            <span className="font-serif text-xl font-semibold text-foreground">Serious People</span>
          </Link>
          <UserMenu />
        </div>
      </header>

      <main className="flex-1 py-12 px-6">
        <div className="max-w-content-wide mx-auto">
          {state === "loading" && (
            <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <p className="text-muted-foreground font-sans">Loading...</p>
            </div>
          )}

          {state === "error" && (
            <div className="flex flex-col items-center justify-center min-h-[40vh]">
              <div className="bg-card border border-border rounded-md p-8 max-w-md text-center">
                <h2 className="font-serif text-2xl font-semibold text-foreground mb-4">Session Not Found</h2>
                <p className="text-muted-foreground font-sans mb-6">
                  We couldn't find your coaching session data. Please complete the coaching modules first.
                </p>
                <Link href="/progress">
                  <Button variant="default" data-testid="link-progress">
                    Go to Your Progress
                  </Button>
                </Link>
              </div>
            </div>
          )}

          {state === "ready" && (
            <div className="flex flex-col items-center justify-center min-h-[40vh]">
              <div className="bg-card border border-border rounded-md p-8 max-w-lg text-center">
                <span className="inline-block bg-primary/10 text-primary text-sm font-medium px-3 py-1 rounded-md mb-6">
                  Coaching Complete
                </span>
                <h2 className="font-serif text-2xl md:text-3xl font-semibold text-foreground mb-4">
                  Ready to Generate Your Career Brief
                </h2>
                <p className="text-muted-foreground font-sans mb-8 leading-relaxed">
                  Based on your coaching session, I'll create your personalized Career Brief with diagnosis, action plan, and conversation scripts.
                </p>
                <Button
                  size="lg"
                  data-testid="button-generate"
                  onClick={generateCareerBrief}
                >
                  Generate My Career Brief
                </Button>
              </div>
            </div>
          )}

          {state === "generating" && (
            <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <p className="text-muted-foreground font-sans text-center max-w-sm">
                Writing your Career Brief... this may take a moment.
              </p>
            </div>
          )}

          {state === "results" && (
            <div className="animate-fade-in">
              <div className="text-center mb-8">
                <h1 className="font-serif text-3xl md:text-4xl font-semibold text-foreground mb-3">
                  Your Career Brief
                </h1>
                <p className="text-muted-foreground font-sans">
                  Use this as your roadmap. Adjust the language to fit your voice.
                </p>
              </div>

              <div className="flex justify-center mb-6">
                <Button
                  variant={copied ? "default" : "outline"}
                  data-testid="button-copy-all"
                  onClick={copyToClipboard}
                  className="gap-2"
                >
                  {copied ? (
                    <>
                      <Check className="h-4 w-4" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      Copy All to Clipboard
                    </>
                  )}
                </Button>
              </div>

              <div className="bg-card border border-border rounded-md p-6 md:p-8">
                <pre 
                  className="whitespace-pre-wrap font-sans text-foreground leading-relaxed text-base overflow-x-auto"
                  data-testid="scripts-output"
                >
                  {careerBrief}
                </pre>
              </div>
            </div>
          )}
        </div>
      </main>

      <footer className="border-t border-border py-8 px-6">
        <p className="text-center text-muted-foreground text-sm font-sans">
          Questions? Contact{" "}
          <a 
            href="mailto:hello@seriouspeople.com" 
            className="text-primary hover:underline"
          >
            hello@seriouspeople.com
          </a>
        </p>
      </footer>
    </div>
  );
}
