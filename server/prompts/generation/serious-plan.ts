/**
 * Serious Plan Generation Prompt
 *
 * Generates a comprehensive, personalized coaching packet after completing
 * all coaching modules.
 *
 * Model: Claude Sonnet 4.5 (with OpenAI fallback)
 * Used in: seriousPlanService.ts - generateSeriousPlan()
 */

import type { ClientDossier, CoachingPlan } from '@shared/schema';

interface PlanHorizon {
  type: '30_days' | '60_days' | '90_days' | '6_months';
  rationale: string;
}

/**
 * Determines the appropriate plan horizon based on client circumstances.
 */
export function determinePlanHorizon(dossier: ClientDossier | null): PlanHorizon {
  if (!dossier?.interviewAnalysis) {
    return { type: '90_days', rationale: 'Standard timeline for career transitions' };
  }

  const analysis = dossier.interviewAnalysis;
  const keyFacts = analysis.keyFacts?.join(' ').toLowerCase() || '';
  const constraints = analysis.constraints?.join(' ').toLowerCase() || '';
  const situation = analysis.situation?.toLowerCase() || '';

  if (keyFacts.includes('immediate') || constraints.includes('urgent') || situation.includes('fired') || situation.includes('laid off')) {
    return { type: '30_days', rationale: 'Urgent timeline due to immediate circumstances' };
  }

  if (keyFacts.includes('visa') || constraints.includes('visa') || constraints.includes('deadline')) {
    return { type: '60_days', rationale: 'Accelerated timeline due to external deadlines' };
  }

  if (keyFacts.includes('long-term') || situation.includes('exploring') || situation.includes('considering')) {
    return { type: '6_months', rationale: 'Extended timeline for thorough exploration and positioning' };
  }

  return { type: '90_days', rationale: 'Standard timeline for thoughtful career transitions' };
}

/**
 * Builds the prompt for generating a complete Serious Plan.
 */
export function buildGenerationPrompt(
  clientName: string,
  coachingPlan: CoachingPlan,
  dossier: ClientDossier | null,
  planHorizon: PlanHorizon
): string {
  const plannedArtifactKeys = coachingPlan.plannedArtifacts?.map(a => a.key) || ['decision_snapshot', 'action_plan', 'module_recap', 'resources'];

  let dossierContext = '';
  if (dossier) {
    const analysis = dossier.interviewAnalysis;
    dossierContext = `
## Client Dossier (INTERNAL - DO NOT QUOTE DIRECTLY)

**Name:** ${analysis.clientName}
**Current Role:** ${analysis.currentRole} at ${analysis.company}
**Tenure:** ${analysis.tenure}

**Situation:** ${analysis.situation}
**Big Problem:** ${analysis.bigProblem}
**Desired Outcome:** ${analysis.desiredOutcome}

**Key Facts:** ${analysis.keyFacts?.join(', ') || 'Not specified'}
**Relationships:** ${analysis.relationships?.map(r => `${r.person} (${r.role}): ${r.dynamic}`).join('; ') || 'Not specified'}
**Emotional State:** ${analysis.emotionalState}
**Priorities:** ${analysis.priorities?.join(', ') || 'Not specified'}
**Constraints:** ${analysis.constraints?.join(', ') || 'Not specified'}
**Motivations:** ${analysis.motivations?.join(', ') || 'Not specified'}
**Fears:** ${analysis.fears?.join(', ') || 'Not specified'}

**Module Summaries:**
${dossier.moduleRecords?.map(m => `- Module ${m.moduleNumber} (${m.moduleName}): ${m.summary}\n  Decisions: ${m.decisions?.join(', ') || 'None'}\n  Action Items: ${m.actionItems?.join(', ') || 'None'}`).join('\n') || 'No modules completed'}
`;
  }

  return `You are generating a comprehensive, personalized "Serious Plan" coaching packet for a client who has just completed a 3-module career coaching program.

${dossierContext}

## Coaching Plan They Completed
- Module 1: ${coachingPlan.modules[0]?.name} - ${coachingPlan.modules[0]?.objective}
- Module 2: ${coachingPlan.modules[1]?.name} - ${coachingPlan.modules[1]?.objective}
- Module 3: ${coachingPlan.modules[2]?.name} - ${coachingPlan.modules[2]?.objective}

## Plan Horizon
Type: ${planHorizon.type}
Rationale: ${planHorizon.rationale}

## Artifacts to Generate
Generate the following artifacts: ${plannedArtifactKeys.join(', ')}

You may add 1-2 BONUS artifacts if they would be uniquely helpful for this client (mark them with importance_level: "bonus").

IMPORTANT: When counting artifacts in the coach note, include the coach note itself in the count. For example, if you generate 6 artifacts plus the coach note, say "7 artifacts" (not 6).

## Output Format
Return a valid JSON object with this structure:
{
  "coach_note": "Write the note starting with '${clientName},' on its own line, then begin the body. A brief, professional note from the coach (2-3 short paragraphs). Be warm but not effusive. Acknowledge what they worked on without dramatizing it. When referencing the number of artifacts in their plan, COUNT THIS NOTE as one of the artifacts (total = artifacts array length + 1). End with a simple, grounded statement of confidence - not flowery or grandiose. Write like a trusted advisor, not a motivational speaker.",
  "metadata": {
    "clientName": "${clientName}",
    "planHorizonType": "${planHorizon.type}",
    "planHorizonRationale": "${planHorizon.rationale}",
    "keyConstraints": ["constraint1", "constraint2"],
    "primaryRecommendation": "Their main recommended path forward",
    "emotionalTone": "encouraging/cautious/confident/etc"
  },
  "artifacts": [
    {
      "artifact_key": "decision_snapshot",
      "title": "Your Decision Snapshot",
      "type": "snapshot",
      "importance_level": "must_read",
      "why_important": "1-2 sentences explaining why this artifact matters for THIS client specifically",
      "content": "The full content in markdown format...",
      "metadata": {}
    }
  ]
}

## Artifact Guidelines

For each artifact:
1. Start with a "why_important" that's specific to THIS client (not generic)
2. Write in clear, direct language - no corporate jargon
3. Reference their specific situation, people, and constraints
4. Be actionable and concrete
5. Use markdown formatting for structure

### decision_snapshot
- One-page summary of their situation
- Their 2-4 real options with pros/cons
- A clear recommendation given their constraints
- "If you only do one thing this week" line

### action_plan
- Time-boxed to ${planHorizon.type.replace('_', ' ')}
- Divided into intervals (weeks or months)
- 2-4 tasks per interval with clear outcomes
- Include decision checkpoints with dates
- metadata should include: { "horizon": "${planHorizon.type}", "intervals": [...] }

### boss_conversation (if included)
- Goal of the conversation
- Opening lines (2-3 tone variants)
- Core script/flow
- Likely pushbacks & responses
- Red lines to hold
- De-escalation and closing

### partner_conversation (if included)
- Similar structure to boss_conversation
- Focus on what they need from partner
- How to frame the situation
- Key concerns to address

### self_narrative (if included)
- Personal memo to themselves
- How they describe this moment
- What they're moving away from and toward
- The kind of person they want to be
- Anchored to their values

### risk_map (if included)
- List of explicit and hidden risks
- For each: name, likelihood, impact, mitigation, fallback
- metadata should include: { "risks": [...] }

### module_recap
- Summary of each module
- Topics covered
- Key answers they gave (paraphrased)
- Major takeaways per module

### resources (if included)
- 5-10 credible, relevant resources formatted as clickable markdown links
- Format each as: [Resource Title](https://exact-url) - Why it's recommended for THEM
- Use actual URLs when possible, not "search for" instructions
- Mark 1-3 as "must read" (can emphasize with **bold**)
- metadata should include: { "resources": [...] }

IMPORTANT: Return ONLY valid JSON. No markdown code blocks, no explanations outside the JSON.`;
}
