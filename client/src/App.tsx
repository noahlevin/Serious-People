import { useEffect, useMemo } from "react";
import { Routes, Route, BrowserRouter } from "react-router-dom";
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

// Detect if running at /app base path
function getBasePath(): string {
  if (typeof window !== "undefined" && window.location.pathname.startsWith("/app")) {
    return "/app";
  }
  return "";
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/__lovable" element={<LovableSmoke />} />

      <Route path="/login" element={<Login />} />
      <Route path="/prepare" element={<Prepare />} />
      <Route path="/interview" element={<Interview />} />
      <Route path="/offer" element={<Offer />} />
      <Route path="/success" element={<Success />} />
      <Route path="/module/:moduleNumber" element={<ModulePage />} />
      <Route path="/progress" element={<Progress />} />
      <Route path="/career-brief" element={<CareerBrief />} />
      <Route path="/serious-plan" element={<SeriousPlan />} />
      <Route path="/coach-chat" element={<CoachChat />} />
      <Route path="/coach-letter" element={<CoachLetter />} />

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

function Router() {
  const base = useMemo(() => getBasePath(), []);
  return (
    <BrowserRouter basename={base || undefined}>
      <AppRoutes />
    </BrowserRouter>
  );
}

export default function App() {
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
