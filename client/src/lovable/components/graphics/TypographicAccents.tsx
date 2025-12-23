interface TypographicAccentsProps {
  isRevealed: boolean;
}

const TypographicAccents = ({ isRevealed }: TypographicAccentsProps) => {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {/* Large decorative numbers */}
      <div 
        className={`absolute -left-8 top-1/2 -translate-y-1/2 font-display text-[20rem] leading-none text-sage-light/30 select-none transition-all duration-1000 ${
          isRevealed ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-20'
        }`}
        style={{ transitionDelay: '0.2s' }}
      >
        5
      </div>
      
      <div 
        className={`absolute -right-4 top-0 font-display text-[12rem] leading-none text-terracotta/10 select-none transition-all duration-1000 ${
          isRevealed ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-20'
        }`}
        style={{ transitionDelay: '0.4s' }}
      >
        00+
      </div>

      {/* Decorative words */}
      <div 
        className={`absolute left-1/4 -bottom-6 font-display text-6xl text-sage-light/20 tracking-widest uppercase select-none transition-all duration-1000 ${
          isRevealed ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
        }`}
        style={{ transitionDelay: '0.6s' }}
      >
        trust
      </div>

      {/* Subtle line elements */}
      <svg 
        className={`absolute top-8 left-1/2 w-40 h-1 transition-all duration-700 ${
          isRevealed ? 'opacity-60' : 'opacity-0'
        }`}
        style={{ transitionDelay: '0.3s' }}
      >
        <line x1="0" y1="0" x2="160" y2="0" stroke="hsl(var(--sage-medium))" strokeWidth="1" />
      </svg>

      <svg 
        className={`absolute bottom-8 right-1/3 w-24 h-1 transition-all duration-700 ${
          isRevealed ? 'opacity-60' : 'opacity-0'
        }`}
        style={{ transitionDelay: '0.5s' }}
      >
        <line x1="0" y1="0" x2="96" y2="0" stroke="hsl(var(--terracotta))" strokeWidth="1" opacity="0.4" />
      </svg>
    </div>
  );
};

export default TypographicAccents;
