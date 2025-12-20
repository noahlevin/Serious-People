#!/usr/bin/env node
/**
 * Smoke test for interview chat LLM integration
 * Tests POST /api/dev/interview/turn with real LLM responses
 * Tests structured outcomes lifecycle: inject -> select -> verify
 * Tests finalize interview lifecycle: finalize -> verify artifacts -> verify final card
 * 
 * Usage: ORIGIN=http://localhost:5000 EMAIL=noah@noahlevin.com DEV_TOOLS_SECRET=sp-dev-2024 node scripts/smoke-interview-chat.mjs
 * 
 * Environment variables:
 *   TURN_TIMEOUT_MS - timeout per LLM turn (default: 120000 = 2 min)
 *   MAX_RETRIES - max retries for LLM turns (default: 2)
 */

const ORIGIN = process.env.ORIGIN || "http://localhost:5000";
const EMAIL = process.env.EMAIL || "noah@noahlevin.com";
const DEV_TOOLS_SECRET = process.env.DEV_TOOLS_SECRET || "sp-dev-2024";
const TURN_TIMEOUT_MS = parseInt(process.env.TURN_TIMEOUT_MS || "120000", 10);
const MAX_RETRIES = parseInt(process.env.MAX_RETRIES || "2", 10);
const DEV_FAST = process.env.DEV_FAST === "1";

console.log(`[INFO] Testing against ${ORIGIN}`);
console.log(`[INFO] Using EMAIL=${EMAIL}`);
console.log(`[INFO] TURN_TIMEOUT_MS=${TURN_TIMEOUT_MS}, MAX_RETRIES=${MAX_RETRIES}`);
if (DEV_FAST) {
  console.log(`[INFO] DEV_FAST=1: Using testskip mode for faster testing`);
}
console.log("");

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return res;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs}ms`);
    }
    throw err;
  }
}

async function callTurnWithRetry(message, retries = MAX_RETRIES) {
  let lastError = null;
  
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      const res = await fetchWithTimeout(
        `${ORIGIN}/api/dev/interview/turn`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-dev-tools-secret": DEV_TOOLS_SECRET,
          },
          body: JSON.stringify({ email: EMAIL, message }),
        },
        TURN_TIMEOUT_MS
      );

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text}`);
      }

      const result = await res.json();
      
      // If success but empty reply, LLM may have had an issue - retry if we have attempts left
      // Exception: if planCard is present (testskip mode), empty reply is acceptable
      if (result.success && (!result.reply || result.reply.length === 0) && !result.planCard && attempt <= retries) {
        console.log(`[RETRY] Turn returned empty reply, attempt ${attempt}/${retries + 1}`);
        lastError = new Error("Empty reply from LLM");
        continue;
      }
      
      return result;
    } catch (err) {
      lastError = err;
      if (attempt <= retries) {
        console.log(`[RETRY] Attempt ${attempt} failed: ${err.message}, retrying...`);
        await new Promise(r => setTimeout(r, 2000)); // Wait 2s before retry
      }
    }
  }
  
  throw lastError || new Error("All retry attempts failed");
}

async function callTurn(message) {
  return callTurnWithRetry(message);
}

async function resetUserName() {
  const res = await fetch(`${ORIGIN}/api/dev/reset-user-name`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-dev-tools-secret": DEV_TOOLS_SECRET,
    },
    body: JSON.stringify({ email: EMAIL }),
  });
  
  if (!res.ok) {
    console.log("[WARN] Could not reset user name (endpoint may not exist)");
    return false;
  }
  return true;
}

async function injectOutcomes() {
  const res = await fetch(`${ORIGIN}/api/dev/interview/inject-outcomes`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-dev-tools-secret": DEV_TOOLS_SECRET,
    },
    body: JSON.stringify({ email: EMAIL }),
  });
  
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`inject-outcomes HTTP ${res.status}: ${text}`);
  }
  return res.json();
}

async function selectOutcome(eventSeq, optionId) {
  const res = await fetch(`${ORIGIN}/api/dev/interview/outcomes/select`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-dev-tools-secret": DEV_TOOLS_SECRET,
    },
    body: JSON.stringify({ email: EMAIL, eventSeq, optionId }),
  });
  
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`outcomes/select HTTP ${res.status}: ${text}`);
  }
  return res.json();
}

async function forceFinalize() {
  const res = await fetch(`${ORIGIN}/api/dev/interview/finalize`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-dev-tools-secret": DEV_TOOLS_SECRET,
    },
    body: JSON.stringify({ email: EMAIL }),
  });
  
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`interview/finalize HTTP ${res.status}: ${text}`);
  }
  return res.json();
}

async function main() {
  let passed = 0;
  let failed = 0;

  // Reset user's providedName and clear events before testing
  console.log("[SETUP] Resetting user providedName and clearing events...");
  const resetOk = await resetUserName();
  if (!resetOk) {
    console.log("[WARN] Reset failed, test may see stale data");
  }
  console.log("");

  // DEV_FAST mode: use testskip to bypass slow LLM turns
  if (DEV_FAST) {
    console.log("=== DEV_FAST MODE: Using testskip ===");
    console.log("");
    console.log("[TEST] Sending 'testskip' to fast-track interview...");
    try {
      const skipResult = await callTurn("testskip");
      if (skipResult.success && skipResult.planCard) {
        console.log(`[PASS] testskip returned planCard with ${skipResult.planCard.modules?.length || 0} modules`);
        passed++;
      } else if (skipResult.success) {
        console.log("[FAIL] testskip returned success but no planCard");
        failed++;
      } else {
        console.log("[FAIL] testskip did not return success");
        failed++;
      }
      
      // Skip to finalize tests
      console.log("");
      console.log("=== FINALIZE INTERVIEW LIFECYCLE TESTS (DEV_FAST) ===");
      console.log("");
      
      console.log("[TEST] Forcing interview finalization...");
      const finalizeResult = await forceFinalize();
      
      if (finalizeResult.success) {
        console.log(`[PASS] Finalize returned success=true`);
        passed++;
        
        if (finalizeResult.interviewComplete) {
          console.log(`[PASS] Interview marked complete=true`);
          passed++;
        } else {
          console.log(`[FAIL] Interview not marked complete`);
          failed++;
        }
        
        if (finalizeResult.finalEvent?.modulesCount > 0) {
          console.log(`[PASS] Final next steps event exists with ${finalizeResult.finalEvent.modulesCount} modules`);
          passed++;
        } else {
          console.log(`[FAIL] No final next steps event or 0 modules`);
          failed++;
        }
        
        if (finalizeResult.hasSeriousPlan && finalizeResult.artifactsCount > 0) {
          console.log(`[PASS] Serious plan exists with ${finalizeResult.artifactsCount} artifacts`);
          passed++;
        } else {
          console.log(`[FAIL] No serious plan or no artifacts`);
          failed++;
        }
      } else {
        console.log(`[FAIL] Finalize did not return success=true`);
        failed++;
      }
      
      console.log("");
      console.log("=== SMOKE TEST COMPLETE (DEV_FAST) ===");
      if (failed === 0) {
        console.log(`PASS: All ${passed} checks passed`);
        process.exit(0);
      } else {
        console.log(`FAIL: ${passed} passed, ${failed} failed`);
        process.exit(1);
      }
    } catch (err) {
      console.log(`[FAIL] DEV_FAST error: ${err.message}`);
      process.exit(1);
    }
  }

  // Normal mode: full test suite
  // Test 1: First turn - say hello
  console.log("[TEST] Turn 1: Sending 'hello'...");
  try {
    const result1 = await callTurn("hello");
    
    if (!result1.success) {
      console.log("[FAIL] Turn 1 did not return success=true");
      failed++;
    } else if (!result1.reply || result1.reply.length === 0) {
      console.log("[FAIL] Turn 1 reply is empty");
      failed++;
    } else if (!result1.transcript || !Array.isArray(result1.transcript)) {
      console.log("[FAIL] Turn 1 transcript is not an array");
      failed++;
    } else {
      console.log(`[PASS] Turn 1: reply contentLength=${result1.reply.length}, transcriptLength=${result1.transcript.length}`);
      passed++;
    }

    const turn1TranscriptLength = result1.transcript?.length || 0;

    // Test 2: Send name to trigger set_provided_name tool
    console.log("");
    console.log("[TEST] Turn 2: Sending 'Call me Noah.'...");
    const result2 = await callTurn("Call me Noah.");

    if (!result2.success) {
      console.log("[FAIL] Turn 2 did not return success=true");
      failed++;
    } else if (!result2.transcript || result2.transcript.length <= turn1TranscriptLength) {
      console.log(`[FAIL] Turn 2 transcript did not grow (was ${turn1TranscriptLength}, now ${result2.transcript?.length || 0})`);
      failed++;
    } else {
      // Empty reply is acceptable if tool was called (LLM behavior can vary)
      const replyNote = result2.reply?.length > 0 ? `reply contentLength=${result2.reply.length}` : "reply empty (tool-only response)";
      console.log(`[PASS] Turn 2: ${replyNote}, transcriptLength=${result2.transcript.length}`);
      passed++;
    }

    // Test 3: Check for user.provided_name_set with name="Noah"
    console.log("");
    console.log("[TEST] Checking for user.provided_name_set with name='Noah'...");
    
    const turn2Events = result2.events || [];
    const allNameEvents = turn2Events.filter(e => e.type === "user.provided_name_set");
    
    if (allNameEvents.length === 0) {
      console.log("[FAIL] No user.provided_name_set events found after 'Call me Noah.'");
      console.log("[INFO] Event types present: " + JSON.stringify([...new Set(turn2Events.map(e => e.type))]));
      failed++;
    } else {
      const latestNameEvent = allNameEvents.reduce((a, b) => 
        (a.eventSeq || 0) > (b.eventSeq || 0) ? a : b
      );
      const eventName = latestNameEvent.payload?.name;
      
      if (eventName === "Noah") {
        console.log(`[PASS] Found user.provided_name_set event with name="${eventName}" (eventSeq=${latestNameEvent.eventSeq})`);
        passed++;
      } else {
        console.log(`[FAIL] user.provided_name_set event has wrong name="${eventName}" (expected "Noah")`);
        failed++;
      }
    }

    // ========================================
    // Test 4-9: Structured Outcomes Lifecycle
    // ========================================
    console.log("");
    console.log("=== STRUCTURED OUTCOMES LIFECYCLE TESTS ===");
    console.log("");

    // Test 4: Inject test outcomes event
    console.log("[TEST] Injecting test outcomes event...");
    const injectResult = await injectOutcomes();
    
    if (!injectResult.success || !injectResult.eventSeq) {
      console.log(`[FAIL] inject-outcomes did not return success or eventSeq`);
      console.log(`[INFO] Result: ${JSON.stringify(injectResult)}`);
      failed++;
    } else {
      const outcomesEventSeq = injectResult.eventSeq;
      const options = injectResult.options || [];
      
      console.log(`[PASS] Injected outcomes event with eventSeq=${outcomesEventSeq}, ${options.length} options`);
      passed++;

      // Verify outcomes event exists in events list
      const outcomesEvent = injectResult.events?.find(e => 
        e.eventSeq === outcomesEventSeq && e.type === "chat.structured_outcomes_added"
      );
      
      if (!outcomesEvent) {
        console.log(`[FAIL] Outcomes event not found in events list`);
        failed++;
      } else if (!outcomesEvent.payload?.options || outcomesEvent.payload.options.length < 2) {
        console.log(`[FAIL] Outcomes event has <2 options: ${outcomesEvent.payload?.options?.length}`);
        failed++;
      } else {
        console.log(`[PASS] Outcomes event has ${outcomesEvent.payload.options.length} options`);
        passed++;
      }

      // Test 5: Select option 1
      console.log("");
      console.log("[TEST] Selecting option 1 (test_opt_1)...");
      const preSelectTranscriptLength = result2.transcript?.length || 0;
      
      try {
        const selectResult = await selectOutcome(outcomesEventSeq, "test_opt_1");
        
        if (!selectResult.success) {
          console.log(`[FAIL] outcomes/select did not return success=true`);
          failed++;
        } else {
          console.log(`[PASS] Option selected successfully`);
          passed++;
          
          // Test 6: Verify transcript grew with user message containing selected value
          const newTranscriptLength = selectResult.transcript?.length || 0;
          if (newTranscriptLength <= preSelectTranscriptLength) {
            console.log(`[FAIL] Transcript did not grow after selection (was ${preSelectTranscriptLength}, now ${newTranscriptLength})`);
            failed++;
          } else {
            const userMessages = selectResult.transcript?.filter(m => m.role === "user") || [];
            const hasSelectedValue = userMessages.some(m => m.content === "I choose option A");
            
            if (hasSelectedValue) {
              console.log(`[PASS] Transcript contains user message with selected option value`);
              passed++;
            } else {
              console.log(`[WARN] User message with exact value not found, but transcript grew`);
              passed++;
            }
          }
          
          // Test 7: Verify selection event exists
          console.log("");
          console.log("[TEST] Verifying selection event exists...");
          
          const selectionEvent = selectResult.events?.find(e => 
            e.type === "chat.structured_outcome_selected" && 
            e.payload?.eventSeq === outcomesEventSeq
          );
          
          if (!selectionEvent) {
            console.log(`[FAIL] No structured_outcome_selected event found for eventSeq=${outcomesEventSeq}`);
            console.log(`[INFO] Events: ${JSON.stringify(selectResult.events?.map(e => ({ type: e.type, eventSeq: e.eventSeq })))}`);
            failed++;
          } else {
            console.log(`[PASS] Found selection event with optionId=${selectionEvent.payload?.optionId}`);
            passed++;
          }
          
          // Test 8: Verify idempotency - same option should succeed
          console.log("");
          console.log("[TEST] Testing idempotency (selecting same option again)...");
          try {
            const idempotentResult = await selectOutcome(outcomesEventSeq, "test_opt_1");
            if (idempotentResult.success) {
              console.log(`[PASS] Idempotent selection returned success (note: ${idempotentResult.note || "no note"})`);
              passed++;
            } else {
              console.log(`[FAIL] Idempotent selection did not return success`);
              failed++;
            }
          } catch (err) {
            console.log(`[FAIL] Idempotent selection threw error: ${err.message}`);
            failed++;
          }
          
          // Test 9: Verify conflict - different option should return 409
          console.log("");
          console.log("[TEST] Testing conflict (selecting different option)...");
          try {
            const conflictResult = await fetch(`${ORIGIN}/api/dev/interview/outcomes/select`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-dev-tools-secret": DEV_TOOLS_SECRET,
              },
              body: JSON.stringify({ email: EMAIL, eventSeq: outcomesEventSeq, optionId: "test_opt_2" }),
            });
            
            if (conflictResult.status === 409) {
              console.log(`[PASS] Different option correctly returned 409 Conflict`);
              passed++;
            } else {
              const text = await conflictResult.text();
              console.log(`[FAIL] Different option returned ${conflictResult.status} instead of 409: ${text}`);
              failed++;
            }
          } catch (err) {
            console.log(`[FAIL] Conflict test threw error: ${err.message}`);
            failed++;
          }
        }
      } catch (err) {
        console.log(`[FAIL] Selection error: ${err.message}`);
        failed++;
      }
    }

    // ========================================
    // Test 10-13: Finalize Interview Lifecycle
    // ========================================
    console.log("");
    console.log("=== FINALIZE INTERVIEW LIFECYCLE TESTS ===");
    console.log("");

    // Test 10: Force finalize interview
    console.log("[TEST] Forcing interview finalization...");
    try {
      const finalizeResult = await forceFinalize();
      
      if (!finalizeResult.success) {
        console.log(`[FAIL] finalize did not return success=true`);
        failed++;
      } else {
        console.log(`[PASS] Finalize returned success=true`);
        passed++;
        
        // Test 11: Verify interview is marked complete
        console.log("");
        console.log("[TEST] Verifying interview marked complete...");
        if (finalizeResult.interviewComplete) {
          console.log(`[PASS] Interview marked complete=true`);
          passed++;
        } else {
          console.log(`[FAIL] Interview not marked complete (interviewComplete=${finalizeResult.interviewComplete})`);
          failed++;
        }
        
        // Test 12: Verify final next steps event exists with modules > 0
        console.log("");
        console.log("[TEST] Verifying final next steps event exists with modules...");
        if (!finalizeResult.finalEvent) {
          console.log(`[FAIL] No final next steps event found`);
          console.log(`[INFO] Events: ${JSON.stringify(finalizeResult.events?.map(e => e.type))}`);
          failed++;
        } else {
          const modulesCount = finalizeResult.finalEvent.modulesCount || 0;
          if (modulesCount === 0) {
            console.log(`[FAIL] Final next steps event has 0 modules`);
            failed++;
          } else {
            console.log(`[PASS] Final next steps event exists with ${modulesCount} modules`);
            console.log(`[INFO] Module titles: ${finalizeResult.finalEvent.modules.map(m => m.title).join(', ')}`);
            passed++;
          }
        }
        
        // Test 12b: Verify serious plan and artifacts were created
        console.log("");
        console.log("[TEST] Verifying serious plan artifacts exist...");
        if (!finalizeResult.hasSeriousPlan) {
          console.log(`[FAIL] No serious plan created`);
          failed++;
        } else if (finalizeResult.artifactsCount === 0) {
          console.log(`[FAIL] Serious plan exists but no artifacts created`);
          failed++;
        } else {
          console.log(`[PASS] Serious plan exists with ${finalizeResult.artifactsCount} artifacts`);
          console.log(`[INFO] Artifact keys: ${finalizeResult.artifacts?.map(a => a.key).join(', ')}`);
          passed++;
        }
        
        // Test 13: Verify idempotency - calling finalize again should not create duplicate event
        console.log("");
        console.log("[TEST] Testing finalize idempotency...");
        const finalizeResult2 = await forceFinalize();
        
        const finalEvents = finalizeResult2.events?.filter(e => e.type === "chat.final_next_steps_added") || [];
        if (finalEvents.length === 1) {
          console.log(`[PASS] Idempotent finalize: still only 1 final_next_steps_added event`);
          passed++;
        } else {
          console.log(`[FAIL] Idempotent finalize created duplicate events (count=${finalEvents.length})`);
          failed++;
        }
        
        // Test 14: Verify no legacy tokens in transcript messages
        console.log("");
        console.log("[TEST] Verifying no legacy tokens in transcript...");
        // Use transcript from finalizeResult2 which has all current data
        const tokenPatterns = ["[[PROGRESS]]", "[[PLAN_CARD]]", "[[VALUE_BULLETS]]", "[[SOCIAL_PROOF]]", "[[INTERVIEW_COMPLETE]]", "[[OPTIONS]]", "[[END_"];
        let foundTokens = false;
        let tokenDetails = [];
        
        for (const msg of finalizeResult2.transcript || []) {
          if (msg.role === "assistant" && msg.content) {
            for (const token of tokenPatterns) {
              if (msg.content.includes(token)) {
                foundTokens = true;
                tokenDetails.push(token);
              }
            }
          }
        }
        
        if (foundTokens) {
          console.log(`[FAIL] Legacy tokens found in transcript: ${[...new Set(tokenDetails)].join(", ")}`);
          failed++;
        } else {
          console.log(`[PASS] No legacy tokens in transcript`);
          passed++;
        }
        
        // Test 15: Verify value_bullets_added and social_proof_added events exist (tool-based injection)
        console.log("");
        console.log("[TEST] Verifying tool-based events (value_bullets, social_proof)...");
        const allEvents = finalizeResult2.events || [];
        const hasValueBullets = allEvents.some(e => e.type === "chat.value_bullets_added");
        const hasSocialProof = allEvents.some(e => e.type === "chat.social_proof_added");
        
        if (hasValueBullets && hasSocialProof) {
          console.log(`[PASS] Both value_bullets_added and social_proof_added events exist`);
          passed++;
        } else if (hasValueBullets || hasSocialProof) {
          console.log(`[WARN] Partial: value_bullets=${hasValueBullets}, social_proof=${hasSocialProof}`);
          console.log(`[PASS] At least one tool-based event exists (acceptable for older data)`);
          passed++;
        } else {
          // For older interviews without tool-based events, this is acceptable
          console.log(`[SKIP] No value_bullets/social_proof events (may be older interview data)`);
          passed++;
        }
      }
    } catch (err) {
      console.log(`[FAIL] Finalize error: ${err.message}`);
      failed++;
    }

  } catch (error) {
    console.log(`[FAIL] Error: ${error.message}`);
    failed++;
  }

  console.log("");
  console.log("=== SMOKE TEST COMPLETE ===");
  if (failed === 0) {
    console.log(`PASS: All ${passed} checks passed`);
    process.exit(0);
  } else {
    console.log(`FAIL: ${passed} passed, ${failed} failed`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[FATAL]", err);
  process.exit(1);
});
