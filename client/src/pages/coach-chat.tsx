import { useEffect, useState, useRef } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { UserMenu } from "@/components/UserMenu";
import { apiRequest, queryClient } from "@/lib/queryClient";
import "@/styles/serious-people.css";

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
      <div className="sp-page">
        <div className="sp-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh' }}>
          <p className="sp-body">Loading...</p>
        </div>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="sp-page">
        <header className="sp-success-header">
          <div className="sp-header-content">
            <Link href="/" className="sp-logo-link" data-testid="link-home">
              <img src="/logan-roy.png" alt="Serious People" className="sp-logo-icon" />
              <span className="sp-logo">Serious People</span>
            </Link>
            <UserMenu />
          </div>
        </header>
        <main className="sp-container">
          <div className="sp-graduation-note" style={{ textAlign: 'center' }}>
            <h1 className="sp-headline" style={{ marginBottom: '1rem' }}>Coach Chat</h1>
            <p className="sp-body" style={{ marginBottom: '2rem' }}>
              Complete your coaching modules and generate your Serious Plan to unlock coach chat.
            </p>
            <Link href="/progress" className="sp-button sp-button-primary" data-testid="link-progress">
              View Progress
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const clientName = plan.summaryMetadata?.clientName || 'there';

  return (
    <div className="sp-interview-page">
      <header className="sp-interview-header">
        <div className="sp-header-content">
          <div className="sp-header-left">
            <Link href="/" className="sp-logo-link" data-testid="link-home">
              <img src="/logan-roy.png" alt="Serious People" className="sp-logo-icon" />
              <span className="sp-logo">Serious People</span>
            </Link>
            <div className="sp-header-separator"></div>
            <div className="sp-header-subtitle">Coach Chat</div>
          </div>
          <UserMenu />
        </div>
      </header>

      <div className="sp-interview-content">
        <main className="sp-interview-main">
          <div 
            className="sp-chat-container" 
            ref={chatContainerRef}
            data-testid="chat-container"
          >
            {(!messages || messages.length === 0) && !messagesLoading && (
              <div className="sp-message sp-message-assistant" data-testid="message-welcome">
                <div className="sp-message-content">
                  <p>Hi {clientName}! Now that you have your Serious Plan, I'm here if you have any questions.</p>
                  <p style={{ marginTop: '0.5rem' }}>You might want to ask about:</p>
                  <ul style={{ marginTop: '0.5rem', marginLeft: '1rem' }}>
                    <li>How to prepare for a specific conversation</li>
                    <li>Clarification on any artifact in your plan</li>
                    <li>Next steps or timing advice</li>
                    <li>How to handle pushback or objections</li>
                  </ul>
                </div>
              </div>
            )}

            {messages?.map((msg) => (
              <div 
                key={msg.id} 
                className={`sp-message sp-message-${msg.role}`}
                data-testid={`message-${msg.role}-${msg.id}`}
              >
                <div className="sp-message-content">
                  {msg.content.split('\n').map((line, i) => (
                    line.trim() ? <p key={i}>{line}</p> : <br key={i} />
                  ))}
                </div>
              </div>
            ))}

            {sendMessageMutation.isPending && (
              <div className="sp-message sp-message-assistant" data-testid="message-typing">
                <div className="sp-message-content">
                  <span className="sp-typing-indicator">
                    <span></span><span></span><span></span>
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="sp-input-area">
            <div className="sp-input-row">
              <textarea
                ref={inputRef}
                className="sp-input"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask your coach a question..."
                rows={1}
                disabled={sendMessageMutation.isPending}
                data-testid="input-message"
              />
              <button
                className="sp-send-button"
                onClick={handleSend}
                disabled={!inputValue.trim() || sendMessageMutation.isPending}
                data-testid="button-send"
              >
                Send
              </button>
            </div>
          </div>
        </main>

        <aside className="sp-chat-sidebar">
          <div className="sp-sidebar-section">
            <h3 className="sp-sidebar-title">Quick Actions</h3>
            <Link 
              href="/serious-plan" 
              className="sp-sidebar-link"
              data-testid="link-serious-plan"
            >
              View Your Serious Plan
            </Link>
          </div>
          
          <div className="sp-sidebar-section">
            <h3 className="sp-sidebar-title">Your Situation</h3>
            <p className="sp-sidebar-text">
              {plan.summaryMetadata?.primaryRecommendation || 'Navigating a career transition'}
            </p>
          </div>
        </aside>
      </div>

      {sendMessageMutation.isError && (
        <div className="sp-error-toast" data-testid="error-toast">
          Something went wrong. Please try again.
        </div>
      )}
    </div>
  );
}
