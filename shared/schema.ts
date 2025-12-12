import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, json, boolean, integer, serial } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// User journey steps for state machine
export type JourneyStep = 
  | 'interview'
  | 'offer'
  | 'module_1'
  | 'module_2'
  | 'module_3'
  | 'graduation'
  | 'serious_plan';

// Serious Plan status
export type SeriousPlanStatus = 'generating' | 'ready' | 'error';

// PDF generation status
export type PdfStatus = 'not_started' | 'generating' | 'ready' | 'error';

// Artifact generation status
export type ArtifactGenerationStatus = 'pending' | 'generating' | 'complete' | 'error';

// Coach letter status
export type CoachLetterStatus = 'pending' | 'generating' | 'complete' | 'error';

// Artifact importance levels
export type ImportanceLevel = 'must_read' | 'recommended' | 'optional' | 'bonus';

export const users = pgTable("users", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").unique(),
  name: text("name"),
  providedName: text("provided_name"), // Name the user gave during interview
  password: text("password"),
  oauthProvider: text("oauth_provider"),
  oauthId: text("oauth_id"),
  promoCode: text("promo_code"),
  isFriendsAndFamily: boolean("is_friends_and_family").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const sessions = pgTable("sessions", {
  sid: varchar("sid", { length: 255 }).primaryKey(),
  sess: json("sess").notNull(),
  expire: timestamp("expire", { precision: 6 }).notNull(),
});

// Type for a single module in the coaching plan
export interface CoachingModule {
  name: string;
  objective: string;
  approach: string;
  outcome: string;
}

// Type for a planned artifact in the Serious Plan
export interface PlannedArtifact {
  key: string;           // Stable identifier (e.g., 'decision_snapshot', 'boss_conversation')
  title: string;         // Human-readable title
  type: string;          // Category: 'snapshot', 'conversation', 'narrative', 'plan', 'recap', 'resources'
  description: string;   // Brief description of what this artifact will contain
  importance: ImportanceLevel;
}

// Type for the full coaching plan
export interface CoachingPlan {
  name: string;  // Client's name
  modules: CoachingModule[];
  careerBrief: string;  // Deprecated, kept for compatibility
  seriousPlanSummary: string;  // One-line summary of what they'll receive
  plannedArtifacts: PlannedArtifact[];  // Artifacts planned for this client
}

// Type for interview analysis in the client dossier
export interface InterviewAnalysis {
  clientName: string;
  currentRole: string;
  company: string;
  tenure: string;
  situation: string;  // Summary of their career situation
  bigProblem: string;  // The core issue they're facing
  desiredOutcome: string;  // What they want to achieve
  clientFacingSummary: string;  // 2-3 sentence client-facing summary of situation and coaching objectives (shown on offer page)
  keyFacts: string[];  // Concrete facts: salary, savings, timeline, etc.
  relationships: { person: string; role: string; dynamic: string }[];  // Partner, manager, etc.
  emotionalState: string;  // Frustration level, confidence, hesitation patterns
  communicationStyle: string;  // Direct vs. indirect, verbose vs. terse, etc.
  priorities: string[];  // What matters most to them
  constraints: string[];  // What limits their options
  motivations: string[];  // What's driving them
  fears: string[];  // What they're worried about
  questionsAsked: string[];  // All questions the AI asked
  optionsOffered: { option: string; chosen: boolean; reason?: string }[];  // Choices presented
  observations: string;  // AI's private notes about user's responses, hesitations, preferences
}

// Type for module completion record
export interface ModuleRecord {
  moduleNumber: number;
  moduleName: string;
  transcript: { role: string; content: string }[];  // Verbatim transcript
  summary: string;  // What was covered
  decisions: string[];  // Commitments made
  insights: string[];  // New understanding gained
  actionItems: string[];  // Concrete next steps
  questionsAsked: string[];  // All questions posed by AI
  optionsPresented: { option: string; chosen: boolean; reason?: string }[];  // Choices offered
  observations: string;  // AI's private notes about user's responses
  completedAt: string;  // ISO timestamp
}

// Type for the complete client dossier (internal AI notes - NEVER shown to user)
export interface ClientDossier {
  interviewTranscript: { role: string; content: string }[];  // Full verbatim interview
  interviewAnalysis: InterviewAnalysis;
  moduleRecords: ModuleRecord[];
  lastUpdated: string;  // ISO timestamp
}

export const interviewTranscripts = pgTable("interview_transcripts", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  sessionToken: varchar("session_token", { length: 64 }).notNull().unique(),
  userId: varchar("user_id", { length: 36 }).references(() => users.id),
  transcript: json("transcript").$type<{ role: string; content: string }[]>().default([]),
  currentModule: text("current_module").default("Interview"),
  progress: integer("progress").default(0),
  interviewComplete: boolean("interview_complete").default(false),
  paymentVerified: boolean("payment_verified").default(false),
  stripeSessionId: text("stripe_session_id"),
  valueBullets: text("value_bullets"),
  socialProof: text("social_proof"),
  planCard: json("plan_card").$type<CoachingPlan | null>(),
  clientDossier: json("client_dossier").$type<ClientDossier | null>(),
  // Program revision count (for analytics)
  revisionCount: integer("revision_count").default(0),
  // Module completion tracking
  module1Complete: boolean("module_1_complete").default(false),
  module2Complete: boolean("module_2_complete").default(false),
  module3Complete: boolean("module_3_complete").default(false),
  // Module transcripts (conversation history for each module)
  module1Transcript: json("module_1_transcript").$type<{ role: string; content: string }[]>(),
  module2Transcript: json("module_2_transcript").$type<{ role: string; content: string }[]>(),
  module3Transcript: json("module_3_transcript").$type<{ role: string; content: string }[]>(),
  // Module summaries (shown in completion card)
  module1Summary: text("module_1_summary"),
  module2Summary: text("module_2_summary"),
  module3Summary: text("module_3_summary"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const magicLinkTokens = pgTable("magic_link_tokens", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull(),
  tokenHash: text("token_hash").notNull(),
  promoCode: text("promo_code"),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertInterviewTranscriptSchema = createInsertSchema(interviewTranscripts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type InsertInterviewTranscript = z.infer<typeof insertInterviewTranscriptSchema>;
export type InterviewTranscript = typeof interviewTranscripts.$inferSelect;

export const insertMagicLinkTokenSchema = createInsertSchema(magicLinkTokens).omit({
  id: true,
  createdAt: true,
});

export type InsertMagicLinkToken = z.infer<typeof insertMagicLinkTokenSchema>;
export type MagicLinkToken = typeof magicLinkTokens.$inferSelect;

// ============================================
// SERIOUS PLAN TABLES
// ============================================

// Metadata stored with the Serious Plan
export interface SeriousPlanMetadata {
  clientName: string;
  planHorizonType: '30_days' | '60_days' | '90_days' | '6_months';
  planHorizonRationale: string;
  keyConstraints: string[];
  primaryRecommendation: string;
  emotionalTone: string;  // For graduation note personalization
}

// The main Serious Plan record
export const seriousPlans = pgTable("serious_plans", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 }).references(() => users.id).notNull(),
  transcriptId: varchar("transcript_id", { length: 36 }).references(() => interviewTranscripts.id),
  status: text("status").$type<SeriousPlanStatus>().default('generating').notNull(),
  coachNoteContent: text("coach_note_content"),  // The graduation note / coach letter
  coachLetterStatus: text("coach_letter_status").$type<CoachLetterStatus>().default('pending'),
  coachLetterSeenAt: timestamp("coach_letter_seen_at"),  // When user viewed the letter interstitial
  bundlePdfStatus: text("bundle_pdf_status").$type<PdfStatus>().default('not_started'),
  bundlePdfUrl: text("bundle_pdf_url"),
  summaryMetadata: json("summary_metadata").$type<SeriousPlanMetadata | null>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Artifact metadata stored in JSON
export interface ArtifactMetadata {
  planHorizonType?: string;
  intervals?: { name: string; tasks: string[] }[];
  resources?: { title: string; url: string; description: string; mustRead: boolean }[];
  risks?: { name: string; likelihood: string; impact: string; mitigation: string; fallback: string }[];
  conversationType?: 'boss' | 'partner' | 'self';
  [key: string]: any;  // Allow additional custom metadata
}

// Individual artifacts within a Serious Plan
export const seriousPlanArtifacts = pgTable("serious_plan_artifacts", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  planId: varchar("plan_id", { length: 36 }).references(() => seriousPlans.id).notNull(),
  artifactKey: text("artifact_key").notNull(),  // e.g., 'decision_snapshot', 'boss_conversation'
  title: text("title").notNull(),
  type: text("type").notNull(),  // 'snapshot', 'conversation', 'narrative', 'plan', 'recap', 'resources', 'transcript'
  importanceLevel: text("importance_level").$type<ImportanceLevel>().default('recommended'),
  whyImportant: text("why_important"),  // 1-2 sentences on why this artifact matters
  contentRaw: text("content_raw"),  // Markdown/HTML from LLM
  generationStatus: text("generation_status").$type<ArtifactGenerationStatus>().default('pending'),
  pdfStatus: text("pdf_status").$type<PdfStatus>().default('not_started'),
  pdfUrl: text("pdf_url"),
  displayOrder: integer("display_order").default(0),
  metadata: json("metadata").$type<ArtifactMetadata | null>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Coach chat messages linked to a Serious Plan
export const coachChatMessages = pgTable("coach_chat_messages", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  planId: varchar("plan_id", { length: 36 }).references(() => seriousPlans.id).notNull(),
  role: text("role").notNull(),  // 'user' or 'assistant'
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Insert schemas for new tables
export const insertSeriousPlanSchema = createInsertSchema(seriousPlans).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertSeriousPlanArtifactSchema = createInsertSchema(seriousPlanArtifacts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCoachChatMessageSchema = createInsertSchema(coachChatMessages).omit({
  id: true,
  createdAt: true,
});

// Types for new tables
export type InsertSeriousPlan = z.infer<typeof insertSeriousPlanSchema>;
export type SeriousPlan = typeof seriousPlans.$inferSelect;

export type InsertSeriousPlanArtifact = z.infer<typeof insertSeriousPlanArtifactSchema>;
export type SeriousPlanArtifact = typeof seriousPlanArtifacts.$inferSelect;

export type InsertCoachChatMessage = z.infer<typeof insertCoachChatMessageSchema>;
export type CoachChatMessage = typeof coachChatMessages.$inferSelect;

// ============================================
// JOURNEY STATE HELPERS
// ============================================

export interface JourneyState {
  interviewComplete: boolean;
  paymentVerified: boolean;
  module1Complete: boolean;
  module2Complete: boolean;
  module3Complete: boolean;
  hasSeriousPlan: boolean;
}

// Determine the current step in the user journey
export function getCurrentJourneyStep(state: JourneyState): JourneyStep {
  if (!state.interviewComplete) return 'interview';
  if (!state.paymentVerified) return 'offer';
  if (!state.module1Complete) return 'module_1';
  if (!state.module2Complete) return 'module_2';
  if (!state.module3Complete) return 'module_3';
  if (!state.hasSeriousPlan) return 'graduation';
  return 'serious_plan';
}

// Check if a user can access a specific step
export function canAccessStep(state: JourneyState, targetStep: JourneyStep): boolean {
  const currentStep = getCurrentJourneyStep(state);
  const stepOrder: JourneyStep[] = [
    'interview', 'offer', 'module_1', 'module_2', 'module_3', 'graduation', 'serious_plan'
  ];
  const currentIndex = stepOrder.indexOf(currentStep);
  const targetIndex = stepOrder.indexOf(targetStep);
  // Can access current step or any previous step
  return targetIndex <= currentIndex;
}

// Get the redirect path for a given journey step
export function getStepPath(step: JourneyStep): string {
  switch (step) {
    case 'interview': return '/interview';
    case 'offer': return '/offer';
    case 'module_1': return '/module/1';
    case 'module_2': return '/module/2';
    case 'module_3': return '/module/3';
    case 'graduation': return '/graduation';
    case 'serious_plan': return '/serious-plan';
  }
}
