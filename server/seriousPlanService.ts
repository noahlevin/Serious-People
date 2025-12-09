import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { storage } from "./storage";
import type { 
  ClientDossier, 
  CoachingPlan, 
  SeriousPlanMetadata, 
  InsertSeriousPlanArtifact,
  ImportanceLevel,
  InterviewTranscript
} from "@shared/schema";

const useAnthropic = !!process.env.ANTHROPIC_API_KEY;
const anthropic = useAnthropic ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface ArtifactGeneration {
  artifact_key: string;
  title: string;
  type: string;
  importance_level: ImportanceLevel;
  why_important: string;
  content: string;
  metadata?: Record<string, any>;
}

interface GenerationResult {
  coachNote: string;
  artifacts: ArtifactGeneration[];
  metadata: SeriousPlanMetadata;
}

function determinePlanHorizon(dossier: ClientDossier | null): { type: '30_days' | '60_days' | '90_days' | '6_months'; rationale: string } {
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

function buildGenerationPrompt(
  clientName: string,
  coachingPlan: CoachingPlan,
  dossier: ClientDossier | null,
  planHorizon: { type: string; rationale: string }
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

export async function generateSeriousPlan(
  userId: string,
  transcriptId: string,
  coachingPlan: CoachingPlan,
  dossier: ClientDossier | null
): Promise<{ planId: string; success: boolean; error?: string }> {
  try {
    const plan = await storage.createSeriousPlan({
      userId,
      transcriptId,
      status: 'generating',
    });

    const clientName = coachingPlan.name || dossier?.interviewAnalysis?.clientName || 'Client';
    const planHorizon = determinePlanHorizon(dossier);
    const prompt = buildGenerationPrompt(clientName, coachingPlan, dossier, planHorizon);

    let responseText: string;

    if (useAnthropic && anthropic) {
      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 8192,
        messages: [{ role: "user", content: prompt }],
      });
      responseText = response.content[0].type === 'text' ? response.content[0].text : '';
    } else {
      const response = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: [{ role: "user", content: prompt }],
        max_completion_tokens: 8192,
      });
      responseText = response.choices[0].message.content || '';
    }

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      await storage.updateSeriousPlanStatus(plan.id, 'error');
      return { planId: plan.id, success: false, error: 'Failed to parse AI response as JSON' };
    }

    let result: GenerationResult;
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      result = {
        coachNote: parsed.coach_note || '',
        artifacts: parsed.artifacts || [],
        metadata: parsed.metadata || {
          clientName,
          planHorizonType: planHorizon.type as any,
          planHorizonRationale: planHorizon.rationale,
          keyConstraints: [],
          primaryRecommendation: '',
          emotionalTone: 'encouraging',
        },
      };
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      await storage.updateSeriousPlanStatus(plan.id, 'error');
      return { planId: plan.id, success: false, error: 'Failed to parse AI response' };
    }

    await storage.updateSeriousPlan(plan.id, {
      coachNoteContent: result.coachNote,
      summaryMetadata: result.metadata,
    });

    const coachNoteArtifact: InsertSeriousPlanArtifact = {
      planId: plan.id,
      artifactKey: 'coach_note',
      title: 'Graduation Note from Your Coach',
      type: 'note',
      importanceLevel: 'must_read',
      whyImportant: 'A personal message reflecting on your coaching journey and what lies ahead.',
      contentRaw: result.coachNote,
      displayOrder: 0,
      pdfStatus: 'not_started',
    };

    const artifactsToCreate: InsertSeriousPlanArtifact[] = [coachNoteArtifact];

    result.artifacts.forEach((artifact, index) => {
      artifactsToCreate.push({
        planId: plan.id,
        artifactKey: artifact.artifact_key,
        title: artifact.title,
        type: artifact.type,
        importanceLevel: artifact.importance_level || 'recommended',
        whyImportant: artifact.why_important,
        contentRaw: artifact.content,
        displayOrder: index + 1,
        pdfStatus: 'not_started',
        metadata: artifact.metadata || null,
      });
    });

    await storage.createArtifacts(artifactsToCreate);
    await storage.updateSeriousPlanStatus(plan.id, 'ready');

    return { planId: plan.id, success: true };
  } catch (error: any) {
    console.error('Serious Plan generation error:', error);
    return { planId: '', success: false, error: error.message };
  }
}

export async function getSeriousPlanWithArtifacts(planId: string) {
  const plan = await storage.getSeriousPlan(planId);
  if (!plan) return null;

  const artifacts = await storage.getArtifactsByPlanId(planId);
  
  return {
    ...plan,
    artifacts,
  };
}

export async function getLatestSeriousPlan(userId: string) {
  const plan = await storage.getSeriousPlanByUserId(userId);
  if (!plan) return null;

  const artifacts = await storage.getArtifactsByPlanId(plan.id);
  
  return {
    ...plan,
    artifacts,
  };
}

// ============================================
// NEW PARALLEL GENERATION FUNCTIONS
// ============================================

/**
 * Initialize a new Serious Plan with transcript artifacts and placeholder artifacts.
 * This creates the plan record and seeds the artifacts, then kicks off parallel generation.
 */
export async function initializeSeriousPlan(
  userId: string,
  transcriptId: string,
  coachingPlan: CoachingPlan,
  dossier: ClientDossier | null,
  transcript: InterviewTranscript
): Promise<{ planId: string; success: boolean; error?: string }> {
  try {
    // Check if plan already exists
    const existingPlan = await storage.getSeriousPlanByUserId(userId);
    if (existingPlan) {
      return { planId: existingPlan.id, success: true };
    }

    // Create the plan with initial status
    const plan = await storage.createSeriousPlan({
      userId,
      transcriptId,
      status: 'generating',
      coachLetterStatus: 'pending',
    });

    const clientName = coachingPlan.name || dossier?.interviewAnalysis?.clientName || 'Client';

    // Create transcript artifacts (immediately marked as complete since they're just data)
    const transcriptArtifacts = createTranscriptArtifacts(plan.id, transcript, dossier);
    
    // Create placeholder artifacts for LLM-generated content
    const plannedArtifactKeys = coachingPlan.plannedArtifacts?.map(a => a.key) || 
      ['decision_snapshot', 'action_plan', 'module_recap', 'resources'];
    
    const placeholderArtifacts = createPlaceholderArtifacts(plan.id, plannedArtifactKeys, coachingPlan);

    // Combine and create all artifacts
    await storage.createArtifacts([...transcriptArtifacts, ...placeholderArtifacts]);

    // Start parallel generation (fire and forget - they update status as they complete)
    generateCoachLetterAsync(plan.id, clientName, coachingPlan, dossier);
    generateArtifactsAsync(plan.id, clientName, coachingPlan, dossier, plannedArtifactKeys);

    return { planId: plan.id, success: true };
  } catch (error: any) {
    console.error('Serious Plan initialization error:', error);
    return { planId: '', success: false, error: error.message };
  }
}

/**
 * Create transcript artifacts from the interview and module transcripts.
 * These are marked as complete immediately since they're just formatted data.
 */
function createTranscriptArtifacts(
  planId: string,
  transcript: InterviewTranscript,
  dossier: ClientDossier | null
): InsertSeriousPlanArtifact[] {
  const artifacts: InsertSeriousPlanArtifact[] = [];
  let displayOrder = 100; // Start high to put transcripts at the end

  // Interview transcript
  if (transcript.transcript && Array.isArray(transcript.transcript) && transcript.transcript.length > 0) {
    artifacts.push({
      planId,
      artifactKey: 'transcript_interview',
      title: 'Interview Transcript',
      type: 'transcript',
      importanceLevel: 'optional',
      whyImportant: 'The full conversation from your initial coaching interview.',
      contentRaw: JSON.stringify({
        type: 'transcript',
        summary: null,
        messages: transcript.transcript
      }),
      generationStatus: 'complete',
      displayOrder: displayOrder++,
      pdfStatus: 'not_started',
    });
  }

  // Module transcripts
  const moduleTranscripts = [
    { num: 1, transcript: transcript.module1Transcript, summary: transcript.module1Summary },
    { num: 2, transcript: transcript.module2Transcript, summary: transcript.module2Summary },
    { num: 3, transcript: transcript.module3Transcript, summary: transcript.module3Summary },
  ];

  const moduleNames = dossier?.moduleRecords?.map(m => m.moduleName) || [
    'Module 1', 'Module 2', 'Module 3'
  ];

  moduleTranscripts.forEach((mod, idx) => {
    if (mod.transcript && Array.isArray(mod.transcript) && mod.transcript.length > 0) {
      artifacts.push({
        planId,
        artifactKey: `transcript_module_${mod.num}`,
        title: `${moduleNames[idx] || `Module ${mod.num}`} Transcript`,
        type: 'transcript',
        importanceLevel: 'optional',
        whyImportant: `The full conversation from ${moduleNames[idx] || `Module ${mod.num}`}.`,
        contentRaw: JSON.stringify({
          type: 'transcript',
          summary: mod.summary || null,
          messages: mod.transcript
        }),
        generationStatus: 'complete',
        displayOrder: displayOrder++,
        pdfStatus: 'not_started',
      });
    }
  });

  return artifacts;
}

/**
 * Create placeholder artifacts for LLM-generated content.
 * These start with status 'pending' and are updated as generation completes.
 */
function createPlaceholderArtifacts(
  planId: string,
  artifactKeys: string[],
  coachingPlan: CoachingPlan
): InsertSeriousPlanArtifact[] {
  const plannedArtifacts = coachingPlan.plannedArtifacts || [];
  
  return artifactKeys.map((key, index) => {
    const planned = plannedArtifacts.find(a => a.key === key);
    return {
      planId,
      artifactKey: key,
      title: planned?.title || formatArtifactKeyToTitle(key),
      type: planned?.type || 'snapshot',
      importanceLevel: planned?.importance || 'recommended',
      whyImportant: planned?.description || null,
      contentRaw: null,
      generationStatus: 'pending' as const,
      displayOrder: index + 1,
      pdfStatus: 'not_started',
    };
  });
}

function formatArtifactKeyToTitle(key: string): string {
  return key.split('_').map(word => 
    word.charAt(0).toUpperCase() + word.slice(1)
  ).join(' ');
}

/**
 * Generate the coach letter asynchronously.
 * This is designed to be fast - small prompt, focused output.
 */
async function generateCoachLetterAsync(
  planId: string,
  clientName: string,
  coachingPlan: CoachingPlan,
  dossier: ClientDossier | null
): Promise<void> {
  try {
    // Mark as generating
    await storage.updateCoachLetter(planId, 'generating');

    const prompt = buildCoachLetterPrompt(clientName, coachingPlan, dossier);

    let letterContent: string;

    if (useAnthropic && anthropic) {
      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      });
      letterContent = response.content[0].type === 'text' ? response.content[0].text : '';
    } else {
      const response = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: [{ role: "user", content: prompt }],
        max_completion_tokens: 1024,
      });
      letterContent = response.choices[0].message.content || '';
    }

    // Update the plan with the letter content
    await storage.updateCoachLetter(planId, 'complete', letterContent);
    console.log(`Coach letter generated for plan ${planId}`);
  } catch (error: any) {
    console.error('Coach letter generation error:', error);
    await storage.updateCoachLetter(planId, 'error');
  }
}

function buildCoachLetterPrompt(
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

/**
 * Generate the plan artifacts asynchronously.
 * This handles the longer-running artifact generation.
 */
async function generateArtifactsAsync(
  planId: string,
  clientName: string,
  coachingPlan: CoachingPlan,
  dossier: ClientDossier | null,
  artifactKeys: string[]
): Promise<void> {
  try {
    // Mark all artifacts as generating
    const existingArtifacts = await storage.getArtifactsByPlanId(planId);
    const artifactsToGenerate = existingArtifacts.filter(a => 
      artifactKeys.includes(a.artifactKey) && a.generationStatus === 'pending'
    );

    for (const artifact of artifactsToGenerate) {
      await storage.updateArtifactGenerationStatus(artifact.id, 'generating');
    }

    const planHorizon = determinePlanHorizon(dossier);
    const prompt = buildArtifactsPrompt(clientName, coachingPlan, dossier, planHorizon, artifactKeys);

    let responseText: string;

    if (useAnthropic && anthropic) {
      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 8192,
        messages: [{ role: "user", content: prompt }],
      });
      responseText = response.content[0].type === 'text' ? response.content[0].text : '';
    } else {
      const response = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: [{ role: "user", content: prompt }],
        max_completion_tokens: 8192,
      });
      responseText = response.choices[0].message.content || '';
    }

    // Parse the response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to parse AI response as JSON');
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const generatedArtifacts: ArtifactGeneration[] = parsed.artifacts || [];

    // Update metadata on the plan
    if (parsed.metadata) {
      await storage.updateSeriousPlan(planId, {
        summaryMetadata: parsed.metadata,
      });
    }

    // Update each artifact with its generated content
    for (const generated of generatedArtifacts) {
      const existing = artifactsToGenerate.find(a => a.artifactKey === generated.artifact_key);
      if (existing) {
        await storage.updateArtifact(existing.id, {
          title: generated.title,
          type: generated.type,
          importanceLevel: generated.importance_level,
          whyImportant: generated.why_important,
          contentRaw: generated.content,
          generationStatus: 'complete',
          metadata: generated.metadata || null,
        });
      }
    }

    // Mark any remaining artifacts as complete (even if empty)
    for (const artifact of artifactsToGenerate) {
      const wasGenerated = generatedArtifacts.some(g => g.artifact_key === artifact.artifactKey);
      if (!wasGenerated) {
        await storage.updateArtifactGenerationStatus(artifact.id, 'complete', 
          `This artifact was not generated. The coach focused on other materials more relevant to your situation.`
        );
      }
    }

    // Mark plan as ready
    await storage.updateSeriousPlanStatus(planId, 'ready');
    console.log(`Artifacts generated for plan ${planId}`);
  } catch (error: any) {
    console.error('Artifact generation error:', error);
    // Mark artifacts as error
    const existingArtifacts = await storage.getArtifactsByPlanId(planId);
    for (const artifact of existingArtifacts) {
      if (artifact.generationStatus === 'generating') {
        await storage.updateArtifactGenerationStatus(artifact.id, 'error');
      }
    }
    await storage.updateSeriousPlanStatus(planId, 'error');
  }
}

function buildArtifactsPrompt(
  clientName: string,
  coachingPlan: CoachingPlan,
  dossier: ClientDossier | null,
  planHorizon: { type: string; rationale: string },
  artifactKeys: string[]
): string {
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

  return `You are generating personalized artifacts for a client who just completed a 3-module career coaching program.

${dossierContext}

## Coaching Plan Completed
- Module 1: ${coachingPlan.modules[0]?.name} - ${coachingPlan.modules[0]?.objective}
- Module 2: ${coachingPlan.modules[1]?.name} - ${coachingPlan.modules[1]?.objective}
- Module 3: ${coachingPlan.modules[2]?.name} - ${coachingPlan.modules[2]?.objective}

## Plan Horizon
Type: ${planHorizon.type}
Rationale: ${planHorizon.rationale}

## Artifacts to Generate
Generate the following artifacts: ${artifactKeys.join(', ')}

You may add 1-2 BONUS artifacts if uniquely helpful (mark with importance_level: "bonus").

## Output Format
Return valid JSON:
{
  "metadata": {
    "clientName": "${clientName}",
    "planHorizonType": "${planHorizon.type}",
    "planHorizonRationale": "${planHorizon.rationale}",
    "keyConstraints": ["constraint1"],
    "primaryRecommendation": "Main path forward",
    "emotionalTone": "encouraging"
  },
  "artifacts": [
    {
      "artifact_key": "decision_snapshot",
      "title": "Your Decision Snapshot",
      "type": "snapshot",
      "importance_level": "must_read",
      "why_important": "Specific reason for THIS client",
      "content": "Full markdown content...",
      "metadata": {}
    }
  ]
}

## Artifact Guidelines
- Each "why_important" must be specific to THIS client
- Write clear, direct language - no corporate jargon
- Reference their specific situation, people, constraints
- Be actionable and concrete
- Use markdown formatting

### decision_snapshot (must_read)
One-page summary: situation, 2-4 options with pros/cons, clear recommendation, "if you only do one thing" line

### action_plan (must_read)
Time-boxed to ${planHorizon.type.replace('_', ' ')}, divided into intervals with 2-4 tasks each

### boss_conversation / partner_conversation (if included)
Goal, opening lines, core script, likely pushbacks & responses, red lines, closing

### self_narrative (if included)
Personal memo: how they describe this moment, what they're moving toward, anchored to values

### risk_map (if included)
List of risks with likelihood, impact, mitigation, fallback

### module_recap (recommended)
Summary of each module: topics covered, key answers, major takeaways

### resources (if included)
5-10 credible resources as markdown links with personal relevance explained

Return ONLY valid JSON.`;
}
