import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { UserMenu } from "@/components/UserMenu";
import { FileText, MessageCircle, Loader2 } from "lucide-react";

interface Artifact {
  id: string;
  artifactKey: string;
  title: string;
  type: string;
  importanceLevel: 'must_read' | 'recommended' | 'optional' | 'bonus';
  whyImportant: string;
  contentRaw: string;
  generationStatus: 'pending' | 'generating' | 'complete' | 'error';
  pdfStatus: 'not_started' | 'generating' | 'ready' | 'error';
  pdfUrl: string | null;
  displayOrder: number;
  metadata?: {
    messages?: { role: string; content: string }[];
    summary?: string;
    [key: string]: any;
  };
}

interface SeriousPlan {
  id: string;
  status: 'generating' | 'ready' | 'error';
  coachNoteContent: string | null;
  summaryMetadata: {
    clientName: string;
    planHorizonType: string;
    planHorizonRationale: string;
    keyConstraints: string[];
    primaryRecommendation: string;
    emotionalTone: string;
  } | null;
  bundlePdfStatus: 'not_started' | 'generating' | 'ready' | 'error';
  bundlePdfUrl: string | null;
  emailSentAt: string | null;
  artifacts: Artifact[];
}

type CategoryFilter = 'all' | 'essential' | 'additional' | 'transcript';

function ArtifactSkeleton() {
  return (
    <div className="bg-card border border-border p-6 animate-pulse" data-testid="artifact-skeleton">
      <div className="flex items-center justify-between mb-4">
        <div className="h-4 w-8 bg-muted rounded" />
        <div className="h-5 w-16 bg-muted rounded" />
      </div>
      <div className="h-6 w-3/4 bg-muted rounded mb-3" />
      <div className="h-4 w-full bg-muted rounded mb-2" />
      <div className="h-4 w-2/3 bg-muted rounded" />
    </div>
  );
}

const SeriousPlan = () => {
  const navigate = useNavigate();
  const { authChecked, isAuthenticated } = useAuth();
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>('all');

  useEffect(() => {
    document.title = "Your Serious Plan - Serious People";
  }, []);

  const { data: plan, isLoading: planLoading } = useQuery<SeriousPlan>({
    queryKey: ['/api/serious-plan/latest'],
    enabled: authChecked && isAuthenticated,
    retry: false,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data || data.status === 'generating') {
        return 2000;
      }
      const anyArtifactGenerating = data.artifacts?.some(
        a => a.generationStatus === 'pending' || a.generationStatus === 'generating'
      );
      if (anyArtifactGenerating) {
        return 2000;
      }
      return false;
    },
  });

  const handleViewArtifact = (artifact: Artifact) => {
    navigate(`/artifact/${artifact.artifactKey}`);
  };

  const isEssential = (artifact: Artifact) => 
    artifact.importanceLevel === 'must_read' || (artifact.importanceLevel as string) === 'essential';

  const isTranscript = (artifact: Artifact) => artifact.type === 'transcript';

  const getFilteredArtifacts = () => {
    if (!plan?.artifacts) return [];
    switch (activeCategory) {
      case 'essential':
        return plan.artifacts.filter(a => isEssential(a));
      case 'additional':
        return plan.artifacts.filter(a => !isEssential(a) && !isTranscript(a));
      case 'transcript':
        return plan.artifacts.filter(a => isTranscript(a));
      default:
        return plan.artifacts;
    }
  };

  const getCategoryCounts = () => {
    if (!plan?.artifacts) return { all: 0, essential: 0, additional: 0, transcript: 0 };
    return {
      all: plan.artifacts.length,
      essential: plan.artifacts.filter(a => isEssential(a)).length,
      additional: plan.artifacts.filter(a => !isEssential(a) && !isTranscript(a)).length,
      transcript: plan.artifacts.filter(a => isTranscript(a)).length,
    };
  };

  const counts = getCategoryCounts();
  const filteredArtifacts = getFilteredArtifacts();

  const anyGenerating = plan?.artifacts?.some(
    a => a.generationStatus === 'pending' || a.generationStatus === 'generating'
  );

  if (!authChecked || planLoading) {
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
            <p className="text-muted-foreground">Loading your Serious Plan...</p>
          </div>
        </main>
      </div>
    );
  }

  if (!plan) {
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
          <div className="max-w-xl mx-auto text-center">
            <div className="bg-card border border-border p-8 md:p-12">
              <h1 className="font-display text-2xl md:text-3xl text-foreground mb-4">
                Preparing Your Plan
              </h1>
              <div className="flex flex-col items-center gap-4">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                <p className="text-muted-foreground">
                  Your coach is crafting personalized artifacts for your situation...
                </p>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const renderArtifactCard = (artifact: Artifact, index: number) => {
    const generating = artifact.generationStatus === 'pending' || artifact.generationStatus === 'generating';
    const hasError = artifact.generationStatus === 'error';
    
    if (generating) {
      return (
        <div key={artifact.id} className="bg-card border border-border p-6" data-testid={`card-artifact-generating-${artifact.artifactKey}`}>
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs text-muted-foreground font-mono">
              {String(index + 1).padStart(2, '0')}
            </span>
            <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 flex items-center gap-1">
              <Loader2 size={12} className="animate-spin" />
              Generating
            </span>
          </div>
          <h3 className="font-display text-lg text-foreground mb-2">
            {artifact.title || artifact.artifactKey.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
          </h3>
          <div className="h-4 w-full bg-muted rounded mb-2 animate-pulse" />
          <div className="h-4 w-2/3 bg-muted rounded animate-pulse" />
        </div>
      );
    }

    if (hasError) {
      return (
        <div key={artifact.id} className="bg-card border border-destructive/30 p-6" data-testid={`card-artifact-error-${artifact.artifactKey}`}>
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs text-muted-foreground font-mono">
              {String(index + 1).padStart(2, '0')}
            </span>
            <span className="text-xs px-2 py-0.5 rounded bg-destructive/10 text-destructive">
              Error
            </span>
          </div>
          <h3 className="font-display text-lg text-foreground mb-2">
            {artifact.title || artifact.artifactKey.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
          </h3>
          <p className="text-sm text-muted-foreground">
            This artifact couldn't be generated. Our team has been notified.
          </p>
        </div>
      );
    }

    const essential = isEssential(artifact);
    const transcript = isTranscript(artifact);
    
    return (
      <div 
        key={artifact.id} 
        className={`bg-card border border-border p-6 cursor-pointer transition-colors hover:border-foreground/30 ${essential ? 'ring-1 ring-primary/20' : ''}`}
        onClick={() => handleViewArtifact(artifact)}
        data-testid={`card-artifact-${artifact.artifactKey}`}
      >
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs text-muted-foreground font-mono">
            {String(index + 1).padStart(2, '0')}
          </span>
          <span className={`text-xs px-2 py-0.5 rounded ${
            essential 
              ? 'bg-primary/10 text-primary' 
              : transcript 
                ? 'bg-muted text-muted-foreground'
                : 'bg-muted text-muted-foreground'
          }`}>
            {essential ? 'Essential' : transcript ? 'Transcript' : 'Additional'}
          </span>
        </div>
        <h3 className="font-display text-lg text-foreground mb-2 flex items-center gap-2">
          {transcript && <MessageCircle size={16} className="text-muted-foreground" />}
          {!transcript && <FileText size={16} className="text-muted-foreground" />}
          {artifact.title}
        </h3>
        <p className="text-sm text-muted-foreground line-clamp-2 mb-4">
          {artifact.whyImportant}
        </p>
        <div className="text-sm text-primary font-medium">
          {transcript ? 'View Transcript →' : 'Read →'}
        </div>
      </div>
    );
  };

  const categories: { id: CategoryFilter; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: counts.all },
    { id: 'essential', label: 'Essential', count: counts.essential },
    { id: 'additional', label: 'Additional', count: counts.additional },
    { id: 'transcript', label: 'Transcript', count: counts.transcript },
  ];

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

      <main className="sp-container py-12">
        <div className="mb-10" data-testid="plan-overview">
          <p className="text-sm text-muted-foreground uppercase tracking-wider mb-2">Your Serious Plan</p>
          <h1 className="font-display text-3xl md:text-4xl text-foreground mb-2">
            {plan.summaryMetadata?.clientName ? `${plan.summaryMetadata.clientName}'s Plan` : 'Your Plan'}
          </h1>
          <p className="text-muted-foreground">
            {plan.artifacts?.length || 0} personalized artifacts prepared for you
            {anyGenerating && ' (some still generating...)'}
          </p>
        </div>

        <div className="flex flex-wrap gap-2 mb-8 border-b border-border pb-4">
          {categories.filter(c => c.count > 0 || c.id === 'all').map((category) => (
            <button
              key={category.id}
              onClick={() => setActiveCategory(category.id)}
              className={`px-4 py-2 text-sm transition-colors ${
                activeCategory === category.id
                  ? 'bg-foreground text-background'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
              data-testid={`tab-${category.id}`}
            >
              {category.label} ({category.count})
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredArtifacts.map((artifact, idx) => renderArtifactCard(artifact, idx))}
        </div>

        {filteredArtifacts.length === 0 && (
          <div className="text-center py-16">
            <p className="text-muted-foreground">No artifacts in this category yet.</p>
          </div>
        )}
      </main>
    </div>
  );
};

export default SeriousPlan;
