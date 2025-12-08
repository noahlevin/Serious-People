import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { UserMenu } from "@/components/UserMenu";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Download, Mail } from "lucide-react";
import "@/styles/serious-people.css";

interface Artifact {
  id: string;
  artifactKey: string;
  title: string;
  type: string;
  importanceLevel: 'must_read' | 'recommended' | 'optional' | 'bonus';
  whyImportant: string;
  contentRaw: string;
  pdfStatus: 'not_started' | 'generating' | 'ready' | 'error';
  pdfUrl: string | null;
  displayOrder: number;
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

type ViewMode = 'graduation' | 'overview' | 'artifact';

export default function SeriousPlanPage() {
  const { isAuthenticated, isLoading: authLoading, refetch, user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [viewMode, setViewMode] = useState<ViewMode>('graduation');
  const [selectedArtifact, setSelectedArtifact] = useState<Artifact | null>(null);
  const [planGenerated, setPlanGenerated] = useState(false);
  const [hasSeenNote, setHasSeenNote] = useState(false);

  useEffect(() => {
    refetch();
  }, [refetch]);
  
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      setLocation("/login");
    }
  }, [authLoading, isAuthenticated, setLocation]);

  const { data: plan, isLoading: planLoading, refetch: refetchPlan } = useQuery<SeriousPlan>({
    queryKey: ['/api/serious-plan/latest'],
    enabled: isAuthenticated && !authLoading,
    retry: false,
    refetchInterval: (query) => {
      // Poll every 2 seconds while plan is generating or doesn't exist yet
      const data = query.state.data;
      if (!data || data.status === 'generating') {
        return 2000;
      }
      return false;
    },
  });

  const generatePlanMutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/serious-plan'),
    onSuccess: () => {
      setPlanGenerated(true);
      refetchPlan();
    },
  });

  const generateBundlePdfMutation = useMutation({
    mutationFn: (planId: string) => apiRequest('POST', `/api/serious-plan/${planId}/bundle-pdf`),
    onSuccess: () => refetchPlan(),
  });

  const sendEmailMutation = useMutation({
    mutationFn: (planId: string) => apiRequest('POST', `/api/serious-plan/${planId}/send-email`),
    onSuccess: () => refetchPlan(),
  });

  const generateArtifactPdfMutation = useMutation({
    mutationFn: ({ planId, artifactId }: { planId: string; artifactId: string }) => 
      apiRequest('POST', `/api/serious-plan/${planId}/artifacts/${artifactId}/pdf`),
    onSuccess: () => refetchPlan(),
  });

  const handleContinue = () => {
    setHasSeenNote(true);
    setViewMode('overview');
    window.scrollTo(0, 0);
  };

  const handleViewArtifact = (artifact: Artifact) => {
    setSelectedArtifact(artifact);
    setViewMode('artifact');
    window.scrollTo(0, 0);
  };

  const handleBackToOverview = () => {
    setSelectedArtifact(null);
    setViewMode('overview');
    window.scrollTo(0, 0);
  };

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
              <img src="/logan-roy.png" alt="Serious People" className="sp-logo-icon" />
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

  // If no plan exists yet, show generating state (plan generation is triggered from module 3)
  if (!plan && !planGenerated) {
    return (
      <div className="sp-page">
        <header className="sp-success-header">
          <div className="sp-header-content">
            <Link href="/" className="sp-logo-link" data-testid="link-home">
              <img src="/logan-roy.png" alt="Serious People" className="sp-logo-icon" />
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

  if (plan?.status === 'generating' || generatePlanMutation.isPending) {
    return (
      <div className="sp-page">
        <header className="sp-success-header">
          <div className="sp-header-content">
            <Link href="/" className="sp-logo-link" data-testid="link-home">
              <img src="/logan-roy.png" alt="Serious People" className="sp-logo-icon" />
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

  if (viewMode === 'graduation' && plan?.coachNoteContent && !hasSeenNote) {
    const metadata = plan.summaryMetadata;
    return (
      <div className="sp-page">
        <header className="sp-success-header">
          <div className="sp-header-content">
            <Link href="/" className="sp-logo-link" data-testid="link-home">
              <img src="/logan-roy.png" alt="Serious People" className="sp-logo-icon" />
              <span className="sp-logo">Serious People</span>
            </Link>
            <UserMenu />
          </div>
        </header>
        <main className="sp-container">
          <div className="sp-graduation-note" data-testid="graduation-note">
            <div className="sp-graduation-header">
              <h1 className="sp-coach-header">A Note from Your Coach</h1>
            </div>
            
            <div className="sp-coach-note-content" data-testid="text-coach-note">
              {plan.coachNoteContent.split('\n\n').map((paragraph, i) => (
                <p key={i} className="sp-body">{paragraph}</p>
              ))}
            </div>

            <div className="sp-graduation-cta">
              <button 
                className="sp-plan-cta"
                onClick={handleContinue}
                data-testid="button-view-plan"
              >
                View Your Complete Plan
                <span className="sp-plan-cta-arrow">→</span>
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (viewMode === 'artifact' && selectedArtifact) {
    return (
      <div className="sp-page">
        <header className="sp-success-header">
          <div className="sp-header-content">
            <Link href="/" className="sp-logo-link" data-testid="link-home">
              <img src="/logan-roy.png" alt="Serious People" className="sp-logo-icon" />
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

              {selectedArtifact.whyImportant && (
                <div className="sp-artifact-intro">
                  {selectedArtifact.whyImportant}
                </div>
              )}

              <div className="sp-artifact-body" data-testid="text-artifact-content">
                {selectedArtifact.contentRaw.split('\n').map((line, i) => {
                  if (line.startsWith('### ')) {
                    return <h3 key={i} className="sp-artifact-h3">{line.replace('### ', '')}</h3>;
                  }
                  if (line.startsWith('## ')) {
                    return <h2 key={i} className="sp-artifact-h2">{line.replace('## ', '')}</h2>;
                  }
                  if (line.startsWith('# ')) {
                    return <h1 key={i} className="sp-artifact-h1">{line.replace('# ', '')}</h1>;
                  }
                  if (line.startsWith('- ')) {
                    return <li key={i} className="sp-artifact-li">{line.replace('- ', '')}</li>;
                  }
                  if (line.startsWith('**') && line.endsWith('**')) {
                    return <p key={i} className="sp-artifact-bold">{line.replace(/\*\*/g, '')}</p>;
                  }
                  if (line.trim() === '') {
                    return <div key={i} className="sp-artifact-spacer" />;
                  }
                  return <p key={i} className="sp-artifact-p">{line}</p>;
                })}
              </div>
            </article>

            <div className="sp-artifact-actions">
              {selectedArtifact.pdfStatus === 'ready' && selectedArtifact.pdfUrl ? (
                <a 
                  href={selectedArtifact.pdfUrl} 
                  className="sp-plan-cta"
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="button-download-pdf"
                >
                  <Download size={18} />
                  Download {selectedArtifact.title}
                </a>
              ) : (
                <button
                  className="sp-button sp-button-secondary"
                  onClick={() => plan && generateArtifactPdfMutation.mutate({ planId: plan.id, artifactId: selectedArtifact.id })}
                  disabled={generateArtifactPdfMutation.isPending || selectedArtifact.pdfStatus === 'generating'}
                  data-testid="button-generate-pdf"
                >
                  {selectedArtifact.pdfStatus === 'generating' || generateArtifactPdfMutation.isPending 
                    ? 'Generating PDF...' 
                    : `Download ${selectedArtifact.title}`}
                </button>
              )}
            </div>
          </div>
        </main>
      </div>
    );
  }

  // Filter artifacts by importance level (handle legacy values 'essential' and 'reference')
  const mustReadArtifacts = plan?.artifacts?.filter(a => 
    a.importanceLevel === 'must_read' || (a.importanceLevel as string) === 'essential'
  ) || [];
  const recommendedArtifacts = plan?.artifacts?.filter(a => a.importanceLevel === 'recommended') || [];
  const optionalArtifacts = plan?.artifacts?.filter(a => 
    a.importanceLevel === 'optional' || a.importanceLevel === 'bonus' || (a.importanceLevel as string) === 'reference'
  ) || [];

  return (
    <div className="sp-page">
      <header className="sp-success-header">
        <div className="sp-header-content">
          <Link href="/" className="sp-logo-link" data-testid="link-home">
            <img src="/logan-roy.png" alt="Serious People" className="sp-logo-icon" />
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
            </p>
            <div className="sp-wsj-header-line"></div>
          </div>

          <div className="sp-plan-actions">
            {plan?.bundlePdfStatus === 'ready' && plan?.bundlePdfUrl ? (
              <a 
                href={plan.bundlePdfUrl} 
                className="sp-button sp-button-primary"
                target="_blank"
                rel="noopener noreferrer"
                data-testid="button-download-bundle"
              >
                <Download size={18} />
                Download My Plan (PDF)
              </a>
            ) : (
              <button
                className="sp-button sp-button-primary"
                onClick={() => plan && generateBundlePdfMutation.mutate(plan.id)}
                disabled={generateBundlePdfMutation.isPending || plan?.bundlePdfStatus === 'generating'}
                data-testid="button-generate-bundle"
              >
                {plan?.bundlePdfStatus === 'generating' || generateBundlePdfMutation.isPending 
                  ? 'Generating...' 
                  : 'Download My Plan (PDF)'}
              </button>
            )}
            <button
              className="sp-button sp-button-secondary"
              onClick={() => {
                plan && sendEmailMutation.mutate(plan.id);
                toast({
                  title: `Email sent to ${user?.email}`,
                  description: "Your plan is on its way to your inbox.",
                  duration: 3000,
                });
              }}
              disabled={sendEmailMutation.isPending || !!plan?.emailSentAt}
              data-testid="button-send-email"
            >
              <Mail size={18} />
              {plan?.emailSentAt 
                ? 'Email Sent' 
                : sendEmailMutation.isPending 
                  ? 'Sending...' 
                  : 'Email My Plan to Me'}
            </button>
          </div>

          {mustReadArtifacts.length > 0 && (
            <div className="sp-artifact-section">
              <div className="sp-section-header">
                <span className="sp-section-label">Essential</span>
                <h2 className="sp-section-title">Start Here</h2>
              </div>
              <div className="sp-artifact-grid">
                {mustReadArtifacts.map((artifact) => (
                  <div 
                    key={artifact.id} 
                    className="sp-artifact-card sp-artifact-premium"
                    onClick={() => handleViewArtifact(artifact)}
                    data-testid={`card-artifact-${artifact.artifactKey}`}
                  >
                    <div className="sp-artifact-card-header">
                      <span className="sp-artifact-number">{String(mustReadArtifacts.indexOf(artifact) + 1).padStart(2, '0')}</span>
                      <span className="sp-importance-tag sp-tag-essential">Essential</span>
                    </div>
                    <h3 className="sp-artifact-title">{artifact.title}</h3>
                    <p className="sp-artifact-preview">{artifact.whyImportant}</p>
                    <div className="sp-artifact-read-more">Read →</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {recommendedArtifacts.length > 0 && (
            <div className="sp-artifact-section">
              <div className="sp-section-header">
                <span className="sp-section-label">Recommended</span>
                <h2 className="sp-section-title">Your Toolkit</h2>
              </div>
              <div className="sp-artifact-grid">
                {recommendedArtifacts.map((artifact) => (
                  <div 
                    key={artifact.id} 
                    className="sp-artifact-card"
                    onClick={() => handleViewArtifact(artifact)}
                    data-testid={`card-artifact-${artifact.artifactKey}`}
                  >
                    <div className="sp-artifact-card-header">
                      <span className="sp-artifact-number">{String(recommendedArtifacts.indexOf(artifact) + 1).padStart(2, '0')}</span>
                      <span className="sp-importance-tag sp-tag-recommended">Recommended</span>
                    </div>
                    <h3 className="sp-artifact-title">{artifact.title}</h3>
                    <p className="sp-artifact-preview">{artifact.whyImportant}</p>
                    <div className="sp-artifact-read-more">Read →</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {optionalArtifacts.length > 0 && (
            <div className="sp-artifact-section">
              <div className="sp-section-header">
                <span className="sp-section-label">Additional</span>
                <h2 className="sp-section-title">Resources</h2>
              </div>
              <div className="sp-artifact-grid">
                {optionalArtifacts.map((artifact) => (
                  <div 
                    key={artifact.id} 
                    className="sp-artifact-card"
                    onClick={() => handleViewArtifact(artifact)}
                    data-testid={`card-artifact-${artifact.artifactKey}`}
                  >
                    <div className="sp-artifact-card-header">
                      <span className="sp-artifact-number">{String(optionalArtifacts.indexOf(artifact) + 1).padStart(2, '0')}</span>
                      <span className="sp-importance-tag sp-tag-optional">{artifact.importanceLevel === 'bonus' ? 'Bonus' : 'Optional'}</span>
                    </div>
                    <h3 className="sp-artifact-title">{artifact.title}</h3>
                    <p className="sp-artifact-preview">{artifact.whyImportant}</p>
                    <div className="sp-artifact-read-more">Read →</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="sp-chat-cta">
            <h3 className="sp-subheadline">Have questions about your plan?</h3>
            <p className="sp-body">Your coach is still here to help.</p>
            <Link href="/coach-chat" className="sp-button sp-button-secondary" data-testid="link-coach-chat">
              Chat with Your Coach
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
