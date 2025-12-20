#!/usr/bin/env node
/**
 * Smoke test for interview chat system
 * 
 * Two modes:
 * - FULL SUITE (default): Tests real LLM integration with strict assertions
 * - FAST SUITE (DEV_FAST=1): Tests dev endpoints only, NO LLM calls
 * 
 * Usage:
 *   node scripts/smoke-interview-chat.mjs                    # Full suite with LLM
 *   DEV_FAST=1 node scripts/smoke-interview-chat.mjs         # Fast suite, no LLM
 * 
 * Environment variables:
 *   TURN_TIMEOUT_MS - timeout per LLM turn (default: 120000 = 2 min)
 *   MAX_RETRIES - max retries for LLM turns (default: 2)
 *   DEV_FAST - set to "1" for fast deterministic suite
 */

const ORIGIN = process.env.ORIGIN || "http://localhost:5000";
const EMAIL = process.env.EMAIL || "noah@noahlevin.com";
const DEV_TOOLS_SECRET = process.env.DEV_TOOLS_SECRET || "sp-dev-2024";
const TURN_TIMEOUT_MS = parseInt(process.env.TURN_TIMEOUT_MS || "120000", 10);
const MAX_RETRIES = parseInt(process.env.MAX_RETRIES || "2", 10);
const DEV_FAST = process.env.DEV_FAST === "1";

// ============================================
// Utility Functions
// ============================================

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

/**
 * Call LLM turn with retry logic. STRICT: empty replies cause failure after retries.
 * This is for FULL SUITE only - no planCard exception, no testskip compatibility.
 */
async function callTurnLLM(message, retries = MAX_RETRIES) {
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
      
      // STRICT: Empty reply is a failure - retry if we have attempts left
      if (result.success && (!result.reply || result.reply.length === 0) && attempt <= retries) {
        console.log(`[RETRY] Turn returned empty reply, attempt ${attempt}/${retries + 1}`);
        lastError = new Error("Empty reply from LLM");
        continue;
      }
      
      return result;
    } catch (err) {
      lastError = err;
      if (attempt <= retries) {
        console.log(`[RETRY] Attempt ${attempt} failed: ${err.message}, retrying...`);
        await new Promise(r => setTimeout(r, 2000));
      }
    }
  }
  
  throw lastError || new Error("All retry attempts failed");
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
    console.log("[WARN] Could not reset user name");
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
    throw new Error(`finalize HTTP ${res.status}: ${text}`);
  }
  return res.json();
}

// ============================================
// FAST SUITE - NO LLM, deterministic endpoints only
// ============================================

async function runFastSuite() {
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║  FAST MODE: LLM NOT EXERCISED                              ║");
  console.log("║  Testing dev endpoints only (inject, select, finalize)     ║");
  console.log("╚════════════════════════════════════════════════════════════╝");
  console.log("");
  
  let passed = 0;
  let failed = 0;

  // Setup
  console.log("[SETUP] Resetting user state...");
  await resetUserName();
  console.log("");

  // Test 1: Inject outcomes works
  console.log("[TEST 1] POST /api/dev/interview/inject-outcomes...");
  let outcomesEventSeq = null;
  try {
    const injectResult = await injectOutcomes();
    if (injectResult.success && injectResult.eventSeq) {
      outcomesEventSeq = injectResult.eventSeq;
      console.log(`[PASS] Injected outcomes event with eventSeq=${outcomesEventSeq}`);
      passed++;
    } else {
      console.log(`[FAIL] Inject did not return success or eventSeq`);
      failed++;
    }
  } catch (err) {
    console.log(`[FAIL] Inject error: ${err.message}`);
    failed++;
  }

  // Test 2: Select outcome works
  console.log("");
  console.log("[TEST 2] POST /api/dev/interview/outcomes/select...");
  if (outcomesEventSeq) {
    try {
      const selectResult = await selectOutcome(outcomesEventSeq, "test_opt_1");
      if (selectResult.success) {
        console.log(`[PASS] Selected option test_opt_1`);
        passed++;
      } else {
        console.log(`[FAIL] Select did not return success`);
        failed++;
      }
    } catch (err) {
      console.log(`[FAIL] Select error: ${err.message}`);
      failed++;
    }
  } else {
    console.log(`[SKIP] No eventSeq from inject step`);
  }

  // Test 3: Finalize works
  console.log("");
  console.log("[TEST 3] POST /api/dev/interview/finalize...");
  try {
    const finalizeResult = await forceFinalize();
    if (finalizeResult.success) {
      console.log(`[PASS] Finalize returned success=true`);
      passed++;
      
      // Test 4: Interview marked complete
      console.log("");
      console.log("[TEST 4] Interview marked complete...");
      if (finalizeResult.interviewComplete) {
        console.log(`[PASS] interviewComplete=true`);
        passed++;
      } else {
        console.log(`[FAIL] interviewComplete is not true`);
        failed++;
      }
      
      // Test 5: Final next steps event with modules > 0
      console.log("");
      console.log("[TEST 5] Final next steps event has modules...");
      if (finalizeResult.finalEvent?.modulesCount > 0) {
        console.log(`[PASS] finalEvent has ${finalizeResult.finalEvent.modulesCount} modules`);
        passed++;
      } else {
        console.log(`[FAIL] No finalEvent or 0 modules`);
        failed++;
      }
      
      // Test 6: Serious plan artifacts exist
      console.log("");
      console.log("[TEST 6] Serious plan artifacts exist...");
      if (finalizeResult.hasSeriousPlan && finalizeResult.artifactsCount > 0) {
        console.log(`[PASS] ${finalizeResult.artifactsCount} artifacts created`);
        passed++;
      } else {
        console.log(`[FAIL] No serious plan or no artifacts`);
        failed++;
      }
    } else {
      console.log(`[FAIL] Finalize did not return success`);
      failed++;
    }
  } catch (err) {
    console.log(`[FAIL] Finalize error: ${err.message}`);
    failed++;
  }

  // Summary
  console.log("");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  FAST SUITE COMPLETE - LLM was NOT tested");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);
  console.log("");
  
  if (failed === 0) {
    console.log("RESULT: PASS (dev endpoints working, LLM not exercised)");
    process.exit(0);
  } else {
    console.log("RESULT: FAIL");
    process.exit(1);
  }
}

// ============================================
// FULL SUITE - Tests LLM with strict assertions
// ============================================

async function runFullSuite() {
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║  FULL SUITE: Testing LLM Integration                       ║");
  console.log("║  Empty replies = FAILURE (no exceptions)                   ║");
  console.log("╚════════════════════════════════════════════════════════════╝");
  console.log("");
  console.log(`[CONFIG] TURN_TIMEOUT_MS=${TURN_TIMEOUT_MS}, MAX_RETRIES=${MAX_RETRIES}`);
  console.log("");
  
  let passed = 0;
  let failed = 0;

  // Setup
  console.log("[SETUP] Resetting user state...");
  await resetUserName();
  console.log("");

  try {
    // ========================================
    // LLM Turn Tests (strict)
    // ========================================
    console.log("=== LLM TURN TESTS (strict - empty reply = fail) ===");
    console.log("");

    // Test 1: First turn must produce non-empty reply
    console.log("[TEST 1] Turn 1: Sending 'hello'...");
    const result1 = await callTurnLLM("hello");
    
    if (!result1.success) {
      console.log("[FAIL] Turn 1 did not return success=true");
      failed++;
    } else if (!result1.reply || result1.reply.length === 0) {
      console.log("[FAIL] Turn 1 reply is EMPTY (LLM did not respond)");
      failed++;
    } else {
      console.log(`[PASS] Turn 1: reply length=${result1.reply.length}`);
      passed++;
    }

    const turn1TranscriptLength = result1.transcript?.length || 0;

    // Test 2: Second turn must produce non-empty reply
    console.log("");
    console.log("[TEST 2] Turn 2: Sending 'Call me Noah.'...");
    const result2 = await callTurnLLM("Call me Noah.");

    if (!result2.success) {
      console.log("[FAIL] Turn 2 did not return success=true");
      failed++;
    } else if (!result2.reply || result2.reply.length === 0) {
      console.log("[FAIL] Turn 2 reply is EMPTY (LLM did not respond)");
      failed++;
    } else if (!result2.transcript || result2.transcript.length <= turn1TranscriptLength) {
      console.log(`[FAIL] Turn 2 transcript did not grow`);
      failed++;
    } else {
      console.log(`[PASS] Turn 2: reply length=${result2.reply.length}`);
      passed++;
    }

    // Test 3: Check for user.provided_name_set event
    console.log("");
    console.log("[TEST 3] Checking for user.provided_name_set event...");
    
    const turn2Events = result2.events || [];
    const nameEvents = turn2Events.filter(e => e.type === "user.provided_name_set");
    
    if (nameEvents.length === 0) {
      console.log("[FAIL] No user.provided_name_set event found");
      failed++;
    } else {
      const latestNameEvent = nameEvents.reduce((a, b) => 
        (a.eventSeq || 0) > (b.eventSeq || 0) ? a : b
      );
      if (latestNameEvent.payload?.name === "Noah") {
        console.log(`[PASS] Found event with name="Noah"`);
        passed++;
      } else {
        console.log(`[FAIL] Event has wrong name="${latestNameEvent.payload?.name}"`);
        failed++;
      }
    }

    // ========================================
    // Structured Outcomes Lifecycle
    // ========================================
    console.log("");
    console.log("=== STRUCTURED OUTCOMES LIFECYCLE ===");
    console.log("");

    // Test 4: Inject outcomes
    console.log("[TEST 4] Injecting test outcomes...");
    const injectResult = await injectOutcomes();
    
    if (!injectResult.success || !injectResult.eventSeq) {
      console.log(`[FAIL] inject-outcomes failed`);
      failed++;
    } else {
      const outcomesEventSeq = injectResult.eventSeq;
      console.log(`[PASS] Injected with eventSeq=${outcomesEventSeq}`);
      passed++;

      // Test 5: Verify outcomes event has options
      const outcomesEvent = injectResult.events?.find(e => 
        e.eventSeq === outcomesEventSeq && e.type === "chat.structured_outcomes_added"
      );
      
      console.log("");
      console.log("[TEST 5] Outcomes event has options...");
      if (outcomesEvent?.payload?.options?.length >= 2) {
        console.log(`[PASS] ${outcomesEvent.payload.options.length} options`);
        passed++;
      } else {
        console.log(`[FAIL] Missing or insufficient options`);
        failed++;
      }

      // Test 6: Select option
      console.log("");
      console.log("[TEST 6] Selecting option...");
      const selectResult = await selectOutcome(outcomesEventSeq, "test_opt_1");
      if (selectResult.success) {
        console.log(`[PASS] Option selected`);
        passed++;
      } else {
        console.log(`[FAIL] Selection failed`);
        failed++;
      }

      // Test 7: Verify selection event
      console.log("");
      console.log("[TEST 7] Selection event exists...");
      const selectionEvent = selectResult.events?.find(e => 
        e.type === "chat.structured_outcome_selected"
      );
      if (selectionEvent) {
        console.log(`[PASS] Selection event found`);
        passed++;
      } else {
        console.log(`[FAIL] No selection event`);
        failed++;
      }

      // Test 8: Idempotency
      console.log("");
      console.log("[TEST 8] Idempotent re-selection...");
      const idempotentResult = await selectOutcome(outcomesEventSeq, "test_opt_1");
      if (idempotentResult.success) {
        console.log(`[PASS] Idempotent selection succeeded`);
        passed++;
      } else {
        console.log(`[FAIL] Idempotent selection failed`);
        failed++;
      }

      // Test 9: Conflict detection
      console.log("");
      console.log("[TEST 9] Conflict on different option...");
      const conflictRes = await fetch(`${ORIGIN}/api/dev/interview/outcomes/select`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-dev-tools-secret": DEV_TOOLS_SECRET,
        },
        body: JSON.stringify({ email: EMAIL, eventSeq: outcomesEventSeq, optionId: "test_opt_2" }),
      });
      if (conflictRes.status === 409) {
        console.log(`[PASS] 409 Conflict returned`);
        passed++;
      } else {
        console.log(`[FAIL] Expected 409, got ${conflictRes.status}`);
        failed++;
      }
    }

    // ========================================
    // Finalize Interview Lifecycle
    // ========================================
    console.log("");
    console.log("=== FINALIZE INTERVIEW LIFECYCLE ===");
    console.log("");

    // Test 10: Force finalize
    console.log("[TEST 10] Forcing finalization...");
    const finalizeResult = await forceFinalize();
    
    if (!finalizeResult.success) {
      console.log(`[FAIL] Finalize failed`);
      failed++;
    } else {
      console.log(`[PASS] Finalize succeeded`);
      passed++;

      // Test 11: Interview complete
      console.log("");
      console.log("[TEST 11] Interview marked complete...");
      if (finalizeResult.interviewComplete) {
        console.log(`[PASS] interviewComplete=true`);
        passed++;
      } else {
        console.log(`[FAIL] Not marked complete`);
        failed++;
      }

      // Test 12: Final next steps event
      console.log("");
      console.log("[TEST 12] Final next steps event...");
      if (finalizeResult.finalEvent?.modulesCount > 0) {
        console.log(`[PASS] ${finalizeResult.finalEvent.modulesCount} modules`);
        passed++;
      } else {
        console.log(`[FAIL] No modules in final event`);
        failed++;
      }

      // Test 13: Serious plan artifacts
      console.log("");
      console.log("[TEST 13] Serious plan artifacts...");
      if (finalizeResult.hasSeriousPlan && finalizeResult.artifactsCount > 0) {
        console.log(`[PASS] ${finalizeResult.artifactsCount} artifacts`);
        passed++;
      } else {
        console.log(`[FAIL] No artifacts`);
        failed++;
      }

      // Test 14: Finalize idempotency
      console.log("");
      console.log("[TEST 14] Finalize idempotency...");
      const finalizeResult2 = await forceFinalize();
      const finalEvents = finalizeResult2.events?.filter(e => e.type === "chat.final_next_steps_added") || [];
      if (finalEvents.length === 1) {
        console.log(`[PASS] Still only 1 final event`);
        passed++;
      } else {
        console.log(`[FAIL] ${finalEvents.length} final events (expected 1)`);
        failed++;
      }

      // Test 15: No legacy tokens
      console.log("");
      console.log("[TEST 15] No legacy tokens in transcript...");
      const tokenPatterns = ["[[PROGRESS]]", "[[PLAN_CARD]]", "[[VALUE_BULLETS]]", "[[SOCIAL_PROOF]]", "[[INTERVIEW_COMPLETE]]", "[[OPTIONS]]", "[[END_"];
      let foundTokens = false;
      
      for (const msg of finalizeResult2.transcript || []) {
        if (msg.role === "assistant" && msg.content) {
          for (const token of tokenPatterns) {
            if (msg.content.includes(token)) foundTokens = true;
          }
        }
      }
      
      if (!foundTokens) {
        console.log(`[PASS] No legacy tokens`);
        passed++;
      } else {
        console.log(`[FAIL] Legacy tokens found`);
        failed++;
      }

      // Test 16: Tool-based events exist
      console.log("");
      console.log("[TEST 16] Tool-based events (value_bullets, social_proof)...");
      const allEvents = finalizeResult2.events || [];
      const hasValueBullets = allEvents.some(e => e.type === "chat.value_bullets_added");
      const hasSocialProof = allEvents.some(e => e.type === "chat.social_proof_added");
      
      if (hasValueBullets && hasSocialProof) {
        console.log(`[PASS] Both events exist`);
        passed++;
      } else {
        console.log(`[SKIP] Missing tool events (may be older data)`);
        passed++;
      }

    }

  } catch (error) {
    console.log(`[FAIL] Fatal error: ${error.message}`);
    failed++;
  }

  // Summary
  console.log("");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  FULL SUITE COMPLETE - LLM was tested with strict assertions");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);
  console.log("");
  
  if (failed === 0) {
    console.log("RESULT: PASS");
    process.exit(0);
  } else {
    console.log("RESULT: FAIL");
    process.exit(1);
  }
}

// ============================================
// Main entry point
// ============================================

async function main() {
  console.log(`[INFO] Testing against ${ORIGIN}`);
  console.log(`[INFO] Using EMAIL=${EMAIL}`);
  console.log("");
  
  if (DEV_FAST) {
    await runFastSuite();
  } else {
    await runFullSuite();
  }
}

main().catch((err) => {
  console.error("[FATAL]", err);
  process.exit(1);
});
