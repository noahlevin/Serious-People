import { useState, useRef, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/lovable/components/ui/button";
import { X } from "lucide-react";
import ChatMessage from "@/lovable/components/interview/ChatMessage";
import ChatInput from "@/lovable/components/interview/ChatInput";
import WelcomeCard from "@/lovable/components/interview/WelcomeCard";
import SectionDivider from "@/lovable/components/interview/SectionDivider";
import UpsellCard from "@/lovable/components/interview/UpsellCard";
import { Message, mockResponses, interviewQuestions, interviewSections } from "@/lovable/data/mockInterview";

// First message without the intro (welcome card handles that)
const firstQuestion: Message = {
  id: '1',
  role: 'assistant',
  content: "Let's start with the basics—tell me about your current role. What company are you with, and what's your title?",
  timestamp: new Date()
};

// Helper to persist a single message to the backend
async function persistMessage(role: string, content: string) {
  try {
    await fetch("/api/interview/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ role, content, timestamp: new Date().toISOString() }),
    });
  } catch (err) {
    console.error("[InterviewChat] Failed to persist message:", err);
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
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([firstQuestion]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [isTyping, setIsTyping] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [showUpsell, setShowUpsell] = useState(false);
  const [shownSections, setShownSections] = useState<string[]>(['context']);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const totalQuestions = interviewQuestions.length;

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, shownSections]);

  // Persist the first question on mount
  useEffect(() => {
    persistMessage('assistant', firstQuestion.content);
  }, []);

  // Check if we need to show a section divider before this question index
  const getSectionForQuestion = (qIndex: number) => {
    return interviewSections.find(s => s.startsAtQuestion === qIndex);
  };

  const handleSendMessage = (content: string) => {
    // Add user message
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, userMessage]);

    // Persist user message (fire-and-forget)
    persistMessage('user', content);

    const nextIndex = questionIndex + 1;
    setQuestionIndex(nextIndex);

    // Check if next question triggers a new section
    const nextSection = getSectionForQuestion(nextIndex);
    if (nextSection && !shownSections.includes(nextSection.id)) {
      setShownSections(prev => [...prev, nextSection.id]);
    }

    // Simulate AI typing
    setIsTyping(true);

    setTimeout(() => {
      setIsTyping(false);
      
      if (nextIndex >= totalQuestions) {
        // Final message before upsell
        const finalMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: mockResponses[7],
          timestamp: new Date()
        };
        setMessages(prev => [...prev, finalMessage]);
        
        // Persist final assistant message
        persistMessage('assistant', mockResponses[7]);
        
        setIsComplete(true);

        // Mark interview complete on the server
        markInterviewComplete();

        // Show upsell card after a delay
        setTimeout(() => {
          setShowUpsell(true);
        }, 2000);
      } else {
        // Add AI response
        const aiMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: mockResponses[nextIndex],
          timestamp: new Date()
        };
        setMessages(prev => [...prev, aiMessage]);
        
        // Persist assistant message
        persistMessage('assistant', mockResponses[nextIndex]);
      }
    }, 1500);
  };

  const handleExit = () => {
    if (window.confirm("Are you sure you want to exit? Your progress will be saved.")) {
      navigate("/interview/start");
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
          <div className="flex items-center justify-between h-16 gap-4">
            <Link to="/interview/start" className="font-display text-xl tracking-tight text-foreground shrink-0">
              Serious People
            </Link>
            
            <Button 
              variant="ghost" 
              size="sm"
              onClick={handleExit}
              className="text-muted-foreground hover:text-foreground shrink-0"
            >
              Save and Exit
              <X className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
        
        {/* Progress bar as the separator line */}
        <div className="h-[2px] bg-border relative">
          <div 
            className="absolute top-0 left-0 h-full bg-accent transition-all duration-500 ease-out"
            style={{ width: `${(questionIndex / totalQuestions) * 100}%` }}
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
