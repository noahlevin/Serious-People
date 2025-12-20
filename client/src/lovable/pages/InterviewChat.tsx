import { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import ChatMessage from "@/lovable/components/interview/ChatMessage";
import { UserMenu } from "@/components/UserMenu";
import ChatInput from "@/lovable/components/interview/ChatInput";
import WelcomeCard from "@/lovable/components/interview/WelcomeCard";
import SectionDivider from "@/lovable/components/interview/SectionDivider";
import UpsellCard from "@/lovable/components/interview/UpsellCard";
import { Message, interviewSections } from "@/lovable/data/mockInterview";

// Helper to call the interview turn endpoint (real LLM)
async function callInterviewTurn(message: string): Promise<{
  success: boolean;
  reply?: string;
  transcript?: { role: string; content: string }[];
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

const InterviewChat = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [progress, setProgress] = useState(0);
  const [isTyping, setIsTyping] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [showUpsell, setShowUpsell] = useState(false);
  const [shownSections, setShownSections] = useState<string[]>(['context']);
  const [isInitialized, setIsInitialized] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, shownSections]);

  // Initialize interview by getting first AI message
  useEffect(() => {
    if (isInitialized) return;
    setIsInitialized(true);
    
    // Get the initial greeting from the LLM
    (async () => {
      setIsTyping(true);
      const result = await callInterviewTurn("start");
      setIsTyping(false);
      
      if (result.success && result.transcript) {
        // Convert transcript to Message format
        const msgs: Message[] = result.transcript.map((t, i) => ({
          id: String(i),
          role: t.role as 'user' | 'assistant',
          content: t.content,
          timestamp: new Date(),
        }));
        setMessages(msgs);
        if (result.progress) setProgress(result.progress);
      }
    })();
  }, [isInitialized]);

  // Check if we need to show a section divider before this question index
  const getSectionForQuestion = (qIndex: number) => {
    return interviewSections.find(s => s.startsAtQuestion === qIndex);
  };

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
      // Add AI response
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: result.reply,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, aiMessage]);
      
      // Update progress if provided
      if (result.progress) setProgress(result.progress);

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

  // Build the chat content with section dividers interspersed
  const renderChatContent = () => {
    const elements: React.ReactNode[] = [];
    let messageIndex = 0;

    // Add welcome card first
    elements.push(<WelcomeCard key="welcome" />);

    // Add first section divider
    const firstSection = interviewSections[0];
    if (firstSection) {
      elements.push(
        <SectionDivider 
          key={`section-${firstSection.id}`}
          title={firstSection.title}
          subtitle={firstSection.subtitle}
        />
      );
    }

    // Now render messages, inserting section dividers as needed
    messages.forEach((message, idx) => {
      // Check if this message triggers a new section (for AI messages after question 0)
      if (message.role === 'assistant' && idx > 0) {
        // Figure out which question this corresponds to
        const assistantMessages = messages.slice(0, idx + 1).filter(m => m.role === 'assistant');
        const qIdx = assistantMessages.length - 1;
        
        const section = getSectionForQuestion(qIdx);
        if (section && section.startsAtQuestion > 0) {
          elements.push(
            <SectionDivider 
              key={`section-${section.id}`}
              title={section.title}
              subtitle={section.subtitle}
            />
          );
        }
      }

      elements.push(<ChatMessage key={message.id} message={message} />);
      messageIndex++;
    });

    return elements;
  };

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="shrink-0">
        <div className="sp-container">
          <div className="flex items-center justify-between h-12 gap-4">
            <Link to="/interview/start" className="font-display text-xl tracking-tight text-foreground shrink-0">
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
