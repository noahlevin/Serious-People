import { useState } from 'react';
import { useLocation } from 'wouter';
import { useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { ChevronDown, ChevronUp, Zap } from 'lucide-react';

const stages = [
  { id: 'interview', label: 'Interview (Start)', description: 'Beginning of the interview' },
  { id: 'paywall', label: 'Paywall', description: 'After interview, before payment' },
  { id: 'module1', label: 'Module 1', description: 'First coaching module' },
  { id: 'module2', label: 'Module 2', description: 'Second coaching module' },
  { id: 'module3', label: 'Module 3', description: 'Third coaching module' },
  { id: 'serious_plan', label: 'Serious Plan', description: 'View your coaching plan' },
  { id: 'coach_chat', label: 'Coach Chat', description: 'Chat with your coach' },
];

export function DevSkipPanel() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [, setLocation] = useLocation();
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();

  const skipMutation = useMutation({
    mutationFn: async (stage: string) => {
      const response = await apiRequest('POST', '/api/dev/skip', { stage });
      return response.json();
    },
    onSuccess: (data) => {
      sessionStorage.removeItem('serious_people_transcript');
      sessionStorage.removeItem('serious_people_plan_card');
      sessionStorage.removeItem('module_1_transcript');
      sessionStorage.removeItem('module_2_transcript');
      sessionStorage.removeItem('module_3_transcript');
      sessionStorage.removeItem('payment_verified');
      
      queryClient.invalidateQueries({ queryKey: ['/api/transcript'] });
      queryClient.invalidateQueries({ queryKey: ['/api/serious-plan/latest'] });
      queryClient.invalidateQueries({ queryKey: ['/auth/me'] });
      
      toast({
        title: 'Stage Skipped',
        description: `Jumped to: ${data.stage}`,
      });
      
      setLocation(data.redirectPath);
    },
    onError: (error: Error) => {
      toast({
        title: 'Skip Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  if (!import.meta.env.DEV || !isAuthenticated) {
    return null;
  }

  return (
    <div 
      style={{
        position: 'fixed',
        bottom: '16px',
        right: '16px',
        zIndex: 9999,
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
      data-testid="dev-skip-panel"
    >
      <div
        style={{
          backgroundColor: '#1a1a1a',
          borderRadius: '8px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          overflow: 'hidden',
          minWidth: isExpanded ? '240px' : 'auto',
        }}
      >
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            width: '100%',
            padding: '10px 14px',
            backgroundColor: '#2563eb',
            color: 'white',
            border: 'none',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: 600,
          }}
          data-testid="button-toggle-dev-panel"
        >
          <Zap size={14} />
          <span>Dev Skip</span>
          {isExpanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>

        {isExpanded && (
          <div style={{ padding: '8px' }}>
            {stages.map((stage) => (
              <button
                key={stage.id}
                onClick={() => skipMutation.mutate(stage.id)}
                disabled={skipMutation.isPending}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '8px 10px',
                  marginBottom: '4px',
                  backgroundColor: skipMutation.isPending ? '#333' : '#2a2a2a',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: skipMutation.isPending ? 'wait' : 'pointer',
                  textAlign: 'left',
                  fontSize: '12px',
                }}
                data-testid={`button-skip-${stage.id}`}
              >
                <div style={{ fontWeight: 600 }}>{stage.label}</div>
                <div style={{ fontSize: '10px', color: '#888', marginTop: '2px' }}>
                  {stage.description}
                </div>
              </button>
            ))}
            {skipMutation.isPending && (
              <div style={{ 
                textAlign: 'center', 
                padding: '8px', 
                color: '#888',
                fontSize: '11px'
              }}>
                Setting up state...
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
