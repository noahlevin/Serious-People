import { useEffect, useState, useRef, useCallback } from "react";
import { Link, useLocation, useParams } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useJourney, canAccessModule } from "@/hooks/useJourney";
import { UserMenu } from "@/components/UserMenu";
import { queryClient } from "@/lib/queryClient";
import { 
  Message, 
  TypingIndicator, 
  ModuleTitleCard, 
  MessageComponent, 
  OptionsContainer,
  ModuleCompleteCard,
  extractTitleCard,
  PlanCard,
  ChatWrapper,
  MessageWrapper
} from "@/components/ChatComponents";
import { DEFAULT_COACHING_MODULES } from "@/components/ModulesProgressCard";
import { analytics } from "@/lib/posthog";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import { Send } from "lucide-react";

const isMobileDevice = () => {
  return window.matchMedia('(max-width: 768px)').matches || 
    ('ontouchstart' in window) || 
    (navigator.maxTouchPoints > 0);
};

interface ModuleResponse {
  reply: string;
  done: boolean;
  progress?: number;
  options?: string[];
  summary?: string;
}

const PLAN_CARD_KEY = "serious_people_plan_card";

export default function ModulePage() {
  const params = useParams<{ moduleNumber: string }>();
  const moduleNumber = parseInt(params.moduleNumber || "1", 10) as 1 | 2 | 3;
  
  const [coachingPlan, setCoachingPlan] = useState<PlanCard | null>(null);
  
  const defaultModuleInfo = DEFAULT_COACHING_MODULES[moduleNumber - 1];
  const moduleInfo = coachingPlan?.modules?.[moduleNumber - 1] 
    ? { 
        number: moduleNumber, 
        name: coachingPlan.modules[moduleNumber - 1].name, 
        description: coachingPlan.modules[moduleNumber - 1].objective 
      }
    : defaultModuleInfo;
  
  const { isAuthenticated, isLoading: authLoading, refetch } = useAuth();
  const { journeyState, isLoading: journeyLoading, currentPath } = useJourney();
  const [, setLocation] = useLocation();
  
  useEffect(() => {
    document.title = `Module ${moduleNumber}: ${moduleInfo.name} - Serious People`;
  }, [moduleNumber, moduleInfo.name]);
  
  useEffect(() => {
    if (journeyLoading || !journeyState) return;
    
    if (!canAccessModule(journeyState, moduleNumber)) {
      setLocation(currentPath || '/interview');
    }
  }, [journeyLoading, journeyState, moduleNumber, currentPath, setLocation]);
  
  const [transcript, setTranscript] = useState<Message[]>([]);
  const [moduleComplete, setModuleComplete] = useState(false);
  const [moduleSummary, setModuleSummary] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState(0);
  const [options, setOptions] = useState<string[]>([]);
  const [animatingMessageIndex, setAnimatingMessageIndex] = useState<number | null>(null);
  const [titleCards, setTitleCards] = useState<{ index: number; name: string; time: string }[]>([]);
  
  const chatWindowRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const initializedModuleRef = useRef<number | null>(null);
  const hasRefetched = useRef(false);

  useEffect(() => {
    if (!hasRefetched.current) {
      hasRefetched.current = true;
      refetch();
    }
  }, [refetch]);

  useEffect(() => {
    const fetchCoachingPlan = async () => {
      try {
        const savedPlan = sessionStorage.getItem(PLAN_CARD_KEY);
        if (savedPlan) {
          setCoachingPlan(JSON.parse(savedPlan));
          return;
        }
        
        const response = await fetch("/api/transcript");
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
    
    if (isAuthenticated) {
      fetchCoachingPlan();
    }
  }, [isAuthenticated]);
  
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      setLocation("/login");
    }
  }, [authLoading, isAuthenticated, setLocation]);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      if (chatWindowRef.current) {
        chatWindowRef.current.scrollTop = chatWindowRef.current.scrollHeight;
      }
    });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [transcript, isTyping, options, moduleComplete, scrollToBottom]);
  
  useEffect(() => {
    if (animatingMessageIndex === null) {
      scrollToBottom();
    }
  }, [animatingMessageIndex, scrollToBottom]);

  const saveTranscript = useCallback((messages: Message[]) => {
    fetch(`/api/module/${moduleNumber}/data`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ transcript: messages }),
    }).catch(e => console.error("Failed to save module transcript:", e));
  }, [moduleNumber]);

  const autoResize = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      const newHeight = Math.min(textareaRef.current.scrollHeight, 150);
      textareaRef.current.style.height = `${newHeight}px`;
    }
  };

  const sendMessage = useCallback(async (userMessage?: string) => {
    setIsSending(true);
    setOptions([]);
    
    let currentTranscript = transcript;

    if (userMessage) {
      const newMessage: Message = { role: "user", content: userMessage };
      currentTranscript = [...transcript, newMessage];
      setTranscript(currentTranscript);
      saveTranscript(currentTranscript);
      analytics.moduleMessageSent(moduleNumber);
    }

    setIsTyping(true);
    setStatus("");

    try {
      let response: Response | null = null;
      let retryCount = 0;
      const maxRetries = 3;
      const retryDelay = 2000;
      
      while (retryCount < maxRetries) {
        response = await fetch("/api/module", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            moduleNumber,
            transcript: currentTranscript 
          }),
        });

        if (response.ok) {
          break;
        }
        
        if (response.status === 409) {
          const errorData = await response.json().catch(() => ({}));
          if (errorData.retryable) {
            retryCount++;
            if (retryCount < maxRetries) {
              console.log(`Context not ready, retrying (${retryCount}/${maxRetries})...`);
              setStatus("Loading your coaching context...");
              await new Promise(resolve => setTimeout(resolve, retryDelay));
              continue;
            }
          }
        }
        
        throw new Error("Failed to get response");
      }

      if (!response || !response.ok) {
        throw new Error("Failed to get response after retries");
      }

      const data: ModuleResponse = await response.json();

      const thinkingDelay = Math.floor(Math.random() * (1500 - 400 + 1)) + 400;
      await new Promise(resolve => setTimeout(resolve, thinkingDelay));

      setIsTyping(false);

      if (data.done) {
        setModuleComplete(true);
        setModuleSummary(data.summary || "");
        fetch(`/api/module/${moduleNumber}/data`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ 
            transcript: currentTranscript,
            summary: data.summary || "",
            complete: true 
          }),
        }).catch(e => console.error("Failed to save module completion:", e));
        analytics.moduleCompleted(moduleNumber);
        
        if (data.reply) {
          const assistantMessage: Message = { role: "assistant", content: data.reply };
          const updatedTranscript = [...currentTranscript, assistantMessage];
          setTranscript(updatedTranscript);
          saveTranscript(updatedTranscript);
          setAnimatingMessageIndex(updatedTranscript.length - 1);
        }
        return;
      }

      if (data.progress !== null && data.progress !== undefined) {
        setProgress(data.progress);
      }

      const assistantMessage: Message = { role: "assistant", content: data.reply };
      const updatedTranscript = [...currentTranscript, assistantMessage];
      setTranscript(updatedTranscript);
      saveTranscript(updatedTranscript);

      const titleCard = extractTitleCard(data.reply);
      if (titleCard) {
        setTitleCards(prev => [...prev, { index: updatedTranscript.length - 1, ...titleCard }]);
      }

      setAnimatingMessageIndex(updatedTranscript.length - 1);

      if (data.options && data.options.length > 0) {
        setOptions(data.options || []);
      }
    } catch (error) {
      console.error("Module error:", error);
      setIsTyping(false);
      setStatus("Something went wrong. Please try again.");
    } finally {
      setIsSending(false);
      if (!isMobileDevice()) {
        textareaRef.current?.focus();
      }
    }
  }, [transcript, saveTranscript, moduleNumber]);

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

  const handleModuleComplete = async () => {
    console.log("[handleModuleComplete] Starting, moduleNumber:", moduleNumber);
    
    if (moduleNumber < 3) {
      setLocation("/progress");
    } else {
      try {
        await fetch("/api/serious-plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
        });
        
        const letterResponse = await fetch("/api/serious-plan/letter", {
          credentials: "include",
        });
        
        if (letterResponse.ok) {
          const letterData = await letterResponse.json();
          if (letterData.seenAt) {
            setLocation("/serious-plan");
          } else {
            setLocation("/coach-letter");
          }
        } else {
          setLocation("/coach-letter");
        }
      } catch (err) {
        console.error("Error in module 3 completion flow:", err);
        setLocation("/coach-letter");
      }
    }
    
    const moduleName = moduleInfo?.name || `Module ${moduleNumber}`;
    fetch("/api/update-module-dossier", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        moduleNumber,
        moduleName,
        transcript
      }),
    }).then(res => {
      if (res.ok) {
        console.log(`Dossier updated with module ${moduleNumber}`);
      } else {
        console.error(`Failed to update dossier with module ${moduleNumber}`);
      }
    }).catch(err => {
      console.error("Error updating dossier:", err);
    });
    
    queryClient.invalidateQueries({ queryKey: ['/api/journey'] });
  };

  useEffect(() => {
    if (authLoading || !isAuthenticated || initializedModuleRef.current === moduleNumber) return;
    initializedModuleRef.current = moduleNumber;
    analytics.moduleStarted(moduleNumber);

    const loadModuleData = async () => {
      try {
        const response = await fetch(`/api/module/${moduleNumber}/data`, {
          credentials: "include",
        });
        
        if (response.ok) {
          const data = await response.json();
          
          if (data.transcript && data.transcript.length > 0) {
            setTranscript(data.transcript);
            
            const cards: { index: number; name: string; time: string }[] = [];
            data.transcript.forEach((msg: Message, idx: number) => {
              if (msg.role === "assistant") {
                const titleCard = extractTitleCard(msg.content);
                if (titleCard) {
                  cards.push({ index: idx, ...titleCard });
                }
              }
            });
            setTitleCards(cards);
            
            if (data.complete) {
              setModuleComplete(true);
              setProgress(100);
              if (data.summary) {
                setModuleSummary(data.summary);
              }
            }
            
            return;
          }
        }
      } catch (e) {
        console.error("Failed to load module transcript from database:", e);
      }
      
      sendMessage();
    };
    
    loadModuleData();
  }, [authLoading, isAuthenticated, moduleNumber, sendMessage]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground font-sans">Loading...</p>
      </div>
    );
  }

  if (!moduleInfo) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground font-sans">Module not found.</p>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="max-w-container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 sm:h-16 gap-2">
            <Link href="/" className="flex items-center gap-2 sm:gap-3 group shrink-0" data-testid="link-home">
              <img src="/favicon.png" alt="Serious People" className="w-7 h-7 sm:w-8 sm:h-8" />
              <div className="flex items-baseline gap-1.5 min-w-0">
                <span className="font-serif text-lg sm:text-xl font-bold tracking-tight text-foreground group-hover:text-primary transition-colors hidden sm:inline">
                  Serious People
                </span>
                <span className="font-serif text-lg font-bold tracking-tight text-foreground group-hover:text-primary transition-colors sm:hidden">
                  SP
                </span>
                <span className="text-muted-foreground text-sm hidden md:inline">·</span>
                <span className="font-sans text-sm text-muted-foreground truncate hidden md:inline">
                  Module {moduleNumber}: {moduleInfo.name}
                </span>
              </div>
            </Link>
            <UserMenu />
          </div>
        </div>
        <div className="h-1 bg-muted">
          <div 
            className="h-full bg-primary transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
            data-testid="progress-bar"
          />
        </div>
      </header>

      <div className="flex-1 flex flex-col max-w-content-wide mx-auto w-full">
        <div className="md:hidden px-4 py-3 border-b border-border bg-card/50">
          <p className="font-sans text-sm text-foreground font-medium">
            Module {moduleNumber}: {moduleInfo.name}
          </p>
        </div>

        <main className="flex-1 overflow-hidden flex flex-col">
          <div 
            ref={chatWindowRef}
            className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-6"
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
                  </MessageWrapper>
                );
              })}
              
              {isTyping && (
                <MessageWrapper role="assistant">
                  <TypingIndicator />
                </MessageWrapper>
              )}
              
              {options.length > 0 && animatingMessageIndex === null && (
                <OptionsContainer options={options} onSelect={handleOptionSelect} />
              )}
              
              {moduleComplete && animatingMessageIndex === null && (
                <ModuleCompleteCard
                  summary={moduleSummary}
                  onComplete={handleModuleComplete}
                />
              )}
            </ChatWrapper>
          </div>
        </main>

        {!moduleComplete && (
          <div className="sticky bottom-0 bg-background border-t border-border px-4 sm:px-6 lg:px-8 py-4">
            <div className="max-w-content mx-auto">
              <div className="flex items-end gap-3">
                <div className="flex-1 relative">
                  <textarea
                    ref={textareaRef}
                    className={cn(
                      "w-full resize-none rounded-xl border border-input bg-card px-4 py-3 pr-12",
                      "text-base text-foreground placeholder:text-muted-foreground",
                      "focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent",
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
                        setTimeout(() => {
                          textareaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }, 300);
                      }
                    }}
                  />
                  <button
                    className={cn(
                      "absolute right-2 bottom-2 p-2 rounded-lg",
                      "bg-primary text-primary-foreground",
                      "hover:bg-primary-hover transition-colors duration-200",
                      "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                      "disabled:opacity-50 disabled:cursor-not-allowed"
                    )}
                    data-testid="button-send"
                    onClick={handleSend}
                    disabled={isSending || !inputValue.trim()}
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
              {status && (
                <p 
                  className="mt-2 text-sm text-muted-foreground text-center"
                  data-testid="status-line"
                >
                  {status}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
