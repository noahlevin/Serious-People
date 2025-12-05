import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import Landing from "@/pages/landing";
import Login from "@/pages/login";
import Interview from "@/pages/interview";
import Success from "@/pages/success";
import ModulePage from "@/pages/module";
import Progress from "@/pages/progress";
import CareerBrief from "@/pages/career-brief";
import SeriousPlan from "@/pages/serious-plan";
import CoachChat from "@/pages/coach-chat";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/login" component={Login} />
      <Route path="/interview" component={Interview} />
      <Route path="/success" component={Success} />
      <Route path="/module/:moduleNumber" component={ModulePage} />
      <Route path="/progress" component={Progress} />
      <Route path="/career-brief" component={CareerBrief} />
      <Route path="/serious-plan" component={SeriousPlan} />
      <Route path="/coach-chat" component={CoachChat} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
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
