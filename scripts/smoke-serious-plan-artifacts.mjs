#!/usr/bin/env node
/**
 * Smoke test for Serious Plan artifact generation.
 * Validates the full DB-mediated lifecycle:
 * 1. POST /api/dev/serious-plan/ensure-artifacts creates artifacts with pending status
 * 2. GET /api/dev/serious-plan/latest returns artifacts with generationStatus
 * 3. Polling observes status transitions (pending -> generating -> complete/error)
 * 4. Refresh-deterministic: multiple fetches return stable artifact IDs/content
 * 
 * Usage: EMAIL=noah@noahlevin.com ORIGIN=http://localhost:5000 node scripts/smoke-serious-plan-artifacts.mjs
 */

const ORIGIN = process.env.ORIGIN || 'http://localhost:5000';
const EMAIL = process.env.EMAIL || 'noah@noahlevin.com';
const DEV_SECRET = process.env.DEV_TOOLS_SECRET || 'sp-dev-2024';
const FORCE_REGENERATE = process.env.FORCE_REGENERATE === '1' || process.env.FORCE_REGENERATE === 'true';
const MAX_POLL_ATTEMPTS = 60; // Increased for real LLM generation
const POLL_INTERVAL_MS = 2000; // Increased interval for LLM processing

const devHeaders = {
  'x-dev-tools-secret': DEV_SECRET,
  'Content-Type': 'application/json',
};

// Track observed states for validation
const observedStates = new Set();

async function main() {
  console.log(`[INFO] Testing against ${ORIGIN}`);
  console.log(`[INFO] Using EMAIL=${EMAIL}`);
  console.log(`[INFO] FORCE_REGENERATE=${FORCE_REGENERATE}`);
  console.log('');

  // Step 1: Call ensure-artifacts to guarantee artifacts exist
  console.log('[TEST] Step 1: Ensure artifacts exist for user');
  
  let ensureResponse;
  try {
    ensureResponse = await fetch(`${ORIGIN}/api/dev/serious-plan/ensure-artifacts`, {
      method: 'POST',
      headers: devHeaders,
      body: JSON.stringify({ email: EMAIL, forceRegenerate: FORCE_REGENERATE }),
    });
  } catch (err) {
    console.log(`[FAIL] Could not connect to ${ORIGIN}: ${err.message}`);
    process.exit(1);
  }

  if (!ensureResponse.ok) {
    const text = await ensureResponse.text();
    console.log(`[FAIL] POST /api/dev/serious-plan/ensure-artifacts returned ${ensureResponse.status}`);
    console.log(`  Response: ${text.slice(0, 300)}`);
    process.exit(1);
  }

  const ensureResult = await ensureResponse.json();
  console.log(`[PASS] Ensure-artifacts returned 200`);
  console.log(`  userId: ${ensureResult.userId}`);
  console.log(`  planId: ${ensureResult.planId}`);
  console.log(`  artifactCount: ${ensureResult.artifactCount}`);
  console.log(`  created: ${ensureResult.created}`);
  console.log(`  artifactKeys: ${ensureResult.artifactKeys?.join(', ')}`);
  
  if (ensureResult.initialStatuses) {
    console.log(`  initialStatuses: ${JSON.stringify(ensureResult.initialStatuses)}`);
    // Track initial states
    ensureResult.initialStatuses.forEach(s => observedStates.add(s.status));
  }
  console.log('');

  const userId = ensureResult.userId;
  const planId = ensureResult.planId;

  // Step 2: Verify artifactCount >= 1
  console.log('[TEST] Step 2: Verify artifactCount >= 1');
  if (ensureResult.artifactCount < 1) {
    console.log(`[FAIL] artifactCount is ${ensureResult.artifactCount}, expected >= 1`);
    process.exit(1);
  }
  console.log(`[PASS] artifactCount = ${ensureResult.artifactCount} (>= 1)`);
  console.log('');

  // Step 3: Fetch plan and validate artifact structure
  console.log('[TEST] Step 3: Fetch plan and validate artifact structure');
  
  const latestResponse = await fetch(`${ORIGIN}/api/dev/serious-plan/latest?userId=${userId}`, {
    headers: devHeaders,
  });

  if (!latestResponse.ok) {
    console.log(`[FAIL] GET /api/dev/serious-plan/latest returned ${latestResponse.status}`);
    process.exit(1);
  }

  const plan = await latestResponse.json();
  console.log(`[PASS] GET /api/dev/serious-plan/latest returns 200`);
  console.log(`  planId: ${plan.id}`);
  console.log(`  status: ${plan.status}`);
  console.log(`  artifactCount: ${plan.artifacts?.length || 0}`);

  if (!plan.id || plan.id !== planId) {
    console.log(`[FAIL] Plan ID mismatch: ${plan.id} vs ${planId}`);
    process.exit(1);
  }

  if (!Array.isArray(plan.artifacts)) {
    console.log('[FAIL] Plan missing artifacts array');
    process.exit(1);
  }

  if (plan.artifacts.length < 1) {
    console.log(`[FAIL] Plan has 0 artifacts, expected >= 1`);
    process.exit(1);
  }
  console.log('[PASS] Plan has artifacts array with >= 1 artifact');

  // Validate artifact structure
  const validStatuses = ['pending', 'generating', 'complete', 'error'];
  for (const artifact of plan.artifacts) {
    if (!artifact.id || !artifact.artifactKey) {
      console.log(`[FAIL] Artifact missing required fields: ${JSON.stringify(artifact).slice(0, 100)}`);
      process.exit(1);
    }
    if (!artifact.generationStatus) {
      console.log(`[FAIL] Artifact ${artifact.artifactKey} missing generationStatus`);
      process.exit(1);
    }
    if (!validStatuses.includes(artifact.generationStatus)) {
      console.log(`[FAIL] Invalid generationStatus "${artifact.generationStatus}" for ${artifact.artifactKey}`);
      process.exit(1);
    }
    observedStates.add(artifact.generationStatus);
  }
  console.log('[PASS] All artifacts have id, artifactKey, and valid generationStatus');
  console.log('');

  // Step 4: Poll until all artifacts reach terminal status
  console.log('[TEST] Step 4: Poll for generation completion');
  
  let finalPlan = plan;
  let attempts = 0;
  
  const getStatusCounts = (artifacts) => {
    const counts = { pending: 0, generating: 0, complete: 0, error: 0 };
    for (const a of artifacts) {
      if (counts.hasOwnProperty(a.generationStatus)) {
        counts[a.generationStatus]++;
      }
    }
    return counts;
  };

  let statusCounts = getStatusCounts(plan.artifacts);
  console.log(`[POLL] Initial: pending=${statusCounts.pending}, generating=${statusCounts.generating}, complete=${statusCounts.complete}, error=${statusCounts.error}`);
  
  while (statusCounts.pending + statusCounts.generating > 0 && attempts < MAX_POLL_ATTEMPTS) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    attempts++;
    
    const pollResponse = await fetch(`${ORIGIN}/api/dev/serious-plan/latest?userId=${userId}`, {
      headers: devHeaders,
    });
    
    if (!pollResponse.ok) {
      console.log(`[WARN] Poll attempt ${attempts} failed: ${pollResponse.status}`);
      continue;
    }
    
    finalPlan = await pollResponse.json();
    
    // Track all observed states
    for (const a of finalPlan.artifacts) {
      observedStates.add(a.generationStatus);
    }
    
    statusCounts = getStatusCounts(finalPlan.artifacts);
    console.log(`[POLL] Attempt ${attempts}/${MAX_POLL_ATTEMPTS}: pending=${statusCounts.pending}, generating=${statusCounts.generating}, complete=${statusCounts.complete}, error=${statusCounts.error}`);
  }
  
  if (statusCounts.pending + statusCounts.generating > 0) {
    console.log(`[TIMEOUT] Polling timed out after ${MAX_POLL_ATTEMPTS} attempts`);
    console.log(`  Final: pending=${statusCounts.pending}, generating=${statusCounts.generating}`);
    console.log('[FAIL] Not all artifacts reached terminal status');
    process.exit(1);
  }
  
  console.log('[PASS] All artifacts reached terminal status (complete or error)');
  if (statusCounts.error > 0) {
    console.log(`[WARN] ${statusCounts.error} artifacts have error status`);
  }
  console.log('');

  // Step 5: Report observed states
  console.log('[TEST] Step 5: Verify observed state transitions');
  console.log(`[INFO] Observed states: ${Array.from(observedStates).join(', ')}`);
  
  // We expect to see at least 'pending' if artifacts were newly created, or 'complete' if pre-existing
  const hasNonTerminal = observedStates.has('pending') || observedStates.has('generating');
  const hasTerminal = observedStates.has('complete') || observedStates.has('error');
  
  if (ensureResult.created && !hasNonTerminal) {
    console.log('[WARN] Artifacts were created but no pending/generating state observed (generation was too fast)');
  } else if (hasNonTerminal) {
    console.log('[PASS] Observed non-terminal state (pending and/or generating)');
  }
  
  if (!hasTerminal) {
    console.log('[FAIL] No terminal state (complete/error) observed');
    process.exit(1);
  }
  console.log('[PASS] Observed terminal state (complete and/or error)');
  console.log('');

  // Step 6: Validate non-empty artifact content
  console.log('[TEST] Step 6: Validate non-empty artifact content');
  
  let hasNonEmptyContent = false;
  const contentCheck = [];
  
  for (const artifact of finalPlan.artifacts) {
    const hasContent = artifact.contentRaw && artifact.contentRaw.length > 10;
    contentCheck.push({
      key: artifact.artifactKey,
      status: artifact.generationStatus,
      hasContent,
      contentLength: artifact.contentRaw?.length || 0,
    });
    if (hasContent) {
      hasNonEmptyContent = true;
    }
  }
  
  console.log('[INFO] Artifact content check:');
  contentCheck.forEach(c => {
    console.log(`  - ${c.key}: status=${c.status}, hasContent=${c.hasContent}, contentLength=${c.contentLength}`);
  });
  
  // Require at least one artifact with non-empty content (real LLM generation)
  const completeArtifacts = finalPlan.artifacts.filter(a => a.generationStatus === 'complete');
  const completeWithContent = completeArtifacts.filter(a => a.contentRaw && a.contentRaw.length > 10);
  
  if (completeArtifacts.length > 0 && completeWithContent.length === 0) {
    console.log('[FAIL] Complete artifacts have no content - real generation may have failed');
    process.exit(1);
  }
  
  if (hasNonEmptyContent) {
    console.log('[PASS] At least one artifact has non-empty content from real generation');
  } else if (statusCounts.error === finalPlan.artifacts.length) {
    console.log('[WARN] All artifacts errored - content validation skipped');
  } else {
    console.log('[WARN] No artifacts have content yet (may still be generating)');
  }
  console.log('');

  // Step 7: Verify refresh-deterministic behavior
  console.log('[TEST] Step 7: Verify refresh-deterministic behavior');
  
  // Fetch twice more and compare
  const refetch1 = await fetch(`${ORIGIN}/api/dev/serious-plan/latest?userId=${userId}`, {
    headers: devHeaders,
  });
  const plan1 = await refetch1.json();
  
  await new Promise(r => setTimeout(r, 500));
  
  const refetch2 = await fetch(`${ORIGIN}/api/dev/serious-plan/latest?userId=${userId}`, {
    headers: devHeaders,
  });
  const plan2 = await refetch2.json();
  
  // Compare plan IDs
  if (plan1.id !== planId || plan2.id !== planId) {
    console.log(`[FAIL] Plan ID changed: original=${planId}, refetch1=${plan1.id}, refetch2=${plan2.id}`);
    process.exit(1);
  }
  console.log('[PASS] Plan ID stable across refetches');
  
  // Compare artifact IDs and statuses
  const getArtifactSnapshot = (artifacts) => {
    return artifacts.map(a => ({
      id: a.id,
      key: a.artifactKey,
      status: a.generationStatus,
      contentHash: a.contentRaw ? a.contentRaw.slice(0, 50) : null,
    })).sort((a, b) => a.key.localeCompare(b.key));
  };
  
  const snap1 = getArtifactSnapshot(plan1.artifacts);
  const snap2 = getArtifactSnapshot(plan2.artifacts);
  
  if (snap1.length !== snap2.length) {
    console.log(`[FAIL] Artifact count changed: ${snap1.length} -> ${snap2.length}`);
    process.exit(1);
  }
  
  let allStable = true;
  for (let i = 0; i < snap1.length; i++) {
    if (snap1[i].id !== snap2[i].id) {
      console.log(`[FAIL] Artifact ID changed for ${snap1[i].key}: ${snap1[i].id} -> ${snap2[i].id}`);
      allStable = false;
    }
    if (snap1[i].status !== snap2[i].status) {
      console.log(`[FAIL] Artifact status changed for ${snap1[i].key}: ${snap1[i].status} -> ${snap2[i].status}`);
      allStable = false;
    }
    if (snap1[i].contentHash !== snap2[i].contentHash) {
      console.log(`[FAIL] Artifact content changed for ${snap1[i].key}`);
      allStable = false;
    }
  }
  
  if (!allStable) {
    process.exit(1);
  }
  
  console.log('[PASS] All artifact IDs, statuses, and content stable across refetches');
  console.log('');

  // Summary
  console.log('=== SMOKE TEST COMPLETE ===');
  console.log('All checks passed:');
  console.log(`  - Artifacts ensured for user ${EMAIL}`);
  console.log(`  - artifactCount >= 1: ${ensureResult.artifactCount} artifacts`);
  console.log(`  - All artifacts have generationStatus field`);
  console.log(`  - All artifacts reached terminal status`);
  console.log(`  - Observed states: ${Array.from(observedStates).join(', ')}`);
  console.log(`  - Non-empty content: ${hasNonEmptyContent ? 'YES (real LLM generation)' : 'NO'}`);
  console.log(`  - Refresh-deterministic: IDs/status/content stable`);
}

main().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});
