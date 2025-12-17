import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { UserMenu } from "@/components/UserMenu";
import { apiRequest } from "@/lib/queryClient";
import { GraduationCap, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

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
      <div className="min-h-screen bg-background">
        <header className="border-b border-border bg-background/95 backdrop-blur-sm">
          <div className="max-w-container mx-auto px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <Link href="/" className="flex items-center gap-3 group" data-testid="link-home">
                <span className="font-serif text-xl font-bold tracking-tight text-foreground group-hover:text-primary transition-colors">
                  Serious People
                </span>
              </Link>
              <UserMenu />
            </div>
          </div>
        </header>
        <div className="flex items-center justify-center min-h-[50vh]">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!letter || letter.status === 'pending' || letter.status === 'generating') {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b border-border bg-background/95 backdrop-blur-sm">
          <div className="max-w-container mx-auto px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <Link href="/" className="flex items-center gap-3 group" data-testid="link-home">
                <span className="font-serif text-xl font-bold tracking-tight text-foreground group-hover:text-primary transition-colors">
                  Serious People
                </span>
              </Link>
              <UserMenu />
            </div>
          </div>
        </header>
        <main className="max-w-content mx-auto px-6 py-16">
          <Card className="p-8 md:p-12" data-testid="letter-loading">
            <div className="text-center">
              <h1 className="font-serif text-2xl md:text-3xl font-semibold text-foreground mb-8">
                Your Coach is Preparing Your Letter
              </h1>
              <div className="flex flex-col items-center gap-4">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
                <p className="text-muted-foreground">
                  Taking a moment to reflect on your journey...
                </p>
              </div>
            </div>
          </Card>
        </main>
      </div>
    );
  }

  if (letter.status === 'error' || !letter.content) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b border-border bg-background/95 backdrop-blur-sm">
          <div className="max-w-container mx-auto px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <Link href="/" className="flex items-center gap-3 group" data-testid="link-home">
                <span className="font-serif text-xl font-bold tracking-tight text-foreground group-hover:text-primary transition-colors">
                  Serious People
                </span>
              </Link>
              <UserMenu />
            </div>
          </div>
        </header>
        <main className="max-w-content mx-auto px-6 py-16">
          <Card className="p-8 md:p-12" data-testid="letter-error">
            <div className="text-center">
              <h1 className="font-serif text-2xl md:text-3xl font-semibold text-foreground mb-4">
                Something went wrong
              </h1>
              <p className="text-muted-foreground mb-8">
                We couldn't load your coach's letter. Please try refreshing the page.
              </p>
              <Button
                onClick={() => setLocation('/serious-plan')}
                data-testid="button-skip-to-plan"
              >
                Continue to Your Plan
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="max-w-container mx-auto px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link href="/" className="flex items-center gap-3 group" data-testid="link-home">
              <span className="font-serif text-xl font-bold tracking-tight text-foreground group-hover:text-primary transition-colors">
                Serious People
              </span>
            </Link>
            <UserMenu />
          </div>
        </div>
      </header>
      <main className="max-w-content mx-auto px-6 py-16">
        <Card className="p-8 md:p-12" data-testid="coach-letter">
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 rounded-full bg-sage-wash flex items-center justify-center">
                <GraduationCap className="w-8 h-8 text-primary" />
              </div>
            </div>
            <h1 className="font-serif text-2xl md:text-3xl font-semibold text-foreground">
              A Note from Your Coach
            </h1>
          </div>

          <div className="space-y-4 text-foreground leading-relaxed" data-testid="text-letter-content">
            {letter.content.split('\n\n').map((paragraph, i) => (
              <p key={i}>{paragraph}</p>
            ))}
          </div>

          <div className="mt-10 pt-8 border-t border-border flex justify-center">
            <Button
              onClick={handleContinue}
              disabled={markSeenMutation.isPending}
              size="lg"
              data-testid="button-continue-to-plan"
            >
              {markSeenMutation.isPending ? "Loading..." : "Continue to Your Plan"}
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </Card>
      </main>
    </div>
  );
}
