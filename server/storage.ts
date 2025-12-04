import { 
  type User, 
  type InsertUser, 
  type InterviewTranscript, 
  type InsertInterviewTranscript,
  users,
  interviewTranscripts 
} from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByOAuth(provider: string, oauthId: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<InsertUser>): Promise<User | undefined>;
  
  getTranscript(sessionToken: string): Promise<InterviewTranscript | undefined>;
  createTranscript(transcript: InsertInterviewTranscript): Promise<InterviewTranscript>;
  updateTranscript(sessionToken: string, updates: Partial<InsertInterviewTranscript>): Promise<InterviewTranscript | undefined>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async getUserByOAuth(provider: string, oauthId: string): Promise<User | undefined> {
    const results = await db.select().from(users)
      .where(eq(users.oauthProvider, provider));
    return results.find(u => u.oauthId === oauthId);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async updateUser(id: string, updates: Partial<InsertUser>): Promise<User | undefined> {
    const [user] = await db.update(users)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async getTranscript(sessionToken: string): Promise<InterviewTranscript | undefined> {
    const [transcript] = await db.select().from(interviewTranscripts)
      .where(eq(interviewTranscripts.sessionToken, sessionToken));
    return transcript;
  }

  async createTranscript(insertTranscript: InsertInterviewTranscript): Promise<InterviewTranscript> {
    const results = await db.insert(interviewTranscripts)
      .values(insertTranscript)
      .returning();
    return results[0];
  }

  async updateTranscript(
    sessionToken: string, 
    updates: Partial<InsertInterviewTranscript>
  ): Promise<InterviewTranscript | undefined> {
    const results = await db.update(interviewTranscripts)
      .set(updates as any)
      .where(eq(interviewTranscripts.sessionToken, sessionToken))
      .returning();
    return results[0];
  }
}

export const storage = new DatabaseStorage();
