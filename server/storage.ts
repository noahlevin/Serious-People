import { 
  type User, 
  type InsertUser, 
  type InterviewTranscript, 
  type InsertInterviewTranscript,
  type MagicLinkToken,
  type InsertMagicLinkToken,
  type ClientDossier,
  users,
  interviewTranscripts,
  magicLinkTokens 
} from "@shared/schema";
import { db } from "./db";
import { eq, and, isNull, gt } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByOAuth(provider: string, oauthId: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<InsertUser>): Promise<User | undefined>;
  
  getTranscript(sessionToken: string): Promise<InterviewTranscript | undefined>;
  getTranscriptByUserId(userId: string): Promise<InterviewTranscript | undefined>;
  createTranscript(transcript: InsertInterviewTranscript): Promise<InterviewTranscript>;
  updateTranscript(sessionToken: string, updates: Partial<InsertInterviewTranscript>): Promise<InterviewTranscript | undefined>;
  upsertTranscriptByUserId(userId: string, data: {
    transcript: any[];
    currentModule: string;
    progress: number;
    interviewComplete: boolean;
    paymentVerified: boolean;
    valueBullets?: string;
    socialProof?: string;
    planCard?: any;
    clientDossier?: ClientDossier | null;
  }): Promise<InterviewTranscript>;
  
  updateClientDossier(userId: string, dossier: ClientDossier): Promise<InterviewTranscript | undefined>;
  
  createMagicLinkToken(token: InsertMagicLinkToken): Promise<MagicLinkToken>;
  getMagicLinkToken(tokenHash: string): Promise<MagicLinkToken | undefined>;
  markMagicLinkTokenUsed(id: string): Promise<void>;
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
      .values(insertTranscript as any)
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

  async getTranscriptByUserId(userId: string): Promise<InterviewTranscript | undefined> {
    const [transcript] = await db.select().from(interviewTranscripts)
      .where(eq(interviewTranscripts.userId, userId));
    return transcript;
  }

  async upsertTranscriptByUserId(userId: string, data: {
    transcript: any[];
    currentModule: string;
    progress: number;
    interviewComplete: boolean;
    paymentVerified: boolean;
    valueBullets?: string;
    socialProof?: string;
    planCard?: any;
    clientDossier?: ClientDossier | null;
  }): Promise<InterviewTranscript> {
    // Check if transcript exists for this user
    const existing = await this.getTranscriptByUserId(userId);
    
    if (existing) {
      // Update existing record
      const updateData: any = {
        transcript: data.transcript,
        currentModule: data.currentModule,
        progress: data.progress,
        interviewComplete: data.interviewComplete,
        paymentVerified: data.paymentVerified,
        valueBullets: data.valueBullets,
        socialProof: data.socialProof,
        planCard: data.planCard,
        updatedAt: new Date(),
      };
      // Only update clientDossier if explicitly provided
      if (data.clientDossier !== undefined) {
        updateData.clientDossier = data.clientDossier;
      }
      const [updated] = await db.update(interviewTranscripts)
        .set(updateData)
        .where(eq(interviewTranscripts.userId, userId))
        .returning();
      return updated;
    } else {
      // Create new record
      const sessionToken = `user-${userId}-${Date.now()}`;
      const [created] = await db.insert(interviewTranscripts)
        .values({
          sessionToken,
          userId,
          transcript: data.transcript,
          currentModule: data.currentModule,
          progress: data.progress,
          interviewComplete: data.interviewComplete,
          paymentVerified: data.paymentVerified,
          valueBullets: data.valueBullets,
          socialProof: data.socialProof,
          planCard: data.planCard,
          clientDossier: data.clientDossier || null,
        } as any)
        .returning();
      return created;
    }
  }

  async updateClientDossier(userId: string, dossier: ClientDossier): Promise<InterviewTranscript | undefined> {
    const [updated] = await db.update(interviewTranscripts)
      .set({
        clientDossier: dossier,
        updatedAt: new Date(),
      } as any)
      .where(eq(interviewTranscripts.userId, userId))
      .returning();
    return updated;
  }

  async createMagicLinkToken(insertToken: InsertMagicLinkToken): Promise<MagicLinkToken> {
    const [token] = await db.insert(magicLinkTokens).values(insertToken).returning();
    return token;
  }

  async getMagicLinkToken(tokenHash: string): Promise<MagicLinkToken | undefined> {
    const [token] = await db.select().from(magicLinkTokens)
      .where(
        and(
          eq(magicLinkTokens.tokenHash, tokenHash),
          isNull(magicLinkTokens.usedAt),
          gt(magicLinkTokens.expiresAt, new Date())
        )
      );
    return token;
  }

  async markMagicLinkTokenUsed(id: string): Promise<void> {
    await db.update(magicLinkTokens)
      .set({ usedAt: new Date() })
      .where(eq(magicLinkTokens.id, id));
  }
}

export const storage = new DatabaseStorage();
