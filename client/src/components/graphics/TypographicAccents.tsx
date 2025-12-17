import { cn } from '@/lib/utils';

interface QuoteMarkProps {
  className?: string;
  position?: 'open' | 'close';
}

export function QuoteMark({ className, position = 'open' }: QuoteMarkProps) {
  return (
    <span
      className={cn(
        "font-serif text-8xl leading-none text-primary/10 select-none",
        position === 'close' && "rotate-180",
        className
      )}
      aria-hidden="true"
    >
      "
    </span>
  );
}

interface StepNumberProps {
  number: number;
  className?: string;
}

export function StepNumber({ number, className }: StepNumberProps) {
  return (
    <span
      className={cn(
        "font-serif text-7xl font-bold text-primary/10 leading-none select-none",
        className
      )}
      aria-hidden="true"
    >
      {number.toString().padStart(2, '0')}
    </span>
  );
}

interface DecorativeRuleProps {
  className?: string;
}

export function DecorativeRule({ className }: DecorativeRuleProps) {
  return (
    <div className={cn("flex items-center gap-4 my-8", className)}>
      <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
      <div className="w-2 h-2 rotate-45 border border-primary/30" />
      <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
    </div>
  );
}

interface DecorativeBracketProps {
  children: React.ReactNode;
  className?: string;
}

export function DecorativeBracket({ children, className }: DecorativeBracketProps) {
  return (
    <div className={cn("relative pl-6", className)}>
      <div
        className="absolute left-0 top-0 bottom-0 w-1 bg-primary/20 rounded-full"
        aria-hidden="true"
      />
      {children}
    </div>
  );
}

interface SectionLabelProps {
  children: React.ReactNode;
  className?: string;
}

export function SectionLabel({ children, className }: SectionLabelProps) {
  return (
    <div className={cn("flex items-center gap-4", className)}>
      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {children}
      </span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

interface PullQuoteProps {
  quote: string;
  author?: {
    name: string;
    title?: string;
  };
  className?: string;
}

export function PullQuote({ quote, author, className }: PullQuoteProps) {
  return (
    <blockquote className={cn("relative my-12 pl-8", className)}>
      <QuoteMark className="absolute -left-4 -top-4" />
      <p className="font-serif text-2xl text-foreground italic leading-relaxed">
        {quote}
      </p>
      {author && (
        <footer className="mt-4 text-sm text-muted-foreground">
          <cite className="not-italic">
            — {author.name}
            {author.title && <span>, {author.title}</span>}
          </cite>
        </footer>
      )}
      <QuoteMark position="close" className="absolute -right-4 -bottom-8" />
    </blockquote>
  );
}

export const TypographicAccents = {
  QuoteMark,
  StepNumber,
  DecorativeRule,
  DecorativeBracket,
  SectionLabel,
  PullQuote,
};

export default TypographicAccents;
