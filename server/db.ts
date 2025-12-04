import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";
import fs from "fs";

const { Pool } = pg;

function getDatabaseUrl(): string {
  // Check environment variable first
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }
  
  // Check for production database file (Replit deployments)
  try {
    const replitDbPath = "/tmp/replitdb";
    if (fs.existsSync(replitDbPath)) {
      return fs.readFileSync(replitDbPath, "utf-8").trim();
    }
  } catch (e) {
    // File doesn't exist or can't be read
  }
  
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const databaseUrl = getDatabaseUrl();
export const pool = new Pool({ connectionString: databaseUrl });
export const db = drizzle(pool, { schema });
