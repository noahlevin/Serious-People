import { useEffect, useState, useRef, useCallback } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { UserMenu } from "@/components/UserMenu";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { formatContent } from "@/components/ChatComponents";
import "@/styles/serious-people.css";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface PlanCard {
  name: string;
  modules: { name: string; objective: string; approach: string; outcome: string }[];
  careerBrief: string;
}

interface InterviewResponse {
  reply: string;
  done: boolean;
  valueBullets?: string;
  socialProof?: string;
  progress?: number;
  options?: string[];
  planCard?: PlanCard;
}

interface PricingData {
  originalPrice: number;
  discountedPrice: number | null;
  percentOff: number | null;
  amountOff: number | null;
  currency: string;
}

const STORAGE_KEY = "serious_people_transcript";
const PROGRESS_KEY = "serious_people_progress";

const TEST_TRANSCRIPT: Message[] = [
  { role: "assistant", content: "Hello! I'm here to help you prepare for some important career conversations. Before we write your scripts, I'd like to understand your situation better.\n\nWhat's prompting you to think about a career change right now?" },
  { role: "user", content: "I've been at my company for 3 years and I feel stuck. My manager keeps promising a promotion but it never happens." },
  { role: "assistant", content: "Three years is significant, and broken promises around promotion are frustrating. That erodes trust.\n\nWhat role are you in currently, and what's the promotion you've been waiting for?" },
  { role: "user", content: "I'm a senior software engineer. The promotion would be to staff engineer, which comes with a significant pay bump and more autonomy." },
  { role: "assistant", content: "Staff engineer is a meaningful step up. The autonomy piece is often as important as the money.\n\nHave you had direct conversations with your manager about specific criteria for the promotion?" },
  { role: "user", content: "Yes, we've had several. Each time they say I'm 'almost there' but the goalposts keep moving. First it was completing a big project, then it was 'demonstrating leadership,' now it's some vague thing about 'executive presence.'" },
  { role: "assistant", content: "Moving goalposts are a classic stalling tactic. The shift from concrete deliverables to vague qualities like 'executive presence' is particularly telling.\n\nDo you have a sense of whether this is your manager's decision, or if they're getting blocked from above?" },
  { role: "user", content: "I think my manager wants to promote me but their boss is the blocker. My skip-level seems to have favorites and I'm not one of them." },
  { role: "assistant", content: "Politics at the skip level is tough because you have less direct influence there. This context is helpful.\n\nWhat's your financial situation? Could you afford to leave without another job lined up, or do you need to line something up first?" },
  { role: "user", content: "I have about 6 months of expenses saved. I could leave but I'd rather have something lined up. My partner is supportive but nervous about me quitting without a plan." },
  { role: "assistant", content: "Six months gives you some runway, and your partner's concern is reasonable. Having a plan matters for both practical and relationship reasons.\n\nWhat does your partner do for work? Understanding your household situation helps me write a better script for that conversation." },
  { role: "user", content: "She's a teacher. Stable income but not enough to cover all our expenses alone. We have a mortgage and a young kid." },
  { role: "assistant", content: "Stable but not sufficient on its own—that means you need a plan, not an impulse exit. The mortgage and kid add real stakes.\n\nAre you already job searching, or is that something you'd start after we clarify your strategy?" },
  { role: "user", content: "I've been casually looking for a few months. Had a few interviews but nothing has clicked yet. I think I'm underselling myself." },
  { role: "assistant", content: "Underselling yourself is common when you've been overlooked internally—it messes with your sense of your own value.\n\nWhat would an ideal next role look like for you? Same type of work at a better company, or something different?" },
  { role: "user", content: "Same technical work but at a company with clearer growth paths. I want to make staff engineer within a year or two and eventually move toward engineering management." },
  { role: "assistant", content: "Clear growth path to staff, eventual move to management—that's a solid trajectory. It's also a compelling story for interviews.\n\nLast question: What's your timeline? When do you want to have made a decision or a move by?" },
  { role: "user", content: "I'd like to have an offer in hand within the next 3 months. If not, I might need to have a harder conversation with my current company about my future there." },
  { role: "assistant", content: "Three months to secure an offer, with a fallback plan to have a frank conversation if needed. That's actionable.\n\nI think I have enough to write your scripts now. Ready to see them?" }
];

const TEST_VALUE_BULLETS = `- Address the promotion stall with concrete next steps, not vague promises
- Give your partner confidence with a clear 3-month timeline and financial safety net
- Articulate your staff engineer trajectory to command better offers
- Prepare a diplomatic but firm exit conversation if the job search doesn't pan out`;

const TEST_SOCIAL_PROOF = `This is a fraction of what a single session with a career coach typically costs ($150–300/hour)—and you'll leave with a structured document, not just a conversation.`;

function extractTitleCard(content: string): { name: string; time: string } | null {
  const match = content.match(/^—\s*(.+?)\s*\(est\.\s*([^)]+)\)\s*—/m);
  if (match) {
    return { name: match[1].trim(), time: match[2].trim() };
  }
  return null;
}

function TypingIndicator() {
  return (
    <div className="sp-typing-indicator">
      <div className="dot"></div>
      <div className="dot"></div>
      <div className="dot"></div>
    </div>
  );
}

function ModuleTitleCard({ name, time }: { name: string; time: string }) {
  return (
    <div className="sp-module-title-card">
      <span className="sp-module-name">{name}</span>
      <span className="sp-module-time">est. {time}</span>
    </div>
  );
}

function PlanCardComponent({ planCard }: { planCard: PlanCard }) {
  return (
    <div className="sp-plan-card sp-card-animate" data-testid="plan-card">
      <div className="sp-plan-card-header">
        <h3 className="sp-plan-card-title">{planCard.name}'s Coaching Plan</h3>
      </div>
      <div className="sp-plan-card-content">
        {planCard.modules.map((mod, i) => (
          <div key={i} className="sp-plan-module" data-testid={`plan-module-${i + 1}`}>
            <div className="sp-plan-module-number">Module {i + 1}</div>
            <div className="sp-plan-module-name">{mod.name}</div>
            <div className="sp-plan-module-details">
              <div className="sp-plan-module-objective">{mod.objective}</div>
              {mod.outcome && (
                <div className="sp-plan-module-outcome">
                  <span className="sp-outcome-label">You'll walk away with:</span> {mod.outcome}
                </div>
              )}
            </div>
          </div>
        ))}
        <div className="sp-plan-career-brief">
          <div className="sp-plan-career-brief-header">
            <span className="sp-plan-career-brief-title">Your Career Brief</span>
          </div>
          <div className="sp-plan-career-brief-desc">{planCard.careerBrief}</div>
        </div>
      </div>
    </div>
  );
}

function MessageComponent({ 
  role, 
  content, 
  animate = false, 
  onComplete,
  onTyping
}: { 
  role: "user" | "assistant"; 
  content: string; 
  animate?: boolean;
  onComplete?: () => void;
  onTyping?: () => void;
}) {
  const [displayedContent, setDisplayedContent] = useState(animate ? "" : formatContent(content, role === "user"));
  const indexRef = useRef(0);
  const formattedContent = formatContent(content, role === "user");

  useEffect(() => {
    if (!animate) {
      if (onComplete) onComplete();
      return;
    }

    const speed = 12;
    
    const type = () => {
      if (indexRef.current < formattedContent.length) {
        let increment = 1;
        
        if (formattedContent.substring(indexRef.current, indexRef.current + 4) === "<br>") {
          increment = 4;
        } else if (formattedContent[indexRef.current] === "&") {
          const semicolonIndex = formattedContent.indexOf(";", indexRef.current);
          if (semicolonIndex !== -1 && semicolonIndex - indexRef.current < 8) {
            increment = semicolonIndex - indexRef.current + 1;
          }
        } else if (formattedContent[indexRef.current] === "<") {
          const closeIndex = formattedContent.indexOf(">", indexRef.current);
          if (closeIndex !== -1) {
            increment = closeIndex - indexRef.current + 1;
          }
        }

        indexRef.current += increment;
        setDisplayedContent(formattedContent.substring(0, indexRef.current));
        
        // Call onTyping for real-time scroll during animation
        if (onTyping) onTyping();
        
        setTimeout(type, speed);
      } else {
        if (onComplete) onComplete();
      }
    };

    const timer = setTimeout(type, speed);
    return () => clearTimeout(timer);
  }, [animate, formattedContent, onComplete, onTyping]);

  return (
    <div 
      className={`sp-message ${role}`} 
      dangerouslySetInnerHTML={{ __html: displayedContent }}
    />
  );
}

function OptionsContainer({ 
  options, 
  onSelect 
}: { 
  options: string[]; 
  onSelect: (option: string) => void;
}) {
  return (
    <div className="sp-options-container" data-testid="options-container">
      {options.map((option, index) => (
        <button
          key={index}
          className="sp-option-pill"
          data-testid={`option-pill-${index}`}
          onClick={() => onSelect(option)}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

function Paywall({ 
  valueBullets, 
  socialProof, 
  onCheckout, 
  isLoading,
  pricing
}: { 
  valueBullets?: string; 
  socialProof?: string;
  onCheckout: () => void;
  isLoading: boolean;
  pricing?: PricingData;
}) {
  const bullets = valueBullets
    ? valueBullets.trim().split("\n").filter(line => line.trim().startsWith("-")).map(line => line.replace(/^-\s*/, "").trim())
    : [];

  const hasDiscount = pricing && pricing.discountedPrice !== null && pricing.discountedPrice < pricing.originalPrice;
  const displayPrice = hasDiscount ? pricing.discountedPrice : (pricing?.originalPrice ?? 49);
  const originalPrice = pricing?.originalPrice ?? 49;

  return (
    <div className="sp-paywall-inline sp-card-animate" data-testid="paywall">
      <div className="sp-paywall-card">
        <h3>Ready to work the plan?</h3>
        <p>
          We've mapped out a custom 3-module coaching session plus your Career Brief.
        </p>
        {bullets.length > 0 && (
          <div className="sp-reasons">
            <p className="intro">Why you'll benefit from this program:</p>
            <ul>
              {bullets.map((bullet, i) => (
                <li key={i} dangerouslySetInnerHTML={{ __html: formatContent(bullet, { skipBulletConversion: true, skipLineBreaks: true }) }} />
              ))}
            </ul>
          </div>
        )}
        {socialProof && <div className="sp-social-proof" dangerouslySetInnerHTML={{ __html: formatContent(socialProof, { skipBulletConversion: true }) }} />}
        <button
          className="sp-checkout-button"
          data-testid="button-checkout"
          onClick={onCheckout}
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <span className="sp-spinner"></span>Redirecting...
            </>
          ) : (
            <>
              Let's Work the Plan – {hasDiscount ? (
                <>
                  <span className="sp-button-price-original">${originalPrice}</span>
                  <span className="sp-button-price-discounted">${displayPrice}</span>
                </>
              ) : (
                `$${displayPrice}`
              )}
            </>
          )}
        </button>
        <div className="sp-price-note">
          Payment handled securely via Stripe.{hasDiscount && " Discount pre-applied."}
        </div>
      </div>
    </div>
  );
}

export default function Interview() {
  const { isAuthenticated, isLoading: authLoading, refetch } = useAuth();
  const [, setLocation] = useLocation();
  
  // Set page title
  useEffect(() => {
    document.title = "Career Interview - Serious People";
  }, []);
  
  const { data: pricing } = useQuery<PricingData>({
    queryKey: ["/api/pricing"],
    staleTime: 60000,
  });
  
  const [transcript, setTranscript] = useState<Message[]>([]);
  const [interviewComplete, setInterviewComplete] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isCheckoutLoading, setIsCheckoutLoading] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState(0);
  const [currentModule, setCurrentModule] = useState("Interview");
  const [options, setOptions] = useState<string[]>([]);
  const [planCard, setPlanCard] = useState<{ card: PlanCard; index: number } | null>(null);
  const [valueBullets, setValueBullets] = useState<string>("");
  const [socialProof, setSocialProof] = useState<string>("");
  const [animatingMessageIndex, setAnimatingMessageIndex] = useState<number | null>(null);
  const [titleCards, setTitleCards] = useState<{ index: number; name: string; time: string }[]>([]);
  const [paymentVerified, setPaymentVerified] = useState(false);
  
  // Dev-only auto-client state
  const [isAutoClientLoading, setIsAutoClientLoading] = useState(false);
  const [isAutoPilot, setIsAutoPilot] = useState(false);
  const [autoPilotCount, setAutoPilotCount] = useState(0);
  const autoPilotCancelRef = useRef(false);
  const isDev = import.meta.env.DEV;

  const chatWindowRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const hasInitialized = useRef(false);
  const moduleJustChanged = useRef(false);
  const hasRefetched = useRef(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSaveRef = useRef<{
    messages: Message[];
    extraData?: {
      currentModule?: string;
      progress?: number;
      interviewComplete?: boolean;
      paymentVerified?: boolean;
      valueBullets?: string;
      socialProof?: string;
      planCard?: PlanCard | null;
    };
  } | null>(null);
  
  // Force refetch auth status on mount (in case of stale cache after OAuth redirect)
  useEffect(() => {
    if (!hasRefetched.current) {
      hasRefetched.current = true;
      refetch();
    }
  }, [refetch]);
  
  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      setLocation("/login");
    }
  }, [authLoading, isAuthenticated, setLocation]);
  
  // Save transcript to server mutation
  const saveTranscriptMutation = useMutation({
    mutationFn: async (data: {
      transcript: Message[];
      currentModule: string;
      progress: number;
      interviewComplete: boolean;
      paymentVerified: boolean;
      valueBullets?: string;
      socialProof?: string;
      planCard?: PlanCard | null;
    }) => {
      const response = await apiRequest("POST", "/api/transcript", data);
      return response.json();
    },
  });

  const scrollToBottom = useCallback(() => {
    // Use requestAnimationFrame to ensure DOM has updated before scrolling
    requestAnimationFrame(() => {
      if (chatWindowRef.current) {
        chatWindowRef.current.scrollTop = chatWindowRef.current.scrollHeight;
      }
    });
  }, []);

  // Scroll to bottom whenever new content is added
  useEffect(() => {
    scrollToBottom();
  }, [transcript, isTyping, options, planCard, interviewComplete, scrollToBottom]);
  
  // Also scroll when message animation completes
  useEffect(() => {
    if (animatingMessageIndex === null) {
      scrollToBottom();
    }
  }, [animatingMessageIndex, scrollToBottom]);

  const saveTranscript = useCallback((messages: Message[], extraData?: {
    currentModule?: string;
    progress?: number;
    interviewComplete?: boolean;
    paymentVerified?: boolean;
    valueBullets?: string;
    socialProof?: string;
    planCard?: PlanCard | null;
  }) => {
    // Always save to sessionStorage immediately
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch (e) {
      console.error("Failed to save transcript:", e);
    }
    
    // Throttle server saves to prevent excessive API calls (debounce 1 second)
    if (isAuthenticated) {
      pendingSaveRef.current = { messages, extraData };
      
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      
      saveTimeoutRef.current = setTimeout(() => {
        const pending = pendingSaveRef.current;
        if (pending) {
          saveTranscriptMutation.mutate({
            transcript: pending.messages,
            currentModule: pending.extraData?.currentModule || currentModule,
            progress: pending.extraData?.progress ?? progress,
            interviewComplete: pending.extraData?.interviewComplete ?? interviewComplete,
            paymentVerified: pending.extraData?.paymentVerified ?? paymentVerified,
            valueBullets: pending.extraData?.valueBullets || valueBullets || undefined,
            socialProof: pending.extraData?.socialProof || socialProof || undefined,
            planCard: pending.extraData?.planCard !== undefined ? pending.extraData.planCard : (planCard?.card || null),
          }, {
            onError: (error) => {
              console.error("Failed to save transcript to server:", error);
            },
          });
          pendingSaveRef.current = null;
        }
      }, 1000);
    }
  }, [isAuthenticated, currentModule, progress, interviewComplete, paymentVerified, valueBullets, socialProof, planCard, saveTranscriptMutation]);

  const saveProgress = useCallback((value: number) => {
    try {
      sessionStorage.setItem(PROGRESS_KEY, value.toString());
    } catch (e) {
      console.error("Failed to save progress:", e);
    }
  }, []);

  const updateProgress = useCallback((value: number, forceReset = false) => {
    if (value >= 0 && value <= 100) {
      setProgress(prev => {
        if (forceReset || value >= prev) {
          saveProgress(value);
          return value;
        }
        return prev;
      });
    }
  }, [saveProgress]);

  const detectAndUpdateModule = useCallback((content: string) => {
    const moduleMatch = content.match(/^—\s*(.+?)\s*\(est\./m);
    if (moduleMatch) {
      const moduleName = moduleMatch[1].trim();
      setCurrentModule(prev => {
        if (moduleName !== prev) {
          moduleJustChanged.current = true;
          updateProgress(5, true);
          return moduleName;
        }
        return prev;
      });
      return true;
    }
    return false;
  }, [updateProgress]);

  const handleTestBypass = useCallback(() => {
    setTranscript(TEST_TRANSCRIPT);
    saveTranscript(TEST_TRANSCRIPT);
    updateProgress(100);
    setInterviewComplete(true);
    setValueBullets(TEST_VALUE_BULLETS);
    setSocialProof(TEST_SOCIAL_PROOF);
    setStatus("");
    
    const cards: { index: number; name: string; time: string }[] = [];
    TEST_TRANSCRIPT.forEach((msg, idx) => {
      if (msg.role === "assistant") {
        const titleCard = extractTitleCard(msg.content);
        if (titleCard) {
          cards.push({ index: idx, ...titleCard });
        }
      }
    });
    setTitleCards(cards);
  }, [saveTranscript, updateProgress]);

  const sendMessage = useCallback(async (userMessage?: string) => {
    if (userMessage?.toLowerCase() === "testskip") {
      handleTestBypass();
      return;
    }

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
      const response = await fetch("/interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: currentTranscript }),
      });

      if (!response.ok) {
        throw new Error("Failed to get response");
      }

      const data: InterviewResponse = await response.json();

      const thinkingDelay = Math.floor(Math.random() * (1500 - 400 + 1)) + 400;
      await new Promise(resolve => setTimeout(resolve, thinkingDelay));

      setIsTyping(false);

      // When interview is complete (paywall time), DON'T add AI's response to transcript
      // The AI often includes Module 1 content in the same response as [[INTERVIEW_COMPLETE]]
      // We want to show only the paywall after the user's confirmation
      if (data.done) {
        setInterviewComplete(true);
        setValueBullets(data.valueBullets || "");
        setSocialProof(data.socialProof || "");
        setStatus("");
        // Don't append the reply, don't update progress, don't show options
        // The paywall will render inline after the user's confirmation message
        return;
      }

      detectAndUpdateModule(data.reply);

      if (data.progress !== null && data.progress !== undefined) {
        if (!moduleJustChanged.current) {
          updateProgress(data.progress);
        }
        moduleJustChanged.current = false;
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

      if (data.planCard?.name) {
        setPlanCard({ card: data.planCard, index: updatedTranscript.length - 1 });
        // Save plan card to sessionStorage for success page
        try {
          sessionStorage.setItem("serious_people_plan_card", JSON.stringify(data.planCard));
        } catch (e) {
          console.error("Failed to save plan card to sessionStorage:", e);
        }
      }

      if (data.options && data.options.length > 0) {
        setOptions(data.options || []);
      }
    } catch (error) {
      console.error("Interview error:", error);
      setIsTyping(false);
      setStatus("Something went wrong. Please try again.");
    } finally {
      setIsSending(false);
      textareaRef.current?.focus();
    }
  }, [transcript, saveTranscript, detectAndUpdateModule, updateProgress, handleTestBypass]);

  const handleCheckout = async () => {
    setIsCheckoutLoading(true);

    try {
      // Check for promo code in URL (e.g., ?promo=FRIENDS100)
      const urlParams = new URLSearchParams(window.location.search);
      const promoCode = urlParams.get('promo');
      
      const response = await fetch("/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ promoCode: promoCode || undefined }),
      });

      const data = await response.json();

      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error(data.error || "Failed to create checkout session");
      }
    } catch (error) {
      console.error("Checkout error:", error);
      alert("Something went wrong. Please try again.");
      setIsCheckoutLoading(false);
    }
  };

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
          stage: "interview",
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
  }, [isDev, isAutoClientLoading, isSending, transcript, sendMessage]);

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
            stage: "interview",
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
  }, [isDev, transcript, sendMessage, isSending, animatingMessageIndex]);

  const stopAutoPilot = useCallback(() => {
    autoPilotCancelRef.current = true;
    setIsAutoPilot(false);
    setAutoPilotCount(0);
  }, []);

  // Load transcript from server or sessionStorage on initialization
  useEffect(() => {
    if (hasInitialized.current || authLoading) return;
    if (!isAuthenticated) return; // Wait for auth check
    
    hasInitialized.current = true;

    const loadTranscript = async () => {
      try {
        // Try to load from server first
        const response = await fetch("/api/transcript", { credentials: "include" });
        if (response.ok) {
          const data = await response.json();
          if (data.transcript && Array.isArray(data.transcript) && data.transcript.length > 0) {
            // Restore from server
            setTranscript(data.transcript);
            setProgress(data.progress || 0);
            setCurrentModule(data.currentModule || "Interview");
            setInterviewComplete(data.interviewComplete || false);
            setPaymentVerified(data.paymentVerified || false);
            if (data.valueBullets) setValueBullets(data.valueBullets);
            if (data.socialProof) setSocialProof(data.socialProof);
            if (data.planCard) {
              // Find the last assistant message index for the plan card
              const lastAssistantIdx = data.transcript.reduce((acc: number, msg: Message, idx: number) => 
                msg.role === "assistant" ? idx : acc, -1);
              setPlanCard({ card: data.planCard, index: lastAssistantIdx });
            }
            
            // Extract title cards from transcript
            const cards: { index: number; name: string; time: string }[] = [];
            data.transcript.forEach((msg: Message, idx: number) => {
              if (msg.role === "assistant") {
                detectAndUpdateModule(msg.content);
                const titleCard = extractTitleCard(msg.content);
                if (titleCard) {
                  cards.push({ index: idx, ...titleCard });
                }
              }
            });
            setTitleCards(cards);
            
            // Also sync to sessionStorage
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data.transcript));
            sessionStorage.setItem(PROGRESS_KEY, (data.progress || 0).toString());
            return;
          }
        }
      } catch (e) {
        console.error("Failed to load transcript from server:", e);
      }
      
      // Fallback to sessionStorage
      try {
        const savedProgress = sessionStorage.getItem(PROGRESS_KEY);
        if (savedProgress) {
          const value = parseInt(savedProgress, 10);
          if (!isNaN(value) && value >= 0 && value <= 100) {
            setProgress(value);
          }
        }
      } catch (e) {
        console.error("Failed to load progress:", e);
      }

      try {
        const saved = sessionStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed: Message[] = JSON.parse(saved);
          setTranscript(parsed);

          const cards: { index: number; name: string; time: string }[] = [];
          parsed.forEach((msg, idx) => {
            if (msg.role === "assistant") {
              detectAndUpdateModule(msg.content);
              const titleCard = extractTitleCard(msg.content);
              if (titleCard) {
                cards.push({ index: idx, ...titleCard });
              }
            }
          });
          setTitleCards(cards);

          const lastResponse = parsed.filter(t => t.role === "assistant").pop();
          if (lastResponse && lastResponse.content.includes("I think I have enough")) {
            setInterviewComplete(true);
          }
        } else {
          sendMessage();
        }
      } catch (e) {
        console.error("Failed to load transcript:", e);
        sendMessage();
      }
    };
    
    loadTranscript();
  }, [authLoading, isAuthenticated, detectAndUpdateModule, sendMessage]);

  const autoResize = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      const newHeight = Math.min(textareaRef.current.scrollHeight, 150);
      textareaRef.current.style.height = newHeight + "px";
    }
  };

  // Show loading state while checking auth
  if (authLoading) {
    return (
      <div className="sp-interview-page">
        <div className="sp-interview-main" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p>Loading...</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="sp-interview-page">
      <header className="sp-interview-header">
        <div className="sp-header-content">
          <Link href="/" className="sp-logo-link">
            <img src="/favicon.png" alt="Serious People" className="sp-logo-icon" />
            <span className="sp-logo">Serious People</span>
            <span className="sp-logo-subtitle"> · {currentModule}</span>
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
                  {planCard && planCard.index === index && msg.role === "assistant" && animatingMessageIndex === null && (
                    <PlanCardComponent planCard={planCard.card} />
                  )}
                </div>
              );
            })}
            {isTyping && <TypingIndicator />}
            {options.length > 0 && animatingMessageIndex === null && (
              <OptionsContainer options={options} onSelect={handleOptionSelect} />
            )}
            {interviewComplete && (
              <Paywall
                valueBullets={valueBullets}
                socialProof={socialProof}
                onCheckout={handleCheckout}
                isLoading={isCheckoutLoading}
                pricing={pricing}
              />
            )}
          </div>
        </main>

        {!interviewComplete && (
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
