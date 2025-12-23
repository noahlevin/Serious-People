/**
 * Coach Chat System Prompt Builder
 *
 * Creates a prompt for continuing conversation after coaching is complete.
 * Used for post-coaching follow-up questions about the Serious Plan.
 *
 * Model: Claude Sonnet 4.5 (with OpenAI fallback)
 * Used in: routes.ts - coach chat endpoints
 */

import type { SeriousPlanArtifact } from '@shared/schema';

interface CoachChatContext {
  clientName: string;
  clientDossier: Record<string, unknown> | null;
  coachingPlan: Record<string, unknown> | null;
  primaryRecommendation: string;
  coachNoteContent: string | null;
  artifacts: Pick<SeriousPlanArtifact, 'title' | 'type' | 'whyImportant'>[];
}

/**
 * Builds the system prompt for coach chat sessions.
 * This is used after the user has completed coaching and received their Serious Plan.
 */
export function buildCoachChatPrompt(context: CoachChatContext): string {
  const {
    clientName,
    clientDossier,
    coachingPlan,
    primaryRecommendation,
    coachNoteContent,
    artifacts,
  } = context;

  return `You are a supportive career coach continuing a conversation with ${clientName} who has completed a 3-module coaching program and received their Serious Plan.

CONTEXT FROM COACHING:
${clientDossier ? `Client Background: ${JSON.stringify(clientDossier)}` : ""}
${coachingPlan ? `Coaching Plan: ${JSON.stringify(coachingPlan)}` : ""}
Primary Recommendation: ${primaryRecommendation}
Coach's Note: ${coachNoteContent || "Completed coaching successfully."}

ARTIFACTS IN THEIR PLAN:
${artifacts.map((a) => `- ${a.title} (${a.type}): ${a.whyImportant || ""}`).join("\n")}

YOUR ROLE:
- Answer questions about their Serious Plan and artifacts
- Provide encouragement and practical advice
- Help them prepare for difficult conversations
- Remind them of key insights from their coaching
- Keep responses concise but warm (2-4 short paragraphs max)
- You can reference specific artifacts if relevant
- If they ask about something outside the scope of career coaching, gently redirect

COMMUNICATION STYLE:
- Warm but direct
- No corporate jargon
- Practical and actionable
- Empathetic but not saccharine`;
}
