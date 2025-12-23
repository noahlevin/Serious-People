/**
 * Artifact Guidelines
 *
 * Provides specific generation guidelines for each artifact type.
 * Used when generating individual artifacts.
 *
 * Used in: seriousPlanService.ts - buildSingleArtifactPrompt()
 */

interface PlanHorizon {
  type: string;
  rationale?: string;
}

/**
 * Get artifact-specific guidelines for generation.
 */
export function getArtifactGuidelines(artifactKey: string, planHorizon: PlanHorizon): string {
  const guidelines: Record<string, string> = {
    decision_snapshot: `### decision_snapshot (ESSENTIAL)
One-page decision summary including:
- Current situation in 2-3 sentences
- 2-4 realistic options with pros/cons for each
- Clear recommendation with rationale
- "If you only do one thing..." action line`,

    action_plan: `### action_plan (ESSENTIAL)
Time-boxed action plan for ${planHorizon.type.replace('_', ' ')}:
- Divide into logical time intervals (Week 1-2, Week 3-4, etc.)
- 2-4 specific, actionable tasks per interval
- Include deadlines and success criteria
- End with "How to know you're on track" section`,

    boss_conversation: `### boss_conversation (Script)
Practical conversation guide:
- Goal of the conversation
- Opening lines (2-3 options)
- Core message and talking points
- Likely pushbacks and how to respond
- Red lines / what not to say
- Closing / next steps`,

    partner_conversation: `### partner_conversation (Script)
Practical conversation guide for discussing career decisions with partner:
- Goal and context
- Opening approach
- Key points to cover
- How to address concerns
- Collaborative next steps`,

    self_narrative: `### self_narrative (Personal)
Internal memo / personal reflection:
- How to describe this moment to yourself
- What you're moving toward (not just away from)
- Core values this decision honors
- Permission slip / affirmation`,

    risk_map: `### risk_map (Strategic)
Risk assessment table:
- List 4-6 key risks
- For each: likelihood (High/Med/Low), impact, mitigation strategy, fallback plan
- Include both external risks and personal/emotional risks`,

    module_recap: `### module_recap (Reference)
Summary of coaching journey:
- For each module: key topics, decisions made, major insights
- Overall arc of the conversation
- Key quotes or breakthroughs`,

    resources: `### resources (Reference)
5-8 curated resources with VERIFIED, WORKING URLs:

CRITICAL: You have web search enabled. You MUST:
1. Use web search to find real, current resources relevant to this client's situation
2. Only include URLs that you found via web search - NEVER make up or guess URLs
3. Verify each link exists by searching for it
4. Include a mix of: articles, books (link to Amazon/Goodreads), tools, frameworks

Format for each resource:
- [Resource Name](verified_URL) - One sentence explaining why THIS client specifically needs this

Categories to consider:
- Career transition articles/guides
- Books relevant to their industry or situation
- Negotiation or communication frameworks
- Industry-specific resources
- Tools for job search, networking, or skill building

DO NOT include any URL you did not find via web search. If you cannot find enough quality resources, include fewer rather than making up links.`,
  };

  return guidelines[artifactKey] || `### ${artifactKey}\nGenerate helpful content for this artifact based on the client's situation.`;
}
