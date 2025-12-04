import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import fs from "fs";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

function getDatabaseUrl(): string {
  const isProduction = process.env.NODE_ENV === 'production';
  console.log(`[DB] Initializing database connection (production=${isProduction})`);
  
  // In PRODUCTION: Use /tmp/replitdb first (contains real Neon URL)
  // The development DATABASE_URL uses "helium" proxy which doesn't work in production
  if (isProduction) {
    const replitDbPath = "/tmp/replitdb";
    if (fs.existsSync(replitDbPath)) {
      const dbUrl = fs.readFileSync(replitDbPath, "utf-8").trim();
      if (dbUrl) {
        try {
          const urlObj = new URL(dbUrl);
          console.log(`[DB] Production: Using /tmp/replitdb: host=${urlObj.hostname}, path=${urlObj.pathname}`);
        } catch (e) {
          console.log(`[DB] Production: Using /tmp/replitdb (URL parse failed)`);
        }
        return dbUrl;
      } else {
        console.log(`[DB] Production: /tmp/replitdb exists but is empty`);
      }
    } else {
      console.log(`[DB] Production: /tmp/replitdb does not exist`);
    }
  }
  
  // In DEVELOPMENT or as fallback: Use DATABASE_URL environment variable
  if (process.env.DATABASE_URL) {
    try {
      const urlObj = new URL(process.env.DATABASE_URL);
      console.log(`[DB] Using DATABASE_URL env: host=${urlObj.hostname}, path=${urlObj.pathname}`);
    } catch (e) {
      console.log(`[DB] Using DATABASE_URL env (URL parse failed)`);
    }
    return process.env.DATABASE_URL;
  }
  
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const databaseUrl = getDatabaseUrl();
export const pool = new Pool({ connectionString: databaseUrl });
export const db = drizzle({ client: pool, schema });
