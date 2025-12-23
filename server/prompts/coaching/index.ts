/**
 * Coaching Prompts
 *
 * User-facing prompts for coaching conversations.
 * Includes interview, module, and follow-up chat prompts.
 */

import { MODULE_1_SYSTEM_PROMPT } from './module-1-job-autopsy';
import { MODULE_2_SYSTEM_PROMPT } from './module-2-fork-in-road';
import { MODULE_3_SYSTEM_PROMPT } from './module-3-great-escape';

export { INTERVIEW_SYSTEM_PROMPT } from './interview';
export { MODULE_1_SYSTEM_PROMPT } from './module-1-job-autopsy';
export { MODULE_2_SYSTEM_PROMPT } from './module-2-fork-in-road';
export { MODULE_3_SYSTEM_PROMPT } from './module-3-great-escape';
export { buildCoachChatPrompt } from './coach-chat';

/**
 * Get the system prompt for a specific module number.
 */
export function getModuleSystemPrompt(moduleNumber: number): string {
  const prompts: Record<number, string> = {
    1: MODULE_1_SYSTEM_PROMPT,
    2: MODULE_2_SYSTEM_PROMPT,
    3: MODULE_3_SYSTEM_PROMPT,
  };

  const prompt = prompts[moduleNumber];
  if (!prompt) {
    throw new Error(`No system prompt found for module ${moduleNumber}`);
  }
  return prompt;
}
