#!/usr/bin/env node

/**
 * Auth Smoke Test Script
 * Validates Google OAuth and magic link endpoints without browser interaction.
 * 
 * Usage: ORIGIN=http://localhost:5000 node scripts/smoke-auth.mjs
 */

const ORIGIN = process.env.ORIGIN || "http://localhost:5000";

let passed = 0;
let failed = 0;

function log(status, msg) {
  const icon = status === "PASS" ? "✓" : "✗";
  console.log(`[${status}] ${icon} ${msg}`);
}

async function testGoogleOAuth() {
  try {
    const res = await fetch(`${ORIGIN}/auth/google?basePath=/app`, { redirect: "manual" });
    
    if (res.status !== 302) {
      log("FAIL", `Google OAuth: Expected 302, got ${res.status}`);
      failed++;
      return;
    }
    
    const location = res.headers.get("location");
    if (!location || !location.includes("accounts.google.com")) {
      log("FAIL", `Google OAuth: Location header missing or doesn't point to Google`);
      failed++;
      return;
    }
    
    // Decode redirect_uri from Location
    const url = new URL(location);
    const redirectUri = url.searchParams.get("redirect_uri");
    
    if (!redirectUri) {
      log("FAIL", `Google OAuth: redirect_uri not found in Location`);
      failed++;
      return;
    }
    
    if (!redirectUri.includes("/auth/google/callback")) {
      log("FAIL", `Google OAuth: redirect_uri should contain /auth/google/callback, got: ${redirectUri}`);
      failed++;
      return;
    }
    
    // Ensure no /app in redirect_uri
    if (redirectUri.includes("/app/auth/google/callback")) {
      log("FAIL", `Google OAuth: redirect_uri should NOT contain /app prefix, got: ${redirectUri}`);
      failed++;
      return;
    }
    
    log("PASS", `Google OAuth: 302 → Google, redirect_uri=${redirectUri}`);
    passed++;
  } catch (err) {
    log("FAIL", `Google OAuth: ${err.message}`);
    failed++;
  }
}

async function testMagicLinkStart() {
  try {
    const res = await fetch(`${ORIGIN}/app/auth/magic/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "smoke-test@example.com", basePath: "/app" }),
    });
    
    if (res.status !== 200) {
      log("FAIL", `Magic Link Start: Expected 200, got ${res.status}`);
      failed++;
      return;
    }
    
    const data = await res.json();
    
    if (data.success !== true) {
      log("FAIL", `Magic Link Start: Expected { success: true }, got: ${JSON.stringify(data)}`);
      failed++;
      return;
    }
    
    log("PASS", `Magic Link Start: 200 OK, success=true`);
    passed++;
  } catch (err) {
    log("FAIL", `Magic Link Start: ${err.message}`);
    failed++;
  }
}

async function testDebugAuthConfig() {
  try {
    const res = await fetch(`${ORIGIN}/api/debug/auth-config`);
    
    if (res.status !== 200) {
      log("FAIL", `Debug Auth Config: Expected 200, got ${res.status}`);
      failed++;
      return;
    }
    
    const data = await res.json();
    
    if (!data.baseUrl || !data.appBasePath || !data.googleCallbackUrl) {
      log("FAIL", `Debug Auth Config: Missing required fields: ${JSON.stringify(data)}`);
      failed++;
      return;
    }
    
    log("PASS", `Debug Auth Config: baseUrl=${data.baseUrl}, appBasePath=${data.appBasePath}`);
    passed++;
  } catch (err) {
    log("FAIL", `Debug Auth Config: ${err.message}`);
    failed++;
  }
}

async function main() {
  console.log(`\n=== Auth Smoke Tests ===`);
  console.log(`ORIGIN: ${ORIGIN}\n`);
  
  await testDebugAuthConfig();
  await testGoogleOAuth();
  await testMagicLinkStart();
  
  console.log(`\n=== Results ===`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  
  process.exit(failed > 0 ? 1 : 0);
}

main();
