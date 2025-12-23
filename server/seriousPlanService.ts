import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { z } from "zod";
import { storage } from "./storage";
import type {
  ClientDossier,
  CoachingPlan,
  SeriousPlanMetadata,
  InsertSeriousPlanArtifact,
  ImportanceLevel,
  InterviewTranscript
} from "@shared/schema";
import {
  determinePlanHorizon,
  buildGenerationPrompt,
  buildCoachLetterPrompt,
  buildSingleArtifactPrompt,
  getArtifactGuidelines,
} from "./prompts";

// Zod schema for validating AI artifact responses
// Type is free-form string to allow AI to create any artifact type
const artifactResponseSchema = z.object({
  artifact_key: z.string().optional(), // Optional - we validate against expected key if provided
  title: z.string().min(1, "Title is required"),
  type: z.string().min(1).transform(s => s.toLowerCase().trim()).default('snapshot'),
  importance_level: z.enum(['must_read', 'recommended', 'optional', 'bonus']).default('recommended'),
  why_important: z.string().nullable().optional(),
  content: z.string().min(1, "Content is required"),
  metadata: z.record(z.any()).nullable().optional(),
});

type ValidatedArtifactResponse = z.infer<typeof artifactResponseSchema>;

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

// Prompt functions imported from ./prompts/generation/

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
        model: "claude-sonnet-4-5",
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
  const startTime = Date.now();
  console.log(`[COACH_LETTER] ts=${new Date().toISOString()} plan=${planId} status=started`);
  
  try {
    // Mark as generating
    await storage.updateCoachLetter(planId, 'generating');

    const prompt = buildCoachLetterPrompt(clientName, coachingPlan, dossier);

    let letterContent: string;

    if (useAnthropic && anthropic) {
      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-5",
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
    const durationMs = Date.now() - startTime;
    console.log(`[COACH_LETTER] ts=${new Date().toISOString()} plan=${planId} status=success durationMs=${durationMs}`);
  } catch (error: any) {
    const durationMs = Date.now() - startTime;
    console.error(`[COACH_LETTER] ts=${new Date().toISOString()} plan=${planId} status=error error="${error.message}" durationMs=${durationMs}`);
    await storage.updateCoachLetter(planId, 'error');
  }
}

/**
 * Generate a single artifact.
 * Each artifact is generated independently and updates storage immediately on completion.
 * Uses atomic "claim" pattern to prevent duplicate generation under concurrency.
 * 
 * Return semantics:
 * - { success: true, skipped: false } - This call generated the artifact
 * - { success: true, skipped: true } - Artifact already being processed (another caller claimed it)
 * - { success: false, skipped: false } - Generation failed with error
 * 
 * Note: `success: true, skipped: true` is NOT an error. It means another concurrent process
 * is already generating this artifact, so this call correctly yields to avoid duplicate work.
 * The artifact WILL be generated - just by the other caller.
 */
async function generateSingleArtifact(
  planId: string,
  artifactId: string,
  artifactKey: string,
  clientName: string,
  coachingPlan: CoachingPlan,
  dossier: ClientDossier | null,
  planHorizon: { type: string; rationale: string }
): Promise<{ success: boolean; artifactKey: string; skipped?: boolean }> {
  const startTime = Date.now();
  console.log(`[ARTIFACT] ts=${new Date().toISOString()} plan=${planId} artifact=${artifactKey} status=started`);
  
  try {
    // Attempt to "claim" this artifact by atomically transitioning pending -> generating
    // This prevents duplicate generation if called concurrently.
    // If claim fails, another caller is already generating - we yield gracefully.
    const claim = await storage.transitionArtifactStatusIfCurrent(
      artifactId, 
      ['pending'], 
      'generating'
    );
    
    if (!claim.updated) {
      // Another process is generating, or it's already complete/error - yield gracefully
      console.log(`[ARTIFACT] ts=${new Date().toISOString()} plan=${planId} artifact=${artifactKey} status=skipped reason=claim_failed (another process is handling)`);
      return { success: true, artifactKey, skipped: true };
    }
    
    const prompt = buildSingleArtifactPrompt(artifactKey, clientName, coachingPlan, dossier, planHorizon);
    
    let responseText: string;

    if (useAnthropic && anthropic) {
      // Enable web search tool ONLY for resources artifact
      const useWebSearch = artifactKey === 'resources';
      
      const requestParams: Anthropic.MessageCreateParams = {
        model: "claude-sonnet-4-5",
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt }],
      };
      
      // Add web search tool for resources artifact
      if (useWebSearch) {
        requestParams.tools = [{
          type: "web_search_20250305",
          name: "web_search",
          max_uses: 10, // Allow up to 10 searches to find quality resources
        } as Anthropic.WebSearchTool20250305];
        console.log(`[ARTIFACT] ts=${new Date().toISOString()} plan=${planId} artifact=${artifactKey} status=web_search_enabled`);
      }
      
      const response = await anthropic.messages.create(requestParams);
      
      // Extract text from response (may include tool_use blocks for web search)
      responseText = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map(block => block.text)
        .join('');
      
      const aiDurationMs = Date.now() - startTime;
      const searchInfo = useWebSearch ? ` webSearchUsed=true` : '';
      console.log(`[ARTIFACT] ts=${new Date().toISOString()} plan=${planId} artifact=${artifactKey} status=ai_complete stop=${response.stop_reason} tokens=${response.usage?.output_tokens} aiDurationMs=${aiDurationMs}${searchInfo}`);
    } else {
      const response = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: [{ role: "user", content: prompt }],
        max_completion_tokens: 4096,
      });
      responseText = response.choices[0].message.content || '';
    }

    // Parse the response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to parse AI response as JSON');
    }

    let rawParsed: unknown;
    try {
      rawParsed = JSON.parse(jsonMatch[0]);
    } catch (parseErr: any) {
      throw new Error(`JSON parse error for ${artifactKey}: ${parseErr.message}`);
    }
    
    // Validate with Zod schema
    const validationResult = artifactResponseSchema.safeParse(rawParsed);
    if (!validationResult.success) {
      const errors = validationResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
      throw new Error(`Validation failed for ${artifactKey}: ${errors}`);
    }
    
    const validated: ValidatedArtifactResponse = validationResult.data;
    
    // Warn if artifact_key doesn't match (but don't fail - AI might omit or mismatch)
    if (validated.artifact_key && validated.artifact_key !== artifactKey) {
      console.warn(`[ARTIFACT] ts=${new Date().toISOString()} plan=${planId} artifact=${artifactKey} warning=key_mismatch received=${validated.artifact_key}`);
    }
    
    // Update artifact with validated data
    await storage.updateArtifact(artifactId, {
      title: validated.title || formatArtifactKeyToTitle(artifactKey),
      type: validated.type,
      importanceLevel: validated.importance_level as ImportanceLevel,
      whyImportant: validated.why_important || null,
      contentRaw: validated.content,
      generationStatus: 'complete',
      metadata: validated.metadata || null,
    });
    
    const durationMs = Date.now() - startTime;
    console.log(`[ARTIFACT] ts=${new Date().toISOString()} plan=${planId} artifact=${artifactKey} status=success durationMs=${durationMs}`);
    
    return { success: true, artifactKey };
  } catch (error: any) {
    const durationMs = Date.now() - startTime;
    console.error(`[ARTIFACT] ts=${new Date().toISOString()} plan=${planId} artifact=${artifactKey} status=error error="${error.message}" durationMs=${durationMs}`);
    await storage.updateArtifactGenerationStatus(artifactId, 'error');
    return { success: false, artifactKey };
  }
}

/**
 * Generate the plan artifacts asynchronously - IN PARALLEL.
 * Each artifact is generated independently and updates the frontend immediately on completion.
 * Exported for dev tooling.
 */
export async function generateArtifactsAsync(
  planId: string,
  clientName: string,
  coachingPlan: CoachingPlan,
  dossier: ClientDossier | null,
  artifactKeys: string[]
): Promise<void> {
  const startTime = Date.now();
  console.log(`[ARTIFACTS_GEN] ts=${new Date().toISOString()} plan=${planId} status=started artifactCount=${artifactKeys.length} keys=${artifactKeys.join(',')}`);
  
  try {
    // Get existing artifacts to find their IDs
    const existingArtifacts = await storage.getArtifactsByPlanId(planId);
    // Filter to only include non-transcript artifacts that need generation
    const artifactsToGenerate = existingArtifacts.filter(a => 
      artifactKeys.includes(a.artifactKey) && 
      a.generationStatus === 'pending' &&
      a.type !== 'transcript' && 
      !a.artifactKey.startsWith('transcript_')
    );

    const planHorizon = determinePlanHorizon(dossier);

    // Generate all artifacts in parallel
    const generationPromises = artifactsToGenerate.map(artifact => 
      generateSingleArtifact(
        planId,
        artifact.id,
        artifact.artifactKey,
        clientName,
        coachingPlan,
        dossier,
        planHorizon
      )
    );

    // Wait for all to complete (each updates storage independently)
    const results = await Promise.all(generationPromises);
    
    const successCount = results.filter(r => r.success).length;
    const failedCount = results.filter(r => !r.success).length;

    // Generate metadata in a separate call (lightweight)
    await generatePlanMetadata(planId, clientName, coachingPlan, dossier, planHorizon);

    // Mark plan as ready (or error if all failed)
    if (failedCount === artifactsToGenerate.length) {
      await storage.updateSeriousPlanStatus(planId, 'error');
    } else {
      await storage.updateSeriousPlanStatus(planId, 'ready');
    }
    
    const durationMs = Date.now() - startTime;
    console.log(`[ARTIFACTS_GEN] ts=${new Date().toISOString()} plan=${planId} status=complete successCount=${successCount} failedCount=${failedCount} durationMs=${durationMs}`);
  } catch (error: any) {
    const durationMs = Date.now() - startTime;
    console.error(`[ARTIFACTS_GEN] ts=${new Date().toISOString()} plan=${planId} status=error error="${error.message}" durationMs=${durationMs}`);
    await storage.updateSeriousPlanStatus(planId, 'error');
  }
}

/**
 * Regenerate pending/error artifacts for an existing plan.
 * Can be called to retry failed artifacts without recreating the entire plan.
 */
export async function regeneratePendingArtifacts(planId: string): Promise<{ started: boolean; artifactCount: number }> {
  const plan = await storage.getSeriousPlan(planId);
  if (!plan) {
    throw new Error('Plan not found');
  }
  
  // Get the transcript for context using user ID
  const transcript = await storage.getTranscriptByUserId(plan.userId);
  if (!transcript?.planCard || !transcript?.clientDossier) {
    throw new Error('Missing transcript data for regeneration');
  }
  
  const artifacts = await storage.getArtifactsByPlanId(planId);
  const pendingArtifacts = artifacts.filter(a => 
    (a.generationStatus === 'pending' || a.generationStatus === 'error') &&
    a.type !== 'transcript' &&
    !a.artifactKey.startsWith('transcript_')
  );
  
  if (pendingArtifacts.length === 0) {
    return { started: false, artifactCount: 0 };
  }
  
  const artifactKeys = pendingArtifacts.map(a => a.artifactKey);
  const clientName = transcript.clientDossier.interviewAnalysis?.clientName || 'Client';
  
  console.log(`[REGENERATE] ts=${new Date().toISOString()} plan=${planId} status=starting artifactCount=${artifactKeys.length} keys=${artifactKeys.join(',')}`);
  
  // Fire and forget - run in background
  generateArtifactsAsync(planId, clientName, transcript.planCard, transcript.clientDossier, artifactKeys);
  
  return { started: true, artifactCount: pendingArtifacts.length };
}

/**
 * Generate plan metadata separately (lightweight call).
 */
async function generatePlanMetadata(
  planId: string,
  clientName: string,
  coachingPlan: CoachingPlan,
  dossier: ClientDossier | null,
  planHorizon: { type: string; rationale: string }
): Promise<void> {
  try {
    const constraints = dossier?.interviewAnalysis?.constraints || [];
    const primaryRecommendation = dossier?.moduleRecords?.find(m => m.moduleNumber === 3)?.summary || 
      'Focus on the action items in your plan';
    
    const metadata = {
      clientName,
      planHorizonType: planHorizon.type,
      planHorizonRationale: planHorizon.rationale,
      keyConstraints: constraints,
      primaryRecommendation,
      emotionalTone: 'encouraging',
    };
    
    await storage.updateSeriousPlan(planId, { summaryMetadata: metadata });
  } catch (error: any) {
    console.error(`[METADATA] ts=${new Date().toISOString()} plan=${planId} status=error error="${error.message}"`);
  }
}

// buildSingleArtifactPrompt and getArtifactGuidelines imported from ./prompts/generation/

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
