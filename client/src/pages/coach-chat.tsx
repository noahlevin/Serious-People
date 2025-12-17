import { useEffect, useState, useRef } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { UserMenu } from "@/components/UserMenu";
import { apiRequest } from "@/lib/queryClient";
import { analytics } from "@/lib/posthog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { 
  MessageComponent, 
  ChatWrapper, 
  MessageWrapper, 
  TypingIndicator,
  formatContent
} from "@/components/ChatComponents";
import { Send } from "lucide-react";

const isMobileDevice = () => {
  return window.matchMedia('(max-width: 768px)').matches || 
    ('ontouchstart' in window) || 
    (navigator.maxTouchPoints > 0);
};

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

interface SeriousPlan {
  id: string;
  status: string;
  summaryMetadata: {
    clientName?: string;
    primaryRecommendation?: string;
  } | null;
}

export default function CoachChatPage() {
  const { isAuthenticated, isLoading: authLoading, refetch } = useAuth();
  const [, setLocation] = useLocation();
  const [inputValue, setInputValue] = useState("");
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    document.title = "Coach Chat - Serious People";
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);
  
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      setLocation("/login");
    }
  }, [authLoading, isAuthenticated, setLocation]);

  const { data: plan, isLoading: planLoading } = useQuery<SeriousPlan>({
    queryKey: ['/api/serious-plan/latest'],
    enabled: isAuthenticated && !authLoading,
    retry: false,
  });

  const { data: messages, isLoading: messagesLoading, refetch: refetchMessages } = useQuery<ChatMessage[]>({
    queryKey: ['/api/coach-chat', plan?.id, 'messages'],
    enabled: !!plan?.id,
    retry: false,
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (message: string) => {
      const response = await apiRequest('POST', `/api/coach-chat/${plan!.id}/message`, { message });
      return response.json();
    },
    onSuccess: () => {
      refetchMessages();
      setInputValue("");
    },
  });

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages, sendMessageMutation.isPending]);

  const handleSend = () => {
    if (!inputValue.trim() || sendMessageMutation.isPending) return;
    if (isMobileDevice()) {
      inputRef.current?.blur();
    }
    analytics.coachChatMessageSent();
    sendMessageMutation.mutate(inputValue.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (authLoading || planLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="flex items-center justify-center min-h-[50vh]">
          <p className="font-sans text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b border-border bg-card sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2" data-testid="link-home">
              <img src="/favicon.png" alt="Serious People" className="w-8 h-8" />
              <span className="font-serif text-xl font-semibold text-foreground">Serious People</span>
            </Link>
            <UserMenu />
          </div>
        </header>
        <main className="max-w-2xl mx-auto px-4 py-16 text-center">
          <h1 className="font-serif text-headline font-semibold text-foreground mb-4">Coach Chat</h1>
          <p className="font-sans text-body text-muted-foreground mb-8">
            Complete your coaching modules and generate your Serious Plan to unlock coach chat.
          </p>
          <Link href="/progress" data-testid="link-progress">
            <Button>View Progress</Button>
          </Link>
        </main>
      </div>
    );
  }

  const clientName = plan.summaryMetadata?.clientName || 'there';

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border bg-card sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-2" data-testid="link-home">
              <img src="/favicon.png" alt="Serious People" className="w-8 h-8" />
              <span className="font-serif text-xl font-semibold text-foreground">Serious People</span>
            </Link>
            <div className="h-6 w-px bg-border" />
            <span className="font-sans text-sm text-muted-foreground">Coach Chat</span>
          </div>
          <UserMenu />
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <main className="flex-1 flex flex-col max-w-4xl mx-auto w-full">
          <div 
            className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8"
            ref={chatContainerRef}
            data-testid="chat-container"
          >
            <ChatWrapper>
              {(!messages || messages.length === 0) && !messagesLoading && (
                <MessageWrapper role="assistant">
                  <div 
                    className="max-w-[85%] w-fit px-5 py-4 text-base leading-relaxed rounded-2xl rounded-bl-md bg-sage-wash text-sage-foreground animate-message-in"
                    data-testid="message-welcome"
                  >
                    <p className="mb-2">Hi {clientName}! Now that you have your Serious Plan, I'm here if you have any questions.</p>
                    <p className="mb-2">You might want to ask about:</p>
                    <ul className="list-disc list-inside space-y-1 text-sm">
                      <li>How to prepare for a specific conversation</li>
                      <li>Clarification on any artifact in your plan</li>
                      <li>Next steps or timing advice</li>
                      <li>How to handle pushback or objections</li>
                    </ul>
                  </div>
                </MessageWrapper>
              )}

              {messages?.map((msg) => (
                <MessageWrapper key={msg.id} role={msg.role}>
                  <MessageComponent 
                    role={msg.role}
                    content={msg.content}
                    data-testid={`message-${msg.role}-${msg.id}`}
                  />
                </MessageWrapper>
              ))}

              {sendMessageMutation.isPending && (
                <MessageWrapper role="assistant">
                  <div 
                    className="max-w-[85%] w-fit rounded-2xl rounded-bl-md bg-sage-wash"
                    data-testid="message-typing"
                  >
                    <TypingIndicator />
                  </div>
                </MessageWrapper>
              )}
            </ChatWrapper>
          </div>

          <div className="border-t border-border bg-card p-4">
            <div className="flex gap-3 items-end max-w-3xl mx-auto">
              <Textarea
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => {
                  if (isMobileDevice()) {
                    setTimeout(() => {
                      inputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }, 300);
                  }
                }}
                placeholder="Ask your coach a question..."
                className="min-h-[44px] max-h-32 resize-none"
                disabled={sendMessageMutation.isPending}
                data-testid="input-message"
              />
              <Button
                onClick={handleSend}
                disabled={!inputValue.trim() || sendMessageMutation.isPending}
                size="icon"
                data-testid="button-send"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </main>

        <aside className="hidden lg:block w-72 border-l border-border bg-card p-6">
          <div className="mb-8">
            <h3 className="font-serif text-sm font-semibold text-foreground mb-3 uppercase tracking-wide">Quick Actions</h3>
            <Link 
              href="/serious-plan" 
              className="text-sm text-primary hover:underline"
              data-testid="link-serious-plan"
            >
              View Your Serious Plan
            </Link>
          </div>
          
          <div>
            <h3 className="font-serif text-sm font-semibold text-foreground mb-3 uppercase tracking-wide">Your Situation</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {plan.summaryMetadata?.primaryRecommendation || 'Navigating a career transition'}
            </p>
          </div>
        </aside>
      </div>

      {sendMessageMutation.isError && (
        <div 
          className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-destructive text-destructive-foreground px-4 py-2 rounded-lg shadow-lg text-sm"
          data-testid="error-toast"
        >
          Something went wrong. Please try again.
        </div>
      )}
    </div>
  );
}
