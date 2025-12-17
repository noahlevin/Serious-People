import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { UserMenu } from "@/components/UserMenu";
import { formatContent } from "@/components/ChatComponents";
import { FileText, MessageCircle, ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

function parseMarkdownInline(text: string): (string | JSX.Element)[] | string {
  const parts: (string | JSX.Element)[] = [];
  let lastIndex = 0;
  const regex = /\*\*\[(.+?)\]\((.+?)\)\*\*|\[(.+?)\]\((.+?)\)|\*\*(.+?)\*\*|\*(.+?)\*|(https?:\/\/[^\s)]+)/g;
  let match;
  let keyCounter = 0;
  
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }
    
    if (match[1] && match[2]) {
      parts.push(
        <a key={`link-${keyCounter++}`} href={match[2]} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 hover:text-primary-hover">
          <strong>{match[1]}</strong>
        </a>
      );
    } else if (match[3] && match[4]) {
      parts.push(
        <a key={`link-${keyCounter++}`} href={match[4]} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 hover:text-primary-hover">
          {match[3]}
        </a>
      );
    } else if (match[5]) {
      parts.push(<strong key={`bold-${keyCounter++}`}>{match[5]}</strong>);
    } else if (match[6]) {
      parts.push(<em key={`italic-${keyCounter++}`}>{match[6]}</em>);
    } else if (match[7]) {
      parts.push(
        <a key={`url-${keyCounter++}`} href={match[7]} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 hover:text-primary-hover">
          {match[7]}
        </a>
      );
    }
    
    lastIndex = regex.lastIndex;
  }
  
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }
  
  return parts.length > 0 ? parts : text;
}

function preprocessMarkdownContent(content: string | null | undefined): string {
  if (!content) return '';
  return content.replace(/\]\s*\n\s*\(/g, '](');
}

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

type ViewMode = 'overview' | 'artifact';

function ArtifactSkeleton() {
  return (
    <Card className="animate-pulse" data-testid="artifact-skeleton">
      <CardHeader className="space-y-3">
        <div className="h-4 w-20 bg-muted rounded" />
        <div className="h-6 w-3/4 bg-muted rounded" />
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="h-4 w-full bg-muted rounded" />
        <div className="h-4 w-2/3 bg-muted rounded" />
      </CardContent>
    </Card>
  );
}

function TranscriptRenderer({ artifact }: { artifact: Artifact }) {
  let parsedData: { messages?: { role: string; content: string }[]; summary?: string } = {};
  if (artifact.contentRaw) {
    try {
      parsedData = JSON.parse(artifact.contentRaw);
    } catch (e) {
      // Not valid JSON, ignore
    }
  }
  
  const messages = parsedData.messages || artifact.metadata?.messages || [];
  const summary = parsedData.summary || artifact.metadata?.summary || artifact.whyImportant;

  return (
    <div className="space-y-8">
      {summary && (
        <div className="bg-sage-wash p-6 rounded-lg border border-border" data-testid="text-transcript-summary">
          <h3 className="font-serif text-lg font-semibold text-foreground mb-3">Summary</h3>
          <div 
            className="font-sans text-foreground leading-relaxed prose prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: formatContent(summary) }}
          />
        </div>
      )}
      <div className="space-y-4">
        <h3 className="font-serif text-lg font-semibold text-foreground">Conversation</h3>
        {messages.map((msg, idx) => (
          <div 
            key={idx} 
            className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
            data-testid={`transcript-message-${idx}`}
          >
            <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
              msg.role === 'assistant' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'
            }`}>
              {msg.role === 'assistant' ? (
                <MessageCircle size={16} />
              ) : (
                <span className="text-xs font-medium">You</span>
              )}
            </div>
            <div 
              className={`flex-1 p-4 rounded-lg ${
                msg.role === 'assistant' 
                  ? 'bg-card border border-border' 
                  : 'bg-primary text-primary-foreground'
              }`}
            >
              <div 
                className="prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: formatContent(msg.content) }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function SeriousPlanPage() {
  const { isAuthenticated, isLoading: authLoading, refetch } = useAuth();
  const [, setLocation] = useLocation();
  const [viewMode, setViewMode] = useState<ViewMode>('overview');
  const [selectedArtifact, setSelectedArtifact] = useState<Artifact | null>(null);

  useEffect(() => {
    document.title = "Your Serious Plan - Serious People";
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);
  
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      setLocation("/login");
    }
  }, [authLoading, isAuthenticated, setLocation]);

  const { data: plan, isLoading: planLoading } = useQuery<SeriousPlan>({
    queryKey: ['/api/serious-plan/latest'],
    enabled: isAuthenticated && !authLoading,
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
    setSelectedArtifact(artifact);
    setViewMode('artifact');
    window.scrollTo(0, 0);
    window.history.pushState({ artifactView: true, artifactId: artifact.id }, '', window.location.pathname);
  };

  const handleBackToOverview = () => {
    window.history.back();
  };
  
  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      if (viewMode === 'artifact') {
        setSelectedArtifact(null);
        setViewMode('overview');
        window.scrollTo(0, 0);
      }
    };
    
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [viewMode]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="flex items-center justify-center min-h-[50vh]">
          <p className="font-sans text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (planLoading) {
    return (
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-50 bg-background border-b border-border">
          <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-3 no-underline" data-testid="link-home">
              <img src="/favicon.png" alt="Serious People" className="w-9 h-9 rounded border border-border" />
              <span className="font-serif text-lg font-bold text-foreground uppercase tracking-wide">Serious People</span>
            </Link>
            <UserMenu />
          </div>
        </header>
        <div className="flex items-center justify-center min-h-[50vh]">
          <p className="font-sans text-muted-foreground">Loading your Serious Plan...</p>
        </div>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-50 bg-background border-b border-border">
          <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-3 no-underline" data-testid="link-home">
              <img src="/favicon.png" alt="Serious People" className="w-9 h-9 rounded border border-border" />
              <span className="font-serif text-lg font-bold text-foreground uppercase tracking-wide">Serious People</span>
            </Link>
            <UserMenu />
          </div>
        </header>
        <main className="max-w-4xl mx-auto px-6 py-16">
          <Card className="text-center p-12">
            <h1 className="font-serif text-2xl font-bold text-foreground mb-6">
              Preparing Your Plan
            </h1>
            <div className="flex flex-col items-center gap-4">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="font-sans text-muted-foreground">
                Your coach is crafting personalized artifacts for your situation...
              </p>
            </div>
          </Card>
        </main>
      </div>
    );
  }

  if (viewMode === 'artifact' && selectedArtifact) {
    const isTranscript = selectedArtifact.type === 'transcript';
    
    return (
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-50 bg-background border-b border-border">
          <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-3 no-underline" data-testid="link-home">
              <img src="/favicon.png" alt="Serious People" className="w-9 h-9 rounded border border-border" />
              <span className="font-serif text-lg font-bold text-foreground uppercase tracking-wide">Serious People</span>
            </Link>
            <UserMenu />
          </div>
        </header>
        <main className="max-w-3xl mx-auto px-6 py-8">
          <div data-testid={`artifact-${selectedArtifact.artifactKey}`}>
            <Button 
              variant="ghost"
              onClick={handleBackToOverview}
              data-testid="button-back"
              className="mb-6 gap-2"
            >
              <ArrowLeft size={16} />
              Back to Plan
            </Button>

            <article className="bg-card border border-card-border rounded-xl p-8 md:p-12">
              <header className="mb-8 pb-8 border-b border-border text-center">
                <div className="w-16 h-px bg-foreground mx-auto mb-6" />
                <Badge 
                  variant={selectedArtifact.importanceLevel === 'must_read' ? 'default' : 'secondary'}
                  className="mb-4"
                >
                  {selectedArtifact.importanceLevel === 'must_read' ? 'Essential' : 
                   selectedArtifact.importanceLevel === 'recommended' ? 'Recommended' :
                   selectedArtifact.importanceLevel === 'bonus' ? 'Bonus' : 'Reference'}
                </Badge>
                <h1 className="font-serif text-2xl md:text-3xl font-bold text-foreground">
                  {selectedArtifact.title}
                </h1>
                <div className="w-16 h-px bg-foreground mx-auto mt-6" />
              </header>

              {selectedArtifact.whyImportant && !isTranscript && (
                <div className="bg-terracotta-wash text-foreground p-6 rounded-lg mb-8 font-sans text-body leading-relaxed italic border-l-4 border-terracotta">
                  {selectedArtifact.whyImportant}
                </div>
              )}

              {isTranscript ? (
                <TranscriptRenderer artifact={selectedArtifact} />
              ) : !selectedArtifact.contentRaw ? (
                <div data-testid="text-artifact-content">
                  <p className="font-sans text-muted-foreground italic">
                    This artifact is still being generated. Please check back in a moment.
                  </p>
                </div>
              ) : (
                <div className="prose prose-lg max-w-none" data-testid="text-artifact-content">
                  {preprocessMarkdownContent(selectedArtifact.contentRaw).split('\n').map((line, i) => {
                    if (line.startsWith('### ')) {
                      return <h3 key={i} className="font-serif text-lg font-semibold text-foreground mt-8 mb-4">{parseMarkdownInline(line.replace('### ', ''))}</h3>;
                    }
                    if (line.startsWith('## ')) {
                      return <h2 key={i} className="font-serif text-xl font-bold text-foreground mt-10 mb-4">{parseMarkdownInline(line.replace('## ', ''))}</h2>;
                    }
                    if (line.startsWith('# ')) {
                      return <h1 key={i} className="font-serif text-2xl font-bold text-foreground mt-12 mb-6">{parseMarkdownInline(line.replace('# ', ''))}</h1>;
                    }
                    if (line.startsWith('- ')) {
                      return <li key={i} className="font-sans text-foreground leading-relaxed ml-4">{parseMarkdownInline(line.replace('- ', ''))}</li>;
                    }
                    if (line.startsWith('**') && line.endsWith('**')) {
                      return <p key={i} className="font-sans font-semibold text-foreground">{line.replace(/\*\*/g, '')}</p>;
                    }
                    if (line.trim() === '') {
                      return <div key={i} className="h-4" />;
                    }
                    return <p key={i} className="font-sans text-foreground leading-relaxed mb-4">{parseMarkdownInline(line)}</p>;
                  })}
                </div>
              )}
            </article>
          </div>
        </main>
      </div>
    );
  }

  const essentialArtifacts = plan?.artifacts?.filter(a => 
    a.importanceLevel === 'must_read' || (a.importanceLevel as string) === 'essential'
  ) || [];
  
  const additionalArtifacts = plan?.artifacts?.filter(a => 
    a.importanceLevel !== 'must_read' && (a.importanceLevel as string) !== 'essential'
  ) || [];

  const anyGenerating = plan?.artifacts?.some(
    a => a.generationStatus === 'pending' || a.generationStatus === 'generating'
  );

  const renderArtifactCard = (artifact: Artifact, index: number, isEssential: boolean) => {
    const isGenerating = artifact.generationStatus === 'pending' || artifact.generationStatus === 'generating';
    
    if (isGenerating) {
      return <ArtifactSkeleton key={artifact.id} />;
    }

    const isTranscript = artifact.type === 'transcript';
    
    return (
      <Card 
        key={artifact.id} 
        className={`cursor-pointer hover-elevate transition-all duration-200 ${isEssential ? 'ring-2 ring-primary/20' : ''}`}
        onClick={() => handleViewArtifact(artifact)}
        data-testid={`card-artifact-${artifact.artifactKey}`}
      >
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="font-serif text-2xl font-bold text-muted-foreground">
              {String(index + 1).padStart(2, '0')}
            </span>
            <Badge variant={isEssential ? 'default' : 'secondary'}>
              {isEssential ? 'Essential' : artifact.importanceLevel === 'bonus' ? 'Bonus' : 'Additional'}
            </Badge>
          </div>
          <CardTitle className="font-serif text-lg font-semibold leading-tight flex items-center gap-2">
            {isTranscript && <MessageCircle size={16} className="flex-shrink-0" />}
            {artifact.title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="font-sans text-sm text-muted-foreground leading-relaxed mb-4 line-clamp-2">
            {artifact.whyImportant}
          </p>
          <span className="font-sans text-sm font-medium text-primary">
            {isTranscript ? 'View Transcript →' : 'Read →'}
          </span>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-background border-b border-border">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 no-underline" data-testid="link-home">
            <img src="/favicon.png" alt="Serious People" className="w-9 h-9 rounded border border-border" />
            <span className="font-serif text-lg font-bold text-foreground uppercase tracking-wide">Serious People</span>
          </Link>
          <UserMenu />
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-6 py-8">
        <div data-testid="plan-overview">
          <div className="text-center mb-12">
            <div className="w-16 h-px bg-foreground mx-auto mb-6" />
            <h1 className="font-serif text-3xl md:text-4xl font-bold text-foreground mb-3">
              Your Serious Plan
            </h1>
            <p className="font-sans text-muted-foreground">
              {plan?.artifacts?.length || 0} personalized artifacts prepared for you
              {anyGenerating && ' (some still generating...)'}
            </p>
            <div className="w-16 h-px bg-foreground mx-auto mt-6" />
          </div>

          {essentialArtifacts.length > 0 && (
            <section className="mb-12" data-testid="section-essential">
              <div className="mb-6">
                <span className="font-sans text-xs font-semibold uppercase tracking-widest text-primary">
                  Essential
                </span>
                <h2 className="font-serif text-xl font-bold text-foreground mt-1">
                  Start Here
                </h2>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {essentialArtifacts.map((artifact, idx) => renderArtifactCard(artifact, idx, true))}
              </div>
            </section>
          )}

          {additionalArtifacts.length > 0 && (
            <section data-testid="section-additional">
              <div className="mb-6">
                <span className="font-sans text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Additional
                </span>
                <h2 className="font-serif text-xl font-bold text-foreground mt-1">
                  Your Toolkit
                </h2>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {additionalArtifacts.map((artifact, idx) => renderArtifactCard(artifact, idx, false))}
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
