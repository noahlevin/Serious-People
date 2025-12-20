import { Link } from "react-router-dom";
import { Clock, Lock, ArrowRight } from "lucide-react";

const Prepare = () => {
  return (
    <div className="flex flex-col flex-1">
      {/* Main */}
      <div className="flex-1 flex">
        {/* Left - Content */}
        <div className="flex-1 flex items-center justify-center p-6 md:p-12 lg:p-16">
          <div className="max-w-lg">
            <p className="sp-eyebrow text-accent mb-4">Before We Begin</p>
            
            <h1 className="font-display text-3xl md:text-4xl text-foreground mb-4">
              This isn't a quiz.
            </h1>
            
            <p className="text-lg text-muted-foreground mb-10 leading-relaxed">
              You're about to have a real conversation about your career. The more honest you are, the more useful this becomes.
            </p>

            {/* The asks */}
            <div className="space-y-6 mb-10">
              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-foreground text-background flex items-center justify-center shrink-0 text-sm font-medium">
                  1
                </div>
                <div>
                  <p className="font-medium text-foreground mb-1">Clear 20 minutes</p>
                  <p className="text-muted-foreground text-sm">
                    Close Slack. This works better without distractions.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-foreground text-background flex items-center justify-center shrink-0 text-sm font-medium">
                  2
                </div>
                <div>
                  <p className="font-medium text-foreground mb-1">Be specific</p>
                  <p className="text-muted-foreground text-sm">
                    Vague answers get vague advice. Names, numbers, timelines—they matter.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-foreground text-background flex items-center justify-center shrink-0 text-sm font-medium">
                  3
                </div>
                <div>
                  <p className="font-medium text-foreground mb-1">Expect to be challenged</p>
                  <p className="text-muted-foreground text-sm">
                    We'll push back on fuzzy thinking. That's the point.
                  </p>
                </div>
              </div>
            </div>

            {/* CTA */}
            <Link to="/interview/chat">
              <button className="w-full sm:w-auto px-8 py-4 bg-foreground text-background text-base font-medium hover:bg-foreground/90 transition-colors flex items-center justify-center gap-2">
                I'm ready
                <ArrowRight className="w-4 h-4" />
              </button>
            </Link>

            <Link 
              to="/"
              className="block mt-4 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Not now — save and come back later
            </Link>
          </div>
        </div>

        {/* Right - Dark panel */}
        <div className="hidden lg:flex lg:w-2/5 bg-foreground text-background p-12 xl:p-16 flex-col justify-between">
          <div />
          
          <div>
            <div className="flex items-center gap-6 mb-8 text-background/60">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4" />
                <span className="text-sm">~20 minutes</span>
              </div>
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4" />
                <span className="text-sm">Private</span>
              </div>
            </div>
            
            <blockquote className="font-display text-2xl xl:text-3xl italic leading-tight mb-6">
              "Most people spend more time planning their vacations than their careers."
            </blockquote>
            <p className="text-background/60 text-sm">
              You're not most people.
            </p>
          </div>

          <div />
        </div>
      </div>
    </div>
  );
};

export default Prepare;
