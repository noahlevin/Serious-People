# Streaming LLM Responses - Testing Guide

This guide provides comprehensive testing procedures for the newly implemented streaming LLM response feature.

## Overview

The interview chat now uses Server-Sent Events (SSE) to stream LLM responses in real-time, providing immediate visual feedback and better user engagement.

## What Changed

### Backend
- **New endpoint**: `POST /api/interview/turn/stream` (SSE-based streaming)
- **Original endpoint**: `POST /api/interview/turn` (remains as fallback)
- **Streaming function**: `callInterviewLLMStream()` handles Anthropic streaming API
- **SSE events**: `text_delta`, `tool_executed`, `done`, `error`

### Frontend
- **New hook**: `useStreamingChat.tsx` manages SSE connections
- **Updated component**: `InterviewChat.tsx` uses streaming by default
- **Typing indicator**: Hides when streaming starts (smooth transition)
- **Animation**: Existing 35ms typing animation works seamlessly with streaming

## Testing Checklist

### ✅ 1. Basic Streaming Functionality

**Test**: Simple message exchange
```
1. Start the interview
2. Send a simple message like "Hello" or "My name is John"
3. Observe the response
```

**Expected Behavior**:
- ✓ Typing indicator shows briefly while waiting for first chunk
- ✓ Typing indicator disappears when streaming starts
- ✓ Response text appears word-by-word in real-time
- ✓ Typing animation is smooth (35ms between words)
- ✓ Message is fully displayed when streaming completes
- ✓ Message is stored in database after completion
- ✓ Scroll follows the streaming text

**How to Verify**:
- Check browser Network tab → Look for `/api/interview/turn/stream` request
- Should see `Content-Type: text/event-stream`
- Should see multiple `data:` events in response

---

### ✅ 2. Tool Call Rendering

**Test**: Messages that trigger tool calls

#### Test 2a: Title Card (First Message)
```
1. Start a fresh interview (clear session)
2. First assistant message should trigger title card
```

**Expected Behavior**:
- ✓ Title card appears before any messages
- ✓ Title card renders with "Interview" title
- ✓ Subtitle and metadata (time, confidential) display correctly
- ✓ Message streams after title card appears

#### Test 2b: Section Headers
```
1. Continue interview until LLM creates a section header
2. Usually happens when transitioning topics
```

**Expected Behavior**:
- ✓ Section header appears after the assistant message completes
- ✓ No duplicate headers
- ✓ Proper spacing and styling

#### Test 2c: Structured Outcomes
```
1. Continue interview until LLM offers choices
2. Look for clickable pill options
```

**Expected Behavior**:
- ✓ Options appear immediately when tool executes during streaming
- ✓ Pills are clickable and not disabled
- ✓ Clicking an option hides the pills
- ✓ Selected option value becomes user message
- ✓ Next response streams correctly

#### Test 2d: Name Collection
```
1. When LLM asks for your name, provide it
2. Example: "My name is Sarah"
```

**Expected Behavior**:
- ✓ Name is saved to user profile
- ✓ No visible UI change (it's internal)
- ✓ Event logged in database
- ✓ Streaming continues normally

#### Test 2e: Value Bullets & Social Proof
```
1. Complete interview until plan is generated
2. Look for value proposition bullets and statistics
```

**Expected Behavior**:
- ✓ Value bullets appear after plan card
- ✓ Social proof displays below bullets
- ✓ Both render during the streaming response

#### Test 2f: Interview Finalization
```
1. Complete full interview
2. LLM should call finalize_interview tool
```

**Expected Behavior**:
- ✓ "Final Next Steps" card appears
- ✓ Card shows coaching plan modules
- ✓ Link to `/app/offer` works
- ✓ Interview marked as complete in database

---

### ✅ 3. Multi-Turn Tool Interactions (Agentic Loop)

**Test**: LLM makes multiple tool calls in sequence
```
1. Start interview (triggers title_card)
2. First message might trigger both title_card AND text response
3. Later messages might trigger section_header then text
```

**Expected Behavior**:
- ✓ All tools execute in sequence
- ✓ Each tool completion triggers event refetch
- ✓ UI updates appear in real-time
- ✓ Final text response streams correctly
- ✓ No missing tools or events

---

### ✅ 4. Animation Behavior

**Test**: Typing animation with streaming content
```
1. Send any message
2. Watch the response appear
```

**Expected Behavior**:
- ✓ Animation starts immediately when first chunk arrives
- ✓ Animation speed is consistent (35ms per word)
- ✓ Animation smoothly handles incoming chunks
- ✓ HTML tags (bold, italic, links) are handled as units
- ✓ Markdown renders correctly during animation
- ✓ Code blocks render properly
- ✓ Lists and bullet points animate smoothly

---

### ✅ 5. Error Handling

#### Test 5a: Network Interruption
```
1. Start sending a message
2. Disconnect network mid-stream (e.g., disable WiFi)
3. Reconnect after 5 seconds
```

**Expected Behavior**:
- ✓ Error event received
- ✓ Error message shown to user: "I'm sorry, something went wrong..."
- ✓ Streaming message removed from UI
- ✓ User can retry sending message
- ✓ No crashes or frozen UI

#### Test 5b: Server Error
```
1. Modify server code to throw error in streaming function
2. Send a message
```

**Expected Behavior**:
- ✓ SSE error event sent
- ✓ Frontend receives error
- ✓ Error message displayed
- ✓ Clean error state (no hanging connections)

#### Test 5c: Invalid Auth
```
1. Clear cookies/session
2. Try to send message
```

**Expected Behavior**:
- ✓ 401 Unauthorized response
- ✓ Redirect to login or error message
- ✓ No streaming connection established

---

### ✅ 6. Edge Cases

#### Test 6a: Very Long Response
```
1. Ask a complex question requiring long answer
2. Example: "Tell me about all the services you offer"
```

**Expected Behavior**:
- ✓ Stream handles 2000+ character responses
- ✓ No timeout errors
- ✓ Memory doesn't leak
- ✓ Animation completes fully
- ✓ All content is displayed

#### Test 6b: Very Fast Response
```
1. Send simple message with short expected answer
2. Example: "Yes" or "No"
```

**Expected Behavior**:
- ✓ Short responses (10-50 chars) work
- ✓ Typing indicator briefly appears
- ✓ Animation is visible (not instant)
- ✓ Message stored correctly

#### Test 6c: Rapid Sequential Messages
```
1. Send a message
2. Immediately send another before first completes
3. Repeat 3-4 times quickly
```

**Expected Behavior**:
- ✓ Each message queues properly
- ✓ Input disabled during streaming
- ✓ Messages don't overlap
- ✓ All messages appear in order
- ✓ No race conditions

#### Test 6d: Special Characters & Markdown
```
1. Ask LLM to respond with markdown
2. Example: "Can you format your response with bullet points and bold text?"
```

**Expected Behavior**:
- ✓ Markdown renders correctly
- ✓ Code blocks display properly
- ✓ Links are clickable
- ✓ Bold/italic formatting works
- ✓ Emojis display correctly (if used)

#### Test 6e: Empty/Fallback Response
```
1. Simulate LLM returning empty text
2. Server should retry and use fallback
```

**Expected Behavior**:
- ✓ Fallback message appears: "Got it — keep going."
- ✓ Interview continues normally
- ✓ No blank messages in UI

---

### ✅ 7. Message Storage & Persistence

**Test**: Database storage after streaming
```
1. Send a message and wait for streaming to complete
2. Refresh the page
3. Check database directly
```

**Expected Behavior**:
- ✓ Messages appear in same state after refresh
- ✓ Database contains complete message (not partial)
- ✓ Message content matches what was displayed
- ✓ Events (tools) are stored correctly
- ✓ Event rendering works after page reload

**Database Check**:
```sql
-- Check transcript
SELECT * FROM interview_transcripts WHERE user_id = 'YOUR_USER_ID';

-- Check events
SELECT * FROM app_events WHERE stream LIKE 'interview:%' ORDER BY event_seq;
```

---

### ✅ 8. Typing Indicator Transition

**Test**: Typing indicator → Streaming animation transition
```
1. Send a message
2. Watch the typing indicator
3. Watch for transition to streaming
```

**Expected Behavior**:
- ✓ Typing indicator (3 bouncing dots) appears immediately
- ✓ Indicator shows while waiting for first chunk
- ✓ Indicator disappears when streaming starts
- ✓ Transition is smooth (no flicker)
- ✓ Typing animation takes over seamlessly

**Timeline**:
```
User sends message
↓
[0ms] Typing indicator appears
↓
[100-500ms] First chunk arrives
↓
[500ms] Typing indicator hides
↓
[500ms] Typing animation starts
↓
[1000ms+] Content streams and animates
```

---

### ✅ 9. Structured Outcome Selection During Streaming

**Test**: Click outcome while another message is streaming
```
1. Wait for structured outcomes to appear
2. While assistant message is still animating, click an option
```

**Expected Behavior**:
- ✓ Option selection is disabled during streaming
- ✓ OR: Option selection waits for current animation to complete
- ✓ Selected option doesn't interfere with current message
- ✓ Response to selected option streams correctly

---

### ✅ 10. Browser Compatibility

**Test**: Different browsers
```
1. Test in Chrome
2. Test in Firefox
3. Test in Safari
4. Test in Edge
```

**Expected Behavior**:
- ✓ EventSource / Fetch streams work in all browsers
- ✓ SSE events parse correctly
- ✓ Animation performance is smooth (60fps)
- ✓ No console errors

**Note**: IE11 not supported (EventSource not available)

---

## Performance Metrics to Monitor

### Time to First Token (TTFT)
- **Before (non-streaming)**: 1500-3000ms
- **After (streaming)**: 100-500ms
- **Measurement**: Time from message send to first visible character

### Perceived Response Time
- **Before**: Typing indicator for full duration
- **After**: Brief indicator, then immediate typing

### Memory Usage
- Monitor browser memory during long streaming sessions
- Should not grow unboundedly
- EventSource connections should close properly

### Animation Frame Rate
- Should maintain 60fps during typing animation
- Use browser DevTools → Performance tab

---

## Debugging Tips

### Check SSE Stream in Browser DevTools

1. Open Network tab
2. Send a message
3. Find `/api/interview/turn/stream` request
4. Click on it → Preview tab
5. Should see stream of events:

```
data: {"type":"text_delta","content":"Hello"}

data: {"type":"text_delta","content":" there"}

data: {"type":"tool_executed","toolName":"append_title_card","refetchEvents":true}

data: {"type":"done","success":true,"transcript":[...],"events":[...]}
```

### Server-Side Logging

Watch server console for:
```
[INTERVIEW_TOOL_STREAM] Appended chat.section_header_added for session interview_...
[INTERVIEW_LLM_STREAM] Retry succeeded, reply length=234
[STREAM] Failed to parse tool input: ...
```

### Frontend Console Logging

Check browser console for:
- Streaming errors
- Failed to parse SSE data
- Event refetch calls

---

## Rollback Plan

If streaming causes critical issues, you can temporarily rollback to non-streaming:

### Option 1: Quick Fix in Frontend
```typescript
// In InterviewChat.tsx, change handleSendMessage to:
const result = await callInterviewTurn(content);
// (Use old implementation)
```

### Option 2: Server-Side Fallback
```typescript
// In routes.ts, modify streaming endpoint to return error
// This will trigger frontend error handler which shows error message
```

### Option 3: Feature Flag (Recommended for Production)
```typescript
const USE_STREAMING = process.env.ENABLE_STREAMING === 'true';

// In handleSendMessage:
if (USE_STREAMING) {
  await sendStreamingMessage(content);
} else {
  const result = await callInterviewTurn(content);
  // ... handle result
}
```

---

## Known Limitations

1. **OpenAI Streaming Not Implemented**: Currently only Anthropic streaming works. OpenAI falls back to non-streaming.

2. **No Reconnection Logic**: If SSE connection drops, it fails (doesn't auto-retry). User must manually retry.

3. **Single Active Stream**: Can't have multiple messages streaming simultaneously (enforced by disabled input).

4. **No Partial Tool Results**: Tools must complete fully before execution (by design, to ensure valid JSON).

---

## Success Criteria

The streaming implementation is successful if:

✅ All 10 test categories pass
✅ No regressions in existing features
✅ TTFT reduces to <500ms
✅ Users report faster perceived response times
✅ No increase in error rates
✅ Tool calls render correctly in real-time
✅ Database storage works as before
✅ Animation is smooth and natural

---

## Testing Checklist Summary

- [ ] Basic streaming works with simple messages
- [ ] Typing indicator transitions smoothly
- [ ] Title card appears on first message
- [ ] Section headers render during streaming
- [ ] Structured outcomes appear and are clickable
- [ ] Name collection works
- [ ] Value bullets and social proof display
- [ ] Interview finalization triggers correctly
- [ ] Multi-turn tool interactions work (agentic loop)
- [ ] Typing animation is smooth (35ms per word)
- [ ] Markdown renders correctly
- [ ] Network errors are handled gracefully
- [ ] Server errors show user-friendly message
- [ ] Very long responses complete successfully
- [ ] Very short responses display properly
- [ ] Rapid messages queue correctly
- [ ] Special characters and emoji work
- [ ] Messages persist after page refresh
- [ ] Database contains complete messages
- [ ] Events are stored and render correctly
- [ ] Works in Chrome, Firefox, Safari, Edge
- [ ] Memory doesn't leak during long sessions
- [ ] Animation maintains 60fps

---

## Next Steps After Testing

1. **Gather Metrics**: TTFT, error rates, user engagement
2. **User Feedback**: Collect subjective feedback on experience
3. **Performance Tuning**: Adjust animation speed if needed
4. **Production Deployment**: Deploy to staging → prod with monitoring
5. **A/B Testing**: Compare streaming vs non-streaming (if desired)

---

## Questions or Issues?

If you encounter any issues during testing:

1. Check server console for error logs
2. Check browser console for frontend errors
3. Verify SSE events in Network tab
4. Test with simplified message (rule out complex interactions)
5. Try clearing cookies/session and starting fresh

For implementation questions, refer to:
- `server/routes.ts` lines 2934-4442 (streaming backend)
- `client/src/hooks/useStreamingChat.tsx` (SSE client)
- `client/src/lovable/pages/InterviewChat.tsx` lines 148-250 (integration)
