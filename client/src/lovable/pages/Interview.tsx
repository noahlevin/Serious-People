import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/lovable/components/ui/button";
import { ArrowRight, Clock, Lock, FileText, MessageCircle } from "lucide-react";
import { useScrollReveal } from "@/lovable/hooks/useScrollReveal";

const Interview = () => {
  const navigate = useNavigate();
  const [isStarting, setIsStarting] = useState(false);
  const heroReveal = useScrollReveal();
  const detailsReveal = useScrollReveal({ threshold: 0.2 });

  const handleBeginInterview = () => {
    setIsStarting(true);
    setTimeout(() => {
      navigate("/interview/chat");
    }, 400);
  };

  const expectations = [
    {
      icon: Clock,
      title: "15 minutes",
      description: "A focused conversation about your situation"
    },
    {
      icon: MessageCircle,
      title: "Thoughtful questions",
      description: "We'll explore what's really driving your career decision"
    },
    {
      icon: Lock,
      title: "Completely confidential",
      description: "Nothing is shared or stored beyond this session"
    },
    {
      icon: FileText,
      title: "Personalized analysis",
      description: "You'll receive insights tailored to your situation"
    }
  ];

  return (
    <div className={`min-h-screen bg-background transition-opacity duration-300 ${isStarting ? 'opacity-0' : 'opacity-100'}`}>
      {/* Header */}
      <header className="border-b border-border">
        <div className="sp-container">
          <div className="flex items-center justify-between h-16">
            <Link to="/" className="font-display text-xl tracking-tight text-foreground">
              Serious People
            </Link>
            <span className="text-sm text-muted-foreground font-medium">
              Step 1 of 4
            </span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="sp-container py-16 md:py-24">
        <div className="max-w-2xl mx-auto">
          {/* Hero */}
          <div 
            ref={heroReveal.ref}
            className={`text-center mb-16 transition-all duration-700 ${heroReveal.isRevealed ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
          >
            <h1 className="font-display text-4xl md:text-5xl lg:text-6xl text-foreground mb-6 leading-tight">
              Let's understand<br />your situation
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground max-w-lg mx-auto leading-relaxed">
              Before we can help, we need to understand where you are. 
              This brief conversation will give us the context we need to 
              provide meaningful guidance.
            </p>
          </div>

          {/* What to Expect */}
          <div 
            ref={detailsReveal.ref}
            className={`transition-all duration-700 delay-200 ${detailsReveal.isRevealed ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
          >
            <div className="bg-sage-wash/30 border border-border rounded-sm p-8 md:p-10 mb-10">
              <h2 className="font-display text-xl text-foreground mb-8 text-center">
                What to expect
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {expectations.map((item, index) => (
                  <div 
                    key={index} 
                    className="flex gap-4"
                    style={{ 
                      transitionDelay: `${300 + index * 100}ms`,
                    }}
                  >
                    <div className="flex-shrink-0 w-10 h-10 rounded-sm bg-background border border-border flex items-center justify-center">
                      <item.icon className="w-5 h-5 text-accent" />
                    </div>
                    <div>
                      <h3 className="font-medium text-foreground mb-1">
                        {item.title}
                      </h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {item.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* CTA */}
            <div className="text-center">
              <Button 
                size="lg" 
                onClick={handleBeginInterview}
                className="group text-base px-8 py-6 h-auto"
              >
                Begin Interview
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </Button>
              
              <p className="mt-6 text-sm text-muted-foreground">
                Changed your mind?{" "}
                <Link to="/" className="text-accent hover:underline underline-offset-4">
                  Return to homepage
                </Link>
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-auto">
        <div className="sp-container py-6">
          <p className="text-sm text-muted-foreground text-center">
            Your responses are confidential and encrypted.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Interview;
