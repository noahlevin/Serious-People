# Component Library Specifications

> Complete specifications and code for all UI components. Each component includes purpose, variants, states, accessibility requirements, and full implementation.

---

## Table of Contents

1. [Button](#button)
2. [Input](#input)
3. [Card](#card)
4. [Chat Message](#chat-message)
5. [Chat Input](#chat-input)
6. [Progress Bar](#progress-bar)
7. [Section Divider](#section-divider)
8. [Welcome Card](#welcome-card)
9. [Upsell Card](#upsell-card)
10. [NavLink](#navlink)
11. [Badge](#badge)

---

## Button

### Purpose
Primary interactive element for user actions. Used for form submissions, navigation triggers, and call-to-action prompts.

### Variants

| Variant | Usage |
|---------|-------|
| `default` | Primary actions (Begin, Submit, Continue) |
| `secondary` | Secondary actions, less emphasis |
| `outline` | Tertiary actions, minimal visual weight |
| `ghost` | Inline actions, icon buttons |
| `destructive` | Dangerous actions (delete, cancel) |
| `link` | Text-style clickable elements |

### Sizes

| Size | Padding | Font Size | Height |
|------|---------|-----------|--------|
| `sm` | 12px 16px | 14px | 36px |
| `default` | 16px 24px | 16px | 44px |
| `lg` | 20px 32px | 18px | 52px |
| `icon` | 10px | - | 40px |

### Implementation

```tsx
// src/components/ui/button.tsx

import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-sm hover:bg-primary-hover active:scale-[0.98]",
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        outline:
          "border border-primary/30 bg-transparent text-primary hover:bg-primary/5 hover:border-primary/50",
        secondary:
          "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80",
        ghost: 
          "text-foreground hover:bg-muted hover:text-foreground",
        link: 
          "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-6 py-2",
        sm: "h-9 rounded-md px-4 text-sm",
        lg: "h-13 rounded-md px-8 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
```

### Usage Examples

```tsx
// Primary CTA
<Button size="lg">Begin Interview</Button>

// Secondary action
<Button variant="outline">Learn More</Button>

// With icon
<Button>
  <ArrowRight className="w-4 h-4" />
  Continue
</Button>

// Link style
<Button variant="link" asChild>
  <Link to="/guides">View all guides</Link>
</Button>
```

---

## Input

### Purpose
Text input fields for forms and data entry.

### States
- Default (resting)
- Focus (active input)
- Disabled
- Error

### Implementation

```tsx
// src/components/ui/input.tsx

import * as React from "react"
import { cn } from "@/lib/utils"

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-11 w-full rounded-md border border-border/50 bg-background px-4 py-2",
          "text-base font-sans text-foreground placeholder:text-muted-foreground",
          "transition-colors duration-200",
          "focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "file:border-0 file:bg-transparent file:text-sm file:font-medium",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
```

---

## Card

### Purpose
Container for grouped content with subtle visual separation.

### Variants

| Variant | Background | Border |
|---------|------------|--------|
| `default` | card | border/30 |
| `elevated` | card | border/50 + shadow |
| `ghost` | transparent | none |

### Implementation

```tsx
// src/components/ui/card.tsx

import * as React from "react"
import { cn } from "@/lib/utils"

const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-xl border border-border/30 bg-card text-card-foreground",
      "transition-all duration-200",
      className
    )}
    {...props}
  />
))
Card.displayName = "Card"

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 p-6", className)}
    {...props}
  />
))
CardHeader.displayName = "CardHeader"

const CardTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      "font-serif text-2xl font-semibold leading-tight tracking-tight",
      className
    )}
    {...props}
  />
))
CardTitle.displayName = "CardTitle"

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm text-muted-foreground leading-relaxed", className)}
    {...props}
  />
))
CardDescription.displayName = "CardDescription"

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
))
CardContent.displayName = "CardContent"

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-6 pt-0", className)}
    {...props}
  />
))
CardFooter.displayName = "CardFooter"

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }
```

---

## Chat Message

### Purpose
Display individual messages in the interview chat interface.

### Variants
- **Assistant**: Sage wash background, left-aligned
- **User**: Terracotta/accent background, right-aligned

### Implementation

```tsx
// src/components/interview/ChatMessage.tsx

import React from 'react';
import { cn } from '@/lib/utils';

interface ChatMessageProps {
  role: 'assistant' | 'user';
  content: string;
  timestamp?: Date;
}

const ChatMessage: React.FC<ChatMessageProps> = ({ role, content, timestamp }) => {
  const isUser = role === 'user';
  
  return (
    <div className={cn(
      "flex w-full mb-4",
      isUser ? "justify-end" : "justify-start"
    )}>
      <div className={cn(
        "max-w-[85%] md:max-w-[75%] px-4 py-3 rounded-2xl",
        "font-sans text-base leading-relaxed",
        isUser 
          ? "bg-accent/20 text-foreground rounded-br-md" 
          : "bg-sage-wash text-foreground rounded-bl-md"
      )}>
        {/* Render content - handle line breaks */}
        {content.split('\n').map((line, i) => (
          <React.Fragment key={i}>
            {line}
            {i < content.split('\n').length - 1 && <br />}
          </React.Fragment>
        ))}
        
        {/* Optional timestamp */}
        {timestamp && (
          <span className="block mt-2 text-xs text-muted-foreground">
            {timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>
    </div>
  );
};

export default ChatMessage;
```

---

## Chat Input

### Purpose
Text input with send button for chat interface.

### States
- Empty (send disabled)
- Has content (send enabled)
- Sending (loading state)

### Implementation

```tsx
// src/components/interview/ChatInput.tsx

import React, { useState, useRef, useEffect } from 'react';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

const ChatInput: React.FC<ChatInputProps> = ({ 
  onSend, 
  disabled = false,
  placeholder = "Type your response..." 
}) => {
  const [message, setMessage] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`;
    }
  }, [message]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim() && !disabled) {
      onSend(message.trim());
      setMessage('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <form 
      onSubmit={handleSubmit}
      className="flex items-end gap-3 p-4 bg-card border-t border-border/30"
    >
      <div className="flex-1 relative">
        <textarea
          ref={textareaRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          className={cn(
            "w-full resize-none rounded-xl border border-border/50 bg-background",
            "px-4 py-3 text-base font-sans",
            "placeholder:text-muted-foreground",
            "focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            "transition-colors duration-200"
          )}
        />
      </div>
      
      <Button
        type="submit"
        size="icon"
        disabled={!message.trim() || disabled}
        className="h-11 w-11 rounded-xl shrink-0"
      >
        <Send className="h-5 w-5" />
        <span className="sr-only">Send message</span>
      </Button>
    </form>
  );
};

export default ChatInput;
```

---

## Progress Bar

### Purpose
Visual indicator of interview progress through sections.

### Implementation

```tsx
// src/components/interview/ProgressBar.tsx

import React from 'react';
import { cn } from '@/lib/utils';

interface ProgressBarProps {
  currentSection: number;
  totalSections: number;
  sectionLabels?: string[];
}

const ProgressBar: React.FC<ProgressBarProps> = ({ 
  currentSection, 
  totalSections,
  sectionLabels = ['Situation', 'Challenges', 'Goals', 'Review']
}) => {
  const progress = ((currentSection) / totalSections) * 100;

  return (
    <div className="w-full px-4 py-3 bg-card border-b border-border/30">
      {/* Section labels */}
      <div className="flex justify-between mb-2">
        {sectionLabels.map((label, index) => (
          <span 
            key={label}
            className={cn(
              "text-xs font-medium transition-colors duration-200",
              index < currentSection 
                ? "text-primary" 
                : index === currentSection 
                  ? "text-foreground" 
                  : "text-muted-foreground"
            )}
          >
            {label}
          </span>
        ))}
      </div>
      
      {/* Progress track */}
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div 
          className="h-full bg-primary rounded-full transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
};

export default ProgressBar;
```

---

## Section Divider

### Purpose
Visual separator between interview sections with animated entrance.

### Implementation

```tsx
// src/components/interview/SectionDivider.tsx

import React from 'react';
import { cn } from '@/lib/utils';

interface SectionDividerProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
}

const SectionDivider: React.FC<SectionDividerProps> = ({ 
  title, 
  description,
  icon 
}) => {
  return (
    <div className="flex justify-center my-8 animate-fade-in">
      <div className={cn(
        "flex items-center gap-3 px-6 py-3",
        "bg-sage-wash rounded-full",
        "border border-primary/10"
      )}>
        {icon && (
          <span className="text-primary">{icon}</span>
        )}
        <div className="text-center">
          <span className="text-sm font-medium text-primary">
            {title}
          </span>
          {description && (
            <span className="text-xs text-muted-foreground ml-2">
              {description}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default SectionDivider;
```

---

## Welcome Card

### Purpose
Initial card shown at the start of the interview chat.

### Implementation

```tsx
// src/components/interview/WelcomeCard.tsx

import React from 'react';
import { Clock, Lock, MessageCircle } from 'lucide-react';

const WelcomeCard: React.FC = () => {
  return (
    <div className="mx-4 my-6 p-6 bg-sage-wash rounded-2xl border border-primary/10 animate-fade-in">
      <h2 className="font-serif text-xl font-semibold text-foreground mb-3">
        Welcome to your career clarity session
      </h2>
      
      <p className="text-muted-foreground text-sm leading-relaxed mb-4">
        I'm going to ask you a few questions to understand your situation. 
        There are no right or wrong answers—just share what's true for you.
      </p>
      
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5" />
          <span>~15 minutes</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Lock className="w-3.5 h-3.5" />
          <span>Private & secure</span>
        </div>
        <div className="flex items-center gap-1.5">
          <MessageCircle className="w-3.5 h-3.5" />
          <span>Conversational</span>
        </div>
      </div>
    </div>
  );
};

export default WelcomeCard;
```

---

## Upsell Card

### Purpose
Post-interview card presenting coaching offer with pricing.

### Implementation

```tsx
// src/components/interview/UpsellCard.tsx

import React from 'react';
import { Button } from '@/components/ui/button';
import { Check, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

interface UpsellCardProps {
  headline: string;
  situationType: string;
  features: string[];
  price: number;
  originalPrice?: number;
}

const UpsellCard: React.FC<UpsellCardProps> = ({
  headline,
  situationType,
  features,
  price,
  originalPrice
}) => {
  return (
    <div className="mx-4 my-6 p-6 bg-card rounded-2xl border border-border/50 shadow-subtle animate-fade-in-up">
      {/* Situation badge */}
      <div className="inline-block px-3 py-1 mb-4 text-xs font-medium text-primary bg-sage-wash rounded-full">
        {situationType}
      </div>
      
      {/* Headline */}
      <h2 className="font-serif text-2xl font-semibold text-foreground mb-3 leading-tight">
        {headline}
      </h2>
      
      {/* Features */}
      <ul className="space-y-2 mb-6">
        {features.map((feature, index) => (
          <li key={index} className="flex items-start gap-2 text-sm text-muted-foreground">
            <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
      
      {/* Pricing */}
      <div className="flex items-baseline gap-2 mb-6">
        <span className="text-3xl font-semibold text-foreground">
          ${price}
        </span>
        {originalPrice && (
          <span className="text-lg text-muted-foreground line-through">
            ${originalPrice}
          </span>
        )}
      </div>
      
      {/* CTA */}
      <Button asChild size="lg" className="w-full">
        <Link to="/checkout">
          Get Your Personalized Plan
          <ArrowRight className="w-4 h-4 ml-2" />
        </Link>
      </Button>
      
      {/* Trust signal */}
      <p className="mt-4 text-xs text-center text-muted-foreground">
        30-day money-back guarantee
      </p>
    </div>
  );
};

export default UpsellCard;
```

---

## NavLink

### Purpose
Navigation link with active state styling.

### Implementation

```tsx
// src/components/NavLink.tsx

import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface NavLinkProps {
  to: string;
  children: React.ReactNode;
  className?: string;
  activeClassName?: string;
  end?: boolean;
}

const NavLink: React.FC<NavLinkProps> = ({ 
  to, 
  children, 
  className,
  activeClassName = "text-primary font-medium",
  end = false 
}) => {
  const location = useLocation();
  const isActive = end 
    ? location.pathname === to 
    : location.pathname.startsWith(to);

  return (
    <Link
      to={to}
      className={cn(
        "transition-colors duration-200",
        className,
        isActive && activeClassName
      )}
    >
      {children}
    </Link>
  );
};

export default NavLink;
```

---

## Badge

### Purpose
Small label for categorization, status, or metadata.

### Variants
- `default`: Muted background
- `primary`: Sage background
- `secondary`: Terracotta wash
- `outline`: Border only

### Implementation

```tsx
// src/components/ui/badge.tsx

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "bg-muted text-muted-foreground",
        primary: "bg-sage-wash text-primary",
        secondary: "bg-terracotta-wash text-accent-foreground",
        outline: "border border-border text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
```

---

## Accessibility Checklist

For all components:

- [ ] Focusable elements have visible focus states
- [ ] Color contrast meets WCAG AA (4.5:1 for text)
- [ ] Interactive elements have appropriate roles
- [ ] Form inputs have associated labels
- [ ] Icons have sr-only labels or aria-labels
- [ ] Animations respect `prefers-reduced-motion`
- [ ] Touch targets are at least 44x44px on mobile
