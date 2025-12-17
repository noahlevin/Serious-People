import { cn } from '@/lib/utils';

interface IconProps {
  className?: string;
  size?: number;
}

export function StuckIcon({ className, size = 64 }: IconProps) {
  return (
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
}

export function ConsideringIcon({ className, size = 64 }: IconProps) {
  return (
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
      <path 
        d="M 12 28 L 8 40 L 20 40 L 16 28" 
        className="fill-sage-wash stroke-primary" 
        strokeWidth="1.5" 
      />

      {/* Right plate */}
      <path 
        d="M 48 28 L 44 40 L 56 40 L 52 28" 
        className="fill-terracotta-wash stroke-terracotta" 
        strokeWidth="1.5" 
      />
    </svg>
  );
}

export function ReadyToLeaveIcon({ className, size = 64 }: IconProps) {
  return (
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
}

export function NewOpportunityIcon({ className, size = 64 }: IconProps) {
  return (
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
}

export const SituationIcons = {
  Stuck: StuckIcon,
  Considering: ConsideringIcon,
  ReadyToLeave: ReadyToLeaveIcon,
  NewOpportunity: NewOpportunityIcon,
};

export default SituationIcons;
