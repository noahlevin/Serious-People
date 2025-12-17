# Graphics Components

> Custom SVG graphics and decorative elements that give the design its distinctive character.

---

## Table of Contents

1. [HeroShapes](#heroshapes)
2. [ProcessPath](#processpath)
3. [SituationIcons](#situationicons)
4. [TypographicAccents](#typographicaccents)

---

## HeroShapes

### Purpose
Decorative abstract shapes used in hero sections to add visual interest without distracting from content.

### Design Principles
- Soft, organic forms
- Uses brand colors (sage, terracotta, muted tones)
- Subtle floating animation
- Hidden on mobile to preserve content focus

### Implementation

```tsx
// src/components/graphics/HeroShapes.tsx

import React from 'react';

const HeroShapes: React.FC = () => {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {/* Large sage circle - top right */}
      <div 
        className="absolute -top-20 -right-20 w-96 h-96 rounded-full bg-sage/5 animate-float"
        style={{ animationDelay: '0s' }}
      />
      
      {/* Medium terracotta circle - bottom left */}
      <div 
        className="absolute -bottom-16 -left-16 w-64 h-64 rounded-full bg-terracotta/5 animate-float-delayed"
        style={{ animationDelay: '2s' }}
      />
      
      {/* Small accent circle - center right */}
      <div 
        className="absolute top-1/2 right-1/4 w-32 h-32 rounded-full bg-sage/3 animate-float"
        style={{ animationDelay: '1s' }}
      />
      
      {/* Decorative line element */}
      <svg 
        className="absolute top-1/3 left-1/4 w-48 h-48 text-border/30"
        viewBox="0 0 200 200"
        fill="none"
      >
        <circle 
          cx="100" 
          cy="100" 
          r="80" 
          stroke="currentColor" 
          strokeWidth="1"
          strokeDasharray="4 6"
        />
      </svg>
      
      {/* Organic blob shape */}
      <svg 
        className="absolute bottom-1/4 right-1/3 w-40 h-40 text-sage/5"
        viewBox="0 0 200 200"
      >
        <path 
          fill="currentColor"
          d="M45,-51.3C57.3,-42.5,65.7,-27.1,68.5,-10.5C71.3,6.1,68.5,23.9,59.4,37.4C50.3,50.9,34.9,60.1,18.2,65.1C1.5,70.1,-16.5,70.9,-32.1,64.6C-47.7,58.3,-60.9,44.9,-67.3,28.8C-73.7,12.7,-73.3,-6.1,-66.7,-21.6C-60.1,-37.1,-47.3,-49.3,-33.3,-57.5C-19.3,-65.7,-4.1,-69.9,9.7,-66.6C23.5,-63.3,32.7,-60.1,45,-51.3Z"
          transform="translate(100 100)"
        />
      </svg>
    </div>
  );
};

export default HeroShapes;
```

### Usage

```tsx
<section className="relative py-24">
  <HeroShapes />
  <div className="relative z-10 container">
    {/* Hero content */}
  </div>
</section>
```

### Visibility

```tsx
// Hide on mobile, show on larger screens
<div className="hidden lg:block">
  <HeroShapes />
</div>
```

---

## ProcessPath

### Purpose
Animated connecting line that visually links process steps, emphasizing the journey from interview to coaching plan.

### Design Principles
- SVG path with stroke animation
- Draws on scroll (or on page load)
- Connects numbered steps
- Subtle, not distracting

### Implementation

```tsx
// src/components/graphics/ProcessPath.tsx

import React, { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface ProcessPathProps {
  className?: string;
}

const ProcessPath: React.FC<ProcessPathProps> = ({ className }) => {
  const pathRef = useRef<SVGPathElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
      },
      { threshold: 0.3 }
    );

    if (pathRef.current) {
      observer.observe(pathRef.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <svg 
      className={cn("w-full h-16 text-primary/30", className)}
      viewBox="0 0 800 60"
      fill="none"
      preserveAspectRatio="xMidYMid meet"
    >
      <path
        ref={pathRef}
        d="M 50 30 C 150 30 150 30 250 30 C 350 30 350 30 450 30 C 550 30 550 30 650 30 C 700 30 750 30 750 30"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="1000"
        strokeDashoffset={isVisible ? "0" : "1000"}
        className="transition-all duration-[2000ms] ease-out"
      />
      
      {/* Step circles */}
      <circle 
        cx="50" 
        cy="30" 
        r="8" 
        className={cn(
          "fill-primary transition-all duration-500",
          isVisible ? "opacity-100" : "opacity-0"
        )}
        style={{ transitionDelay: '0ms' }}
      />
      <circle 
        cx="300" 
        cy="30" 
        r="8" 
        className={cn(
          "fill-primary transition-all duration-500",
          isVisible ? "opacity-100" : "opacity-0"
        )}
        style={{ transitionDelay: '600ms' }}
      />
      <circle 
        cx="550" 
        cy="30" 
        r="8" 
        className={cn(
          "fill-primary transition-all duration-500",
          isVisible ? "opacity-100" : "opacity-0"
        )}
        style={{ transitionDelay: '1200ms' }}
      />
      <circle 
        cx="750" 
        cy="30" 
        r="8" 
        className={cn(
          "fill-primary transition-all duration-500",
          isVisible ? "opacity-100" : "opacity-0"
        )}
        style={{ transitionDelay: '1800ms' }}
      />
    </svg>
  );
};

export default ProcessPath;
```

### Curved Variant

```tsx
// For a more organic curved path:
<path
  d="M 50 50 C 150 10 250 90 350 50 C 450 10 550 90 650 50 C 700 30 750 50 750 50"
  stroke="currentColor"
  strokeWidth="2"
  fill="none"
/>
```

---

## SituationIcons

### Purpose
Illustrative icons representing different career situations (e.g., "Stuck in Role", "Considering a Change", "Ready to Leave").

### Design Principles
- Simple, abstract representations
- Uses brand color palette
- Consistent visual weight
- Works at multiple sizes (40px to 120px)

### Implementation

```tsx
// src/components/graphics/SituationIcons.tsx

import React from 'react';

interface IconProps {
  className?: string;
  size?: number;
}

// Stuck in Role - represents being boxed in
export const StuckIcon: React.FC<IconProps> = ({ className, size = 64 }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 64 64" 
    fill="none"
    className={className}
  >
    {/* Box outline */}
    <rect 
      x="12" y="12" 
      width="40" height="40" 
      rx="4"
      stroke="currentColor" 
      strokeWidth="2"
      className="text-primary"
    />
    {/* Figure inside */}
    <circle cx="32" cy="28" r="6" className="fill-terracotta" />
    <path 
      d="M 24 42 Q 32 36 40 42" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round"
      className="text-primary"
    />
    {/* Pressure arrows */}
    <path d="M 6 32 L 12 32" stroke="currentColor" strokeWidth="2" className="text-muted-foreground" />
    <path d="M 52 32 L 58 32" stroke="currentColor" strokeWidth="2" className="text-muted-foreground" />
  </svg>
);

// Considering Change - represents weighing options
export const ConsideringIcon: React.FC<IconProps> = ({ className, size = 64 }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 64 64" 
    fill="none"
    className={className}
  >
    {/* Scale base */}
    <path 
      d="M 32 56 L 32 24" 
      stroke="currentColor" 
      strokeWidth="2"
      className="text-primary"
    />
    <circle cx="32" cy="20" r="4" className="fill-primary" />
    
    {/* Balance beam */}
    <path 
      d="M 12 28 L 52 28" 
      stroke="currentColor" 
      strokeWidth="2"
      className="text-primary"
    />
    
    {/* Left plate */}
    <path d="M 12 28 L 8 40 L 20 40 L 16 28" className="fill-sage-wash stroke-primary" strokeWidth="1.5" />
    
    {/* Right plate */}
    <path d="M 48 28 L 44 40 L 56 40 L 52 28" className="fill-terracotta-wash stroke-terracotta" strokeWidth="1.5" />
  </svg>
);

// Ready to Leave - represents movement/door
export const ReadyToLeaveIcon: React.FC<IconProps> = ({ className, size = 64 }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 64 64" 
    fill="none"
    className={className}
  >
    {/* Door frame */}
    <rect 
      x="16" y="8" 
      width="24" height="48" 
      rx="2"
      stroke="currentColor" 
      strokeWidth="2"
      className="text-muted-foreground"
    />
    
    {/* Open door */}
    <path 
      d="M 16 8 L 28 14 L 28 50 L 16 56 Z" 
      className="fill-sage-wash stroke-primary" 
      strokeWidth="2"
    />
    
    {/* Figure walking out */}
    <circle cx="44" cy="28" r="5" className="fill-terracotta" />
    <path 
      d="M 44 34 L 44 46 M 44 38 L 38 44 M 44 38 L 50 44 M 44 46 L 40 56 M 44 46 L 48 56" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round"
      className="text-primary"
    />
    
    {/* Arrow indicating direction */}
    <path 
      d="M 50 28 L 58 28 M 54 24 L 58 28 L 54 32" 
      stroke="currentColor" 
      strokeWidth="2"
      strokeLinecap="round"
      className="text-primary"
    />
  </svg>
);

// New Opportunity - represents growth/reaching
export const NewOpportunityIcon: React.FC<IconProps> = ({ className, size = 64 }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 64 64" 
    fill="none"
    className={className}
  >
    {/* Rising steps */}
    <path 
      d="M 8 52 L 8 44 L 20 44 L 20 36 L 32 36 L 32 28 L 44 28 L 44 20 L 56 20 L 56 12" 
      stroke="currentColor" 
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-primary"
    />
    
    {/* Figure at top */}
    <circle cx="52" cy="8" r="4" className="fill-terracotta" />
    
    {/* Star/goal */}
    <path 
      d="M 56 4 L 57 7 L 60 7 L 58 9 L 59 12 L 56 10 L 53 12 L 54 9 L 52 7 L 55 7 Z" 
      className="fill-accent"
    />
  </svg>
);

// Export all icons
export const SituationIcons = {
  Stuck: StuckIcon,
  Considering: ConsideringIcon,
  ReadyToLeave: ReadyToLeaveIcon,
  NewOpportunity: NewOpportunityIcon,
};

export default SituationIcons;
```

### Usage

```tsx
import { SituationIcons } from '@/components/graphics/SituationIcons';

<SituationIcons.Stuck size={80} className="text-primary" />
<SituationIcons.Considering size={80} />
<SituationIcons.ReadyToLeave size={80} />
<SituationIcons.NewOpportunity size={80} />
```

---

## TypographicAccents

### Purpose
Decorative typographic elements that add editorial flair to headers and pull quotes.

### Design Principles
- Large quotation marks for pull quotes
- Decorative numbers for lists/steps
- Subtle, elegant flourishes

### Implementation

```tsx
// src/components/graphics/TypographicAccents.tsx

import React from 'react';
import { cn } from '@/lib/utils';

// Large decorative quotation mark
export const QuoteMark: React.FC<{ className?: string; position?: 'open' | 'close' }> = ({ 
  className,
  position = 'open'
}) => (
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

// Decorative step number
export const StepNumber: React.FC<{ number: number; className?: string }> = ({ 
  number, 
  className 
}) => (
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

// Decorative horizontal rule
export const DecorativeRule: React.FC<{ className?: string }> = ({ className }) => (
  <div className={cn("flex items-center gap-4 my-8", className)}>
    <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
    <div className="w-2 h-2 rotate-45 border border-primary/30" />
    <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
  </div>
);

// Decorative bracket for emphasis
export const DecorativeBracket: React.FC<{ 
  children: React.ReactNode;
  className?: string;
}> = ({ children, className }) => (
  <div className={cn("relative pl-6", className)}>
    <div 
      className="absolute left-0 top-0 bottom-0 w-1 bg-primary/20 rounded-full"
      aria-hidden="true"
    />
    {children}
  </div>
);

// Section label with decorative line
export const SectionLabel: React.FC<{ 
  children: React.ReactNode;
  className?: string;
}> = ({ children, className }) => (
  <div className={cn("flex items-center gap-4", className)}>
    <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
      {children}
    </span>
    <div className="h-px flex-1 bg-border" />
  </div>
);
```

### Usage Examples

```tsx
// Pull quote with decorative marks
<blockquote className="relative my-12 pl-8">
  <QuoteMark className="absolute -left-4 -top-4" />
  <p className="font-serif text-2xl text-foreground italic leading-relaxed">
    The clarity I gained in 15 minutes was worth more than months of 
    spinning in my own head.
  </p>
  <QuoteMark position="close" className="absolute -right-4 -bottom-8" />
</blockquote>

// Step with decorative number
<div className="relative">
  <StepNumber number={1} className="absolute -left-16 top-0" />
  <h3 className="font-serif text-2xl">Complete the Interview</h3>
  <p>Answer a few questions about your situation...</p>
</div>

// Section with label
<SectionLabel>Our Process</SectionLabel>
<h2 className="font-serif text-4xl mt-4">How It Works</h2>
```

---

## Animation Guidelines for Graphics

### Floating Elements

```css
@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-10px); }
}

@keyframes float-delayed {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-15px); }
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
  from { stroke-dashoffset: 1000; }
  to { stroke-dashoffset: 0; }
}

.animate-draw-line {
  animation: draw-line 2s ease-out forwards;
}
```

### Reduced Motion Support

```tsx
// Always respect user preferences
<svg 
  className={cn(
    "animate-float",
    "motion-reduce:animate-none"
  )}
>
  {/* ... */}
</svg>
```

---

## Color Application in Graphics

Graphics should use these semantic colors:

| Element | Color Token | Hex Approximation |
|---------|-------------|-------------------|
| Primary strokes | `text-primary` | #4A5548 |
| Secondary fills | `fill-terracotta` | #C4A484 |
| Wash backgrounds | `fill-sage-wash` | #F5F7F5 |
| Subtle elements | `text-muted-foreground` | #737373 |
| Decorative | `text-primary/10` | 10% opacity sage |

Always use Tailwind classes for colors to maintain theme consistency.
