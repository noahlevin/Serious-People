import { cn } from '@/lib/utils';

interface HeroShapesProps {
  className?: string;
}

export function HeroShapes({ className }: HeroShapesProps) {
  return (
    <div 
      className={cn("absolute inset-0 overflow-hidden pointer-events-none hidden lg:block", className)} 
      aria-hidden="true"
    >
      {/* Large sage circle - top right */}
      <div
        className="absolute -top-20 -right-20 w-96 h-96 rounded-full bg-sage/5 animate-float motion-reduce:animate-none"
        style={{ animationDelay: '0s' }}
      />

      {/* Medium terracotta circle - bottom left */}
      <div
        className="absolute -bottom-16 -left-16 w-64 h-64 rounded-full bg-terracotta/5 animate-float-delayed motion-reduce:animate-none"
        style={{ animationDelay: '2s' }}
      />

      {/* Small accent circle - center right */}
      <div
        className="absolute top-1/2 right-1/4 w-32 h-32 rounded-full bg-sage/[0.03] animate-float motion-reduce:animate-none"
        style={{ animationDelay: '1s' }}
      />

      {/* Decorative dashed circle */}
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
}

export default HeroShapes;
