import { useState, useRef, useEffect, useCallback } from "react";
import ChatMessage from "@/lovable/components/interview/ChatMessage";
import ChatInput from "@/lovable/components/interview/ChatInput";
import SectionDivider from "@/lovable/components/interview/SectionDivider";
import UpsellCard from "@/lovable/components/interview/UpsellCard";
import StructuredOutcomes from "@/lovable/components/interview/StructuredOutcomes";
import FinalNextStepsCard from "@/lovable/components/interview/FinalNextStepsCard";
import { Clock, Lock, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
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
    modules?: { slug: string; title: string; description?: string }[];  // for final_next_steps_added events
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

// SSE Event types for streaming
interface SSETokenEvent {
  text: string;
}

interface SSEDoneEvent {
  success: boolean;
  transcript?: { role: string; content: string }[];
  events?: AppEvent[];
  reply?: string;
}

interface SSEErrorEvent {
  error: string;
}

// Helper to call the streaming interview turn endpoint
async function callInterviewTurnStream(
  message: string,
  onToken: (text: string) => void,
  onDone: (data: SSEDoneEvent) => void,
  onError: (error: string) => void
): Promise<void> {
  try {
    const res = await fetch("/api/interview/turn/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ message }),
    });

    if (!res.ok) {
      const text = await res.text();
      onError(`HTTP ${res.status}: ${text}`);
      return;
    }

    if (!res.body) {
      onError("No response body");
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      let currentEvent = "";
      for (const line of lines) {
        if (line.startsWith("event: ")) {
          currentEvent = line.slice(7);
        } else if (line.startsWith("data: ")) {
          const data = line.slice(6);
          try {
            const parsed = JSON.parse(data);
            if (currentEvent === "token") {
              onToken((parsed as SSETokenEvent).text);
            } else if (currentEvent === "done") {
              onDone(parsed as SSEDoneEvent);
            } else if (currentEvent === "error") {
              onError((parsed as SSEErrorEvent).error);
            }
          } catch (e) {
            // Ignore parse errors for partial data
          }
        }
      }
    }
  } catch (err: any) {
    console.error("[InterviewChat] Stream error:", err);
    onError(err.message);
  }
}

// Helper to call the interview turn endpoint (non-streaming fallback)
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
  const [streamingHasContent, setStreamingHasContent] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [showUpsell, setShowUpsell] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Track which message indices have finished their typing animation
  // Messages loaded from server (on init) are considered already animated
  const [animatedMessageIds, setAnimatedMessageIds] = useState<Set<string>>(new Set());
  // Track message IDs that need to animate (newly added)
  const [messagesToAnimate, setMessagesToAnimate] = useState<Set<string>>(new Set());
  
  // Local optimistic selection state: survives server event replacement
  // Maps eventSeq -> optionId for selected outcomes
  const [localSelections, setLocalSelections] = useState<Map<number, string>>(new Map());

  // Calculate progress from section header events
  const sectionHeaderCount = events.filter(e => e.type === "chat.section_header_added").length;
  const progress = Math.min((sectionHeaderCount / TOTAL_SECTIONS) * 100, 100);

  // Check if a structured outcomes event has been selected (using eventSeq)
  // Checks BOTH local optimistic state AND server events
  const isOutcomeSelected = useCallback((eventSeq: number): boolean => {
    // Check local optimistic state first (instant)
    if (localSelections.has(eventSeq)) {
      return true;
    }
    // Check server events
    return events.some(e => 
      e.type === "chat.structured_outcome_selected" && 
      e.payload.eventSeq === eventSeq
    );
  }, [events, localSelections]);

  // Handle structured outcome selection (eventSeq is passed as string, converted to number)
  // Optimistic update: immediately hide pills AND add user message, then sync with server
  const handleOutcomeSelect = useCallback(async (eventSeqStr: string, optionId: string, value: string) => {
    const eventSeq = parseInt(eventSeqStr, 10);
    if (isNaN(eventSeq)) {
      console.error("[InterviewChat] Invalid eventSeq:", eventSeqStr);
      return;
    }
    
    // INSTANT: Set local selection state to hide pills immediately
    setLocalSelections(prev => new Map(prev).set(eventSeq, optionId));
    
    // Optimistic update: add user message immediately
    const optimisticMessageId = `optimistic-msg-${Date.now()}`;
    const optimisticMessage: Message = {
      id: optimisticMessageId,
      role: 'user',
      content: value,
      timestamp: new Date(),
    };
    
    setMessages(prev => [...prev, optimisticMessage]);
    setIsTyping(true);
    
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
        
        // Find the newest assistant message and mark it for animation
        const lastAssistantMsg = msgs.filter(m => m.role === 'assistant').pop();
        if (lastAssistantMsg && !animatedMessageIds.has(lastAssistantMsg.id)) {
          setMessagesToAnimate(prev => new Set(prev).add(lastAssistantMsg.id));
        }
        // Mark all user messages as animated
        setAnimatedMessageIds(prev => {
          const next = new Set(prev);
          msgs.forEach(m => {
            if (m.role === 'user') next.add(m.id);
          });
          return next;
        });
        
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
      // Remove local selection and optimistic message on failure
      setLocalSelections(prev => {
        const next = new Map(prev);
        next.delete(eventSeq);
        return next;
      });
      setMessages(prev => prev.filter(m => m.id !== optimisticMessageId));
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
      const state = await fetchInterviewState();
      
      if (state.success && state.transcript) {
        const msgs: Message[] = state.transcript.map((t, i) => ({
          id: String(i),
          role: t.role as 'user' | 'assistant',
          content: t.content,
          timestamp: new Date(),
        }));
        setMessages(msgs);
        setEvents(state.events || []);
        // Mark all loaded messages as already animated (no typewriter for history)
        const alreadyAnimated = new Set(msgs.map(m => m.id));
        setAnimatedMessageIds(alreadyAnimated);
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

    // Create placeholder assistant message for streaming
    const streamingMsgId = `streaming-${Date.now()}`;
    let streamingContent = "";

    // Add empty assistant message that will be populated via streaming
    const streamingMessage: Message = {
      id: streamingMsgId,
      role: 'assistant',
      content: "",
      timestamp: new Date()
    };
    setMessages(prev => [...prev, streamingMessage]);
    // Mark as animating (streaming tokens = live animation)
    setAnimatedMessageIds(prev => new Set(prev).add(streamingMsgId));

    await callInterviewTurnStream(
      content,
      // onToken: Update the streaming message content progressively
      (text) => {
        streamingContent += text;
        setStreamingHasContent(true);
        setMessages(prev => prev.map(m => 
          m.id === streamingMsgId 
            ? { ...m, content: streamingContent }
            : m
        ));
      },
      // onDone: Replace with final state from server
      (data) => {
        setIsTyping(false);
        setStreamingHasContent(false);
        
        if (data.success && data.transcript) {
          const msgs: Message[] = data.transcript.map((t, i) => ({
            id: String(i),
            role: t.role as 'user' | 'assistant',
            content: t.content,
            timestamp: new Date(),
          }));
          setMessages(msgs);
          
          // Mark all messages as already animated (streaming was the animation)
          setAnimatedMessageIds(new Set(msgs.map(m => m.id)));
        }
        
        if (data.events) {
          setEvents(data.events);
          
          if (data.events.some(e => e.type === "user.provided_name_set")) {
            refetch();
          }
          
          // Check for interview completion
          if (data.events.some(e => e.type === "chat.final_next_steps_added")) {
            setIsComplete(true);
            markInterviewComplete();
            setTimeout(() => setShowUpsell(true), 2000);
          }
        }
      },
      // onError: Show error message
      (error) => {
        setIsTyping(false);
        setStreamingHasContent(false);
        console.error("[InterviewChat] Stream error:", error);
        setMessages(prev => prev.map(m => 
          m.id === streamingMsgId 
            ? { ...m, content: "I'm sorry, something went wrong. Please try again." }
            : m
        ));
      }
    );
  };

  // Handle animation complete callback
  const handleAnimationComplete = useCallback((messageId: string) => {
    setAnimatedMessageIds(prev => new Set(prev).add(messageId));
    setMessagesToAnimate(prev => {
      const next = new Set(prev);
      next.delete(messageId);
      return next;
    });
  }, []);

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
        if (isOutcomeSelected(event.eventSeq)) {
          return null;
        }
        return (
          <StructuredOutcomes
            key={`event-${event.eventSeq}`}
            eventId={String(event.eventSeq)}
            options={event.payload.options}
            onSelect={handleOutcomeSelect}
            disabled={isTyping}
          />
        );
      } else if (event.type === "chat.final_next_steps_added" && event.payload.modules) {
        return (
          <FinalNextStepsCard
            key={`event-${event.eventSeq}`}
            modules={event.payload.modules}
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
      const shouldAnimate = messagesToAnimate.has(message.id);
      const isFullyAnimated = animatedMessageIds.has(message.id);
      
      elements.push(
        <ChatMessage 
          key={message.id} 
          message={message}
          animate={shouldAnimate}
          onAnimationComplete={() => handleAnimationComplete(message.id)}
        />
      );
      
      // Only render events after this message if it has finished animating
      if (isFullyAnimated || !shouldAnimate) {
        const postEvents = eventsByIndex.get(idx) || [];
        for (const event of postEvents) {
          const el = renderEvent(event);
          if (el) elements.push(el);
        }
      }
    });

    return elements;
  };

  // Show loading state while initializing
  const isLoading = !isInitialized || (messages.length === 0 && events.length === 0);

  return (
    <div className="sp-chat-page">
      {/* Progress bar */}
      <div className="h-[2px] bg-border relative shrink-0">
        <div 
          className="absolute top-0 left-0 h-full bg-accent transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
          data-testid="progress-bar"
        />
      </div>

      {/* Chat Messages - scrollable area */}
      <div className="sp-chat-scroll">
        <div className="max-w-2xl mx-auto px-4 py-6 space-y-3">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 animate-fade-in">
              <Loader2 className="h-6 w-6 text-muted-foreground animate-spin mb-3" />
              <p className="text-sm text-muted-foreground">Starting your interview...</p>
            </div>
          ) : (
            renderChatContent()
          )}
          
          {isTyping && !streamingHasContent && (
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
      </div>

      {/* Input Area - pinned to bottom */}
      <div className="sp-chat-composer">
        <ChatInput 
          onSend={handleSendMessage}
          disabled={isTyping || isComplete}
          placeholder={isComplete ? "Interview complete..." : "Type your response..."}
        />
      </div>
    </div>
  );
};

export default InterviewChat;
