import { useEffect, useState, useRef, useCallback } from "react";
import { Link, useLocation, useParams } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useJourney, canAccessModule } from "@/hooks/useJourney";
import { queryClient } from "@/lib/queryClient";
import { 
  Message, 
  TypingIndicator, 
  ModuleTitleCard, 
  OptionsContainer,
  ModuleCompleteCard,
  extractTitleCard,
  PlanCard,
  formatContent
} from "@/components/ChatComponents";
import ChatMessage from "@/lovable/components/interview/ChatMessage";
import ChatInput from "@/lovable/components/interview/ChatInput";
import { DEFAULT_COACHING_MODULES } from "@/components/ModulesProgressCard";
import { analytics } from "@/lib/posthog";
import "@/styles/serious-people.css";

// Detect if user is on a mobile device (for keyboard behavior)
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
  
  // Set page title
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

  // Save module transcript to database (fire-and-forget for performance)
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
      // Retry logic for handling temporary data loading issues
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
        
        // Handle 409 "Context not ready" - retry with delay
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

      setIsTyping(false);

      if (data.done) {
        setModuleComplete(true);
        setModuleSummary(data.summary || "");
        // Save module completion (summary + complete flag atomically) to database
        // Also include the full transcript to ensure all data is persisted
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
      // Only auto-focus on desktop - mobile users don't want keyboard popping up
      if (!isMobileDevice()) {
        textareaRef.current?.focus();
      }
    }
  }, [transcript, saveTranscript, moduleNumber]);

  const handleSend = () => {
    const text = inputValue.trim();
    if (text && !isSending) {
      setInputValue("");
      // Reset textarea height to default
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
        // On mobile, blur to dismiss keyboard after sending
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
    
    // Completion status already saved when module marked done (in sendMessage)
    // Navigate immediately - don't wait for API calls
    console.log("[handleModuleComplete] Navigating immediately, moduleNumber:", moduleNumber);
    
    if (moduleNumber < 3) {
      setLocation("/progress");
    } else {
      // For module 3, start plan generation and check if letter has been seen
      try {
        // Start plan generation
        await fetch("/api/serious-plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
        });
        
        // Check if letter has been seen
        const letterResponse = await fetch("/api/serious-plan/letter", {
          credentials: "include",
        });
        
        if (letterResponse.ok) {
          const letterData = await letterResponse.json();
          if (letterData.seenAt) {
            // Letter already seen, go directly to plan
            setLocation("/serious-plan");
          } else {
            // Letter not seen yet, show coach letter first
            setLocation("/coach-letter");
          }
        } else {
          // If letter endpoint fails, default to coach-letter
          setLocation("/coach-letter");
        }
      } catch (err) {
        console.error("Error in module 3 completion flow:", err);
        // Default to coach-letter on error
        setLocation("/coach-letter");
      }
    }
    
    // Update dossier in background (fire-and-forget)
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
    
    // Invalidate journey cache after navigation started
    queryClient.invalidateQueries({ queryKey: ['/api/journey'] });
  };

  useEffect(() => {
    if (authLoading || !isAuthenticated || initializedModuleRef.current === moduleNumber) return;
    initializedModuleRef.current = moduleNumber;
    analytics.moduleStarted(moduleNumber);

    // Load module data from database
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
            
            // Restore completion state from database
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
      
      // Only start fresh if no transcript exists
      sendMessage();
    };
    
    loadModuleData();
  }, [authLoading, isAuthenticated, moduleNumber, sendMessage]);

  if (authLoading) {
    return (
      <div className="sp-interview-page">
        <div className="sp-interview-main" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  if (!moduleInfo) {
    return (
      <div className="sp-interview-page">
        <div className="sp-interview-main" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p>Module not found.</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Module progress bar + context */}
      <div className="shrink-0 px-4 py-2 text-sm text-muted-foreground border-b border-border">
        Module {moduleNumber}: {moduleInfo.name}
      </div>
      <div className="h-[2px] bg-border relative shrink-0">
        <div 
          className="absolute top-0 left-0 h-full bg-accent transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="sp-interview-content flex-1 flex flex-col min-h-0">
        <main className="sp-interview-main">
          <div className="sp-chat-window" ref={chatWindowRef} data-testid="chat-window">
            {transcript.map((msg, index) => {
              const titleCard = titleCards.find(tc => tc.index === index);
              const lovableMessage = {
                id: `msg-${index}`,
                role: msg.role,
                content: msg.content,
                timestamp: new Date()
              };
              const formattedHtml = msg.role === 'assistant' ? formatContent(msg.content) : undefined;
              return (
                <div key={index} className="sp-message-wrapper-lovable">
                  {msg.role === "assistant" && titleCard && (
                    <ModuleTitleCard name={titleCard.name} time={titleCard.time} />
                  )}
                  <ChatMessage
                    message={lovableMessage}
                    htmlContent={formattedHtml}
                  />
                </div>
              );
            })}
            {isTyping && <TypingIndicator />}
            {options.length > 0 && animatingMessageIndex === null && (
              <OptionsContainer options={options} onSelect={handleOptionSelect} />
            )}
            {moduleComplete && animatingMessageIndex === null && (
              <ModuleCompleteCard
                summary={moduleSummary}
                onComplete={handleModuleComplete}
              />
            )}
          </div>
        </main>

        {!moduleComplete && (
          <div className="sp-module-input-wrapper">
            <ChatInput
              onSend={(message) => {
                setInputValue("");
                sendMessage(message);
              }}
              disabled={isSending}
              placeholder="Type your answer here..."
            />
            {status && <div className="sp-status-line" data-testid="status-line">{status}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
