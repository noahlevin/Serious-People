import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { UserMenu } from "@/components/UserMenu";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, Lock, Circle } from "lucide-react";
import "@/styles/serious-people.css";

interface Step {
  id: string;
  label: string;
  status: "completed" | "current" | "locked";
}

export default function Progress() {
  const { isAuthenticated, authChecked, journey, routing } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    document.title = "Your Progress - Serious People";
  }, []);

  if (!authChecked) {
    return (
      <div className="sp-page">
        <div className="sp-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh' }}>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  if (isAuthenticated && !routing) {
    return (
      <div className="sp-page">
        <header className="sp-success-header">
          <div className="sp-header-content">
            <Link to="/" className="sp-logo-link">
              <img src="/favicon.png" alt="Serious People" className="sp-logo-icon" />
              <span className="sp-logo">Serious People</span>
            </Link>
            <UserMenu />
          </div>
        </header>
        <div className="sp-container">
          <Card>
            <CardContent className="p-6">
              <p className="text-center text-muted-foreground">
                Unable to load your progress. Please refresh the page.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const state = journey?.state;
  
  const steps: Step[] = [
    {
      id: "interview",
      label: "Career Interview",
      status: state?.interviewComplete ? "completed" : "current",
    },
    {
      id: "purchase",
      label: "Purchase Coaching Plan",
      status: state?.paymentVerified 
        ? "completed" 
        : state?.interviewComplete 
          ? "current" 
          : "locked",
    },
    {
      id: "module1",
      label: "Module 1: Job Autopsy",
      status: state?.module1Complete 
        ? "completed" 
        : state?.paymentVerified 
          ? "current" 
          : "locked",
    },
    {
      id: "module2",
      label: "Module 2: Fork in the Road",
      status: state?.module2Complete 
        ? "completed" 
        : state?.module1Complete 
          ? "current" 
          : "locked",
    },
    {
      id: "module3",
      label: "Module 3: The Great Escape Plan",
      status: state?.module3Complete 
        ? "completed" 
        : state?.module2Complete 
          ? "current" 
          : "locked",
    },
    {
      id: "coach-letter",
      label: "Coach Letter",
      status: state?.hasSeriousPlan 
        ? "completed" 
        : state?.module3Complete 
          ? "current" 
          : "locked",
    },
    {
      id: "serious-plan",
      label: "Your Serious Plan",
      status: state?.hasSeriousPlan 
        ? "completed" 
        : "locked",
    },
  ];

  const handleResume = () => {
    if (routing?.resumePath) {
      navigate(routing.resumePath);
    }
  };

  const completedCount = steps.filter(s => s.status === "completed").length;
  const totalCount = steps.length;

  return (
    <div className="sp-page">
      <header className="sp-success-header">
        <div className="sp-header-content">
          <Link to="/" className="sp-logo-link">
            <img src="/favicon.png" alt="Serious People" className="sp-logo-icon" />
            <span className="sp-logo">Serious People</span>
          </Link>
          <UserMenu />
        </div>
      </header>

      <div className="sp-container">
        <div className="sp-state-container">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">Your Progress</CardTitle>
              <p className="text-muted-foreground">
                {completedCount} of {totalCount} steps completed
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="space-y-3">
                {steps.map((step) => (
                  <li 
                    key={step.id}
                    className="flex items-center gap-3 py-2"
                    data-testid={`step-${step.id}`}
                  >
                    {step.status === "completed" && (
                      <Check className="h-5 w-5 text-green-600" />
                    )}
                    {step.status === "current" && (
                      <Circle className="h-5 w-5 text-primary" />
                    )}
                    {step.status === "locked" && (
                      <Lock className="h-5 w-5 text-muted-foreground" />
                    )}
                    <span className={step.status === "locked" ? "text-muted-foreground" : ""}>
                      {step.label}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="pt-4">
                <Button 
                  onClick={handleResume}
                  className="w-full"
                  size="lg"
                  data-testid="button-resume"
                >
                  Resume
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <footer className="sp-footer">
        <p>Questions? Contact <a href="mailto:hello@seriouspeople.com">hello@seriouspeople.com</a></p>
      </footer>
    </div>
  );
}
