/**
 * Test script to measure JSON reliability of dossier generation
 * Run with: npx tsx server/test-dossier-reliability.ts
 */

import Anthropic from "@anthropic-ai/sdk";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

const anthropic = new Anthropic();

const INTERVIEW_ANALYSIS_PROMPT = `You are an internal analysis system for a career coaching platform. Your job is to create a comprehensive, detailed dossier about a coaching client based on their interview transcript.

CRITICAL: This dossier is INTERNAL ONLY and will NEVER be shown to the client. Be thorough and capture everything.

IMPORTANT: Write ALL content in SECOND PERSON ("you", "your") - NOT third person. For example, write "You mentioned feeling stuck in your role..." NOT "The client mentioned feeling stuck...".

Analyze the interview transcript and output a JSON object with the following structure:

{
  "situationSummary": "A comprehensive summary of the client's situation - written in second person (you/your) - include what they do, where they work, how long they've been there, what's happening, what prompted this coaching session. Multiple paragraphs if needed.",
  "background": [
    "Every piece of background info mentioned",
    "Work history, education, past roles, past companies",
    "Include financial details",
    "Include family/relationship details that affect their decision"
  ],
  "relationships": [
    {
      "person": "Partner/Spouse/Manager/Skip-level/etc.",
      "role": "Their role in the client's life",
      "dynamic": "Detailed description of the relationship dynamic and how it affects the client's career situation"
    }
  ],
  "emotionalState": "Detailed observations about their emotional state: frustration level, confidence, anxiety, determination, hesitation patterns, what topics made them emotional, what they seemed confident about vs uncertain about",
  "communicationStyle": "How they communicate: direct vs indirect, verbose vs terse, analytical vs emotional, how quickly they respond, whether they elaborate or need prompting, whether they're open or guarded",
  "priorities": [
    "What matters most to them, in order of importance",
    "Include both stated priorities and implied ones from their language"
  ],
  "constraints": [
    "What limits their options: financial, family, visa, location, skills gaps, etc.",
    "Include both hard constraints and soft preferences"
  ],
  "motivations": [
    "What's driving them to make a change",
    "Include both push factors (what they're running from) and pull factors (what they're running toward)"
  ],
  "fears": [
    "What they're worried about or afraid of",
    "Include stated fears and implied ones"
  ],
  "questionsAsked": [
    "List the 10 most important questions the coach asked"
  ],
  "optionsOffered": [
    {
      "option": "The option that was presented",
      "chosen": true,
      "reason": "Why they chose or rejected it, if stated"
    }
  ],
  "observations": "Your private analytical notes: What patterns did you notice? What were they avoiding? What topics made them energized vs deflated? What might they not be saying? What assumptions are they making? What biases do you detect? How self-aware are they? What coaching approach might work best with them? Include any other observations that would help a coach understand this person deeply."
}

Important:
- Be EXHAUSTIVE. Do not leave out any detail from the transcript.
- If something wasn't mentioned, leave the field empty or write "Not mentioned" - never fabricate.
- For arrays, include ALL relevant items, not just top 3.
- The "observations" field should be especially detailed - this is your analytical synthesis.
- Quote their exact words where relevant.
- Capture nuance, hesitation, and subtext.

CRITICAL JSON FORMATTING RULES:
- Output ONLY valid JSON. No markdown code fences, no explanation, just the raw JSON object.
- Start your response with { and end with }
- Ensure all strings are properly escaped (especially quotes and newlines)
- Ensure all arrays are properly closed with ]
- Ensure all objects are properly closed with }
- Double-check that every { has a matching } and every [ has a matching ]
- Limit questionsAsked to the 10 most important questions
- Limit optionsOffered to actual options presented (usually 2-5)`;

async function testDossierGeneration(transcriptId: string, email: string, transcript: any[]): Promise<{ success: boolean; durationMs: number; error?: string }> {
  const startTime = Date.now();
  
  try {
    const transcriptText = transcript.map((m: any) => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n');
    
    console.log(`  Testing ${email} (${transcript.length} messages)...`);
    
    // Use prefill technique: start assistant response with { to ensure clean JSON
    const result = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 8192, // Increased to prevent truncation
      system: INTERVIEW_ANALYSIS_PROMPT,
      messages: [
        { role: "user", content: transcriptText },
        { role: "assistant", content: "{" } // Prefill to ensure JSON starts correctly
      ],
    });
    
    // Prepend the { since we used it as prefill
    const content = result.content[0].type === 'text' ? result.content[0].text : '';
    const response = "{" + content;
    const durationMs = Date.now() - startTime;
    
    // Try to parse JSON with better error handling
    try {
      JSON.parse(response);
      console.log(`  ✓ SUCCESS in ${durationMs}ms`);
      return { success: true, durationMs };
    } catch (directError: any) {
      // Try extracting JSON object from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          JSON.parse(jsonMatch[0]);
          console.log(`  ✓ SUCCESS (extracted) in ${durationMs}ms`);
          return { success: true, durationMs };
        } catch (extractError: any) {
          const posMatch = extractError.message.match(/position (\d+)/);
          const pos = posMatch ? parseInt(posMatch[1]) : 100;
          const snippet = jsonMatch[0].substring(Math.max(0, pos - 30), pos + 30);
          console.log(`  ✗ FAILED: ${extractError.message} near: ...${snippet}... (${durationMs}ms)`);
          return { success: false, durationMs, error: extractError.message };
        }
      }
      console.log(`  ✗ FAILED: ${directError.message} (${durationMs}ms)`);
      return { success: false, durationMs, error: directError.message };
    }
  } catch (error: any) {
    const durationMs = Date.now() - startTime;
    console.log(`  ✗ FAILED: ${error.message} (${durationMs}ms)`);
    return { success: false, durationMs, error: error.message };
  }
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  
  // Get 3 test transcripts
  const result = await pool.query(`
    SELECT u.id, u.email, t.transcript 
    FROM users u 
    JOIN interview_transcripts t ON u.id = t.user_id 
    WHERE t.transcript IS NOT NULL 
      AND jsonb_array_length(t.transcript::jsonb) > 10
    ORDER BY jsonb_array_length(t.transcript::jsonb) DESC
    LIMIT 3
  `);
  
  console.log("\n=== DOSSIER JSON RELIABILITY TEST ===\n");
  console.log(`Testing ${result.rows.length} transcripts...\n`);
  
  const results: { email: string; success: boolean; durationMs: number; error?: string }[] = [];
  
  for (const row of result.rows) {
    const testResult = await testDossierGeneration(row.id, row.email, row.transcript);
    results.push({ email: row.email, ...testResult });
  }
  
  console.log("\n=== RESULTS ===\n");
  
  const successes = results.filter(r => r.success).length;
  const failures = results.filter(r => !r.success).length;
  const avgDuration = Math.round(results.reduce((sum, r) => sum + r.durationMs, 0) / results.length);
  
  console.log(`Success: ${successes}/${results.length} (${Math.round(successes/results.length*100)}%)`);
  console.log(`Failures: ${failures}/${results.length}`);
  console.log(`Average duration: ${avgDuration}ms`);
  
  if (failures > 0) {
    console.log("\nFailure details:");
    results.filter(r => !r.success).forEach(r => {
      console.log(`  - ${r.email}: ${r.error}`);
    });
  }
  
  await pool.end();
}

main().catch(console.error);
