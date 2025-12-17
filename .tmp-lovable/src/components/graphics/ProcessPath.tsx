const ProcessPath = () => {
  return (
    <div className="hidden lg:block absolute inset-0 pointer-events-none">
      <svg
        className="w-full h-full"
        viewBox="0 0 1000 200"
        preserveAspectRatio="xMidYMid meet"
        fill="none"
      >
        {/* Main flowing path connecting all three steps */}
        <path
          d="M80 100 C 180 100, 220 50, 320 50 C 420 50, 420 100, 500 100 C 580 100, 580 150, 680 150 C 780 150, 820 100, 920 100"
          stroke="hsl(var(--primary))"
          strokeWidth="2"
          strokeLinecap="round"
        />

        {/* Step 1 node */}
        <g>
          <circle cx="80" cy="100" r="20" fill="hsl(var(--background))" stroke="hsl(var(--primary))" strokeWidth="2" />
          <circle cx="80" cy="100" r="12" fill="hsl(var(--primary) / 0.1)" />
          <path d="M74 96 L86 96 L86 104 L81 104 L78 108 L78 104 L74 104 Z" stroke="hsl(var(--primary))" strokeWidth="1.5" fill="none" />
        </g>

        {/* Step 2 node */}
        <g>
          <circle cx="500" cy="100" r="20" fill="hsl(var(--background))" stroke="hsl(var(--primary))" strokeWidth="2" />
          <circle cx="500" cy="100" r="12" fill="hsl(var(--primary) / 0.1)" />
          <circle cx="500" cy="100" r="6" stroke="hsl(var(--primary))" strokeWidth="1.5" fill="none" />
          <circle cx="500" cy="100" r="2" fill="hsl(var(--primary))" />
        </g>

        {/* Step 3 node */}
        <g>
          <circle cx="920" cy="100" r="20" fill="hsl(var(--background))" stroke="hsl(var(--primary))" strokeWidth="2" />
          <circle cx="920" cy="100" r="12" fill="hsl(var(--primary) / 0.1)" />
          <path d="M912 100 L918 106 L928 94" stroke="hsl(var(--primary))" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </g>

        {/* Small decorative dots along path */}
        <g style={{ opacity: 0.5 }}>
          <circle cx="200" cy="75" r="3" fill="hsl(var(--sage-medium))" />
          <circle cx="380" cy="60" r="2" fill="hsl(var(--terracotta))" />
          <circle cx="620" cy="140" r="3" fill="hsl(var(--sage-medium))" />
          <circle cx="800" cy="125" r="2" fill="hsl(var(--terracotta))" />
        </g>

        {/* Arrow indicators showing direction */}
        <g>
          <polygon points="280,55 290,50 285,60" fill="hsl(var(--primary))" />
          <polygon points="620,145 630,140 625,150" fill="hsl(var(--primary))" />
        </g>
      </svg>
    </div>
  );
};

export default ProcessPath;