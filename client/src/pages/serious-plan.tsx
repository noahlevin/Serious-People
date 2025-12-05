import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { UserMenu } from "@/components/UserMenu";
import { apiRequest, queryClient } from "@/lib/queryClient";
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
  const { isAuthenticated, isLoading: authLoading, refetch } = useAuth();
  const [, setLocation] = useLocation();
  const [viewMode, setViewMode] = useState<ViewMode>('graduation');
  const [selectedArtifact, setSelectedArtifact] = useState<Artifact | null>(null);
  const [planGenerated, setPlanGenerated] = useState(false);

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
    setViewMode('overview');
  };

  const handleViewArtifact = (artifact: Artifact) => {
    setSelectedArtifact(artifact);
    setViewMode('artifact');
  };

  const handleBackToOverview = () => {
    setSelectedArtifact(null);
    setViewMode('overview');
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
          <div className="sp-graduation-note" data-testid="graduation-container">
            <h1 className="sp-headline" style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
              Congratulations
            </h1>
            <div className="sp-subheadline" style={{ textAlign: 'center', marginBottom: '2rem' }}>
              You've completed all three coaching modules
            </div>
            <p className="sp-body" style={{ textAlign: 'center', marginBottom: '2rem' }}>
              Your coach is now preparing your personalized Serious Plan — a comprehensive 
              packet with your decision snapshot, action plan, conversation scripts, and more.
            </p>
            <div style={{ textAlign: 'center' }}>
              <button 
                className="sp-button sp-button-primary" 
                onClick={() => generatePlanMutation.mutate()}
                disabled={generatePlanMutation.isPending}
                data-testid="button-generate-plan"
              >
                {generatePlanMutation.isPending ? 'Preparing Your Plan...' : 'Generate My Serious Plan'}
              </button>
            </div>
            {generatePlanMutation.isError && (
              <p className="sp-body" style={{ color: 'red', textAlign: 'center', marginTop: '1rem' }}>
                Something went wrong. Please try again.
              </p>
            )}
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

  if (viewMode === 'graduation' && plan?.coachNoteContent) {
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
              <h1 className="sp-headline">A Note from Your Coach</h1>
              {metadata?.clientName && (
                <div className="sp-subheadline">For {metadata.clientName}</div>
              )}
            </div>
            
            <div className="sp-coach-note-content" data-testid="text-coach-note">
              {plan.coachNoteContent.split('\n\n').map((paragraph, i) => (
                <p key={i} className="sp-body">{paragraph}</p>
              ))}
            </div>

            {metadata && (
              <div className="sp-plan-summary">
                <div className="sp-summary-item">
                  <span className="sp-summary-label">Your Plan Horizon</span>
                  <span className="sp-summary-value">{metadata.planHorizonType?.replace('_', ' ')}</span>
                </div>
                <div className="sp-summary-item">
                  <span className="sp-summary-label">Primary Direction</span>
                  <span className="sp-summary-value">{metadata.primaryRecommendation}</span>
                </div>
              </div>
            )}

            <div className="sp-graduation-actions">
              <button 
                className="sp-button sp-button-primary"
                onClick={handleContinue}
                data-testid="button-view-plan"
              >
                View Your Complete Plan
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

            <div className="sp-artifact-header">
              <h1 className="sp-headline">{selectedArtifact.title}</h1>
              <span className={`sp-importance-badge sp-importance-${selectedArtifact.importanceLevel}`}>
                {selectedArtifact.importanceLevel === 'must_read' ? 'Must Read' : 
                 selectedArtifact.importanceLevel === 'recommended' ? 'Recommended' :
                 selectedArtifact.importanceLevel === 'bonus' ? 'Bonus' : 'Optional'}
              </span>
            </div>

            {selectedArtifact.whyImportant && (
              <div className="sp-why-important">
                <strong>Why this matters for you:</strong> {selectedArtifact.whyImportant}
              </div>
            )}

            <div className="sp-artifact-content" data-testid="text-artifact-content">
              {selectedArtifact.contentRaw.split('\n').map((line, i) => {
                if (line.startsWith('### ')) {
                  return <h3 key={i} className="sp-subheadline">{line.replace('### ', '')}</h3>;
                }
                if (line.startsWith('## ')) {
                  return <h2 key={i} className="sp-headline" style={{ fontSize: '1.5rem' }}>{line.replace('## ', '')}</h2>;
                }
                if (line.startsWith('# ')) {
                  return <h1 key={i} className="sp-headline">{line.replace('# ', '')}</h1>;
                }
                if (line.startsWith('- ')) {
                  return <li key={i} className="sp-body">{line.replace('- ', '')}</li>;
                }
                if (line.trim() === '') {
                  return <br key={i} />;
                }
                return <p key={i} className="sp-body">{line}</p>;
              })}
            </div>

            <div className="sp-artifact-actions">
              {selectedArtifact.pdfStatus === 'ready' && selectedArtifact.pdfUrl ? (
                <a 
                  href={selectedArtifact.pdfUrl} 
                  className="sp-button sp-button-secondary"
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="button-download-pdf"
                >
                  Download PDF
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
                    : 'Generate PDF'}
                </button>
              )}
            </div>
          </div>
        </main>
      </div>
    );
  }

  const mustReadArtifacts = plan?.artifacts?.filter(a => a.importanceLevel === 'must_read') || [];
  const recommendedArtifacts = plan?.artifacts?.filter(a => a.importanceLevel === 'recommended') || [];
  const optionalArtifacts = plan?.artifacts?.filter(a => a.importanceLevel === 'optional' || a.importanceLevel === 'bonus') || [];

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
            <h1 className="sp-headline">Your Serious Plan</h1>
            <div className="sp-subheadline">
              {plan?.artifacts?.length || 0} personalized artifacts
            </div>
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
                Download Complete Bundle
              </a>
            ) : (
              <button
                className="sp-button sp-button-primary"
                onClick={() => plan && generateBundlePdfMutation.mutate(plan.id)}
                disabled={generateBundlePdfMutation.isPending || plan?.bundlePdfStatus === 'generating'}
                data-testid="button-generate-bundle"
              >
                {plan?.bundlePdfStatus === 'generating' || generateBundlePdfMutation.isPending 
                  ? 'Generating Bundle...' 
                  : 'Generate PDF Bundle'}
              </button>
            )}
            <button
              className="sp-button sp-button-secondary"
              onClick={() => plan && sendEmailMutation.mutate(plan.id)}
              disabled={sendEmailMutation.isPending || !!plan?.emailSentAt}
              data-testid="button-send-email"
            >
              {plan?.emailSentAt 
                ? 'Email Sent' 
                : sendEmailMutation.isPending 
                  ? 'Sending...' 
                  : 'Send to My Email'}
            </button>
          </div>

          {mustReadArtifacts.length > 0 && (
            <div className="sp-artifact-section">
              <h2 className="sp-subheadline sp-section-title">Must Read</h2>
              <div className="sp-artifact-grid">
                {mustReadArtifacts.map((artifact) => (
                  <div 
                    key={artifact.id} 
                    className="sp-artifact-card sp-artifact-must-read"
                    onClick={() => handleViewArtifact(artifact)}
                    data-testid={`card-artifact-${artifact.artifactKey}`}
                  >
                    <h3 className="sp-artifact-title">{artifact.title}</h3>
                    <p className="sp-artifact-preview">{artifact.whyImportant}</p>
                    <span className="sp-importance-badge sp-importance-must_read">Must Read</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {recommendedArtifacts.length > 0 && (
            <div className="sp-artifact-section">
              <h2 className="sp-subheadline sp-section-title">Recommended</h2>
              <div className="sp-artifact-grid">
                {recommendedArtifacts.map((artifact) => (
                  <div 
                    key={artifact.id} 
                    className="sp-artifact-card"
                    onClick={() => handleViewArtifact(artifact)}
                    data-testid={`card-artifact-${artifact.artifactKey}`}
                  >
                    <h3 className="sp-artifact-title">{artifact.title}</h3>
                    <p className="sp-artifact-preview">{artifact.whyImportant}</p>
                    <span className="sp-importance-badge sp-importance-recommended">Recommended</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {optionalArtifacts.length > 0 && (
            <div className="sp-artifact-section">
              <h2 className="sp-subheadline sp-section-title">Additional Resources</h2>
              <div className="sp-artifact-grid">
                {optionalArtifacts.map((artifact) => (
                  <div 
                    key={artifact.id} 
                    className="sp-artifact-card"
                    onClick={() => handleViewArtifact(artifact)}
                    data-testid={`card-artifact-${artifact.artifactKey}`}
                  >
                    <h3 className="sp-artifact-title">{artifact.title}</h3>
                    <p className="sp-artifact-preview">{artifact.whyImportant}</p>
                    <span className={`sp-importance-badge sp-importance-${artifact.importanceLevel}`}>
                      {artifact.importanceLevel === 'bonus' ? 'Bonus' : 'Optional'}
                    </span>
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
