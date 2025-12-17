import { useEffect, useState, useRef, useCallback } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { UserMenu } from "@/components/UserMenu";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  formatContent, 
  extractTitleCard,
  MessageComponent,
  TypingIndicator,
  ModuleTitleCard,
  OptionsContainer,
  ChatWrapper,
  MessageWrapper,
  PlanCardComponent
} from "@/components/ChatComponents";
import { analytics } from "@/lib/posthog";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ArrowRight, Send } from "lucide-react";

const isMobileDevice = () => {
  return window.matchMedia('(max-width: 768px)').matches || 
    ('ontouchstart' in window) || 
    (navigator.maxTouchPoints > 0);
};

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface PlanCard {
  name: string;
  modules: { name: string; objective: string; approach: string; outcome: string }[];
  careerBrief: string;
}

interface InterviewResponse {
  reply: string;
  done: boolean;
  valueBullets?: string;
  socialProof?: string;
  progress?: number;
  options?: string[];
  planCard?: PlanCard;
}

interface PricingData {
  originalPrice: number;
  discountedPrice: number | null;
  percentOff: number | null;
  amountOff: number | null;
  currency: string;
}

const STORAGE_KEY = "serious_people_transcript";
const PROGRESS_KEY = "serious_people_progress";

function PlanCardTeaser({ planCard, onViewPlan }: { planCard: PlanCard; onViewPlan: () => void }) {
  const [showModules, setShowModules] = useState(false);
  
  useEffect(() => {
    const timer = setTimeout(() => setShowModules(true), 300);
    return () => clearTimeout(timer);
  }, []);
  
  return (
    <div 
      className="w-full max-w-[520px] mx-auto my-6 bg-card border border-border rounded-lg shadow-lg animate-fade-in"
      data-testid="plan-teaser"
    >
      <div className="p-6 text-center border-b border-border">
        <h3 className="font-serif text-xl font-semibold text-foreground">
          {planCard.name}, are you ready to see your personalized coaching plan?
        </h3>
      </div>
      
      <div className="p-4 space-y-2">
        {planCard.modules.map((mod, i) => (
          <div 
            key={i} 
            className={cn(
              "p-4 bg-sage-wash/50 rounded-lg transition-all duration-300",
              showModules ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
            )}
            style={{ transitionDelay: `${i * 150}ms` }}
            data-testid={`teaser-module-${i + 1}`}
          >
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">
              Module {i + 1}
            </div>
            <div className="font-serif text-base font-semibold text-foreground">
              {mod.name}
            </div>
          </div>
        ))}
      </div>
      
      <div className="p-4 pt-2">
        <Button 
          className="w-full py-6 text-base font-medium"
          onClick={onViewPlan}
          data-testid="button-see-plan"
        >
          See my plan
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}

function PlanConfirmationCTAs({
  onConfirm,
  onRevise,
  isLoading
}: {
  onConfirm: () => void;
  onRevise: () => void;
  isLoading: boolean;
}) {
  return (
    <div className="w-full max-w-[520px] mx-auto my-6 animate-fade-in" data-testid="plan-confirmation-ctas">
      <div className="flex flex-col sm:flex-row gap-3">
        <Button
          className="flex-1 py-6 text-base"
          data-testid="button-lets-do-it"
          onClick={onConfirm}
          disabled={isLoading}
        >
          {isLoading ? (
            <span className="flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
              Loading...
            </span>
          ) : (
            "Let's Do It"
          )}
        </Button>
        <Button
          variant="outline"
          className="flex-1 py-6 text-base"
          data-testid="button-change-something"
          onClick={onRevise}
          disabled={isLoading}
        >
          Change Something
        </Button>
      </div>
    </div>
  );
}

export default function Interview() {
  const { isAuthenticated, isLoading: authLoading, refetch } = useAuth();
  const [, setLocation] = useLocation();
  
  useEffect(() => {
    document.title = "Career Interview - Serious People";
  }, []);
  
  const { data: pricing } = useQuery<PricingData>({
    queryKey: ["/api/pricing"],
    staleTime: 60000,
  });
  
  const [transcript, setTranscript] = useState<Message[]>([]);
  const [interviewComplete, setInterviewComplete] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isCheckoutLoading, setIsCheckoutLoading] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState(0);
  const [currentModule, setCurrentModule] = useState("Interview");
  const [options, setOptions] = useState<string[]>([]);
  const [planCard, setPlanCard] = useState<{ card: PlanCard; index: number } | null>(null);
  const [valueBullets, setValueBullets] = useState<string>("");
  const [socialProof, setSocialProof] = useState<string>("");
  const [animatingMessageIndex, setAnimatingMessageIndex] = useState<number | null>(null);
  const [titleCards, setTitleCards] = useState<{ index: number; name: string; time: string }[]>([]);
  const [paymentVerified, setPaymentVerified] = useState(false);
  const [isNavigatingToOffer, setIsNavigatingToOffer] = useState(false);
  const [showPlanCTAs, setShowPlanCTAs] = useState(false);
  const [isRevising, setIsRevising] = useState(false);
  
  const chatWindowRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const hasInitialized = useRef(false);
  const moduleJustChanged = useRef(false);
  const hasRefetched = useRef(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSaveRef = useRef<{
    messages: Message[];
    extraData?: {
      currentModule?: string;
      progress?: number;
      interviewComplete?: boolean;
      paymentVerified?: boolean;
      valueBullets?: string;
      socialProof?: string;
      planCard?: PlanCard | null;
    };
  } | null>(null);
  
  useEffect(() => {
    if (!hasRefetched.current) {
      hasRefetched.current = true;
      refetch();
    }
  }, [refetch]);
  
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      setLocation("/login");
    }
  }, [authLoading, isAuthenticated, setLocation]);
  
  const saveTranscriptMutation = useMutation({
    mutationFn: async (data: {
      transcript: Message[];
      currentModule: string;
      progress: number;
      interviewComplete: boolean;
      paymentVerified: boolean;
      valueBullets?: string;
      socialProof?: string;
      planCard?: PlanCard | null;
    }) => {
      const response = await apiRequest("POST", "/api/transcript", data);
      return response.json();
    },
    onSuccess: (data) => {
      if (data?.providedNameUpdated) {
        refetch();
      }
    },
  });

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      if (chatWindowRef.current) {
        chatWindowRef.current.scrollTop = chatWindowRef.current.scrollHeight;
      }
    });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [transcript, isTyping, options, planCard, interviewComplete, scrollToBottom]);
  
  useEffect(() => {
    if (animatingMessageIndex === null) {
      scrollToBottom();
    }
  }, [animatingMessageIndex, scrollToBottom]);

  const saveTranscript = useCallback((messages: Message[], extraData?: {
    currentModule?: string;
    progress?: number;
    interviewComplete?: boolean;
    paymentVerified?: boolean;
    valueBullets?: string;
    socialProof?: string;
    planCard?: PlanCard | null;
  }) => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch (e) {
      console.error("Failed to save transcript:", e);
    }
    
    if (isAuthenticated) {
      pendingSaveRef.current = { messages, extraData };
      
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      
      saveTimeoutRef.current = setTimeout(() => {
        const pending = pendingSaveRef.current;
        if (pending) {
          saveTranscriptMutation.mutate({
            transcript: pending.messages,
            currentModule: pending.extraData?.currentModule || currentModule,
            progress: pending.extraData?.progress ?? progress,
            interviewComplete: pending.extraData?.interviewComplete ?? interviewComplete,
            paymentVerified: pending.extraData?.paymentVerified ?? paymentVerified,
            valueBullets: pending.extraData?.valueBullets || valueBullets || undefined,
            socialProof: pending.extraData?.socialProof || socialProof || undefined,
            planCard: pending.extraData?.planCard !== undefined ? pending.extraData.planCard : (planCard?.card || null),
          }, {
            onError: (error) => {
              console.error("Failed to save transcript to server:", error);
            },
          });
          pendingSaveRef.current = null;
        }
      }, 1000);
    }
  }, [isAuthenticated, currentModule, progress, interviewComplete, paymentVerified, valueBullets, socialProof, planCard, saveTranscriptMutation]);

  const saveProgress = useCallback((value: number) => {
    try {
      sessionStorage.setItem(PROGRESS_KEY, value.toString());
    } catch (e) {
      console.error("Failed to save progress:", e);
    }
  }, []);

  const updateProgress = useCallback((value: number, forceReset = false) => {
    if (value >= 0 && value <= 100) {
      setProgress(prev => {
        if (forceReset || value >= prev) {
          saveProgress(value);
          return value;
        }
        return prev;
      });
    }
  }, [saveProgress]);

  const detectAndUpdateModule = useCallback((content: string) => {
    const moduleMatch = content.match(/^—\s*(.+?)\s*\(est\./m);
    if (moduleMatch) {
      const moduleName = moduleMatch[1].trim();
      setCurrentModule(prev => {
        if (moduleName !== prev) {
          moduleJustChanged.current = true;
          updateProgress(5, true);
          return moduleName;
        }
        return prev;
      });
      return true;
    }
    return false;
  }, [updateProgress]);

  const sendMessage = useCallback(async (userMessage?: string) => {
    setIsSending(true);
    setOptions([]);
    
    let currentTranscript = transcript;

    if (userMessage) {
      const newMessage: Message = { role: "user", content: userMessage };
      currentTranscript = [...transcript, newMessage];
      setTranscript(currentTranscript);
      saveTranscript(currentTranscript);
      analytics.interviewMessageSent();
    }

    setIsTyping(true);
    setStatus("");

    try {
      const response = await fetch("/interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: currentTranscript }),
      });

      if (!response.ok) {
        throw new Error("Failed to get response");
      }

      const data: InterviewResponse = await response.json();

      const thinkingDelay = Math.floor(Math.random() * (1500 - 400 + 1)) + 400;
      await new Promise(resolve => setTimeout(resolve, thinkingDelay));

      setIsTyping(false);

      if (data.done) {
        setInterviewComplete(true);
        setValueBullets(data.valueBullets || "");
        setSocialProof(data.socialProof || "");
        setStatus("");
        analytics.interviewCompleted();
        
        saveTranscript(currentTranscript, {
          interviewComplete: true,
          valueBullets: data.valueBullets || undefined,
          socialProof: data.socialProof || undefined,
          planCard: data.planCard || undefined,
        });
        
        if (data.planCard?.name) {
          const lastAssistantIdx = currentTranscript.length - 1;
          setPlanCard({ card: data.planCard, index: lastAssistantIdx >= 0 ? lastAssistantIdx : 0 });
          try {
            sessionStorage.setItem("serious_people_plan_card", JSON.stringify(data.planCard));
          } catch (e) {
            console.error("Failed to save plan card to sessionStorage:", e);
          }
        }
        
        return;
      }

      detectAndUpdateModule(data.reply);

      if (data.progress !== null && data.progress !== undefined) {
        if (!moduleJustChanged.current) {
          updateProgress(data.progress);
        }
        moduleJustChanged.current = false;
      }

      const assistantMessage: Message = { role: "assistant", content: data.reply };
      const updatedTranscript = [...currentTranscript, assistantMessage];
      setTranscript(updatedTranscript);
      
      saveTranscript(updatedTranscript, {
        planCard: data.planCard || null,
        valueBullets: data.valueBullets || undefined,
        socialProof: data.socialProof || undefined,
      });

      const titleCard = extractTitleCard(data.reply);
      if (titleCard) {
        setTitleCards(prev => [...prev, { index: updatedTranscript.length - 1, ...titleCard }]);
      }

      setAnimatingMessageIndex(updatedTranscript.length - 1);

      if (data.planCard?.name) {
        setPlanCard({ card: data.planCard, index: updatedTranscript.length - 1 });
        setShowPlanCTAs(true);
        setIsRevising(false);
        try {
          sessionStorage.setItem("serious_people_plan_card", JSON.stringify(data.planCard));
        } catch (e) {
          console.error("Failed to save plan card to sessionStorage:", e);
        }
      }

      if (data.options && data.options.length > 0) {
        setOptions(data.options || []);
      }
    } catch (error) {
      console.error("Interview error:", error);
      setIsTyping(false);
      setStatus("Something went wrong. Please try again.");
    } finally {
      setIsSending(false);
      if (!isMobileDevice()) {
        textareaRef.current?.focus();
      }
    }
  }, [transcript, saveTranscript, detectAndUpdateModule, updateProgress]);

  const handleCheckout = async () => {
    setIsCheckoutLoading(true);
    analytics.checkoutStarted();

    try {
      const completeRes = await fetch("/api/interview/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      
      if (!completeRes.ok) {
        console.error("Failed to mark interview complete:", await completeRes.text());
      } else {
        console.log("Interview marked complete, dossier generation started");
      }
      
      const urlParams = new URLSearchParams(window.location.search);
      let promoCode = urlParams.get('promo');
      if (!promoCode) {
        promoCode = sessionStorage.getItem('sp_promo_code');
      }
      
      const basePath = window.location.pathname.startsWith('/app') ? '/app' : '';
      
      const response = await fetch("/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          promoCode: promoCode || undefined,
          basePath: basePath || undefined,
        }),
      });

      const data = await response.json();

      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error(data.error || "Failed to create checkout session");
      }
    } catch (error) {
      console.error("Checkout error:", error);
      alert("Something went wrong. Please try again.");
      setIsCheckoutLoading(false);
    }
  };

  const handleSend = () => {
    const text = inputValue.trim();
    if (text && !isSending) {
      setInputValue("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
        if (isMobileDevice()) {
          textareaRef.current.blur();
        }
      }
      sendMessage(text);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleOptionSelect = (option: string) => {
    setOptions([]);
    setInputValue("");
    sendMessage(option);
  };

  const handleConfirmPlan = async () => {
    setIsNavigatingToOffer(true);
    analytics.interviewCompleted();
    
    try {
      const completeRes = await fetch("/api/interview/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      
      if (!completeRes.ok) {
        console.error("Failed to mark interview complete:", await completeRes.text());
      }
      
      await queryClient.invalidateQueries({ queryKey: ["/api/journey"] });
      
      await new Promise(resolve => setTimeout(resolve, 300));
      
      document.body.classList.add('page-transition-out');
      setTimeout(() => {
        setLocation("/offer");
      }, 400);
    } catch (error) {
      console.error("Error confirming plan:", error);
      setIsNavigatingToOffer(false);
    }
  };

  const handleRevisePlan = async () => {
    setIsRevising(true);
    setShowPlanCTAs(false);
    
    try {
      await fetch("/api/transcript/revision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
    } catch (error) {
      console.error("Failed to increment revision count:", error);
    }
    
    const revisionMessage = "I'd like to change something about this plan.";
    sendMessage(revisionMessage);
  };

  useEffect(() => {
    if (hasInitialized.current || authLoading) return;
    if (!isAuthenticated) return;
    
    hasInitialized.current = true;

    const loadTranscript = async () => {
      try {
        const response = await fetch("/api/transcript", { credentials: "include" });
        if (response.ok) {
          const data = await response.json();
          if (data.transcript && Array.isArray(data.transcript) && data.transcript.length > 0) {
            setTranscript(data.transcript);
            setProgress(data.progress || 0);
            setCurrentModule(data.currentModule || "Interview");
            setInterviewComplete(data.interviewComplete || false);
            setPaymentVerified(data.paymentVerified || false);
            if (data.valueBullets) setValueBullets(data.valueBullets);
            if (data.socialProof) setSocialProof(data.socialProof);
            if (data.planCard) {
              const lastAssistantIdx = data.transcript.reduce((acc: number, msg: Message, idx: number) => 
                msg.role === "assistant" ? idx : acc, -1);
              setPlanCard({ card: data.planCard, index: lastAssistantIdx });
            }
            
            const cards: { index: number; name: string; time: string }[] = [];
            data.transcript.forEach((msg: Message, idx: number) => {
              if (msg.role === "assistant") {
                detectAndUpdateModule(msg.content);
                const titleCard = extractTitleCard(msg.content);
                if (titleCard) {
                  cards.push({ index: idx, ...titleCard });
                }
              }
            });
            setTitleCards(cards);
            
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data.transcript));
            sessionStorage.setItem(PROGRESS_KEY, (data.progress || 0).toString());
            return;
          }
        }
      } catch (e) {
        console.error("Failed to load transcript from server:", e);
      }
      
      try {
        const savedProgress = sessionStorage.getItem(PROGRESS_KEY);
        if (savedProgress) {
          const value = parseInt(savedProgress, 10);
          if (!isNaN(value) && value >= 0 && value <= 100) {
            setProgress(value);
          }
        }
      } catch (e) {
        console.error("Failed to load progress:", e);
      }

      try {
        const saved = sessionStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed: Message[] = JSON.parse(saved);
          setTranscript(parsed);

          const cards: { index: number; name: string; time: string }[] = [];
          parsed.forEach((msg, idx) => {
            if (msg.role === "assistant") {
              detectAndUpdateModule(msg.content);
              const titleCard = extractTitleCard(msg.content);
              if (titleCard) {
                cards.push({ index: idx, ...titleCard });
              }
            }
          });
          setTitleCards(cards);

          const lastResponse = parsed.filter(t => t.role === "assistant").pop();
          if (lastResponse && lastResponse.content.includes("I think I have enough")) {
            setInterviewComplete(true);
          }
        } else {
          analytics.interviewStarted();
          sendMessage();
        }
      } catch (e) {
        console.error("Failed to load transcript:", e);
        analytics.interviewStarted();
        sendMessage();
      }
    };
    
    loadTranscript();
  }, [authLoading, isAuthenticated, detectAndUpdateModule, sendMessage]);

  const autoResize = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      const newHeight = Math.min(textareaRef.current.scrollHeight, 150);
      textareaRef.current.style.height = newHeight + "px";
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b border-border">
        <div className="max-w-content-wide mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2 group" data-testid="link-home">
            <img src="/favicon.png" alt="Serious People" className="w-8 h-8" />
            <span className="font-serif text-lg font-semibold text-foreground group-hover:text-primary transition-colors">
              Serious People
            </span>
            <span className="text-muted-foreground text-sm hidden sm:inline">
              · {currentModule}
            </span>
          </Link>
          <UserMenu />
        </div>
        <div className="h-1 bg-muted">
          <div 
            className="h-full bg-primary transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </header>

      <div className="flex-1 flex flex-col max-w-content-wide mx-auto w-full">
        <main className="flex-1 overflow-hidden flex flex-col">
          <div 
            ref={chatWindowRef} 
            className="flex-1 overflow-y-auto px-4 sm:px-6 py-6"
            data-testid="chat-window"
          >
            <ChatWrapper>
              {transcript.map((msg, index) => {
                const titleCard = titleCards.find(tc => tc.index === index);
                return (
                  <MessageWrapper key={index} role={msg.role}>
                    {msg.role === "assistant" && titleCard && (
                      <ModuleTitleCard name={titleCard.name} time={titleCard.time} />
                    )}
                    <MessageComponent
                      role={msg.role}
                      content={msg.content}
                      animate={animatingMessageIndex === index}
                      onComplete={() => {
                        if (animatingMessageIndex === index) {
                          setAnimatingMessageIndex(null);
                        }
                      }}
                      onTyping={scrollToBottom}
                    />
                    {planCard && planCard.index === index && msg.role === "assistant" && animatingMessageIndex === null && (
                      <PlanCardTeaser planCard={planCard.card} onViewPlan={handleConfirmPlan} />
                    )}
                  </MessageWrapper>
                );
              })}
              
              {isTyping && (
                <MessageWrapper role="assistant">
                  <div className="bg-sage-wash rounded-2xl rounded-bl-md">
                    <TypingIndicator />
                  </div>
                </MessageWrapper>
              )}
              
              {options.length > 0 && animatingMessageIndex === null && !showPlanCTAs && (
                <OptionsContainer options={options} onSelect={handleOptionSelect} />
              )}
              
              {interviewComplete && planCard && (
                <MessageWrapper role="assistant">
                  <PlanCardTeaser planCard={planCard.card} onViewPlan={handleConfirmPlan} />
                </MessageWrapper>
              )}
            </ChatWrapper>
          </div>
        </main>

        {!interviewComplete && !showPlanCTAs && (
          <div className="sticky bottom-0 bg-background border-t border-border px-4 sm:px-6 py-4">
            <div className="flex items-end gap-3">
              <textarea
                ref={textareaRef}
                className={cn(
                  "flex-1 resize-none rounded-lg border border-input bg-card px-4 py-3",
                  "text-base leading-relaxed placeholder:text-muted-foreground",
                  "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                  "transition-colors duration-200",
                  "min-h-[48px] max-h-[150px]"
                )}
                data-testid="input-message"
                placeholder="Type your answer here..."
                rows={1}
                value={inputValue}
                onChange={(e) => {
                  setInputValue(e.target.value);
                  autoResize();
                }}
                onKeyDown={handleKeyDown}
                onFocus={() => {
                  if (isMobileDevice()) {
                    const scrollIntoViewport = () => {
                      if (textareaRef.current) {
                        textareaRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
                      }
                    };
                    setTimeout(scrollIntoViewport, 100);
                    setTimeout(scrollIntoViewport, 400);
                    setTimeout(scrollIntoViewport, 600);
                  }
                }}
              />
              <Button
                size="icon"
                className="h-12 w-12 shrink-0"
                data-testid="button-send"
                onClick={handleSend}
                disabled={isSending || !inputValue.trim()}
              >
                <Send className="w-5 h-5" />
              </Button>
            </div>
            {status && (
              <p className="text-sm text-destructive mt-2" data-testid="status-line">
                {status}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
