import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface ProcessPathProps {
  className?: string;
  steps?: number;
}

export function ProcessPath({ className, steps = 4 }: ProcessPathProps) {
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

  // Calculate step positions based on number of steps
  const stepPositions = Array.from({ length: steps }, (_, i) => {
    const spacing = 700 / (steps - 1);
    return 50 + spacing * i;
  });

  return (
    <svg
      className={cn("w-full h-16 text-primary/30 motion-reduce:opacity-100", className)}
      viewBox="0 0 800 60"
      fill="none"
      preserveAspectRatio="xMidYMid meet"
    >
      <path
        ref={pathRef}
        d={`M 50 30 C 150 30 150 30 250 30 C 350 30 350 30 450 30 C 550 30 550 30 650 30 C 700 30 750 30 750 30`}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="1000"
        strokeDashoffset={isVisible ? "0" : "1000"}
        className="transition-all duration-[2000ms] ease-out motion-reduce:transition-none motion-reduce:stroke-dashoffset-0"
        style={{ strokeDashoffset: isVisible ? 0 : 1000 }}
      />

      {/* Step circles */}
      {stepPositions.map((x, i) => (
        <circle
          key={i}
          cx={x}
          cy="30"
          r="8"
          className={cn(
            "fill-primary transition-all duration-500 motion-reduce:opacity-100",
            isVisible ? "opacity-100" : "opacity-0"
          )}
          style={{ transitionDelay: `${i * 400}ms` }}
        />
      ))}
    </svg>
  );
}

export function ProcessPathCurved({ className, steps = 4 }: ProcessPathProps) {
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

  const stepPositions = Array.from({ length: steps }, (_, i) => {
    const spacing = 700 / (steps - 1);
    return 50 + spacing * i;
  });

  return (
    <svg
      className={cn("w-full h-24 text-primary/30 motion-reduce:opacity-100", className)}
      viewBox="0 0 800 100"
      fill="none"
      preserveAspectRatio="xMidYMid meet"
    >
      <path
        ref={pathRef}
        d="M 50 50 C 150 10 250 90 350 50 C 450 10 550 90 650 50 C 700 30 750 50 750 50"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
        strokeDasharray="1000"
        strokeDashoffset={isVisible ? "0" : "1000"}
        className="transition-all duration-[2000ms] ease-out motion-reduce:transition-none"
        style={{ strokeDashoffset: isVisible ? 0 : 1000 }}
      />

      {stepPositions.map((x, i) => (
        <circle
          key={i}
          cx={x}
          cy="50"
          r="8"
          className={cn(
            "fill-primary transition-all duration-500 motion-reduce:opacity-100",
            isVisible ? "opacity-100" : "opacity-0"
          )}
          style={{ transitionDelay: `${i * 400}ms` }}
        />
      ))}
    </svg>
  );
}

export default ProcessPath;
