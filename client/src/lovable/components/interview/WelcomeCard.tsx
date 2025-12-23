import { Clock, Lock } from "lucide-react";

const WelcomeCard = () => {
  return (
    <div className="animate-fade-in mb-6">
      <div className="bg-muted/50 rounded-2xl p-6">
        <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
          Intake Interview
        </p>
        <h1 className="font-display text-2xl md:text-3xl text-foreground mb-3">
          Understanding Your Situation
        </h1>
        <p className="text-muted-foreground text-[15px] leading-relaxed max-w-md mb-4">
          A brief conversation to understand where you are, what's changed, and where you want to go.
        </p>
        
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            <span>~15 minutes</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Lock className="h-3.5 w-3.5" />
            <span>Confidential</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WelcomeCard;
