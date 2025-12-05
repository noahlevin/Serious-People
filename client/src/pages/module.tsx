import { useEffect, useState, useRef, useCallback } from "react";
import { Link, useLocation, useParams } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { UserMenu } from "@/components/UserMenu";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { 
  Message, 
  TypingIndicator, 
  ModuleTitleCard, 
  MessageComponent, 
  OptionsContainer,
  ModuleCompleteCard,
  extractTitleCard
} from "@/components/ChatComponents";
import { COACHING_MODULES } from "@/components/ModulesProgressCard";
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

export default function ModulePage() {
  const params = useParams<{ moduleNumber: string }>();
  const moduleNumber = parseInt(params.moduleNumber || "1", 10);
  const moduleInfo = COACHING_MODULES[moduleNumber - 1];
  
  const { isAuthenticated, isLoading: authLoading, refetch } = useAuth();
  const [, setLocation] = useLocation();
  
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

  const handleModuleComplete = () => {
    const completedModules = JSON.parse(sessionStorage.getItem(COMPLETED_MODULES_KEY) || "[]");
    if (!completedModules.includes(moduleNumber)) {
      completedModules.push(moduleNumber);
      sessionStorage.setItem(COMPLETED_MODULES_KEY, JSON.stringify(completedModules));
    }
    
    if (moduleNumber < 3) {
      setLocation("/progress");
    } else {
      setLocation("/career-brief");
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
          </div>
          <div className="sp-status-line" data-testid="status-line">{status}</div>
        </div>
      )}
    </div>
  );
}
