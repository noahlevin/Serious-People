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
  PlanCard
} from "@/components/ChatComponents";
import { DEFAULT_COACHING_MODULES } from "@/components/ModulesProgressCard";
import "@/styles/serious-people.css";

interface ModuleResponse {
  reply: string;
  done: boolean;
  progress?: number;
  options?: string[];
  summary?: string;
}

const MODULE_STORAGE_PREFIX = "serious_people_module_";
const COMPLETED_MODULES_KEY = "serious_people_completed_modules";
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
  
  // Dev-only auto-client state
  const [isAutoClientLoading, setIsAutoClientLoading] = useState(false);
  const [isAutoPilot, setIsAutoPilot] = useState(false);
  const [autoPilotCount, setAutoPilotCount] = useState(0);
  const autoPilotCancelRef = useRef(false);
  const isDev = import.meta.env.DEV;

  const chatWindowRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const hasInitialized = useRef(false);
  const hasRefetched = useRef(false);

  const storageKey = `${MODULE_STORAGE_PREFIX}${moduleNumber}`;

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
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(messages));
    } catch (e) {
      console.error("Failed to save module transcript:", e);
    }
  }, [storageKey]);

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
    }

    setIsTyping(true);
    setStatus("");

    try {
      const response = await fetch("/api/module", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          moduleNumber,
          transcript: currentTranscript 
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to get response");
      }

      const data: ModuleResponse = await response.json();

      const thinkingDelay = Math.floor(Math.random() * (1500 - 400 + 1)) + 400;
      await new Promise(resolve => setTimeout(resolve, thinkingDelay));

      setIsTyping(false);

      if (data.done) {
        setModuleComplete(true);
        setModuleSummary(data.summary || "");
        
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
        setTimeout(() => {
          setOptions(data.options || []);
        }, data.reply.length * 12 + 100);
      }
    } catch (error) {
      console.error("Module error:", error);
      setIsTyping(false);
      setStatus("Something went wrong. Please try again.");
    } finally {
      setIsSending(false);
      textareaRef.current?.focus();
    }
  }, [transcript, saveTranscript, moduleNumber]);

  const handleSend = () => {
    const text = inputValue.trim();
    if (text && !isSending) {
      setInputValue("");
      // Reset textarea height to default
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
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

  // Dev-only: Auto-generate client response
  const handleAutoClient = useCallback(async () => {
    if (!isDev || isAutoClientLoading || isSending) return;
    
    setIsAutoClientLoading(true);
    try {
      const response = await fetch("/api/dev/auto-client", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          stage: "module",
          moduleNumber,
          transcript,
        }),
      });
      
      if (!response.ok) {
        throw new Error("Failed to generate auto-client response");
      }
      
      const data = await response.json();
      if (data.reply) {
        setInputValue(data.reply);
        // Auto-submit after a brief delay
        setTimeout(() => {
          sendMessage(data.reply);
          setInputValue("");
        }, 300);
      }
    } catch (error) {
      console.error("Auto-client error:", error);
      setStatus("Auto-client failed. Try again.");
    } finally {
      setIsAutoClientLoading(false);
    }
  }, [isDev, isAutoClientLoading, isSending, moduleNumber, transcript, sendMessage]);

  // Dev-only: Auto-pilot mode - run multiple exchanges
  const runAutoPilot = useCallback(async () => {
    if (!isDev) return;
    
    autoPilotCancelRef.current = false;
    setIsAutoPilot(true);
    setAutoPilotCount(0);
    
    const maxExchanges = 10;
    const maxWaitTime = 30000; // 30 second timeout for each exchange
    
    for (let i = 0; i < maxExchanges; i++) {
      // Check cancellation at start of each iteration
      if (autoPilotCancelRef.current) {
        break;
      }
      
      setAutoPilotCount(i + 1);
      
      // Wait for any ongoing operations to complete
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Check cancellation again after wait
      if (autoPilotCancelRef.current) break;
      
      // Generate and send auto-client response
      try {
        const response = await fetch("/api/dev/auto-client", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            stage: "module",
            moduleNumber,
            transcript,
          }),
        });
        
        if (autoPilotCancelRef.current) break;
        
        if (!response.ok) throw new Error("Auto-client failed");
        
        const data = await response.json();
        if (data.reply) {
          // Send the message and wait for response with timeout
          await new Promise<void>((resolve) => {
            sendMessage(data.reply);
            const startTime = Date.now();
            const checkInterval = setInterval(() => {
              // Check for cancellation, timeout, or completion
              if (autoPilotCancelRef.current || 
                  Date.now() - startTime > maxWaitTime ||
                  (!isSending && animatingMessageIndex === null)) {
                clearInterval(checkInterval);
                resolve();
              }
            }, 500);
          });
          
          // Check cancellation after each exchange
          if (autoPilotCancelRef.current) break;
          
          // Extra delay to let the UI settle
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (error) {
        console.error("Auto-pilot error:", error);
        break;
      }
    }
    
    setIsAutoPilot(false);
    setAutoPilotCount(0);
  }, [isDev, moduleNumber, transcript, sendMessage, isSending, animatingMessageIndex]);

  const stopAutoPilot = useCallback(() => {
    autoPilotCancelRef.current = true;
    setIsAutoPilot(false);
    setAutoPilotCount(0);
  }, []);

  const handleModuleComplete = async () => {
    const completedModules = JSON.parse(sessionStorage.getItem(COMPLETED_MODULES_KEY) || "[]");
    if (!completedModules.includes(moduleNumber)) {
      completedModules.push(moduleNumber);
      sessionStorage.setItem(COMPLETED_MODULES_KEY, JSON.stringify(completedModules));
    }
    
    // Invalidate journey cache to ensure fresh state on next page
    queryClient.invalidateQueries({ queryKey: ['/api/journey'] });
    
    // Update the client dossier with this module's completion record
    const moduleName = moduleInfo?.name || `Module ${moduleNumber}`;
    try {
      const res = await fetch("/api/update-module-dossier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          moduleNumber,
          moduleName,
          transcript
        }),
      });
      if (res.ok) {
        console.log(`Dossier updated with module ${moduleNumber}`);
      } else {
        console.error(`Failed to update dossier with module ${moduleNumber}`);
      }
    } catch (err) {
      console.error("Error updating dossier:", err);
    }
    
    if (moduleNumber < 3) {
      setLocation("/progress");
    } else {
      // For module 3, trigger plan generation immediately then navigate
      try {
        const planRes = await fetch("/api/serious-plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
        });
        if (planRes.ok) {
          console.log("Serious Plan generation started");
        } else {
          console.error("Failed to start plan generation");
        }
      } catch (err) {
        console.error("Error starting plan generation:", err);
      }
      setLocation("/serious-plan");
    }
  };

  useEffect(() => {
    if (hasInitialized.current || authLoading || !isAuthenticated) return;
    hasInitialized.current = true;

    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.length > 0) {
          setTranscript(parsed);
          
          const cards: { index: number; name: string; time: string }[] = [];
          parsed.forEach((msg: Message, idx: number) => {
            if (msg.role === "assistant") {
              const titleCard = extractTitleCard(msg.content);
              if (titleCard) {
                cards.push({ index: idx, ...titleCard });
              }
            }
          });
          setTitleCards(cards);
          return;
        }
      }
    } catch (e) {
      console.error("Failed to load module transcript:", e);
    }

    sendMessage();
  }, [authLoading, isAuthenticated, storageKey, sendMessage]);

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
    <div className="sp-interview-page">
      <header className="sp-interview-header">
        <div className="sp-header-content">
          <Link href="/" className="sp-logo-link">
            <img src="/logan-roy.png" alt="Serious People" className="sp-logo-icon" />
            <span className="sp-logo">Serious People</span>
            <span className="sp-logo-subtitle"> · Module {moduleNumber}: {moduleInfo.name}</span>
          </Link>
          <UserMenu />
        </div>
        <div className="sp-progress-bar-container">
          <div className="sp-progress-bar-fill" style={{ width: `${progress}%` }} />
        </div>
      </header>

      <div className="sp-interview-content">
        <main className="sp-interview-main">
          <div className="sp-chat-window" ref={chatWindowRef} data-testid="chat-window">
            {transcript.map((msg, index) => {
              const titleCard = titleCards.find(tc => tc.index === index);
              return (
                <div key={index} className={`sp-message-wrapper ${msg.role}`}>
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
          <div className="sp-input-area">
            <div className="sp-input-row">
              <textarea
                ref={textareaRef}
                className="sp-textarea"
                data-testid="input-message"
                placeholder="Type your answer here..."
                rows={1}
                value={inputValue}
                onChange={(e) => {
                  setInputValue(e.target.value);
                  autoResize();
                }}
                onKeyDown={handleKeyDown}
              />
              <button
                className="sp-send-button"
                data-testid="button-send"
                onClick={handleSend}
                disabled={isSending}
              >
                →
              </button>
              {isDev && (
                <button
                  className="sp-dev-button"
                  data-testid="button-auto-client"
                  onClick={handleAutoClient}
                  disabled={isAutoClientLoading || isSending}
                  title="Auto-generate client response (Dev only)"
                >
                  {isAutoClientLoading ? "..." : "🤖"}
                </button>
              )}
            </div>
            <div className="sp-status-line" data-testid="status-line">{status}</div>
          </div>
        )}
      </div>
    </div>
  );
}
