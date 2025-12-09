import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { UserMenu } from "@/components/UserMenu";
import { FileText, MessageCircle } from "lucide-react";
import "@/styles/serious-people.css";

function parseMarkdownInline(text: string): (string | JSX.Element)[] | string {
  const parts: (string | JSX.Element)[] = [];
  let lastIndex = 0;
  // Match bold-wrapped links first, then regular links, then bold, italic, and bare URLs
  // Order matters: more specific patterns first
  const regex = /\*\*\[(.+?)\]\((.+?)\)\*\*|\[(.+?)\]\((.+?)\)|\*\*(.+?)\*\*|\*(.+?)\*|(https?:\/\/[^\s)]+)/g;
  let match;
  let keyCounter = 0;
  
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }
    
    if (match[1] && match[2]) {
      // Bold-wrapped markdown link **[text](url)**
      parts.push(
        <a key={`link-${keyCounter++}`} href={match[2]} target="_blank" rel="noopener noreferrer" className="sp-artifact-link">
          <strong>{match[1]}</strong>
        </a>
      );
    } else if (match[3] && match[4]) {
      // Regular markdown link [text](url)
      parts.push(
        <a key={`link-${keyCounter++}`} href={match[4]} target="_blank" rel="noopener noreferrer" className="sp-artifact-link">
          {match[3]}
        </a>
      );
    } else if (match[5]) {
      // Bold text **text**
      parts.push(<strong key={`bold-${keyCounter++}`}>{match[5]}</strong>);
    } else if (match[6]) {
      // Italic text *text*
      parts.push(<em key={`italic-${keyCounter++}`}>{match[6]}</em>);
    } else if (match[7]) {
      // Bare URL - make it clickable
      parts.push(
        <a key={`url-${keyCounter++}`} href={match[7]} target="_blank" rel="noopener noreferrer" className="sp-artifact-link">
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

// Preprocess content to fix broken markdown links (where ] and ( are on separate lines)
function preprocessMarkdownContent(content: string): string {
  // Join lines where a link title ends with ] on one line and ( starts on the next
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
    <div className="sp-artifact-card sp-artifact-skeleton" data-testid="artifact-skeleton">
      <div className="sp-artifact-card-header">
        <div className="sp-skeleton-line sp-skeleton-short"></div>
      </div>
      <div className="sp-skeleton-line sp-skeleton-title"></div>
      <div className="sp-skeleton-line sp-skeleton-text"></div>
      <div className="sp-skeleton-line sp-skeleton-text-short"></div>
    </div>
  );
}

function TranscriptRenderer({ artifact }: { artifact: Artifact }) {
  // Parse contentRaw if it contains transcript data (stored as JSON string)
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
    <div className="sp-transcript-container">
      {summary && (
        <div className="sp-transcript-summary" data-testid="text-transcript-summary">
          <h3 className="sp-artifact-h3">Summary</h3>
          <p className="sp-body">{summary}</p>
        </div>
      )}
      <div className="sp-transcript-messages">
        <h3 className="sp-artifact-h3">Conversation</h3>
        {messages.map((msg, idx) => (
          <div 
            key={idx} 
            className={`sp-transcript-message sp-transcript-${msg.role}`}
            data-testid={`transcript-message-${idx}`}
          >
            <div className="sp-transcript-role">
              {msg.role === 'assistant' ? (
                <MessageCircle size={16} />
              ) : (
                <span className="sp-transcript-user-icon">You</span>
              )}
            </div>
            <div className="sp-transcript-content">
              {msg.content}
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
    // Push state so browser back button returns to overview
    window.history.pushState({ artifactView: true, artifactId: artifact.id }, '', window.location.pathname);
  };

  const handleBackToOverview = () => {
    // Use history.back() to properly integrate with browser navigation
    window.history.back();
  };
  
  // Handle browser back button
  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      // If we're in artifact view and user hits back, return to overview
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
      <div className="sp-page">
        <div className="sp-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh' }}>
          <p className="sp-body">Loading...</p>
        </div>
      </div>
    );
  }

  if (planLoading) {
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
          <p className="sp-body">Loading your Serious Plan...</p>
        </div>
      </div>
    );
  }

  if (!plan) {
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
          <div className="sp-graduation-note">
            <h1 className="sp-headline" style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
              Preparing Your Plan
            </h1>
            <div className="sp-generating-indicator">
              <div className="sp-spinner"></div>
              <p className="sp-body" style={{ marginTop: '1rem' }}>
                Your coach is crafting personalized artifacts for your situation...
              </p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (viewMode === 'artifact' && selectedArtifact) {
    const isTranscript = selectedArtifact.type === 'transcript';
    
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
          <div className="sp-artifact-view" data-testid={`artifact-${selectedArtifact.artifactKey}`}>
            <button 
              className="sp-back-button"
              onClick={handleBackToOverview}
              data-testid="button-back"
            >
              ← Back to Plan
            </button>

            <article className="sp-artifact-document">
              <header className="sp-artifact-doc-header">
                <div className="sp-wsj-header-line"></div>
                <span className={`sp-importance-tag sp-tag-${selectedArtifact.importanceLevel === 'must_read' ? 'essential' : selectedArtifact.importanceLevel}`}>
                  {selectedArtifact.importanceLevel === 'must_read' ? 'Essential' : 
                   selectedArtifact.importanceLevel === 'recommended' ? 'Recommended' :
                   selectedArtifact.importanceLevel === 'bonus' ? 'Bonus' : 'Reference'}
                </span>
                <h1 className="sp-artifact-doc-title">{selectedArtifact.title}</h1>
                <div className="sp-wsj-header-line"></div>
              </header>

              {selectedArtifact.whyImportant && !isTranscript && (
                <div className="sp-artifact-intro">
                  {selectedArtifact.whyImportant}
                </div>
              )}

              {isTranscript ? (
                <TranscriptRenderer artifact={selectedArtifact} />
              ) : (
                <div className="sp-artifact-body" data-testid="text-artifact-content">
                  {preprocessMarkdownContent(selectedArtifact.contentRaw).split('\n').map((line, i) => {
                    if (line.startsWith('### ')) {
                      return <h3 key={i} className="sp-artifact-h3">{parseMarkdownInline(line.replace('### ', ''))}</h3>;
                    }
                    if (line.startsWith('## ')) {
                      return <h2 key={i} className="sp-artifact-h2">{parseMarkdownInline(line.replace('## ', ''))}</h2>;
                    }
                    if (line.startsWith('# ')) {
                      return <h1 key={i} className="sp-artifact-h1">{parseMarkdownInline(line.replace('# ', ''))}</h1>;
                    }
                    if (line.startsWith('- ')) {
                      return <li key={i} className="sp-artifact-li">{parseMarkdownInline(line.replace('- ', ''))}</li>;
                    }
                    if (line.startsWith('**') && line.endsWith('**')) {
                      return <p key={i} className="sp-artifact-bold">{line.replace(/\*\*/g, '')}</p>;
                    }
                    if (line.trim() === '') {
                      return <div key={i} className="sp-artifact-spacer" />;
                    }
                    return <p key={i} className="sp-artifact-p">{parseMarkdownInline(line)}</p>;
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
      <div 
        key={artifact.id} 
        className={`sp-artifact-card ${isEssential ? 'sp-artifact-premium' : ''}`}
        onClick={() => handleViewArtifact(artifact)}
        data-testid={`card-artifact-${artifact.artifactKey}`}
      >
        <div className="sp-artifact-card-header">
          <span className="sp-artifact-number">{String(index + 1).padStart(2, '0')}</span>
          {isEssential ? (
            <span className="sp-importance-tag sp-tag-essential">Essential</span>
          ) : (
            <span className="sp-importance-tag sp-tag-recommended">
              {artifact.importanceLevel === 'bonus' ? 'Bonus' : 'Additional'}
            </span>
          )}
        </div>
        <h3 className="sp-artifact-title">
          {isTranscript && <MessageCircle size={16} style={{ marginRight: '0.5rem', display: 'inline' }} />}
          {artifact.title}
        </h3>
        <p className="sp-artifact-preview">{artifact.whyImportant}</p>
        <div className="sp-artifact-read-more">
          {isTranscript ? 'View Transcript →' : 'Read →'}
        </div>
      </div>
    );
  };

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
        <div className="sp-plan-overview" data-testid="plan-overview">
          <div className="sp-plan-header">
            <div className="sp-wsj-header-line"></div>
            <h1 className="sp-plan-main-title">Your Serious Plan</h1>
            <p className="sp-plan-subtitle">
              {plan?.artifacts?.length || 0} personalized artifacts prepared for you
              {anyGenerating && ' (some still generating...)'}
            </p>
            <div className="sp-wsj-header-line"></div>
          </div>

          {essentialArtifacts.length > 0 && (
            <div className="sp-artifact-section" data-testid="section-essential">
              <div className="sp-section-header">
                <span className="sp-section-label">Essential</span>
                <h2 className="sp-section-title">Start Here</h2>
              </div>
              <div className="sp-artifact-grid">
                {essentialArtifacts.map((artifact, idx) => renderArtifactCard(artifact, idx, true))}
              </div>
            </div>
          )}

          {additionalArtifacts.length > 0 && (
            <div className="sp-artifact-section" data-testid="section-additional">
              <div className="sp-section-header">
                <span className="sp-section-label">Additional</span>
                <h2 className="sp-section-title">Your Toolkit</h2>
              </div>
              <div className="sp-artifact-grid">
                {additionalArtifacts.map((artifact, idx) => renderArtifactCard(artifact, idx, false))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
