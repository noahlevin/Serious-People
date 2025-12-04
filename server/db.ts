import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

function getDatabaseUrl(): string {
  const isProduction = process.env.NODE_ENV === 'production';
  console.log(`[DB] Initializing database connection (production=${isProduction})`);
  
  // Try to construct URL from individual PG* environment variables
  // This works in both development and production
  const pgHost = process.env.PGHOST;
  const pgUser = process.env.PGUSER;
  const pgPassword = process.env.PGPASSWORD;
  const pgDatabase = process.env.PGDATABASE;
  const pgPort = process.env.PGPORT || "5432";
  
  if (pgHost && pgUser && pgPassword && pgDatabase) {
    // Check if this is a Neon host (requires sslmode=require)
    const isNeon = pgHost.includes('neon.tech') || pgHost.includes('aws.neon.tech');
    const sslParam = isNeon ? '?sslmode=require' : '';
    const constructedUrl = `postgresql://${pgUser}:${pgPassword}@${pgHost}:${pgPort}/${pgDatabase}${sslParam}`;
    console.log(`[DB] Using constructed URL from PG* vars: host=${pgHost}, database=${pgDatabase}`);
    return constructedUrl;
  }
  
  // Fallback to DATABASE_URL environment variable (works in development with helium proxy)
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
