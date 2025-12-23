interface ProgressBarProps {
  current: number;
  total: number;
  label?: string;
}

const ProgressBar = ({ current, total, label }: ProgressBarProps) => {
  const progress = Math.min((current / total) * 100, 100);
  
  return (
    <div className="flex items-center gap-3">
      {label && (
        <span className="text-sm text-muted-foreground whitespace-nowrap">
          {label}
        </span>
      )}
      <div className="flex-1 h-1 bg-border rounded-full overflow-hidden min-w-[100px]">
        <div 
          className="h-full bg-accent transition-all duration-500 ease-out rounded-full"
          style={{ width: `${progress}%` }}
        />
      </div>
      <span className="text-sm text-muted-foreground whitespace-nowrap">
        {current}/{total}
      </span>
    </div>
  );
};

export default ProgressBar;
