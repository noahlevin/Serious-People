import { useEffect, useState, useRef } from "react";
import "@/styles/serious-people.css";

export interface Message {
  role: "user" | "assistant";
  content: string;
}

export interface PlanCard {
  name: string;
  modules: { name: string; desc: string }[];
  careerBrief: string;
}

export function formatContent(content: string, skipTitleCard = false): string {
  let formatted = content;

  if (!skipTitleCard) {
    formatted = formatted.replace(/^—\s*(.+?)\s*\(est\.\s*([^)]+)\)\s*—\s*\n?/m, "");
  }

  formatted = formatted.replace(/\*\*(.+?)\*\*/g, "{{BOLD_START}}$1{{BOLD_END}}");
  formatted = formatted.replace(/<b>(.+?)<\/b>/gi, "{{BOLD_START}}$1{{BOLD_END}}");
  
  formatted = formatted
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  formatted = formatted.replace(/\{\{BOLD_START\}\}/g, "<b>");
  formatted = formatted.replace(/\{\{BOLD_END\}\}/g, "</b>");

  formatted = formatted.replace(/^- (.+)$/gm, "• $1");
  formatted = formatted.replace(/\n{3,}/g, "\n\n");
  formatted = formatted.replace(/\n/g, "<br>");
  formatted = formatted.replace(/^(<br>)+/, "");
  formatted = formatted.replace(/(<br>){3,}/g, "<br><br>");

  return formatted;
}

export function extractTitleCard(content: string): { name: string; time: string } | null {
  const match = content.match(/^—\s*(.+?)\s*\(est\.\s*([^)]+)\)\s*—/m);
  if (match) {
    return { name: match[1].trim(), time: match[2].trim() };
  }
  return null;
}

export function TypingIndicator() {
  return (
    <div className="sp-typing-indicator">
      <div className="dot"></div>
      <div className="dot"></div>
      <div className="dot"></div>
    </div>
  );
}

export function ModuleTitleCard({ name, time }: { name: string; time: string }) {
  return (
    <div className="sp-module-title-card">
      <span className="sp-module-name">{name}</span>
      <span className="sp-module-time">est. {time}</span>
    </div>
  );
}

export function PlanCardComponent({ planCard }: { planCard: PlanCard }) {
  return (
    <div className="sp-plan-card" data-testid="plan-card">
      <div className="sp-plan-card-header">
        <h3 className="sp-plan-card-title">{planCard.name}'s Coaching Plan</h3>
      </div>
      <div className="sp-plan-card-content">
        {planCard.modules.map((mod, i) => (
          <div key={i} className="sp-plan-module">
            <div className="sp-plan-module-number">Module {i + 1}</div>
            <div className="sp-plan-module-name">{mod.name}</div>
            <div className="sp-plan-module-desc">{mod.desc}</div>
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

export function MessageComponent({ 
  role, 
  content, 
  animate = false, 
  onComplete 
}: { 
  role: "user" | "assistant"; 
  content: string; 
  animate?: boolean;
  onComplete?: () => void;
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
        setTimeout(type, speed);
      } else {
        if (onComplete) onComplete();
      }
    };

    const timer = setTimeout(type, speed);
    return () => clearTimeout(timer);
  }, [animate, formattedContent, onComplete]);

  return (
    <div 
      className={`sp-message ${role}`} 
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

export function ModuleCompleteCard({
  summary,
  onComplete
}: {
  summary: string;
  onComplete: () => void;
}) {
  return (
    <div className="sp-module-complete-card" data-testid="module-complete-card">
      <div className="sp-module-complete-header">
        <h3>Module Complete</h3>
      </div>
      <div className="sp-module-complete-summary" dangerouslySetInnerHTML={{ __html: formatContent(summary) }} />
      <button
        className="sp-module-complete-btn"
        data-testid="button-complete-module"
        onClick={onComplete}
      >
        Continue to Next Step
      </button>
    </div>
  );
}
