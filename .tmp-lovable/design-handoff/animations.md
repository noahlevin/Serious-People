# Animation System

> Complete motion design specifications including scroll reveals, hover interactions, page transitions, and micro-interactions.

---

## Design Principles

### The Philosophy of Motion

Our animation approach embodies "Quiet Confidence":

1. **Subtle over dramatic** — Animations should feel like gentle revelations, not performances
2. **Purposeful** — Every animation serves a function (reveal, feedback, guidance)
3. **Natural timing** — Easing curves that feel organic, not mechanical
4. **Respectful** — Honor `prefers-reduced-motion` settings

### Timing Guidelines

| Type | Duration | Use Case |
|------|----------|----------|
| Micro | 100-200ms | Button hovers, focus states |
| Standard | 200-400ms | Content reveals, transitions |
| Emphasis | 400-600ms | Hero entrances, important moments |
| Slow | 600-1000ms | SVG drawings, complex sequences |

### Easing Curves

```css
/* Standard easing */
--ease-out: cubic-bezier(0.16, 1, 0.3, 1);      /* For entrances */
--ease-in: cubic-bezier(0.4, 0, 1, 1);          /* For exits */
--ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);    /* For state changes */

/* Special curves */
--ease-out-back: cubic-bezier(0.34, 1.56, 0.64, 1);  /* Slight overshoot */
--ease-spring: cubic-bezier(0.175, 0.885, 0.32, 1.1); /* Bouncy feel */
```

---

## Scroll Reveal System

### The useScrollReveal Hook

This hook powers our scroll-triggered animations.

```tsx
// src/hooks/useScrollReveal.ts

import { useEffect, useRef, useState } from 'react';

interface UseScrollRevealOptions {
  threshold?: number;
  rootMargin?: string;
  triggerOnce?: boolean;
}

export const useScrollReveal = (options: UseScrollRevealOptions = {}) => {
  const {
    threshold = 0.1,
    rootMargin = '0px 0px -50px 0px',
    triggerOnce = true
  } = options;

  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    // Respect reduced motion preference
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          if (triggerOnce) {
            observer.unobserve(element);
          }
        } else if (!triggerOnce) {
          setIsVisible(false);
        }
      },
      { threshold, rootMargin }
    );

    observer.observe(element);

    return () => observer.disconnect();
  }, [threshold, rootMargin, triggerOnce]);

  return { ref, isVisible };
};
```

### Usage Pattern

```tsx
import { useScrollReveal } from '@/hooks/useScrollReveal';
import { cn } from '@/lib/utils';

const RevealSection = ({ children }) => {
  const { ref, isVisible } = useScrollReveal();

  return (
    <div
      ref={ref}
      className={cn(
        "transition-all duration-700 ease-out",
        isVisible
          ? "opacity-100 translate-y-0"
          : "opacity-0 translate-y-8"
      )}
    >
      {children}
    </div>
  );
};
```

### Staggered Reveals

For lists or grids with staggered entrance:

```tsx
const StaggeredList = ({ items }) => {
  const { ref, isVisible } = useScrollReveal();

  return (
    <div ref={ref} className="grid grid-cols-3 gap-6">
      {items.map((item, index) => (
        <div
          key={item.id}
          className={cn(
            "transition-all duration-500 ease-out",
            isVisible
              ? "opacity-100 translate-y-0"
              : "opacity-0 translate-y-8"
          )}
          style={{
            transitionDelay: isVisible ? `${index * 100}ms` : '0ms'
          }}
        >
          {item.content}
        </div>
      ))}
    </div>
  );
};
```

---

## Hover Interactions

### Button Hover

```css
/* Primary button */
.btn-primary {
  transition: all 200ms ease;
}

.btn-primary:hover {
  background-color: hsl(var(--primary-hover));
  transform: translateY(-1px);
}

.btn-primary:active {
  transform: scale(0.98);
}
```

### Link Underline Animation

```css
.link-animated {
  position: relative;
  text-decoration: none;
}

.link-animated::after {
  content: '';
  position: absolute;
  bottom: -2px;
  left: 0;
  width: 100%;
  height: 1px;
  background-color: currentColor;
  transform: scaleX(0);
  transform-origin: right;
  transition: transform 300ms ease;
}

.link-animated:hover::after {
  transform: scaleX(1);
  transform-origin: left;
}
```

### Card Hover

```css
.card-interactive {
  transition: all 200ms ease;
}

.card-interactive:hover {
  border-color: hsl(var(--primary) / 0.3);
  background-color: hsl(var(--card));
  box-shadow: 0 4px 12px -2px hsl(var(--primary) / 0.08);
}
```

### Implementation in React

```tsx
// Animated link component
const AnimatedLink = ({ to, children }) => (
  <Link
    to={to}
    className="relative text-foreground hover:text-primary transition-colors duration-200 group"
  >
    {children}
    <span className="absolute bottom-0 left-0 w-full h-px bg-primary transform scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left" />
  </Link>
);
```

---

## Page Transitions

### Simple Fade

For basic page transitions:

```tsx
// Wrap page content
const PageWrapper = ({ children }) => (
  <div className="animate-fade-in">
    {children}
  </div>
);
```

### Delayed Content Reveal

For pages with multiple sections:

```tsx
const Page = () => (
  <div className="animate-fade-in">
    <header style={{ animationDelay: '0ms' }}>
      {/* Header content */}
    </header>
    
    <section 
      className="animate-fade-in-up"
      style={{ animationDelay: '100ms' }}
    >
      {/* First section */}
    </section>
    
    <section 
      className="animate-fade-in-up"
      style={{ animationDelay: '200ms' }}
    >
      {/* Second section */}
    </section>
  </div>
);
```

---

## Chat Animations

### Message Entrance

```css
@keyframes message-in {
  from {
    opacity: 0;
    transform: translateY(10px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.chat-message {
  animation: message-in 300ms ease-out forwards;
}
```

### Typing Indicator

```tsx
const TypingIndicator = () => (
  <div className="flex gap-1 px-4 py-3 bg-sage-wash rounded-2xl rounded-bl-md w-fit">
    {[0, 1, 2].map((i) => (
      <span
        key={i}
        className="w-2 h-2 bg-primary/40 rounded-full animate-pulse-dot"
        style={{ animationDelay: `${i * 200}ms` }}
      />
    ))}
  </div>
);
```

```css
@keyframes pulse-dot {
  0%, 100% {
    opacity: 0.4;
    transform: scale(0.8);
  }
  50% {
    opacity: 1;
    transform: scale(1);
  }
}

.animate-pulse-dot {
  animation: pulse-dot 1.4s ease-in-out infinite;
}
```

### Section Divider Entrance

```tsx
const SectionDivider = ({ title }) => (
  <div className="flex justify-center my-8 animate-fade-in">
    <div className="flex items-center gap-3 px-6 py-3 bg-sage-wash rounded-full border border-primary/10">
      <span className="text-sm font-medium text-primary">{title}</span>
    </div>
  </div>
);
```

---

## Decorative Animations

### Floating Elements

```css
@keyframes float {
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-10px);
  }
}

@keyframes float-delayed {
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-15px);
  }
}

.animate-float {
  animation: float 6s ease-in-out infinite;
}

.animate-float-delayed {
  animation: float-delayed 8s ease-in-out infinite;
}
```

### SVG Path Drawing

```css
@keyframes draw-line {
  from {
    stroke-dashoffset: 1000;
  }
  to {
    stroke-dashoffset: 0;
  }
}

.animate-draw-line {
  stroke-dasharray: 1000;
  animation: draw-line 2s ease-out forwards;
}
```

```tsx
// SVG with draw animation
const AnimatedPath = ({ isVisible }) => (
  <svg viewBox="0 0 200 100">
    <path
      d="M 10 50 Q 100 10 190 50"
      stroke="currentColor"
      strokeWidth="2"
      fill="none"
      strokeDasharray="1000"
      strokeDashoffset={isVisible ? 0 : 1000}
      className="transition-all duration-[2000ms] ease-out"
    />
  </svg>
);
```

---

## Loading States

### Skeleton Shimmer

```css
@keyframes shimmer {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(100%);
  }
}

.skeleton {
  position: relative;
  overflow: hidden;
  background-color: hsl(var(--muted));
}

.skeleton::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    90deg,
    transparent,
    hsl(var(--background) / 0.5),
    transparent
  );
  animation: shimmer 2s infinite;
}
```

### Button Loading State

```tsx
const LoadingButton = ({ isLoading, children, ...props }) => (
  <Button disabled={isLoading} {...props}>
    {isLoading ? (
      <span className="flex items-center gap-2">
        <svg 
          className="animate-spin h-4 w-4" 
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
            fill="none"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
        Loading...
      </span>
    ) : (
      children
    )}
  </Button>
);
```

---

## Number Animations

### Counting Animation

```tsx
import { useState, useEffect } from 'react';

const AnimatedNumber = ({ value, duration = 1000 }) => {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    const startTime = Date.now();
    const startValue = displayValue;
    
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      
      setDisplayValue(Math.round(startValue + (value - startValue) * eased));
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };
    
    requestAnimationFrame(animate);
  }, [value, duration]);

  return <span>{displayValue}</span>;
};
```

---

## Complete Keyframes Reference

Add these to your Tailwind config or CSS:

```js
// tailwind.config.ts
keyframes: {
  // Accordion
  "accordion-down": {
    from: { height: "0", opacity: "0" },
    to: { height: "var(--radix-accordion-content-height)", opacity: "1" },
  },
  "accordion-up": {
    from: { height: "var(--radix-accordion-content-height)", opacity: "1" },
    to: { height: "0", opacity: "0" },
  },
  
  // Fade variants
  "fade-in": {
    "0%": { opacity: "0", transform: "translateY(10px)" },
    "100%": { opacity: "1", transform: "translateY(0)" },
  },
  "fade-in-up": {
    "0%": { opacity: "0", transform: "translateY(20px)" },
    "100%": { opacity: "1", transform: "translateY(0)" },
  },
  "fade-out": {
    "0%": { opacity: "1", transform: "translateY(0)" },
    "100%": { opacity: "0", transform: "translateY(10px)" },
  },
  
  // Scale
  "scale-in": {
    "0%": { transform: "scale(0.95)", opacity: "0" },
    "100%": { transform: "scale(1)", opacity: "1" },
  },
  
  // Slide
  "slide-in-right": {
    "0%": { transform: "translateX(100%)" },
    "100%": { transform: "translateX(0)" },
  },
  "slide-up": {
    "0%": { transform: "translateY(100%)", opacity: "0" },
    "100%": { transform: "translateY(0)", opacity: "1" },
  },
  
  // Decorative
  "float": {
    "0%, 100%": { transform: "translateY(0)" },
    "50%": { transform: "translateY(-10px)" },
  },
  "float-delayed": {
    "0%, 100%": { transform: "translateY(0)" },
    "50%": { transform: "translateY(-15px)" },
  },
  
  // Indicators
  "pulse-dot": {
    "0%, 100%": { opacity: "0.4", transform: "scale(0.8)" },
    "50%": { opacity: "1", transform: "scale(1)" },
  },
  
  // Drawing
  "draw-line": {
    "0%": { strokeDashoffset: "1000" },
    "100%": { strokeDashoffset: "0" },
  },
  
  // Loading
  "shimmer": {
    "0%": { transform: "translateX(-100%)" },
    "100%": { transform: "translateX(100%)" },
  },
  "spin": {
    "0%": { transform: "rotate(0deg)" },
    "100%": { transform: "rotate(360deg)" },
  },
},

animation: {
  "accordion-down": "accordion-down 0.2s ease-out",
  "accordion-up": "accordion-up 0.2s ease-out",
  "fade-in": "fade-in 0.5s ease-out forwards",
  "fade-in-up": "fade-in-up 0.6s ease-out forwards",
  "fade-out": "fade-out 0.3s ease-out",
  "scale-in": "scale-in 0.2s ease-out",
  "slide-in-right": "slide-in-right 0.3s ease-out",
  "slide-up": "slide-up 0.4s ease-out",
  "float": "float 6s ease-in-out infinite",
  "float-delayed": "float-delayed 8s ease-in-out infinite",
  "pulse-dot": "pulse-dot 1.4s ease-in-out infinite",
  "draw-line": "draw-line 2s ease-out forwards",
  "shimmer": "shimmer 2s infinite",
  "spin": "spin 1s linear infinite",
},
```

---

## Accessibility: Reduced Motion

Always provide alternatives for users who prefer reduced motion:

```tsx
// Check for reduced motion preference
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// In components
<div className={cn(
  "transition-all duration-500",
  "motion-reduce:transition-none motion-reduce:transform-none"
)}>
  {/* Content */}
</div>
```

```css
/* Global reduced motion override */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```
