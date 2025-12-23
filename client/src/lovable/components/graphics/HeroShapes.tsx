const HeroShapes = ({ parallaxOffset = 0 }: { parallaxOffset?: number }) => {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {/* Large circle - top right */}
      <svg
        className="absolute -top-20 -right-20 w-80 h-80 text-sage-light opacity-60"
        viewBox="0 0 200 200"
        style={{ transform: `translateY(${parallaxOffset * 0.3}px)` }}
      >
        <circle cx="100" cy="100" r="90" fill="none" stroke="currentColor" strokeWidth="1" />
        <circle cx="100" cy="100" r="70" fill="none" stroke="currentColor" strokeWidth="0.5" strokeDasharray="4 4" />
      </svg>

      {/* Abstract angular shape - left side */}
      <svg
        className="absolute top-1/3 -left-16 w-64 h-64 text-terracotta/20"
        viewBox="0 0 200 200"
        style={{ transform: `translateY(${parallaxOffset * 0.5}px)` }}
      >
        <path
          d="M20 100 L100 20 L180 100 L100 180 Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
        />
        <path
          d="M50 100 L100 50 L150 100 L100 150 Z"
          fill="currentColor"
          opacity="0.3"
        />
      </svg>

      {/* Dots grid - bottom right */}
      <svg
        className="absolute bottom-20 right-1/4 w-48 h-48 text-sage-medium opacity-40"
        viewBox="0 0 100 100"
        style={{ transform: `translateY(${parallaxOffset * 0.4}px)` }}
      >
        {[...Array(5)].map((_, row) =>
          [...Array(5)].map((_, col) => (
            <circle
              key={`${row}-${col}`}
              cx={10 + col * 20}
              cy={10 + row * 20}
              r="2"
              fill="currentColor"
            />
          ))
        )}
      </svg>

      {/* Curved line accent */}
      <svg
        className="absolute top-1/2 right-10 w-32 h-64 text-primary/20"
        viewBox="0 0 50 100"
        style={{ transform: `translateY(${parallaxOffset * 0.2}px)` }}
      >
        <path
          d="M25 0 Q 50 25 25 50 Q 0 75 25 100"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        />
      </svg>

      {/* Small decorative triangle */}
      <svg
        className="absolute top-40 left-1/3 w-16 h-16 text-terracotta/30"
        viewBox="0 0 50 50"
        style={{ transform: `translateY(${parallaxOffset * 0.6}px) rotate(15deg)` }}
      >
        <polygon points="25,5 45,45 5,45" fill="currentColor" />
      </svg>
    </div>
  );
};

export default HeroShapes;
