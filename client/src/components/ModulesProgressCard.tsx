import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CoachingModule } from "./ChatComponents";

export interface Module {
  number: number;
  name: string;
  description: string;
}

export const DEFAULT_COACHING_MODULES: Module[] = [
  {
    number: 1,
    name: "Discovery",
    description: "Dig deep into your current situation to understand what's really driving the issue."
  },
  {
    number: 2,
    name: "Options",
    description: "Map out your motivations, constraints, and possibilities to see the full picture."
  },
  {
    number: 3,
    name: "Action Plan",
    description: "Build a concrete plan with next steps and key conversation scripts."
  }
];

interface ModulesProgressCardProps {
  currentModule?: number;
  completedModules?: number[];
  showBadge?: boolean;
  badgeText?: string;
  title: string;
  subtitle?: string;
  ctaText?: string;
  onCtaClick?: () => void;
  customModules?: CoachingModule[];
}

export function ModulesProgressCard({
  currentModule = 1,
  completedModules = [],
  showBadge = false,
  badgeText = "Payment Confirmed",
  title,
  subtitle,
  ctaText,
  onCtaClick,
  customModules
}: ModulesProgressCardProps) {
  const modules: Module[] = customModules 
    ? customModules.map((mod, i) => ({
        number: i + 1,
        name: mod.name,
        description: mod.objective
      }))
    : DEFAULT_COACHING_MODULES;

  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader className="text-center pb-4">
        {showBadge && (
          <div className="flex justify-center mb-4">
            <Badge variant="default" className="bg-primary text-primary-foreground">
              {badgeText}
            </Badge>
          </div>
        )}
        <CardTitle className="font-serif text-headline text-foreground">
          {title}
        </CardTitle>
        {subtitle && (
          <CardDescription className="text-body text-muted-foreground mt-3 max-w-lg mx-auto leading-relaxed">
            {subtitle}
          </CardDescription>
        )}
      </CardHeader>
      
      <CardContent className="space-y-4" data-testid="modules-list">
        {modules.map((module) => {
          const isNext = module.number === currentModule;
          const isCompleted = completedModules.includes(module.number);
          
          return (
            <div 
              key={module.number} 
              className={cn(
                "flex items-start gap-4 p-4 rounded-lg transition-colors",
                isCompleted && "bg-sage-wash",
                isNext && !isCompleted && "bg-card border border-primary/20",
                !isNext && !isCompleted && "bg-muted/30"
              )}
              data-testid={`module-item-${module.number}`}
            >
              <div 
                className={cn(
                  "flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold",
                  isCompleted && "bg-primary text-primary-foreground",
                  isNext && !isCompleted && "bg-primary/10 text-primary border-2 border-primary",
                  !isNext && !isCompleted && "bg-muted text-muted-foreground"
                )}
              >
                {isCompleted ? <Check className="w-5 h-5" /> : module.number}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-serif font-semibold text-foreground">
                    {module.name}
                  </h3>
                  {isNext && !isCompleted && (
                    <Badge variant="outline" className="text-primary border-primary/30 text-xs">
                      Up Next
                    </Badge>
                  )}
                  {isCompleted && (
                    <Badge variant="secondary" className="bg-sage-wash text-sage text-xs">
                      Complete
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                  {module.description}
                </p>
              </div>
            </div>
          );
        })}
        
        {ctaText && onCtaClick && (
          <div className="pt-4">
            <Button
              className="w-full"
              size="lg"
              data-testid="button-modules-cta"
              onClick={onCtaClick}
            >
              {ctaText}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
