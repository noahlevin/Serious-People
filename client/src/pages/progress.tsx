import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { queryClient } from "@/lib/queryClient";
import { ModulesProgressCard, DEFAULT_COACHING_MODULES } from "@/components/ModulesProgressCard";
import type { PlanCard } from "@/components/ChatComponents";
import { Header, Footer } from "@/components/layout";

const PLAN_CARD_KEY = "serious_people_plan_card";

export default function Progress() {
  const { isAuthenticated, isLoading: authLoading, refetch } = useAuth();
  const [, setLocation] = useLocation();
  const [completedModules, setCompletedModules] = useState<number[]>([]);
  const [coachingPlan, setCoachingPlan] = useState<PlanCard | null>(null);
  
  useEffect(() => {
    document.title = "Your Progress - Serious People";
  }, []);
  
  useEffect(() => {
    refetch();
  }, [refetch]);
  
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      setLocation("/login");
    }
  }, [authLoading, isAuthenticated, setLocation]);

  useEffect(() => {
    const loadModulesStatus = async () => {
      try {
        const response = await fetch("/api/modules/status", {
          credentials: "include",
        });
        if (response.ok) {
          const data = await response.json();
          const completed = data.modules
            .filter((m: { number: number; complete: boolean }) => m.complete)
            .map((m: { number: number }) => m.number);
          setCompletedModules(completed);
        }
      } catch (e) {
        console.error("Failed to load completed modules:", e);
      }
    };
    
    if (isAuthenticated) {
      loadModulesStatus();
    }
  }, [isAuthenticated]);

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
    queryClient.invalidateQueries({ queryKey: ['/api/journey'] });
    
    if (allComplete) {
      setLocation("/serious-plan");
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
      return "Your personalized three-module coaching journey awaits. At the end, you'll receive your Serious Plan with decision snapshot, action plan, and conversation scripts.";
    } else if (allComplete) {
      return "You've completed all three coaching modules. Now it's time to receive your personalized Serious Plan.";
    } else {
      return `You've completed ${completedModules.length} of 3 modules. Keep going to unlock your Serious Plan.`;
    }
  };

  const getCtaText = () => {
    if (allComplete) {
      return "Get My Serious Plan";
    } else {
      const modules = coachingPlan?.modules || DEFAULT_COACHING_MODULES.map(m => ({ name: m.name, objective: m.description, approach: '', outcome: '' }));
      const nextModuleInfo = modules[nextModule - 1];
      return `Start Module ${nextModule}: ${nextModuleInfo?.name || 'Next'}`;
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header variant="default" />
        <main className="pt-24 pb-16 px-6">
          <div className="max-w-content-wide mx-auto flex items-center justify-center min-h-[50vh]">
            <div className="flex items-center gap-3 text-muted-foreground">
              <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="font-sans">Loading...</p>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header variant="default" />

      <main className="flex-1 pt-24 pb-16 px-6" data-testid="progress-page">
        <div className="max-w-content-wide mx-auto">
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
      </main>

      <Footer />
    </div>
  );
}
