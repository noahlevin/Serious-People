import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { UserMenu } from "@/components/UserMenu";
import { apiRequest } from "@/lib/queryClient";
import { GraduationCap } from "lucide-react";
import "@/styles/serious-people.css";

interface LetterResponse {
  status: 'pending' | 'generating' | 'complete' | 'error';
  content: string | null;
  seenAt: string | null;
}

export default function CoachLetterPage() {
  const { isAuthenticated, isLoading: authLoading, refetch } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    document.title = "A Note From Your Coach - Serious People";
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      setLocation("/login");
    }
  }, [authLoading, isAuthenticated, setLocation]);

  const { data: letter, isLoading: letterLoading } = useQuery<LetterResponse>({
    queryKey: ['/api/serious-plan/letter'],
    enabled: isAuthenticated && !authLoading,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data || data.status === 'pending' || data.status === 'generating') {
        return 2000;
      }
      return false;
    },
  });

  const markSeenMutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/serious-plan/letter/seen'),
    onSuccess: () => {
      setLocation('/serious-plan');
    },
  });

  const handleContinue = () => {
    markSeenMutation.mutate();
  };

  if (authLoading || letterLoading) {
    return (
      <div className="sp-page">
        <header className="sp-success-header">
          <div className="sp-header-content">
            <Link href="/" className="sp-logo-link" data-testid="link-home">
              <img src="/favicon.png" alt="Serious People" className="sp-logo-icon" />
              <span className="sp-logo">Serious People</span>
            </Link>
            <UserMenu />
          </div>
        </header>
        <div className="sp-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh' }}>
          <p className="sp-body">Loading...</p>
        </div>
      </div>
    );
  }

  if (!letter || letter.status === 'pending' || letter.status === 'generating') {
    return (
      <div className="sp-page">
        <header className="sp-success-header">
          <div className="sp-header-content">
            <Link href="/" className="sp-logo-link" data-testid="link-home">
              <img src="/favicon.png" alt="Serious People" className="sp-logo-icon" />
              <span className="sp-logo">Serious People</span>
            </Link>
            <UserMenu />
          </div>
        </header>
        <main className="sp-container">
          <div className="sp-graduation-note" data-testid="letter-loading">
            <div className="sp-graduation-header" style={{ textAlign: 'center' }}>
              <GraduationCap size={48} style={{ marginBottom: '1rem', opacity: 0.8 }} />
              <h1 className="sp-coach-header">Your Coach is Preparing Your Letter</h1>
            </div>
            <div className="sp-generating-indicator">
              <div className="sp-spinner"></div>
              <p className="sp-body" style={{ marginTop: '1rem', textAlign: 'center' }}>
                Taking a moment to reflect on your journey...
              </p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (letter.status === 'error' || !letter.content) {
    return (
      <div className="sp-page">
        <header className="sp-success-header">
          <div className="sp-header-content">
            <Link href="/" className="sp-logo-link" data-testid="link-home">
              <img src="/favicon.png" alt="Serious People" className="sp-logo-icon" />
              <span className="sp-logo">Serious People</span>
            </Link>
            <UserMenu />
          </div>
        </header>
        <main className="sp-container">
          <div className="sp-graduation-note" data-testid="letter-error">
            <h1 className="sp-coach-header" style={{ textAlign: 'center' }}>Something went wrong</h1>
            <p className="sp-body" style={{ textAlign: 'center' }}>
              We couldn't load your coach's letter. Please try refreshing the page.
            </p>
            <div className="sp-graduation-cta">
              <button
                className="sp-plan-cta"
                onClick={() => setLocation('/serious-plan')}
                data-testid="button-skip-to-plan"
              >
                Continue to Your Plan
                <span className="sp-plan-cta-arrow">→</span>
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="sp-page">
      <header className="sp-success-header">
        <div className="sp-header-content">
          <Link href="/" className="sp-logo-link" data-testid="link-home">
            <img src="/favicon.png" alt="Serious People" className="sp-logo-icon" />
            <span className="sp-logo">Serious People</span>
          </Link>
          <UserMenu />
        </div>
      </header>
      <main className="sp-container">
        <div className="sp-graduation-note" data-testid="coach-letter">
          <div className="sp-graduation-header">
            <div className="sp-letter-icon-row" style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
              <GraduationCap size={40} style={{ opacity: 0.8 }} />
            </div>
            <h1 className="sp-coach-header">A Note from Your Coach</h1>
          </div>

          <div className="sp-coach-note-content" data-testid="text-letter-content">
            {letter.content.split('\n\n').map((paragraph, i) => (
              <p key={i} className="sp-body">{paragraph}</p>
            ))}
          </div>

          <div className="sp-graduation-cta">
            <button
              className="sp-plan-cta"
              onClick={handleContinue}
              disabled={markSeenMutation.isPending}
              data-testid="button-continue-to-plan"
            >
              {markSeenMutation.isPending ? "Loading..." : "Continue to Your Plan"}
              <span className="sp-plan-cta-arrow">→</span>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
