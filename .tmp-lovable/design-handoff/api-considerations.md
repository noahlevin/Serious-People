# API Considerations

> Flags for potential API changes, data structure notes, and questions for collaborative review.

---

## Overview

This document captures areas where the new design may require changes to existing API contracts or data structures. **Do not implement these changes unilaterally**—flag them here for discussion.

---

## Current API Contract Reference

Based on the original project specification, the existing APIs include:

### Core Endpoints
- `POST /api/interview/start` — Begin interview session
- `POST /api/interview/respond` — Submit user response, get AI follow-up
- `POST /api/interview/complete` — Finalize interview, generate results
- `GET /api/user/profile` — Get user profile and progress
- `GET /api/modules/:id` — Get coaching module content
- `POST /api/checkout/create-session` — Initiate Stripe checkout

### Data Models
- **User**: id, email, name, subscription_status, created_at
- **Interview**: id, user_id, status, messages[], results, created_at
- **Module**: id, title, description, content, order
- **Progress**: user_id, module_id, completed_exercises[], completed_at

---

## Potential API Additions

### 1. Interview Section Tracking

**Context**: The new chat UI shows section dividers ("Situation", "Challenges", "Goals", "Review") with a progress bar.

**Current state**: Unknown if sections are tracked server-side.

**Potential need**:
```typescript
// Enhanced interview response
interface InterviewResponse {
  message: string;
  currentSection: 'situation' | 'challenges' | 'goals' | 'review';
  sectionProgress: number; // 0-100 within section
  overallProgress: number; // 0-100 total
}
```

**Question**: Does the current API return section/progress info, or is this client-side only?

---

### 2. Upsell Content Personalization

**Context**: After interview completion, the upsell card shows personalized content based on the user's situation type.

**Current state**: Unknown if results include situation classification.

**Potential need**:
```typescript
interface InterviewResults {
  situationType: 'stuck' | 'considering' | 'readyToLeave' | 'newOpportunity';
  headline: string;
  insights: string[];
  recommendedModules: string[];
  urgencyLevel: 'low' | 'medium' | 'high';
  // Upsell-specific fields
  upsellHeadline: string;
  upsellFeatures: string[];
  pricing: {
    amount: number;
    originalAmount?: number;
    currency: string;
  };
}
```

**Question**: Does the completion endpoint return enough data to personalize the upsell, or do we need additional fields?

---

### 3. Artifacts/Content Hub

**Context**: The Artifacts page shows user-generated content organized by type.

**Current state**: Unknown if there's an artifacts endpoint.

**Potential need**:
```typescript
// GET /api/user/artifacts
interface Artifact {
  id: string;
  type: 'exercise' | 'insight' | 'note' | 'assessment';
  title: string;
  content: string;
  moduleId?: string;
  createdAt: Date;
  updatedAt: Date;
}

interface ArtifactsResponse {
  artifacts: Artifact[];
  totalCount: number;
}
```

**Question**: Is artifact storage already implemented? What's the current data model?

---

### 4. Module Progress Enhancement

**Context**: Module wrap-up screens show detailed completion stats.

**Potential need**:
```typescript
interface ModuleProgress {
  moduleId: string;
  status: 'not_started' | 'in_progress' | 'completed';
  startedAt?: Date;
  completedAt?: Date;
  exercisesCompleted: number;
  totalExercises: number;
  keyTakeaways: string[]; // User-captured or AI-generated
  nextModuleId?: string;
}
```

**Question**: Does current progress tracking support key takeaways or next module recommendations?

---

## Data Structure Compatibility Notes

### Interview Messages

The chat UI expects messages in this format:
```typescript
interface ChatMessage {
  id: string;
  role: 'assistant' | 'user';
  content: string;
  timestamp: Date;
}
```

**Verify**: Does the current API return messages in this format, or is transformation needed?

---

### Section Configuration

The UI uses this section structure:
```typescript
interface InterviewSection {
  id: string;
  title: string;
  description: string;
  questionCount?: number;
}
```

**Question**: Is section configuration stored in the database or hard-coded client-side?

---

## Recommendations

### No Changes Required
- Basic auth flow (Google OAuth, magic link)
- Stripe checkout integration
- Core user profile structure

### Minor Additions (Low Risk)
- Add `currentSection` to interview response if not present
- Add `situationType` to interview results if not present

### Potential New Endpoints (Discuss First)
- Artifacts CRUD operations
- Module recommendations based on results
- Progress analytics/stats

---

## Implementation Notes for Replit Agent

When implementing the design:

1. **Check existing endpoints first** — Many of these concerns may already be addressed
2. **Document discrepancies** — If the API returns different data than expected, note it here
3. **Propose changes** — Don't modify API contracts without discussion
4. **Use mock data** — For missing data, use sensible defaults and flag for review

---

## Questions for Review

Please answer these before finalizing the implementation:

1. [ ] Does the interview API return section progress information?
2. [ ] Does the interview completion return situation classification?
3. [ ] Is there an existing artifacts/content storage system?
4. [ ] What is the current module progress data model?
5. [ ] Are there any rate limits or usage quotas to consider in the UI?
6. [ ] How should error states be communicated to the frontend?

---

## Change Log

| Date | Change | Status |
|------|--------|--------|
| Initial | Document created | Pending review |

---

*This document should be updated as implementation progresses and questions are resolved.*
