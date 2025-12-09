import { 
  type User, 
  type InsertUser, 
  type InterviewTranscript, 
  type InsertInterviewTranscript,
  type MagicLinkToken,
  type InsertMagicLinkToken,
  type ClientDossier,
  type SeriousPlan,
  type InsertSeriousPlan,
  type SeriousPlanArtifact,
  type InsertSeriousPlanArtifact,
  type CoachChatMessage,
  type InsertCoachChatMessage,
  type JourneyState,
  type PdfStatus,
  type SeriousPlanStatus,
  type CoachLetterStatus,
  type ArtifactGenerationStatus,
  users,
  interviewTranscripts,
  magicLinkTokens,
  seriousPlans,
  seriousPlanArtifacts,
  coachChatMessages 
} from "@shared/schema";
import { db } from "./db";
import { eq, and, isNull, gt, desc, asc } from "drizzle-orm";

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByOAuth(provider: string, oauthId: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<InsertUser>): Promise<User | undefined>;
  
  // Transcript operations
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
  updateModuleComplete(userId: string, moduleNumber: 1 | 2 | 3, complete: boolean): Promise<InterviewTranscript | undefined>;
  updateModuleData(userId: string, moduleNumber: 1 | 2 | 3, data: {
    transcript?: { role: string; content: string }[];
    summary?: string;
    complete?: boolean;
  }): Promise<InterviewTranscript | undefined>;
  getModuleData(userId: string, moduleNumber: 1 | 2 | 3): Promise<{
    transcript: { role: string; content: string }[] | null;
    summary: string | null;
    complete: boolean;
  } | null>;
  deleteTranscript(id: string): Promise<void>;
  
  // Magic link operations
  createMagicLinkToken(token: InsertMagicLinkToken): Promise<MagicLinkToken>;
  getMagicLinkToken(tokenHash: string): Promise<MagicLinkToken | undefined>;
  markMagicLinkTokenUsed(id: string): Promise<void>;
  
  // Journey state
  getJourneyState(userId: string): Promise<JourneyState | null>;
  
  // Serious Plan operations
  createSeriousPlan(plan: InsertSeriousPlan): Promise<SeriousPlan>;
  getSeriousPlan(id: string): Promise<SeriousPlan | undefined>;
  getSeriousPlanByUserId(userId: string): Promise<SeriousPlan | undefined>;
  updateSeriousPlan(id: string, updates: Partial<InsertSeriousPlan>): Promise<SeriousPlan | undefined>;
  updateSeriousPlanStatus(id: string, status: SeriousPlanStatus): Promise<SeriousPlan | undefined>;
  updateSeriousPlanBundlePdf(id: string, status: PdfStatus, url?: string): Promise<SeriousPlan | undefined>;
  
  // Coach letter operations
  updateCoachLetter(id: string, status: CoachLetterStatus, content?: string): Promise<SeriousPlan | undefined>;
  markCoachLetterSeen(id: string): Promise<SeriousPlan | undefined>;
  
  // Artifact operations
  createArtifact(artifact: InsertSeriousPlanArtifact): Promise<SeriousPlanArtifact>;
  createArtifacts(artifacts: InsertSeriousPlanArtifact[]): Promise<SeriousPlanArtifact[]>;
  getArtifact(id: string): Promise<SeriousPlanArtifact | undefined>;
  getArtifactByKey(planId: string, artifactKey: string): Promise<SeriousPlanArtifact | undefined>;
  getArtifactsByPlanId(planId: string): Promise<SeriousPlanArtifact[]>;
  updateArtifact(id: string, updates: Partial<InsertSeriousPlanArtifact>): Promise<SeriousPlanArtifact | undefined>;
  updateArtifactPdf(id: string, status: PdfStatus, url?: string): Promise<SeriousPlanArtifact | undefined>;
  updateArtifactGenerationStatus(id: string, status: ArtifactGenerationStatus, content?: string): Promise<SeriousPlanArtifact | undefined>;
  
  // Coach chat operations
  createCoachChatMessage(message: InsertCoachChatMessage): Promise<CoachChatMessage>;
  getCoachChatMessages(planId: string): Promise<CoachChatMessage[]>;
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

  // Module completion tracking
  async updateModuleComplete(userId: string, moduleNumber: 1 | 2 | 3, complete: boolean): Promise<InterviewTranscript | undefined> {
    const field = moduleNumber === 1 ? 'module1Complete' 
      : moduleNumber === 2 ? 'module2Complete' 
      : 'module3Complete';
    
    const updateData: any = { updatedAt: new Date() };
    updateData[field] = complete;
    
    const [updated] = await db.update(interviewTranscripts)
      .set(updateData)
      .where(eq(interviewTranscripts.userId, userId))
      .returning();
    return updated;
  }

  // Update module transcript, summary, and/or completion status
  async updateModuleData(userId: string, moduleNumber: 1 | 2 | 3, data: {
    transcript?: { role: string; content: string }[];
    summary?: string;
    complete?: boolean;
  }): Promise<InterviewTranscript | undefined> {
    const updateData: any = { updatedAt: new Date() };
    
    if (moduleNumber === 1) {
      if (data.transcript !== undefined) updateData.module1Transcript = data.transcript;
      if (data.summary !== undefined) updateData.module1Summary = data.summary;
      if (data.complete !== undefined) updateData.module1Complete = data.complete;
    } else if (moduleNumber === 2) {
      if (data.transcript !== undefined) updateData.module2Transcript = data.transcript;
      if (data.summary !== undefined) updateData.module2Summary = data.summary;
      if (data.complete !== undefined) updateData.module2Complete = data.complete;
    } else {
      if (data.transcript !== undefined) updateData.module3Transcript = data.transcript;
      if (data.summary !== undefined) updateData.module3Summary = data.summary;
      if (data.complete !== undefined) updateData.module3Complete = data.complete;
    }
    
    const [updated] = await db.update(interviewTranscripts)
      .set(updateData)
      .where(eq(interviewTranscripts.userId, userId))
      .returning();
    return updated;
  }

  // Get module data (transcript, summary, completion status)
  async getModuleData(userId: string, moduleNumber: 1 | 2 | 3): Promise<{
    transcript: { role: string; content: string }[] | null;
    summary: string | null;
    complete: boolean;
  } | null> {
    const transcript = await this.getTranscriptByUserId(userId);
    if (!transcript) return null;
    
    if (moduleNumber === 1) {
      return {
        transcript: transcript.module1Transcript || null,
        summary: transcript.module1Summary || null,
        complete: transcript.module1Complete || false,
      };
    } else if (moduleNumber === 2) {
      return {
        transcript: transcript.module2Transcript || null,
        summary: transcript.module2Summary || null,
        complete: transcript.module2Complete || false,
      };
    } else {
      return {
        transcript: transcript.module3Transcript || null,
        summary: transcript.module3Summary || null,
        complete: transcript.module3Complete || false,
      };
    }
  }

  async deleteTranscript(id: string): Promise<void> {
    await db.delete(interviewTranscripts).where(eq(interviewTranscripts.id, id));
  }

  // Journey state
  async getJourneyState(userId: string): Promise<JourneyState | null> {
    const transcript = await this.getTranscriptByUserId(userId);
    if (!transcript) return null;
    
    const plan = await this.getSeriousPlanByUserId(userId);
    
    return {
      interviewComplete: transcript.interviewComplete || false,
      paymentVerified: transcript.paymentVerified || false,
      module1Complete: transcript.module1Complete || false,
      module2Complete: transcript.module2Complete || false,
      module3Complete: transcript.module3Complete || false,
      hasSeriousPlan: !!plan && plan.status === 'ready',
    };
  }

  // Serious Plan operations
  async createSeriousPlan(plan: InsertSeriousPlan): Promise<SeriousPlan> {
    const [created] = await db.insert(seriousPlans).values(plan as any).returning();
    return created;
  }

  async getSeriousPlan(id: string): Promise<SeriousPlan | undefined> {
    const [plan] = await db.select().from(seriousPlans).where(eq(seriousPlans.id, id));
    return plan;
  }

  async getSeriousPlanByUserId(userId: string): Promise<SeriousPlan | undefined> {
    const [plan] = await db.select().from(seriousPlans)
      .where(eq(seriousPlans.userId, userId))
      .orderBy(desc(seriousPlans.createdAt))
      .limit(1);
    return plan;
  }

  async updateSeriousPlan(id: string, updates: Partial<InsertSeriousPlan>): Promise<SeriousPlan | undefined> {
    const [updated] = await db.update(seriousPlans)
      .set({ ...updates, updatedAt: new Date() } as any)
      .where(eq(seriousPlans.id, id))
      .returning();
    return updated;
  }

  async updateSeriousPlanStatus(id: string, status: SeriousPlanStatus): Promise<SeriousPlan | undefined> {
    const [updated] = await db.update(seriousPlans)
      .set({ status, updatedAt: new Date() } as any)
      .where(eq(seriousPlans.id, id))
      .returning();
    return updated;
  }

  async updateSeriousPlanBundlePdf(id: string, status: PdfStatus, url?: string): Promise<SeriousPlan | undefined> {
    const updateData: any = { bundlePdfStatus: status, updatedAt: new Date() };
    if (url) updateData.bundlePdfUrl = url;
    
    const [updated] = await db.update(seriousPlans)
      .set(updateData)
      .where(eq(seriousPlans.id, id))
      .returning();
    return updated;
  }

  // Coach letter operations
  async updateCoachLetter(id: string, status: CoachLetterStatus, content?: string): Promise<SeriousPlan | undefined> {
    const updateData: any = { coachLetterStatus: status, updatedAt: new Date() };
    if (content !== undefined) updateData.coachNoteContent = content;
    
    const [updated] = await db.update(seriousPlans)
      .set(updateData)
      .where(eq(seriousPlans.id, id))
      .returning();
    return updated;
  }

  async markCoachLetterSeen(id: string): Promise<SeriousPlan | undefined> {
    const [updated] = await db.update(seriousPlans)
      .set({ coachLetterSeenAt: new Date(), updatedAt: new Date() } as any)
      .where(eq(seriousPlans.id, id))
      .returning();
    return updated;
  }

  // Artifact operations
  async createArtifact(artifact: InsertSeriousPlanArtifact): Promise<SeriousPlanArtifact> {
    const [created] = await db.insert(seriousPlanArtifacts).values(artifact as any).returning();
    return created;
  }

  async createArtifacts(artifacts: InsertSeriousPlanArtifact[]): Promise<SeriousPlanArtifact[]> {
    if (artifacts.length === 0) return [];
    const created = await db.insert(seriousPlanArtifacts).values(artifacts as any).returning();
    return created;
  }

  async getArtifact(id: string): Promise<SeriousPlanArtifact | undefined> {
    const [artifact] = await db.select().from(seriousPlanArtifacts).where(eq(seriousPlanArtifacts.id, id));
    return artifact;
  }

  async getArtifactByKey(planId: string, artifactKey: string): Promise<SeriousPlanArtifact | undefined> {
    const [artifact] = await db.select().from(seriousPlanArtifacts)
      .where(and(
        eq(seriousPlanArtifacts.planId, planId),
        eq(seriousPlanArtifacts.artifactKey, artifactKey)
      ));
    return artifact;
  }

  async getArtifactsByPlanId(planId: string): Promise<SeriousPlanArtifact[]> {
    return db.select().from(seriousPlanArtifacts)
      .where(eq(seriousPlanArtifacts.planId, planId))
      .orderBy(asc(seriousPlanArtifacts.displayOrder));
  }

  async updateArtifact(id: string, updates: Partial<InsertSeriousPlanArtifact>): Promise<SeriousPlanArtifact | undefined> {
    const [updated] = await db.update(seriousPlanArtifacts)
      .set({ ...updates, updatedAt: new Date() } as any)
      .where(eq(seriousPlanArtifacts.id, id))
      .returning();
    return updated;
  }

  async updateArtifactPdf(id: string, status: PdfStatus, url?: string): Promise<SeriousPlanArtifact | undefined> {
    const updateData: any = { pdfStatus: status, updatedAt: new Date() };
    if (url) updateData.pdfUrl = url;
    
    const [updated] = await db.update(seriousPlanArtifacts)
      .set(updateData)
      .where(eq(seriousPlanArtifacts.id, id))
      .returning();
    return updated;
  }

  async updateArtifactGenerationStatus(id: string, status: ArtifactGenerationStatus, content?: string): Promise<SeriousPlanArtifact | undefined> {
    const updateData: any = { generationStatus: status, updatedAt: new Date() };
    if (content !== undefined) updateData.contentRaw = content;
    
    const [updated] = await db.update(seriousPlanArtifacts)
      .set(updateData)
      .where(eq(seriousPlanArtifacts.id, id))
      .returning();
    return updated;
  }

  // Coach chat operations
  async createCoachChatMessage(message: InsertCoachChatMessage): Promise<CoachChatMessage> {
    const [created] = await db.insert(coachChatMessages).values(message as any).returning();
    return created;
  }

  async getCoachChatMessages(planId: string): Promise<CoachChatMessage[]> {
    return db.select().from(coachChatMessages)
      .where(eq(coachChatMessages.planId, planId))
      .orderBy(asc(coachChatMessages.createdAt));
  }
}

export const storage = new DatabaseStorage();
