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
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
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
