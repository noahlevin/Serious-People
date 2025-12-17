import { Link } from "react-router-dom";

interface UpsellCardProps {
  userName?: string;
}

const UpsellCard = ({ userName = "Sarah" }: UpsellCardProps) => {
  const modules = [
    { number: 1, title: "The Performance Paradox" },
    { number: 2, title: "The Family Factor" },
    { number: 3, title: "The Decisive Move" },
  ];

  return (
    <div className="animate-fade-in w-full max-w-md mx-auto">
      {/* Dark header */}
      <div className="bg-foreground text-background p-8 rounded-t-sm">
        <h2 className="font-display text-xl md:text-2xl text-center italic">
          {userName}, are you ready to see your personalized coaching plan?
        </h2>
      </div>

      {/* Light body */}
      <div className="bg-card border border-t-0 border-border p-6 rounded-b-sm">
        {/* Modules */}
        <div className="space-y-3 mb-6">
          {modules.map((module) => (
            <div
              key={module.number}
              className="bg-muted/50 border border-border p-4 text-center"
            >
              <p className="sp-eyebrow text-muted-foreground mb-1">
                MODULE {module.number}
              </p>
              <p className="font-display text-lg text-foreground">
                {module.title}
              </p>
            </div>
          ))}
        </div>

        {/* CTA */}
        <Link to="/app/offer">
          <button className="w-full py-4 bg-foreground text-background text-base font-medium hover:bg-foreground/90 transition-colors">
            See my plan
          </button>
        </Link>
      </div>
    </div>
  );
};

export default UpsellCard;
