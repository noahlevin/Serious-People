export const StayOrGoIcon = () => (
  <svg className="w-10 h-10 text-primary" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    {/* Two paths diverging */}
    <path d="M20 35 L20 20" />
    <path d="M20 20 L10 8" />
    <path d="M20 20 L30 8" />
    <circle cx="10" cy="6" r="2" />
    <circle cx="30" cy="6" r="2" />
    <circle cx="20" cy="37" r="2" fill="currentColor" />
  </svg>
);

export const BadManagerIcon = () => (
  <svg className="w-10 h-10 text-primary" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    {/* Storm cloud over figure */}
    <path d="M8 22 Q8 16 14 16 Q14 12 20 12 Q26 12 26 16 Q32 16 32 22" />
    <path d="M12 22 L12 24" />
    <path d="M20 22 L20 26" />
    <path d="M28 22 L28 24" />
    {/* Person below */}
    <circle cx="20" cy="32" r="3" />
    <path d="M14 38 L20 35 L26 38" />
  </svg>
);

export const BurnoutIcon = () => (
  <svg className="w-10 h-10 text-primary" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    {/* Battery depleted */}
    <rect x="6" y="12" width="24" height="16" rx="2" />
    <path d="M30 18 L34 18 L34 22 L30 22" />
    {/* Low charge indicator */}
    <rect x="9" y="15" width="4" height="10" fill="currentColor" opacity="0.3" />
    {/* Zigzag line = exhaustion */}
    <path d="M16 20 L18 17 L20 23 L22 20" />
  </svg>
);

export const NegotiatingIcon = () => (
  <svg className="w-10 h-10 text-primary" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    {/* Handshake abstracted */}
    <path d="M6 20 L12 14 L20 20 L28 14 L34 20" />
    <path d="M12 14 L12 28" />
    <path d="M28 14 L28 28" />
    {/* Bridge/connection */}
    <path d="M12 28 Q20 32 28 28" strokeDasharray="3 2" />
  </svg>
);

export const CounterOfferIcon = () => (
  <svg className="w-10 h-10 text-primary" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    {/* Scale/balance */}
    <path d="M20 6 L20 12" />
    <path d="M8 12 L32 12" />
    <path d="M8 12 L8 24" />
    <path d="M32 12 L32 20" />
    {/* Pans */}
    <path d="M4 24 Q8 28 12 24" />
    <path d="M28 20 Q32 24 36 20" />
    {/* Question mark */}
    <path d="M18 30 Q18 26 20 26 Q22 26 22 28 Q22 30 20 31" />
    <circle cx="20" cy="34" r="1" fill="currentColor" />
  </svg>
);

export const TwoOpportunitiesIcon = () => (
  <svg className="w-10 h-10 text-primary" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    {/* Two doors */}
    <rect x="4" y="10" width="12" height="24" rx="1" />
    <rect x="24" y="10" width="12" height="24" rx="1" />
    {/* Door details */}
    <circle cx="13" cy="22" r="1.5" fill="currentColor" />
    <circle cx="27" cy="22" r="1.5" fill="currentColor" />
    {/* Light rays from doors */}
    <path d="M10 6 L10 8" opacity="0.5" />
    <path d="M30 6 L30 8" opacity="0.5" />
    {/* Person in middle */}
    <circle cx="20" cy="38" r="2" fill="currentColor" />
  </svg>
);

const situationIcons = {
  "Stay or go?": StayOrGoIcon,
  "Bad manager": BadManagerIcon,
  "Burnout": BurnoutIcon,
  "Negotiating an exit": NegotiatingIcon,
  "Counter-offer dilemma": CounterOfferIcon,
  "Two opportunities": TwoOpportunitiesIcon,
};

export default situationIcons;
