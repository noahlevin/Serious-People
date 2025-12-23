/**
 * Prompts
 *
 * Central export for all prompt templates used throughout the application.
 *
 * Directory Structure:
 * - analysis/     - Internal analysis prompts (never shown to users)
 * - coaching/     - User-facing coaching conversation prompts
 * - generation/   - Serious Plan and artifact generation prompts
 *
 * Usage:
 * import { INTERVIEW_SYSTEM_PROMPT, buildCoachChatPrompt } from './prompts';
 */

// Analysis prompts (internal)
export {
  INTERVIEW_ANALYSIS_PROMPT,
  MODULE_ANALYSIS_PROMPT,
} from './analysis';

// Coaching prompts (user-facing)
export {
  INTERVIEW_SYSTEM_PROMPT,
  MODULE_1_SYSTEM_PROMPT,
  MODULE_2_SYSTEM_PROMPT,
  MODULE_3_SYSTEM_PROMPT,
  buildCoachChatPrompt,
  getModuleSystemPrompt,
} from './coaching';

// Generation prompts (plan/artifact creation)
export {
  buildGenerationPrompt,
  determinePlanHorizon,
  buildCoachLetterPrompt,
  buildSingleArtifactPrompt,
  getArtifactGuidelines,
} from './generation';
