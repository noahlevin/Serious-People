import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useEffect } from "react";
import type { JourneyState, JourneyStep } from "@shared/schema";

interface JourneyResponse {
  state: JourneyState;
  currentStep: JourneyStep;
  currentPath: string;
}

export function useJourney() {
  const { data, isLoading, error, refetch } = useQuery<JourneyResponse>({
    queryKey: ["/api/journey"],
    retry: false,
    staleTime: 0, // Always refetch to ensure fresh journey state
  });

  return {
    journeyState: data?.state ?? null,
    currentStep: data?.currentStep ?? null,
    currentPath: data?.currentPath ?? null,
    isLoading,
    error,
    refetch,
  };
}

export function useJourneyGate(requiredStep: JourneyStep) {
  const [, setLocation] = useLocation();
  const { journeyState, currentStep, currentPath, isLoading } = useJourney();
  
  const stepOrder: JourneyStep[] = [
    'interview', 'paywall', 'module_1', 'module_2', 'module_3', 'graduation', 'serious_plan'
  ];
  
  useEffect(() => {
    if (isLoading || !currentStep) return;
    
    const requiredIndex = stepOrder.indexOf(requiredStep);
    const currentIndex = stepOrder.indexOf(currentStep);
    
    if (requiredIndex > currentIndex) {
      setLocation(currentPath || '/interview');
    }
  }, [isLoading, currentStep, requiredStep, currentPath, setLocation]);
  
  const canAccess = !isLoading && currentStep && 
    stepOrder.indexOf(requiredStep) <= stepOrder.indexOf(currentStep);
  
  return {
    canAccess,
    isLoading,
    journeyState,
    currentStep,
    shouldRedirect: !isLoading && !canAccess,
  };
}

export function canAccessModule(journeyState: JourneyState | null, moduleNumber: 1 | 2 | 3): boolean {
  if (!journeyState) return false;
  if (!journeyState.paymentVerified) return false;
  
  switch (moduleNumber) {
    case 1:
      return true;
    case 2:
      return journeyState.module1Complete;
    case 3:
      return journeyState.module1Complete && journeyState.module2Complete;
    default:
      return false;
  }
}

export function getNextStep(journeyState: JourneyState): { step: JourneyStep; path: string } {
  if (!journeyState.interviewComplete) {
    return { step: 'interview', path: '/interview' };
  }
  if (!journeyState.paymentVerified) {
    return { step: 'paywall', path: '/interview' };
  }
  if (!journeyState.module1Complete) {
    return { step: 'module_1', path: '/module/1' };
  }
  if (!journeyState.module2Complete) {
    return { step: 'module_2', path: '/module/2' };
  }
  if (!journeyState.module3Complete) {
    return { step: 'module_3', path: '/module/3' };
  }
  if (!journeyState.hasSeriousPlan) {
    return { step: 'graduation', path: '/coach-letter' };
  }
  return { step: 'serious_plan', path: '/serious-plan' };
}
