import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import fs from "fs";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

function getDatabaseUrl(): string {
  const isProduction = process.env.NODE_ENV === 'production';
  console.log(`[DB] Initializing database connection (production=${isProduction})`);
  
  // Try DATABASE_URL environment variable first (works in both dev and production)
  if (process.env.DATABASE_URL) {
    try {
      const urlObj = new URL(process.env.DATABASE_URL);
      console.log(`[DB] Using DATABASE_URL env: host=${urlObj.hostname}, path=${urlObj.pathname}`);
    } catch (e) {
      console.log(`[DB] Using DATABASE_URL env (URL parse failed)`);
    }
    return process.env.DATABASE_URL;
  }
  
  // For published apps, check /tmp/replitdb as fallback
  const replitDbPath = "/tmp/replitdb";
  if (fs.existsSync(replitDbPath)) {
    const dbUrl = fs.readFileSync(replitDbPath, "utf-8").trim();
    if (dbUrl) {
      try {
        const urlObj = new URL(dbUrl);
        console.log(`[DB] Using /tmp/replitdb: host=${urlObj.hostname}, path=${urlObj.pathname}`);
      } catch (e) {
        console.log(`[DB] Using /tmp/replitdb (URL parse failed)`);
      }
      return dbUrl;
    } else {
      console.log(`[DB] /tmp/replitdb exists but is empty`);
    }
  } else {
    console.log(`[DB] /tmp/replitdb does not exist`);
  }
  
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const databaseUrl = getDatabaseUrl();
export const pool = new Pool({ connectionString: databaseUrl });
export const db = drizzle({ client: pool, schema });
