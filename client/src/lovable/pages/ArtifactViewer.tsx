import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { formatContent } from "@/components/ChatComponents";
import { ArrowLeft, MessageCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

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
        <a key={`link-${keyCounter++}`} href={match[2]} target="_blank" rel="noopener noreferrer" className="text-primary underline hover:text-primary/80">
          <strong>{match[1]}</strong>
        </a>
      );
    } else if (match[3] && match[4]) {
      parts.push(
        <a key={`link-${keyCounter++}`} href={match[4]} target="_blank" rel="noopener noreferrer" className="text-primary underline hover:text-primary/80">
          {match[3]}
        </a>
      );
    } else if (match[5]) {
      parts.push(<strong key={`bold-${keyCounter++}`}>{match[5]}</strong>);
    } else if (match[6]) {
      parts.push(<em key={`italic-${keyCounter++}`}>{match[6]}</em>);
    } else if (match[7]) {
      parts.push(
        <a key={`url-${keyCounter++}`} href={match[7]} target="_blank" rel="noopener noreferrer" className="text-primary underline hover:text-primary/80">
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

function TranscriptRenderer({ artifact }: { artifact: Artifact }) {
  let parsedData: { messages?: { role: string; content: string }[]; summary?: string } = {};
  if (artifact.contentRaw) {
    try {
      parsedData = JSON.parse(artifact.contentRaw);
    } catch (e) {
      // Not valid JSON
    }
  }
  
  const messages = parsedData.messages || artifact.metadata?.messages || [];
  const summary = parsedData.summary || artifact.metadata?.summary || artifact.whyImportant;

  return (
    <div className="space-y-8">
      {summary && (
        <div className="border-b border-border pb-6" data-testid="text-transcript-summary">
          <h3 className="font-display text-lg text-foreground mb-3">Summary</h3>
          <div 
            className="text-muted-foreground leading-relaxed prose prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: formatContent(summary) }}
          />
        </div>
      )}
      <div>
        <h3 className="font-display text-lg text-foreground mb-4">Conversation</h3>
        <div className="space-y-4">
          {messages.map((msg, idx) => (
            <div 
              key={idx} 
              className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
              data-testid={`transcript-message-${idx}`}
            >
              <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                msg.role === 'assistant' ? 'bg-muted' : 'bg-primary/10'
              }`}>
                {msg.role === 'assistant' ? (
                  <MessageCircle size={14} className="text-muted-foreground" />
                ) : (
                  <span className="text-xs text-primary font-medium">You</span>
                )}
              </div>
              <div 
                className={`flex-1 p-4 rounded ${
                  msg.role === 'assistant' ? 'bg-muted/50' : 'bg-primary/5'
                }`}
              >
                <div 
                  className="text-sm text-foreground leading-relaxed prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: formatContent(msg.content) }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const ArtifactViewer = () => {
  const navigate = useNavigate();
  const { artifactSlug } = useParams<{ artifactSlug: string }>();
  const { authChecked, isAuthenticated } = useAuth();

  const { data: plan, isLoading: planLoading } = useQuery<SeriousPlan>({
    queryKey: ['/api/serious-plan/latest'],
    enabled: authChecked && isAuthenticated,
    retry: false,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return 2000;
      const artifact = data.artifacts?.find(a => a.artifactKey === artifactSlug);
      if (artifact && (artifact.generationStatus === 'pending' || artifact.generationStatus === 'generating')) {
        return 2000;
      }
      return false;
    },
  });

  const artifact = plan?.artifacts?.find(a => a.artifactKey === artifactSlug);

  useEffect(() => {
    if (artifact) {
      document.title = `${artifact.title} - Serious People`;
    } else {
      document.title = "Artifact - Serious People";
    }
  }, [artifact]);

  const handleBack = () => {
    navigate('/serious-plan');
  };

  if (!authChecked || planLoading) {
    return (
      <div className="sp-container py-16 flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">Loading artifact...</p>
        </div>
      </div>
    );
  }

  if (!artifact) {
    return (
      <div className="sp-container py-16">
        <div className="max-w-xl mx-auto text-center">
          <div className="bg-card border border-border p-8 md:p-12">
            <h1 className="font-display text-2xl md:text-3xl text-foreground mb-4">
              Artifact Not Found
            </h1>
            <p className="text-muted-foreground mb-8">
              We couldn't find the artifact you're looking for.
            </p>
            <Button onClick={handleBack} data-testid="button-back-to-plan">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Your Plan
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const isGenerating = artifact.generationStatus === 'pending' || artifact.generationStatus === 'generating';
  const isTranscript = artifact.type === 'transcript';
  const isEssential = artifact.importanceLevel === 'must_read' || (artifact.importanceLevel as string) === 'essential';

  if (isGenerating) {
    return (
      <div className="sp-container py-16">
        <div className="max-w-xl mx-auto text-center">
          <div className="bg-card border border-border p-8 md:p-12">
            <h1 className="font-display text-2xl md:text-3xl text-foreground mb-4">
              {artifact.title}
            </h1>
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              <p className="text-muted-foreground">
                Still generating this artifact...
              </p>
            </div>
            <div className="mt-8">
              <Button variant="outline" onClick={handleBack} data-testid="button-back-while-generating">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Your Plan
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="sp-container py-8">
      <div className="max-w-3xl mx-auto" data-testid={`artifact-${artifact.artifactKey}`}>
        <button 
          onClick={handleBack}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-8 transition-colors"
          data-testid="button-back"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Plan
        </button>

          <article className="bg-card border border-border p-8 md:p-12">
            <header className="border-b border-border pb-6 mb-8">
              <div className="flex items-center gap-3 mb-4">
                <span className={`text-xs px-2 py-0.5 rounded ${
                  isEssential 
                    ? 'bg-primary/10 text-primary' 
                    : 'bg-muted text-muted-foreground'
                }`}>
                  {isEssential ? 'Essential' : isTranscript ? 'Transcript' : 'Additional'}
                </span>
              </div>
              <h1 className="font-display text-2xl md:text-3xl text-foreground">
                {artifact.title}
              </h1>
            </header>

            {artifact.whyImportant && !isTranscript && (
              <div className="bg-muted/30 p-4 mb-8 border-l-2 border-primary/30">
                <p className="text-muted-foreground italic">{artifact.whyImportant}</p>
              </div>
            )}

            {isTranscript ? (
              <TranscriptRenderer artifact={artifact} />
            ) : !artifact.contentRaw ? (
              <div data-testid="text-artifact-content">
                <p className="text-muted-foreground italic">
                  This artifact is still being generated. Please check back in a moment.
                </p>
              </div>
            ) : (
              <div className="prose prose-sm max-w-none" data-testid="text-artifact-content">
                {preprocessMarkdownContent(artifact.contentRaw).split('\n').map((line, i) => {
                  if (line.startsWith('### ')) {
                    return <h3 key={i} className="font-display text-lg text-foreground mt-6 mb-3">{parseMarkdownInline(line.replace('### ', ''))}</h3>;
                  }
                  if (line.startsWith('## ')) {
                    return <h2 key={i} className="font-display text-xl text-foreground mt-8 mb-4">{parseMarkdownInline(line.replace('## ', ''))}</h2>;
                  }
                  if (line.startsWith('# ')) {
                    return <h1 key={i} className="font-display text-2xl text-foreground mt-8 mb-4">{parseMarkdownInline(line.replace('# ', ''))}</h1>;
                  }
                  if (line.startsWith('- ')) {
                    return <li key={i} className="text-foreground ml-4 mb-1">{parseMarkdownInline(line.replace('- ', ''))}</li>;
                  }
                  if (line.startsWith('**') && line.endsWith('**')) {
                    return <p key={i} className="text-foreground font-semibold my-3">{line.replace(/\*\*/g, '')}</p>;
                  }
                  if (line.trim() === '') {
                    return <div key={i} className="h-4" />;
                  }
                  return <p key={i} className="text-foreground leading-relaxed mb-3">{parseMarkdownInline(line)}</p>;
                })}
              </div>
            )}
          </article>
        </div>
      </div>
  );
};

export default ArtifactViewer;
