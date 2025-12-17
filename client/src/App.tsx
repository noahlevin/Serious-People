import { useEffect, useMemo } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { initPostHog } from "@/lib/posthog";
import Landing from "@/pages/landing";
import Login from "@/pages/login";
import Prepare from "@/pages/prepare";
import Interview from "@/pages/interview";
import Offer from "@/pages/offer";
import Success from "@/pages/success";
import ModulePage from "@/pages/module";
import Progress from "@/pages/progress";
import CareerBrief from "@/pages/career-brief";
import SeriousPlan from "@/pages/serious-plan";
import CoachChat from "@/pages/coach-chat";
import CoachLetter from "@/pages/coach-letter";
import NotFound from "@/pages/not-found";
import LovableSmoke from "@/pages/lovable-smoke";


// Detect if running at /app base path (Phase 5: optional /app mount)
function getBasePath(): string {
  if (typeof window !== "undefined" && window.location.pathname.startsWith("/app")) {
    return "/app";
  }
  return "";
}

function AppRoutes() {
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/login" component={Login} />
      <Route path="/prepare" component={Prepare} />
      <Route path="/interview" component={Interview} />
      <Route path="/offer" component={Offer} />
      <Route path="/success" component={Success} />
      <Route path="/module/:moduleNumber" component={ModulePage} />
      <Route path="/progress" component={Progress} />
      <Route path="/career-brief" component={CareerBrief} />
      <Route path="/serious-plan" component={SeriousPlan} />
      <Route path="/coach-chat" component={CoachChat} />
      <Route path="/coach-letter" component={CoachLetter} />
      <Route component={NotFound} />
      <Route path="/__lovable" component={LovableSmoke} />
    </Switch>
  );
}

function Router() {
  const base = useMemo(() => getBasePath(), []);
  
  if (base) {
    return (
      <WouterRouter base={base}>
        <AppRoutes />
      </WouterRouter>
    );
  }
  
  return <AppRoutes />;
}

function App() {
  useEffect(() => {
    initPostHog();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
