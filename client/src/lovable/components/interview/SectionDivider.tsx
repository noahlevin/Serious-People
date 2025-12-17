interface SectionDividerProps {
  title: string;
  subtitle?: string;
}

const SectionDivider = ({ title, subtitle }: SectionDividerProps) => {
  return (
    <div className="flex items-center gap-4 py-4 animate-fade-in">
      <div className="h-px flex-1 bg-border" />
      <div className="text-center">
        <p className="text-xs uppercase tracking-wider text-accent font-medium">
          {title}
        </p>
        {subtitle && (
          <p className="text-xs text-muted-foreground mt-0.5">
            {subtitle}
          </p>
        )}
      </div>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
};

export default SectionDivider;
