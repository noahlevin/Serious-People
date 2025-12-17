import { useEffect, useState, useRef } from "react";
import { cn } from "@/lib/utils";

export interface Message {
  role: "user" | "assistant";
  content: string;
}

export interface CoachingModule {
  name: string;
  objective: string;
  approach: string;
  outcome: string;
}

export interface PlanCard {
  name: string;
  modules: CoachingModule[];
  careerBrief: string;
}

interface FormatOptions {
  skipTitleCard?: boolean;
  skipBulletConversion?: boolean;
  skipLineBreaks?: boolean;
}

export function formatContent(content: string, optionsOrSkipTitleCard: FormatOptions | boolean = false): string {
  let formatted = content;
  
  const options: FormatOptions = typeof optionsOrSkipTitleCard === 'boolean' 
    ? { skipTitleCard: optionsOrSkipTitleCard }
    : optionsOrSkipTitleCard;

  formatted = formatted.replace(/\[\[PROVIDED_NAME:[^\]]+\]\]\n?/g, "");

  if (!options.skipTitleCard) {
    formatted = formatted.replace(/^—\s*(.+?)\s*\(est\.\s*([^)]+)\)\s*—\s*\n?/m, "");
  }

  formatted = formatted.replace(/\*\*(.+?)\*\*/g, "{{BOLD_START}}$1{{BOLD_END}}");
  formatted = formatted.replace(/\*([^*]+?)\*/g, "{{ITALIC_START}}$1{{ITALIC_END}}");
  formatted = formatted.replace(/<b>(.+?)<\/b>/gi, "{{BOLD_START}}$1{{BOLD_END}}");
  formatted = formatted.replace(/<i>(.+?)<\/i>/gi, "{{ITALIC_START}}$1{{ITALIC_END}}");
  
  formatted = formatted
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  formatted = formatted.replace(/\{\{BOLD_START\}\}/g, "<b>");
  formatted = formatted.replace(/\{\{BOLD_END\}\}/g, "</b>");
  formatted = formatted.replace(/\{\{ITALIC_START\}\}/g, "<i>");
  formatted = formatted.replace(/\{\{ITALIC_END\}\}/g, "</i>");
  formatted = formatted.replace(/^---+$/gm, "<hr>");
  
  if (!options.skipBulletConversion) {
    formatted = formatted.replace(/^- (.+)$/gm, "• $1");
    formatted = formatted.replace(/^• ?$/gm, "");
    
    const lines = formatted.split('\n');
    const processedLines: string[] = [];
    let inList = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const isBullet = line.trim().startsWith('• ');
      
      if (isBullet) {
        if (!inList) {
          processedLines.push('<ul class="chat-list">');
          inList = true;
        }
        const bulletContent = line.trim().substring(2);
        processedLines.push(`<li>${bulletContent}</li>`);
      } else {
        if (inList) {
          processedLines.push('</ul>');
          inList = false;
        }
        processedLines.push(line);
      }
    }
    
    if (inList) {
      processedLines.push('</ul>');
    }
    
    formatted = processedLines.join('\n');
  }
  
  if (!options.skipLineBreaks) {
    formatted = formatted.replace(/\n{3,}/g, "\n\n");
    formatted = formatted.replace(/\n/g, "<br>");
    formatted = formatted.replace(/^(<br>)+/, "");
    formatted = formatted.replace(/(<br>){3,}/g, "<br><br>");
    formatted = formatted.replace(/<br><ul/g, "<ul");
    formatted = formatted.replace(/<\/ul><br>/g, "</ul>");
    formatted = formatted.replace(/<br><li>/g, "<li>");
    formatted = formatted.replace(/<\/li><br>/g, "</li>");
    formatted = formatted.replace(/(?<!<br>)<br><b>/g, " <b>");
    formatted = formatted.replace(/<\/b><br>(?!<ul|<br>|\d+\.)/g, "</b> ");
    formatted = formatted.replace(/(?<!<br>)<br><i>/g, " <i>");
    formatted = formatted.replace(/<\/i><br>(?!<ul|<br>|\d+\.)/g, "</i> ");
  }

  return formatted;
}

export function extractTitleCard(content: string): { name: string; time: string } | null {
  const match = content.match(/^(?:#+ )?—\s*(.+?)\s*\(est\.\s*([^)]+)\)\s*—/m);
  if (match) {
    return { name: match[1].trim(), time: match[2].trim() };
  }
  
  const altMatch = content.match(/MODULE\s*\d*:?\s*(.+?)[\n\r]+.*?(?:Estimated\s+Time|est\.?)[:.]?\s*(\d+[-–]\d+\s*minutes)/im);
  if (altMatch) {
    return { name: altMatch[1].trim(), time: altMatch[2].trim() };
  }
  
  return null;
}

export function TypingIndicator() {
  return (
    <div className="flex items-center gap-1.5 px-4 py-3">
      <div className="w-2 h-2 rounded-full bg-primary/60 animate-pulse-dot" style={{ animationDelay: '0ms' }} />
      <div className="w-2 h-2 rounded-full bg-primary/60 animate-pulse-dot" style={{ animationDelay: '200ms' }} />
      <div className="w-2 h-2 rounded-full bg-primary/60 animate-pulse-dot" style={{ animationDelay: '400ms' }} />
    </div>
  );
}

export function ModuleTitleCard({ name, time }: { name: string; time: string }) {
  return (
    <div className="text-center py-6 px-8 my-4 mx-auto max-w-[85%]">
      <div className="w-16 h-px bg-primary mx-auto mb-4" />
      <span className="font-serif text-lg font-semibold tracking-wide uppercase text-foreground block mb-1">
        {name}
      </span>
      <span className="font-sans text-sm italic text-muted-foreground">
        est. {time}
      </span>
      <div className="w-16 h-px bg-primary mx-auto mt-4" />
    </div>
  );
}

export function PlanCardComponent({ planCard }: { planCard: PlanCard }) {
  return (
    <div 
      className="w-full max-w-[520px] mx-auto my-6 bg-card border-2 border-primary rounded-lg shadow-lg relative"
      data-testid="plan-card"
    >
      <div className="absolute inset-0 translate-x-2 translate-y-2 bg-primary rounded-lg -z-10" />
      
      <div className="bg-primary text-primary-foreground px-6 py-5 text-center rounded-t-lg">
        <h3 className="font-serif text-xl font-semibold tracking-wide">
          {planCard.name}'s Coaching Plan
        </h3>
      </div>
      
      <div className="p-6">
        {planCard.modules.map((mod, i) => (
          <div 
            key={i} 
            className="py-4 border-b border-border last:border-b-0"
            data-testid={`plan-module-${i + 1}`}
          >
            <div className="font-serif text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-1">
              Module {i + 1}
            </div>
            <div className="font-serif text-lg font-semibold text-foreground mb-2">
              {mod.name}
            </div>
            <div className="text-sm text-muted-foreground leading-relaxed mb-2">
              {mod.objective}
            </div>
            {mod.outcome && (
              <div className="text-sm text-muted-foreground italic">
                <span className="font-semibold not-italic text-foreground">You'll walk away with:</span> {mod.outcome}
              </div>
            )}
          </div>
        ))}
        
        <div className="mt-4 p-4 bg-sage-wash rounded-md border-y border-border">
          <div className="flex items-center justify-center gap-3 mb-2">
            <div className="h-px w-6 bg-primary" />
            <span className="font-serif text-sm font-semibold tracking-wide text-foreground">
              Your Career Brief
            </span>
            <div className="h-px w-6 bg-primary" />
          </div>
          <div className="text-sm text-muted-foreground leading-relaxed text-center">
            {planCard.careerBrief}
          </div>
        </div>
      </div>
    </div>
  );
}

interface MessageComponentProps {
  role: "user" | "assistant";
  content: string;
  animate?: boolean;
  onComplete?: () => void;
  onTyping?: () => void;
}

export function MessageComponent({ 
  role, 
  content, 
  animate = false, 
  onComplete,
  onTyping
}: MessageComponentProps) {
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
      className={cn(
        "max-w-[85%] w-fit px-5 py-4 text-base leading-relaxed whitespace-pre-wrap rounded-2xl animate-message-in motion-reduce:animate-none",
        "chat-bubble",
        role === "assistant" && "bg-sage-wash text-sage-foreground rounded-bl-md",
        role === "user" && "bg-terracotta-wash text-terracotta-foreground rounded-br-md ml-auto"
      )}
      dangerouslySetInnerHTML={{ __html: displayedContent }}
    />
  );
}

export function OptionsContainer({ 
  options, 
  onSelect 
}: { 
  options: string[]; 
  onSelect: (option: string) => void;
}) {
  return (
    <div 
      className="flex flex-wrap gap-2 mt-4"
      data-testid="options-container"
    >
      {options.map((option, index) => (
        <button
          key={index}
          className={cn(
            "px-4 py-2.5 rounded-full text-sm font-medium",
            "bg-card border border-border text-foreground",
            "hover:bg-sage-wash hover:border-primary/30 transition-all duration-200",
            "focus:outline-none focus:ring-2 focus:ring-primary/20"
          )}
          data-testid={`option-pill-${index}`}
          onClick={() => onSelect(option)}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

export function ModuleCompleteCard({
  summary,
  onComplete
}: {
  summary: string;
  onComplete: () => void | Promise<void>;
}) {
  const [isLoading, setIsLoading] = useState(false);
  
  const handleClick = async () => {
    setIsLoading(true);
    try {
      await onComplete();
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <div 
      className="w-full max-w-[480px] mx-auto my-6 bg-card border border-border rounded-lg shadow-md overflow-hidden"
      data-testid="module-complete-card"
    >
      <div className="bg-primary text-primary-foreground px-6 py-4 text-center">
        <h3 className="font-serif text-lg font-semibold">Module Complete</h3>
      </div>
      
      <div 
        className="p-6 text-muted-foreground leading-relaxed chat-bubble"
        dangerouslySetInnerHTML={{ __html: formatContent(summary) }} 
      />
      
      <div className="px-6 pb-6">
        <button
          className={cn(
            "w-full py-3.5 px-6 rounded-lg font-medium text-base",
            "bg-primary text-primary-foreground",
            "hover:bg-primary-hover transition-colors duration-200",
            "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
            "disabled:opacity-50 disabled:cursor-not-allowed"
          )}
          data-testid="button-complete-module"
          onClick={handleClick}
          disabled={isLoading}
        >
          {isLoading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
              Loading...
            </span>
          ) : (
            "Continue to Next Step"
          )}
        </button>
      </div>
    </div>
  );
}

export function SectionDivider({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-4 my-8">
      <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
      {label && (
        <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          {label}
        </span>
      )}
      <div className="w-2 h-2 rotate-45 border border-primary/30" />
      {!label && (
        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
      )}
    </div>
  );
}

export function ChatWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-5 py-4">
      {children}
    </div>
  );
}

export function MessageWrapper({ 
  children, 
  role 
}: { 
  children: React.ReactNode; 
  role: "user" | "assistant";
}) {
  return (
    <div className={cn(
      "flex flex-col",
      role === "assistant" && "items-start",
      role === "user" && "items-end"
    )}>
      {children}
    </div>
  );
}
