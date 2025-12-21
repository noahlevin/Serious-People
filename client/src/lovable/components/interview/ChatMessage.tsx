import { Message } from "@/lovable/data/mockInterview";

interface ChatMessageProps {
  message: Message;
  isTyping?: boolean;
}

// Safe markdown renderer - converts markdown to HTML with sanitization
// Supports: **bold**, *italics*, unordered/ordered lists, line breaks
// Disallows: raw HTML, script tags, arbitrary HTML injection
function renderMarkdown(text: string): string {
  if (!text) return '';
  
  // Escape HTML first to prevent XSS
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
  
  // Convert markdown to HTML (order matters)
  // Bold: **text** or __text__
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');
  
  // Italics: *text* or _text_ (must come after bold)
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/_(.+?)_/g, '<em>$1</em>');
  
  // Unordered lists: lines starting with - or *
  // First, identify list blocks and wrap them
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
  
  // Line breaks: double newline becomes paragraph break, single newline preserved
  html = html.replace(/\n\n/g, '</p><p>');
  html = html.replace(/\n/g, '<br/>');
  
  // Wrap in paragraph
  html = `<p>${html}</p>`;
  
  // Clean up empty paragraphs
  html = html.replace(/<p><\/p>/g, '');
  
  return html;
}

const ChatMessage = ({ message, isTyping = false }: ChatMessageProps) => {
  const isAssistant = message.role === 'assistant';
  
  // Render markdown for assistant messages, plain text for user messages
  const renderedContent = isAssistant ? renderMarkdown(message.content) : null;
  
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
        {isAssistant && renderedContent ? (
          <div 
            className="font-chat text-foreground text-[15px] leading-relaxed sp-md"
            dangerouslySetInnerHTML={{ __html: renderedContent }}
          />
        ) : (
          <p className="font-chat text-foreground text-[15px] leading-relaxed whitespace-pre-wrap">
            {message.content}
          </p>
        )}
        {isTyping && (
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
