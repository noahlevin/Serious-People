import { useState, useEffect, useRef } from "react";
import { Message } from "@/lovable/data/mockInterview";

interface ChatMessageProps {
  message: Message;
  isTyping?: boolean;
  animate?: boolean;
  onAnimationComplete?: () => void;
  onContentUpdate?: () => void;
}

function renderMarkdown(text: string): string {
  if (!text) return '';
  
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
  
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');
  
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/_(.+?)_/g, '<em>$1</em>');
  
  const lines = html.split('\n');
  const result: string[] = [];
  let inList = false;
  let listType: 'ul' | 'ol' | null = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const ulMatch = line.match(/^[-*]\s+(.+)$/);
    const olMatch = line.match(/^\d+\.\s+(.+)$/);
    
    if (ulMatch) {
      if (!inList || listType !== 'ul') {
        if (inList) result.push(listType === 'ul' ? '</ul>' : '</ol>');
        result.push('<ul>');
        inList = true;
        listType = 'ul';
      }
      result.push(`<li>${ulMatch[1]}</li>`);
    } else if (olMatch) {
      if (!inList || listType !== 'ol') {
        if (inList) result.push(listType === 'ul' ? '</ul>' : '</ol>');
        result.push('<ol>');
        inList = true;
        listType = 'ol';
      }
      result.push(`<li>${olMatch[1]}</li>`);
    } else {
      if (inList) {
        result.push(listType === 'ul' ? '</ul>' : '</ol>');
        inList = false;
        listType = null;
      }
      result.push(line);
    }
  }
  if (inList) {
    result.push(listType === 'ul' ? '</ul>' : '</ol>');
  }
  
  html = result.join('\n');
  
  html = html.replace(/\n\n/g, '</p><p>');
  html = html.replace(/\n/g, '<br/>');
  
  html = `<p>${html}</p>`;
  
  html = html.replace(/<p><\/p>/g, '');
  
  return html;
}

const ChatMessage = ({ message, isTyping = false, animate = false, onAnimationComplete, onContentUpdate }: ChatMessageProps) => {
  const isAssistant = message.role === 'assistant';
  const fullContent = isAssistant ? renderMarkdown(message.content) : message.content;
  
  const [displayedContent, setDisplayedContent] = useState(animate && isAssistant ? '' : fullContent);
  const [isAnimating, setIsAnimating] = useState(animate && isAssistant);
  const indexRef = useRef(0);
  const animationRef = useRef<number | null>(null);
  
  useEffect(() => {
    if (!animate || !isAssistant || !fullContent) {
      setDisplayedContent(fullContent);
      setIsAnimating(false);
      return;
    }
    
    indexRef.current = 0;
    setDisplayedContent('');
    setIsAnimating(true);
    
    const speed = 35;
    
    const type = () => {
      if (indexRef.current < fullContent.length) {
        let increment = 1;
        const currentChar = fullContent[indexRef.current];
        
        // Skip HTML tags entirely
        if (currentChar === '<') {
          const closeIndex = fullContent.indexOf('>', indexRef.current);
          if (closeIndex !== -1) {
            increment = closeIndex - indexRef.current + 1;
          }
        } 
        // Skip HTML entities entirely
        else if (currentChar === '&') {
          const semicolonIndex = fullContent.indexOf(';', indexRef.current);
          if (semicolonIndex !== -1 && semicolonIndex - indexRef.current < 8) {
            increment = semicolonIndex - indexRef.current + 1;
          }
        }
        // For regular text, advance to end of current word
        else if (currentChar !== ' ' && currentChar !== '\n') {
          // Find the end of the current word (stop at space, newline, or HTML tag)
          let wordEnd = indexRef.current + 1;
          while (wordEnd < fullContent.length) {
            const char = fullContent[wordEnd];
            if (char === ' ' || char === '\n' || char === '<' || char === '&') {
              break;
            }
            wordEnd++;
          }
          increment = wordEnd - indexRef.current;
        }
        
        indexRef.current += increment;
        setDisplayedContent(fullContent.substring(0, indexRef.current));

        // Trigger scroll callback during animation
        if (onContentUpdate) {
          onContentUpdate();
        }

        animationRef.current = window.setTimeout(type, speed);
      } else {
        setIsAnimating(false);
        if (onAnimationComplete) {
          onAnimationComplete();
        }
      }
    };
    
    animationRef.current = window.setTimeout(type, speed);
    
    return () => {
      if (animationRef.current) {
        clearTimeout(animationRef.current);
      }
    };
  }, [animate, isAssistant, fullContent, onAnimationComplete, onContentUpdate]);
  
  return (
    <div 
      className={`flex ${isAssistant ? 'justify-start' : 'justify-end'} animate-fade-in`}
      data-testid={`message-${message.role}-${message.id}`}
    >
      <div 
        className={`max-w-[80%] md:max-w-[70%] rounded-2xl px-4 py-2.5 ${
          isAssistant 
            ? 'bg-muted' 
            : 'bg-accent/15'
        }`}
      >
        {isAssistant ? (
          <div 
            className="font-chat text-foreground text-[15px] leading-relaxed sp-md"
            dangerouslySetInnerHTML={{ __html: displayedContent }}
          />
        ) : (
          <p className="font-chat text-foreground text-[15px] leading-relaxed whitespace-pre-wrap">
            {message.content}
          </p>
        )}
        {(isTyping || (isAnimating && displayedContent.length === 0)) && (
          <span className="inline-flex ml-1 items-center">
            <span className="w-1 h-1 bg-accent/60 rounded-full animate-pulse" />
            <span className="w-1 h-1 bg-accent/60 rounded-full animate-pulse ml-0.5" style={{ animationDelay: '0.2s' }} />
            <span className="w-1 h-1 bg-accent/60 rounded-full animate-pulse ml-0.5" style={{ animationDelay: '0.4s' }} />
          </span>
        )}
      </div>
    </div>
  );
};

export default ChatMessage;
