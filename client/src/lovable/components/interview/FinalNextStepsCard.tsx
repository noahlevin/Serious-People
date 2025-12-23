import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

interface ModuleInfo {
  slug: string;
  title: string;
  description?: string;
}

interface FinalNextStepsCardProps {
  modules: ModuleInfo[];
}

export default function FinalNextStepsCard({ modules }: FinalNextStepsCardProps) {
  return (
    <div 
      className="bg-card border border-border rounded-md p-6 my-4"
      data-testid="final-next-steps-card"
    >
      <h3 className="font-display text-lg text-foreground mb-1">
        Your Personalized Coaching Plan
      </h3>
      <p className="text-sm text-muted-foreground mb-4">
        Here's what we'll work through together:
      </p>
      
      <div className="space-y-3 mb-6">
        {modules.map((module, idx) => (
          <div 
            key={module.slug} 
            className="flex gap-3"
            data-testid={`module-step-${idx + 1}`}
          >
            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="text-xs font-medium text-primary">{idx + 1}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-foreground text-sm">
                {module.title}
              </p>
              {module.description && (
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                  {module.description}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
      
      <Link href="/app/offer">
        <Button 
          className="w-full"
          data-testid="button-view-plan"
        >
          View Your Plan
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </Link>
    </div>
  );
}
