import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import fs from "fs";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

function getDatabaseUrl(): string {
  // For published apps, check /tmp/replitdb first
  const replitDbPath = "/tmp/replitdb";
  if (fs.existsSync(replitDbPath)) {
    const dbUrl = fs.readFileSync(replitDbPath, "utf-8").trim();
    if (dbUrl) {
      console.log("Using DATABASE_URL from /tmp/replitdb");
      return dbUrl;
    }
  }
  
  // Fall back to environment variable
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }
  
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const databaseUrl = getDatabaseUrl();
export const pool = new Pool({ connectionString: databaseUrl });
export const db = drizzle({ client: pool, schema });
