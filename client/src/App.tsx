import { useEffect, useMemo } from "react";
import { Routes, Route, BrowserRouter, Navigate, useLocation } from "react-router-dom";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { initPostHog } from "@/lib/posthog";
import { AppShell } from "@/components/AppShell";

function ScrollToTop() {
  const { pathname } = useLocation();
  
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [pathname]);
  
  return null;
}

// Route guard: redirects to landing page if not authenticated
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  
  if (isLoading) {
    return null;
  }
  
  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }
  
  return <>{children}</>;
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
      {/* Public routes */}
      <Route path="/interview/start" element={<InterviewStart />} />
      <Route path="/login" element={<Login />} />
      
      {/* Protected routes - require authentication */}
      <Route path="/interview/prepare" element={<RequireAuth><InterviewPrepare /></RequireAuth>} />
      <Route path="/interview/chat" element={<RequireAuth><InterviewChat /></RequireAuth>} />
      <Route path="/offer" element={<RequireAuth><Offer /></RequireAuth>} />
      <Route path="/offer/success" element={<RequireAuth><Success /></RequireAuth>} />
      <Route path="/module/:moduleNumber" element={<RequireAuth><ModulePage /></RequireAuth>} />
      <Route path="/progress" element={<RequireAuth><Progress /></RequireAuth>} />
      <Route path="/coach-letter" element={<RequireAuth><CoachLetter /></RequireAuth>} />
      <Route path="/serious-plan" element={<RequireAuth><SeriousPlan /></RequireAuth>} />
      <Route path="/artifact/:artifactSlug" element={<RequireAuth><Artifacts /></RequireAuth>} />
      <Route path="/career-brief" element={<RequireAuth><CareerBrief /></RequireAuth>} />
      <Route path="/coach-chat" element={<RequireAuth><CoachChat /></RequireAuth>} />
      <Route path="/artifacts" element={<RequireAuth><Artifacts /></RequireAuth>} />
      
      {/* Debug/test routes */}
      <Route path="/__lovable" element={<LovableSmoke />} />
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
