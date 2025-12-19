import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { UserMenu } from "@/components/UserMenu";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { GraduationCap, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface LetterResponse {
  status: 'pending' | 'generating' | 'complete' | 'error';
  content: string | null;
  seenAt: string | null;
}

const CoachLetter = () => {
  const navigate = useNavigate();
  const { authChecked, isAuthenticated } = useAuth();

  useEffect(() => {
    document.title = "A Note From Your Coach - Serious People";
  }, []);

  const { data: letter, isLoading: letterLoading } = useQuery<LetterResponse>({
    queryKey: ['/api/serious-plan/letter'],
    enabled: authChecked && isAuthenticated,
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
      queryClient.invalidateQueries({ queryKey: ["/api/bootstrap"] });
      navigate('/serious-plan');
    },
  });

  const handleContinue = () => {
    markSeenMutation.mutate();
  };

  const handleSkipToplan = () => {
    navigate('/serious-plan');
  };

  if (!authChecked || letterLoading) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b border-border">
          <div className="sp-container py-6 flex items-center justify-between">
            <Link 
              to="/progress" 
              className="font-display text-xl tracking-tight hover:text-primary transition-colors duration-300"
              data-testid="link-home"
            >
              Serious People
            </Link>
            <UserMenu />
          </div>
        </header>
        <main className="sp-container py-16 flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">Loading...</p>
          </div>
        </main>
      </div>
    );
  }

  if (!letter || letter.status === 'pending' || letter.status === 'generating') {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b border-border">
          <div className="sp-container py-6 flex items-center justify-between">
            <Link 
              to="/progress" 
              className="font-display text-xl tracking-tight hover:text-primary transition-colors duration-300"
              data-testid="link-home"
            >
              Serious People
            </Link>
            <UserMenu />
          </div>
        </header>
        <main className="sp-container py-16">
          <div className="max-w-xl mx-auto" data-testid="letter-loading">
            <div className="bg-card border border-border p-8 md:p-12 text-center">
              <GraduationCap className="w-12 h-12 mx-auto mb-6 text-muted-foreground" />
              <h1 className="font-display text-2xl md:text-3xl text-foreground mb-4">
                Your Coach is Preparing Your Letter
              </h1>
              <div className="flex flex-col items-center gap-4">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                <p className="text-muted-foreground">
                  Taking a moment to reflect on your journey...
                </p>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (letter.status === 'error' || !letter.content) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b border-border">
          <div className="sp-container py-6 flex items-center justify-between">
            <Link 
              to="/progress" 
              className="font-display text-xl tracking-tight hover:text-primary transition-colors duration-300"
              data-testid="link-home"
            >
              Serious People
            </Link>
            <UserMenu />
          </div>
        </header>
        <main className="sp-container py-16">
          <div className="max-w-xl mx-auto" data-testid="letter-error">
            <div className="bg-card border border-border p-8 md:p-12 text-center">
              <h1 className="font-display text-2xl md:text-3xl text-foreground mb-4">
                Something went wrong
              </h1>
              <p className="text-muted-foreground mb-8">
                We couldn't load your coach's letter. Please try refreshing the page.
              </p>
              <Button
                onClick={handleSkipToplan}
                className="w-full sm:w-auto"
                data-testid="button-skip-to-plan"
              >
                Continue to Your Plan
              </Button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="sp-container py-6 flex items-center justify-between">
          <Link 
            to="/progress" 
            className="font-display text-xl tracking-tight hover:text-primary transition-colors duration-300"
            data-testid="link-home"
          >
            Serious People
          </Link>
          <UserMenu />
        </div>
      </header>
      <main className="sp-container py-16">
        <div className="max-w-2xl mx-auto" data-testid="coach-letter">
          <div className="bg-card border border-border p-8 md:p-12">
            <div className="text-center mb-8">
              <GraduationCap className="w-10 h-10 mx-auto mb-4 text-muted-foreground" />
              <h1 className="font-display text-2xl md:text-3xl text-foreground">
                A Note from Your Coach
              </h1>
            </div>

            <div className="space-y-4 mb-10" data-testid="text-letter-content">
              {letter.content.split('\n\n').map((paragraph, i) => (
                <p key={i} className="text-foreground leading-relaxed">
                  {paragraph}
                </p>
              ))}
            </div>

            <div className="text-center">
              <Button
                onClick={handleContinue}
                disabled={markSeenMutation.isPending}
                className="w-full sm:w-auto min-w-[200px]"
                data-testid="button-continue-to-plan"
              >
                {markSeenMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Loading...
                  </>
                ) : (
                  "Continue to Your Plan"
                )}
              </Button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default CoachLetter;
