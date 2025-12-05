import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { UserMenu } from "@/components/UserMenu";
import { ModulesProgressCard, DEFAULT_COACHING_MODULES } from "@/components/ModulesProgressCard";
import type { CoachingModule, PlanCard } from "@/components/ChatComponents";
import "@/styles/serious-people.css";

const COMPLETED_MODULES_KEY = "serious_people_completed_modules";
const PLAN_CARD_KEY = "serious_people_plan_card";

export default function Progress() {
  const { isAuthenticated, isLoading: authLoading, refetch } = useAuth();
  const [, setLocation] = useLocation();
  const [completedModules, setCompletedModules] = useState<number[]>([]);
  const [coachingPlan, setCoachingPlan] = useState<PlanCard | null>(null);
  
  useEffect(() => {
    refetch();
  }, [refetch]);
  
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      setLocation("/login");
    }
  }, [authLoading, isAuthenticated, setLocation]);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(COMPLETED_MODULES_KEY);
      if (saved) {
        setCompletedModules(JSON.parse(saved));
      }
    } catch (e) {
      console.error("Failed to load completed modules:", e);
    }
  }, []);

  useEffect(() => {
    const fetchCoachingPlan = async () => {
      try {
        const savedPlan = sessionStorage.getItem(PLAN_CARD_KEY);
        if (savedPlan) {
          setCoachingPlan(JSON.parse(savedPlan));
          return;
        }
        
        const response = await fetch("/api/transcript");
        if (response.ok) {
          const data = await response.json();
          if (data.planCard) {
            setCoachingPlan(data.planCard);
            sessionStorage.setItem(PLAN_CARD_KEY, JSON.stringify(data.planCard));
          }
        }
      } catch (e) {
        console.error("Failed to load coaching plan:", e);
      }
    };
    
    if (isAuthenticated) {
      fetchCoachingPlan();
    }
  }, [isAuthenticated]);

  const nextModule = completedModules.length < 3 
    ? completedModules.length + 1 
    : 3;
  
  const allComplete = completedModules.length >= 3;

  const handleContinue = () => {
    if (allComplete) {
      setLocation("/career-brief");
    } else {
      setLocation(`/module/${nextModule}`);
    }
  };

  const getTitle = () => {
    if (completedModules.length === 0) {
      return "Let's Start Your Coaching Program";
    } else if (allComplete) {
      return "Coaching Complete!";
    } else {
      return "Great Progress!";
    }
  };

  const getSubtitle = () => {
    if (completedModules.length === 0) {
      return "Your personalized three-module coaching journey awaits. At the end, you'll receive your Career Brief with diagnosis, action plan, and conversation scripts.";
    } else if (allComplete) {
      return "You've completed all three coaching modules. Now it's time to generate your personalized Career Brief.";
    } else {
      return `You've completed ${completedModules.length} of 3 modules. Keep going to unlock your Career Brief.`;
    }
  };

  const getCtaText = () => {
    if (allComplete) {
      return "Generate My Career Brief";
    } else {
      const modules = coachingPlan?.modules || DEFAULT_COACHING_MODULES.map(m => ({ name: m.name, objective: m.description, approach: '', outcome: '' }));
      const nextModuleInfo = modules[nextModule - 1];
      return `Start Module ${nextModule}: ${nextModuleInfo?.name || 'Next'}`;
    }
  };

  if (authLoading) {
    return (
      <div className="sp-page">
        <div className="sp-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh' }}>
          <p>Loading...</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="sp-page">
      <header className="sp-success-header">
        <div className="sp-header-content">
          <Link href="/" className="sp-logo-link">
            <img src="/logan-roy.png" alt="Serious People" className="sp-logo-icon" />
            <span className="sp-logo">Serious People</span>
          </Link>
          <UserMenu />
        </div>
      </header>

      <div className="sp-container">
        <div className="sp-state-container">
          <ModulesProgressCard
            currentModule={nextModule}
            completedModules={completedModules}
            showBadge={completedModules.length > 0}
            badgeText={allComplete ? "All Modules Complete" : `${completedModules.length} of 3 Complete`}
            title={getTitle()}
            subtitle={getSubtitle()}
            ctaText={getCtaText()}
            onCtaClick={handleContinue}
            customModules={coachingPlan?.modules}
          />
        </div>
      </div>

      <footer className="sp-footer">
        <p>Questions? Contact <a href="mailto:support@example.com">support@example.com</a></p>
      </footer>
    </div>
  );
}
