import { Message } from "@/data/mockInterview";

interface ChatMessageProps {
  message: Message;
  isTyping?: boolean;
}

const ChatMessage = ({ message, isTyping = false }: ChatMessageProps) => {
  const isAssistant = message.role === 'assistant';
  
  return (
    <div 
      className={`flex ${isAssistant ? 'justify-start' : 'justify-end'} animate-fade-in`}
    >
      <div 
        className={`max-w-[80%] md:max-w-[70%] rounded-2xl px-4 py-2.5 ${
          isAssistant 
            ? 'bg-muted' 
            : 'bg-accent/15'
        }`}
      >
        <p className="font-chat text-foreground text-[15px] leading-relaxed whitespace-pre-wrap">
          {message.content}
          {isTyping && (
            <span className="inline-flex ml-1 items-center">
              <span className="w-1 h-1 bg-accent/60 rounded-full animate-pulse" />
              <span className="w-1 h-1 bg-accent/60 rounded-full animate-pulse ml-0.5" style={{ animationDelay: '0.2s' }} />
              <span className="w-1 h-1 bg-accent/60 rounded-full animate-pulse ml-0.5" style={{ animationDelay: '0.4s' }} />
            </span>
          )}
        </p>
      </div>
    </div>
  );
};

export default ChatMessage;
