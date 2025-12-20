import { useState, useRef, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import ChatMessage from "@/lovable/components/interview/ChatMessage";
import { UserMenu } from "@/components/UserMenu";
import ChatInput from "@/lovable/components/interview/ChatInput";
import SectionDivider from "@/lovable/components/interview/SectionDivider";
import UpsellCard from "@/lovable/components/interview/UpsellCard";
import StructuredOutcomes from "@/lovable/components/interview/StructuredOutcomes";
import { Clock, Lock } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

// Types for events from server
interface StructuredOption {
  id: string;
  label: string;
  value: string;
}

interface AppEvent {
  id: string;  // UUID
  eventSeq: number;  // Canonical numeric identifier used for selection
  stream: string;
  type: string;
  payload: {
    render: { afterMessageIndex: number };
    title?: string;
    subtitle?: string;
    name?: string;  // for user.provided_name_set events
    prompt?: string;  // for structured_outcomes_added events
    options?: StructuredOption[];  // for structured_outcomes_added events
    eventSeq?: number;  // for structured_outcome_selected events (references outcomes event)
    optionId?: string;  // for structured_outcome_selected events
  };
  createdAt: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

// Total sections for progress calculation
const TOTAL_SECTIONS = 4;

// Helper to fetch interview state
async function fetchInterviewState(): Promise<{
  success: boolean;
  transcript?: { role: string; content: string }[];
  events?: AppEvent[];
  error?: string;
}> {
  try {
    const res = await fetch("/api/interview/state", {
      method: "GET",
      credentials: "include",
    });
    if (!res.ok) {
      const text = await res.text();
      return { success: false, error: `HTTP ${res.status}: ${text}` };
    }
    return res.json();
  } catch (err: any) {
    console.error("[InterviewChat] Failed to fetch state:", err);
    return { success: false, error: err.message };
  }
}

// Helper to call the interview turn endpoint (real LLM)
async function callInterviewTurn(message: string): Promise<{
  success: boolean;
  reply?: string;
  transcript?: { role: string; content: string }[];
  events?: AppEvent[];
  done?: boolean;
  progress?: number;
  planCard?: any;
  error?: string;
}> {
  try {
    const res = await fetch("/api/interview/turn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ message }),
    });
    if (!res.ok) {
      const text = await res.text();
      return { success: false, error: `HTTP ${res.status}: ${text}` };
    }
    return res.json();
  } catch (err: any) {
    console.error("[InterviewChat] Failed to call interview turn:", err);
    return { success: false, error: err.message };
  }
}

// Helper to mark interview complete
async function markInterviewComplete() {
  try {
    const res = await fetch("/api/interview/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    });
    return res.ok;
  } catch (err) {
    console.error("[InterviewChat] Failed to mark interview complete:", err);
    return false;
  }
}

// Title card component (rendered from events)
const TitleCard = ({ title, subtitle }: { title: string; subtitle?: string }) => {
  return (
    <div className="animate-fade-in mb-6">
      <div className="bg-muted/50 rounded-2xl p-6">
        <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
          Intake Interview
        </p>
        <h1 className="font-display text-2xl md:text-3xl text-foreground mb-3">
          {title}
        </h1>
        {subtitle && (
          <p className="text-muted-foreground text-[15px] leading-relaxed max-w-md mb-4">
            {subtitle}
          </p>
        )}
        
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            <span>~15 minutes</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Lock className="h-3.5 w-3.5" />
            <span>Confidential</span>
          </div>
        </div>
      </div>
    </div>
  );
};

const InterviewChat = () => {
  const { refetch } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [events, setEvents] = useState<AppEvent[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [showUpsell, setShowUpsell] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Calculate progress from section header events
  const sectionHeaderCount = events.filter(e => e.type === "chat.section_header_added").length;
  const progress = Math.min((sectionHeaderCount / TOTAL_SECTIONS) * 100, 100);

  // Check if a structured outcomes event has been selected (using eventSeq)
  const isOutcomeSelected = useCallback((eventSeq: number): boolean => {
    return events.some(e => 
      e.type === "chat.structured_outcome_selected" && 
      e.payload.eventSeq === eventSeq
    );
  }, [events]);

  // Handle structured outcome selection (eventSeq is passed as string, converted to number)
  const handleOutcomeSelect = useCallback(async (eventSeqStr: string, optionId: string) => {
    setIsTyping(true);
    
    const eventSeq = parseInt(eventSeqStr, 10);
    if (isNaN(eventSeq)) {
      console.error("[InterviewChat] Invalid eventSeq:", eventSeqStr);
      setIsTyping(false);
      return;
    }
    
    try {
      const res = await fetch("/api/interview/outcomes/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ eventSeq, optionId }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text}`);
      }

      const result = await res.json();
      
      if (result.success && result.transcript) {
        const msgs: Message[] = result.transcript.map((t: any, i: number) => ({
          id: String(i),
          role: t.role as 'user' | 'assistant',
          content: t.content,
          timestamp: new Date(),
        }));
        setMessages(msgs);
        
        if (result.events) {
          setEvents(result.events);
          if (result.events.some((e: AppEvent) => e.type === "user.provided_name_set")) {
            refetch();
          }
        }

        if (result.done) {
          setIsComplete(true);
          markInterviewComplete();
          setTimeout(() => setShowUpsell(true), 2000);
        }
      }
    } catch (error) {
      console.error("[InterviewChat] Outcome selection failed:", error);
    } finally {
      setIsTyping(false);
    }
  }, [refetch]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, events]);

  // Initialize interview by fetching state or starting fresh
  useEffect(() => {
    if (isInitialized) return;
    setIsInitialized(true);
    
    (async () => {
      // First try to load existing state
      const state = await fetchInterviewState();
      
      if (state.success && state.transcript && state.transcript.length > 0) {
        // Existing session - load from server
        const msgs: Message[] = state.transcript.map((t, i) => ({
          id: String(i),
          role: t.role as 'user' | 'assistant',
          content: t.content,
          timestamp: new Date(),
        }));
        setMessages(msgs);
        setEvents(state.events || []);
      } else {
        // No existing session - start fresh by calling turn
        setIsTyping(true);
        const result = await callInterviewTurn("start");
        setIsTyping(false);
        
        if (result.success && result.transcript) {
          const msgs: Message[] = result.transcript.map((t, i) => ({
            id: String(i),
            role: t.role as 'user' | 'assistant',
            content: t.content,
            timestamp: new Date(),
          }));
          setMessages(msgs);
          setEvents(result.events || []);
        }
      }
    })();
  }, [isInitialized]);

  const handleSendMessage = async (content: string) => {
    // Add user message optimistically
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, userMessage]);
    setIsTyping(true);

    // Call the real LLM endpoint
    const result = await callInterviewTurn(content);
    setIsTyping(false);

    if (result.success && result.reply) {
      // Update from server transcript (authority)
      if (result.transcript) {
        const msgs: Message[] = result.transcript.map((t, i) => ({
          id: String(i),
          role: t.role as 'user' | 'assistant',
          content: t.content,
          timestamp: new Date(),
        }));
        setMessages(msgs);
      } else {
        // Fallback: add AI response locally
        const aiMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: result.reply,
          timestamp: new Date()
        };
        setMessages(prev => [...prev, aiMessage]);
      }
      
      // Replace events from server (authority)
      if (result.events) {
        setEvents(result.events);
        
        // If name was set, refetch auth to update UserMenu
        if (result.events.some(e => e.type === "user.provided_name_set")) {
          refetch();
        }
      }

      // Check if interview is complete
      if (result.done) {
        setIsComplete(true);
        markInterviewComplete();
        
        // Show upsell card after a delay
        setTimeout(() => {
          setShowUpsell(true);
        }, 2000);
      }
    } else {
      // Show error in chat
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: "I'm sorry, something went wrong. Please try again.",
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    }
  };

  // Build the chat content with events interspersed based on afterMessageIndex
  const renderChatContent = () => {
    const elements: React.ReactNode[] = [];

    // Group events by afterMessageIndex
    const eventsByIndex = new Map<number, AppEvent[]>();
    for (const event of events) {
      const idx = event.payload?.render?.afterMessageIndex ?? -1;
      if (!eventsByIndex.has(idx)) {
        eventsByIndex.set(idx, []);
      }
      eventsByIndex.get(idx)!.push(event);
    }

    // Helper to render an event
    const renderEvent = (event: AppEvent) => {
      if (event.type === "chat.title_card_added" && event.payload.title) {
        return (
          <TitleCard
            key={`event-${event.id}`}
            title={event.payload.title}
            subtitle={event.payload.subtitle}
          />
        );
      } else if (event.type === "chat.section_header_added" && event.payload.title) {
        return (
          <SectionDivider
            key={`event-${event.id}`}
            title={event.payload.title}
            subtitle={event.payload.subtitle}
          />
        );
      } else if (event.type === "chat.structured_outcomes_added" && event.payload.options) {
        return (
          <StructuredOutcomes
            key={`event-${event.eventSeq}`}
            eventId={String(event.eventSeq)}
            prompt={event.payload.prompt}
            options={event.payload.options}
            onSelect={handleOutcomeSelect}
            disabled={isOutcomeSelected(event.eventSeq) || isTyping}
          />
        );
      }
      return null;
    };

    // Render events with afterMessageIndex === -1 first (before any messages)
    const preEvents = eventsByIndex.get(-1) || [];
    for (const event of preEvents) {
      const el = renderEvent(event);
      if (el) elements.push(el);
    }

    // Render messages, inserting events after each message as needed
    messages.forEach((message, idx) => {
      elements.push(<ChatMessage key={message.id} message={message} />);
      
      // Render events that should appear after this message
      const postEvents = eventsByIndex.get(idx) || [];
      for (const event of postEvents) {
        const el = renderEvent(event);
        if (el) elements.push(el);
      }
    });

    return elements;
  };

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="shrink-0">
        <div className="sp-container">
          <div className="flex items-center justify-between h-12 gap-4">
            <Link to="/interview/start" className="font-display text-xl tracking-tight text-foreground shrink-0" data-testid="link-logo">
              Serious People
            </Link>
            <UserMenu />
          </div>
        </div>
        
        {/* Progress bar as the separator line */}
        <div className="h-[2px] bg-border relative">
          <div 
            className="absolute top-0 left-0 h-full bg-accent transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
            data-testid="progress-bar"
          />
        </div>
      </header>

      {/* Chat Messages */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-6 space-y-3">
          {renderChatContent()}
          
          {isTyping && (
            <ChatMessage 
              message={{
                id: 'typing',
                role: 'assistant',
                content: '',
                timestamp: new Date()
              }}
              isTyping={true}
            />
          )}
          
          {isComplete && !showUpsell && (
            <div className="text-center py-8 animate-fade-in">
              <div className="inline-flex items-center gap-2 text-muted-foreground">
                <div className="w-2 h-2 bg-accent rounded-full animate-pulse" />
                <span className="text-sm">Analyzing your responses...</span>
              </div>
            </div>
          )}

          {showUpsell && (
            <div className="py-6">
              <UpsellCard userName="Sarah" />
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* Input Area */}
      <ChatInput 
        onSend={handleSendMessage}
        disabled={isTyping || isComplete}
        placeholder={isComplete ? "Interview complete..." : "Type your response..."}
      />
    </div>
  );
};

export default InterviewChat;
