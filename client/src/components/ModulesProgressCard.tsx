import "@/styles/serious-people.css";

export interface Module {
  number: number;
  name: string;
  description: string;
}

export const COACHING_MODULES: Module[] = [
  {
    number: 1,
    name: "Job Autopsy",
    description: "Understand what's really driving your dissatisfaction and separate fixable problems from fundamental mismatches."
  },
  {
    number: 2,
    name: "Fork in the Road",
    description: "Clarify your options and evaluate the trade-offs of staying, pivoting, or leaving entirely."
  },
  {
    number: 3,
    name: "The Great Escape Plan",
    description: "Build a concrete action plan with timelines, scripts, and strategies for your next move."
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
}

export function ModulesProgressCard({
  currentModule = 1,
  completedModules = [],
  showBadge = false,
  badgeText = "Payment Confirmed",
  title,
  subtitle,
  ctaText,
  onCtaClick
}: ModulesProgressCardProps) {
  return (
    <div className="sp-ready-card sp-coaching-ready">
      {showBadge && <div className="sp-success-badge">{badgeText}</div>}
      <h2>{title}</h2>
      {subtitle && <p className="sp-coaching-intro">{subtitle}</p>}
      
      <div className="sp-modules-list" data-testid="modules-list">
        {COACHING_MODULES.map((module) => {
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
