import "@/styles/serious-people.css";
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
    <div className="sp-ready-card sp-coaching-ready">
      {showBadge && <div className="sp-success-badge">{badgeText}</div>}
      <h2>{title}</h2>
      {subtitle && <p className="sp-coaching-intro">{subtitle}</p>}
      
      <div className="sp-modules-list" data-testid="modules-list">
        {modules.map((module) => {
          const isNext = module.number === currentModule;
          const isCompleted = completedModules.includes(module.number);
          
          return (
            <div 
              key={module.number} 
              className={`sp-module-item ${isNext ? 'sp-module-next' : ''} ${isCompleted ? 'sp-module-completed' : ''}`}
              data-testid={`module-item-${module.number}`}
            >
              <div className="sp-module-number">
                {isCompleted ? '✓' : module.number}
              </div>
              <div className="sp-module-content">
                <h3 className="sp-module-name">
                  {module.name}
                  {isNext && !isCompleted && <span className="sp-up-next-badge">Up Next</span>}
                  {isCompleted && <span className="sp-completed-badge">Complete</span>}
                </h3>
                <p className="sp-module-description">{module.description}</p>
              </div>
            </div>
          );
        })}
      </div>
      
      {ctaText && onCtaClick && (
        <button
          className="sp-generate-btn sp-start-coaching-btn"
          data-testid="button-modules-cta"
          onClick={onCtaClick}
        >
          {ctaText}
        </button>
      )}
    </div>
  );
}
