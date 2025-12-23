/**
 * Single Artifact Generation Prompt
 *
 * Generates a single personalized artifact for the Serious Plan.
 * Each artifact is generated independently for parallel processing.
 *
 * Model: Claude Sonnet 4.5 (with OpenAI fallback)
 * Max Tokens: 4096
 * Note: Web search is enabled for 'resources' artifact type
 * Used in: seriousPlanService.ts - generateSingleArtifact()
 */

import type { ClientDossier, CoachingPlan } from '@shared/schema';
import { getArtifactGuidelines } from './artifact-guidelines';

interface PlanHorizon {
  type: string;
  rationale: string;
}

/**
 * Builds the prompt for generating a single artifact.
 */
export function buildSingleArtifactPrompt(
  artifactKey: string,
  clientName: string,
  coachingPlan: CoachingPlan,
  dossier: ClientDossier | null,
  planHorizon: PlanHorizon
): string {
  let dossierContext = '';
  if (dossier) {
    const analysis = dossier.interviewAnalysis;
    dossierContext = `
## Client Dossier
**Name:** ${analysis.clientName}
**Current Role:** ${analysis.currentRole} at ${analysis.company}
**Tenure:** ${analysis.tenure}
**Situation:** ${analysis.situation}
**Big Problem:** ${analysis.bigProblem}
**Desired Outcome:** ${analysis.desiredOutcome}
**Emotional State:** ${analysis.emotionalState}
**Key Facts:** ${analysis.keyFacts?.join(', ') || 'Not specified'}
**Constraints:** ${analysis.constraints?.join(', ') || 'Not specified'}
**Priorities:** ${analysis.priorities?.join(', ') || 'Not specified'}

**Module Summaries:**
${dossier.moduleRecords?.map(m => `- Module ${m.moduleNumber} (${m.moduleName}): ${m.summary}`).join('\n') || 'No modules completed'}
`;
  }

  const artifactGuidelines = getArtifactGuidelines(artifactKey, planHorizon);

  return `You are generating a SINGLE personalized artifact for ${clientName} who just completed a 3-module career coaching program.

${dossierContext}

## Plan Horizon: ${planHorizon.type.replace('_', ' ')}

## Artifact to Generate: ${artifactKey}
${artifactGuidelines}

## Output Format
Return valid JSON with this exact structure:
{
  "title": "Human-readable title for this artifact",
  "type": "${artifactKey.includes('conversation') ? 'script' : 'snapshot'}",
  "importance_level": "${artifactKey === 'decision_snapshot' || artifactKey === 'action_plan' ? 'must_read' : 'recommended'}",
  "why_important": "One sentence explaining why THIS specific client needs this artifact",
  "content": "Full markdown content..."
}

## Guidelines
- Write clear, direct language - no corporate jargon
- Reference their specific situation, people, constraints
- Be actionable and concrete
- Use markdown formatting (headers, lists, bold)

Return ONLY valid JSON.`;
}
