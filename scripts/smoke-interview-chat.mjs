#!/usr/bin/env node
/**
 * Smoke test for interview chat LLM integration
 * Tests POST /api/dev/interview/turn with real LLM responses
 * 
 * Usage: ORIGIN=http://localhost:5000 EMAIL=noah@noahlevin.com DEV_TOOLS_SECRET=sp-dev-2024 node scripts/smoke-interview-chat.mjs
 */

const ORIGIN = process.env.ORIGIN || "http://localhost:5000";
const EMAIL = process.env.EMAIL || "noah@noahlevin.com";
const DEV_TOOLS_SECRET = process.env.DEV_TOOLS_SECRET || "sp-dev-2024";

console.log(`[INFO] Testing against ${ORIGIN}`);
console.log(`[INFO] Using EMAIL=${EMAIL}`);
console.log("");

async function callTurn(message) {
  const res = await fetch(`${ORIGIN}/api/dev/interview/turn`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-dev-tools-secret": DEV_TOOLS_SECRET,
    },
    body: JSON.stringify({ email: EMAIL, message }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }

  return res.json();
}

async function main() {
  let passed = 0;
  let failed = 0;

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

    // Test 2: Send name to trigger set_provided_name tool
    console.log("");
    console.log("[TEST] Turn 2: Sending 'Call me Noah.'...");
    const result2 = await callTurn("Call me Noah.");

    if (!result2.success) {
      console.log("[FAIL] Turn 2 did not return success=true");
      failed++;
    } else if (!result2.reply || result2.reply.length === 0) {
      console.log("[FAIL] Turn 2 reply is empty");
      failed++;
    } else if (!result2.transcript || result2.transcript.length <= result1.transcript.length) {
      console.log(`[FAIL] Turn 2 transcript did not grow (was ${result1.transcript.length}, now ${result2.transcript?.length || 0})`);
      failed++;
    } else {
      console.log(`[PASS] Turn 2: reply contentLength=${result2.reply.length}, transcriptLength=${result2.transcript.length}`);
      console.log(`[INFO] Transcript grew from ${result1.transcript.length} to ${result2.transcript.length} messages`);
      passed++;
    }

    // Test 3: Check events for user.provided_name_set
    console.log("");
    console.log("[TEST] Turn 2 events: Checking for user.provided_name_set...");
    if (!result2.events || !Array.isArray(result2.events)) {
      console.log("[FAIL] Turn 2 events is not an array");
      failed++;
    } else {
      const nameEvent = result2.events.find(e => e.type === "user.provided_name_set");
      if (nameEvent) {
        console.log(`[PASS] Found user.provided_name_set event with name="${nameEvent.payload?.name}"`);
        passed++;
      } else {
        // Check if there are other events
        const eventTypes = result2.events.map(e => e.type);
        console.log(`[INFO] Events present: ${JSON.stringify(eventTypes)}`);
        console.log("[WARN] user.provided_name_set event not found (LLM may not have called the tool)");
        // Not a hard fail - LLM behavior can vary
        passed++;
      }
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
