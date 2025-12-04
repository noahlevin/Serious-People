import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import fs from "fs";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

function isValidPostgresUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    // Valid PostgreSQL URLs start with postgres:// or postgresql://
    // and should NOT point to kv.replit.com (that's the KV store, not PostgreSQL)
    const isPostgresProtocol = urlObj.protocol === 'postgres:' || urlObj.protocol === 'postgresql:';
    const isNotKvStore = !urlObj.hostname.includes('kv.replit.com');
    return isPostgresProtocol && isNotKvStore;
  } catch {
    return false;
  }
}

function getDatabaseUrl(): string {
  const isProduction = process.env.NODE_ENV === 'production';
  console.log(`[DB] Initializing database connection (production=${isProduction})`);
  
  // Method 0: Check for PRODUCTION_DATABASE_URL override (highest priority for production)
  // This allows manual configuration when the platform doesn't provide the correct URL
  if (isProduction && process.env.PRODUCTION_DATABASE_URL) {
    try {
      const urlObj = new URL(process.env.PRODUCTION_DATABASE_URL);
      console.log(`[DB] Using PRODUCTION_DATABASE_URL override: host=${urlObj.hostname}`);
    } catch (e) {
      console.log(`[DB] Using PRODUCTION_DATABASE_URL override`);
    }
    return process.env.PRODUCTION_DATABASE_URL;
  }
  
  // Method 1: Try to construct URL from individual PG* environment variables
  // Skip if PGHOST is 'helium' in production (that's the dev proxy which won't work)
  const pgHost = process.env.PGHOST;
  const pgUser = process.env.PGUSER;
  const pgPassword = process.env.PGPASSWORD;
  const pgDatabase = process.env.PGDATABASE;
  const pgPort = process.env.PGPORT || "5432";
  
  const isDevProxy = pgHost === 'helium';
  if (pgHost && pgUser && pgPassword && pgDatabase && !(isProduction && isDevProxy)) {
    const isNeon = pgHost.includes('neon.tech') || pgHost.includes('aws.neon.tech');
    const sslParam = isNeon ? '?sslmode=require' : '';
    const constructedUrl = `postgresql://${pgUser}:${pgPassword}@${pgHost}:${pgPort}/${pgDatabase}${sslParam}`;
    console.log(`[DB] Using constructed URL from PG* vars: host=${pgHost}, database=${pgDatabase}`);
    return constructedUrl;
  } else if (isProduction && isDevProxy) {
    console.log(`[DB] Skipping PGHOST=helium in production (dev proxy won't work)`);
  }
  
  // Method 2: For production, check /tmp/replitdb
  if (isProduction) {
    const replitDbPath = "/tmp/replitdb";
    if (fs.existsSync(replitDbPath)) {
      const dbUrl = fs.readFileSync(replitDbPath, "utf-8").trim();
      if (dbUrl && isValidPostgresUrl(dbUrl)) {
        try {
          const urlObj = new URL(dbUrl);
          console.log(`[DB] Using /tmp/replitdb: host=${urlObj.hostname}, database=${urlObj.pathname.slice(1)}`);
        } catch (e) {
          console.log(`[DB] Using /tmp/replitdb`);
        }
        return dbUrl;
      } else if (dbUrl) {
        try {
          const urlObj = new URL(dbUrl);
          console.error(`[DB] ERROR: /tmp/replitdb contains non-PostgreSQL URL: host=${urlObj.hostname}`);
          console.error(`[DB] This looks like a Replit KV store URL, not PostgreSQL.`);
          console.error(`[DB] Please set PRODUCTION_DATABASE_URL secret with your Neon PostgreSQL URL.`);
        } catch (e) {
          console.error(`[DB] ERROR: /tmp/replitdb contains invalid URL`);
        }
      }
    }
  }
  
  // Method 3: Check DATABASE_URL environment variable
  if (process.env.DATABASE_URL && isValidPostgresUrl(process.env.DATABASE_URL)) {
    try {
      const urlObj = new URL(process.env.DATABASE_URL);
      console.log(`[DB] Using DATABASE_URL env: host=${urlObj.hostname}, database=${urlObj.pathname.slice(1)}`);
    } catch (e) {
      console.log(`[DB] Using DATABASE_URL env`);
    }
    return process.env.DATABASE_URL;
  }
  
  // Method 4: For development, use DATABASE_URL even if not validated (internal proxy)
  if (!isProduction && process.env.DATABASE_URL) {
    console.log(`[DB] Using DATABASE_URL (dev internal proxy)`);
    return process.env.DATABASE_URL;
  }
  
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database? " +
    "For production, you may need to set PRODUCTION_DATABASE_URL secret with your Neon PostgreSQL connection string."
  );
}

const databaseUrl = getDatabaseUrl();
export const pool = new Pool({ connectionString: databaseUrl });
export const db = drizzle({ client: pool, schema });
