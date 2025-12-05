import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, json, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").unique(),
  name: text("name"),
  password: text("password"),
  oauthProvider: text("oauth_provider"),
  oauthId: text("oauth_id"),
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

// Type for the full coaching plan
export interface CoachingPlan {
  name: string;  // Client's name
  modules: CoachingModule[];
  careerBrief: string;
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
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const magicLinkTokens = pgTable("magic_link_tokens", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull(),
  tokenHash: text("token_hash").notNull(),
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
