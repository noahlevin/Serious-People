import { useEffect, useMemo } from "react";
import { Routes, Route, BrowserRouter, Navigate, useLocation } from "react-router-dom";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { initPostHog } from "@/lib/posthog";
import { AppShell } from "@/components/AppShell";

function ScrollToTop() {
  const { pathname } = useLocation();
  
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [pathname]);
  
  return null;
}

import Login from "@/pages/login";
import Offer from "@/pages/offer";
import Success from "@/pages/success";
import ModulePage from "@/pages/module";
import Progress from "@/pages/progress";
import CareerBrief from "@/pages/career-brief";
import SeriousPlan from "@/pages/serious-plan";
import CoachChat from "@/pages/coach-chat";
import CoachLetter from "@/pages/coach-letter";
import InterviewStart from "@/pages/interview-start";
import InterviewPrepare from "@/pages/interview-prepare";
import InterviewChat from "@/pages/interview-chat";
import Artifacts from "@/pages/artifacts";

import LovableSmoke from "@/pages/lovable-smoke";
import DebugChatComponents from "@/pages/debug-chat-components";
import NotFound from "@/pages/not-found";

// Detect if running at /app base path
function getBasePath(): string {
  if (
    typeof window !== "undefined" &&
    window.location.pathname.startsWith("/app")
  ) {
    return "/app";
  }
  return "";
}

function AppRoutes() {
  return (
    <Routes>
      {/* Canonical routes */}
      <Route path="/interview/start" element={<InterviewStart />} />
      <Route path="/interview/prepare" element={<InterviewPrepare />} />
      <Route path="/interview/chat" element={<InterviewChat />} />
      <Route path="/offer" element={<Offer />} />
      <Route path="/offer/success" element={<Success />} />
      <Route path="/module/:moduleNumber" element={<ModulePage />} />
      <Route path="/progress" element={<Progress />} />
      <Route path="/coach-letter" element={<CoachLetter />} />
      <Route path="/serious-plan" element={<SeriousPlan />} />
      <Route path="/artifact/:artifactSlug" element={<Artifacts />} />
      
      {/* Supporting routes */}
      <Route path="/login" element={<Login />} />
      <Route path="/career-brief" element={<CareerBrief />} />
      <Route path="/coach-chat" element={<CoachChat />} />
      <Route path="/artifacts" element={<Artifacts />} />
      <Route path="/__lovable" element={<LovableSmoke />} />
      {/* Debug route: only register in dev mode or when VITE_DEBUG_UI=1 */}
      {(import.meta.env.DEV || import.meta.env.VITE_DEBUG_UI === "1") && (
        <Route path="/debug/chat-components" element={<DebugChatComponents />} />
      )}
      
      {/* Legacy aliases → redirect to canonical */}
      <Route path="/" element={<Navigate to="/interview/start" replace />} />
      <Route path="/prepare" element={<Navigate to="/interview/prepare" replace />} />
      <Route path="/interview" element={<Navigate to="/interview/chat" replace />} />
      <Route path="/success" element={<Navigate to="/offer/success" replace />} />

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

function Router() {
  const base = useMemo(() => getBasePath(), []);
  return (
    <BrowserRouter basename={base || undefined}>
      <ScrollToTop />
      <AppShell>
        <AppRoutes />
      </AppShell>
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
