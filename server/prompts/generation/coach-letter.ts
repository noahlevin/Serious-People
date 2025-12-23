/**
 * Coach Letter Prompt
 *
 * Generates a brief, warm graduation note from the coach.
 * This is a lightweight, fast generation for immediate display.
 *
 * Model: Claude Sonnet 4.5 (with OpenAI fallback)
 * Max Tokens: 1024
 * Used in: seriousPlanService.ts - generateCoachLetterAsync()
 */

import type { ClientDossier, CoachingPlan } from '@shared/schema';

/**
 * Builds the prompt for generating a coach's graduation letter.
 */
export function buildCoachLetterPrompt(
  clientName: string,
  coachingPlan: CoachingPlan,
  dossier: ClientDossier | null
): string {
  let context = '';
  if (dossier) {
    const analysis = dossier.interviewAnalysis;
    context = `
Client: ${analysis.clientName}
Current Role: ${analysis.currentRole} at ${analysis.company}
Situation: ${analysis.situation}
Big Problem: ${analysis.bigProblem}
Desired Outcome: ${analysis.desiredOutcome}
Emotional State: ${analysis.emotionalState}

Modules Completed:
${dossier.moduleRecords?.map(m => `- ${m.moduleName}: ${m.summary}`).join('\n') || 'No details available'}
`;
  }

  return `You are writing a brief, warm graduation note from an online career coach to a client who just completed a one-time 3-module coaching session.

IMPORTANT CONTEXT: This was a single online coaching session (about an hour total across 3 modules), NOT an ongoing coaching relationship. You have never met in person. Do NOT write things like "It's been great working with you these past few months" or imply any long-term relationship. This was their first and only session with you.

${context}

Write a personal note (2-3 short paragraphs) that:
1. Starts with "${clientName}," on its own line
2. Acknowledges what they worked on in this session without dramatizing
3. References specific insights or decisions from their conversation today
4. Ends with grounded confidence, not flowery motivation
5. Sounds like a trusted advisor wrapping up a focused coaching session

Write like you're an online coach who genuinely helped them think through their situation in this session. No bullet points, no headers - just a warm, direct note.

Output ONLY the letter text, nothing else.`;
}
