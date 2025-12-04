import passport from "passport";
import { Strategy as GoogleStrategy, Profile } from "passport-google-oauth20";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import connectPg from "connect-pg-simple";
import fs from "fs";
import { storage } from "./storage";

function getDatabaseUrl(): string {
  // Try DATABASE_URL environment variable first (works in both dev and production)
  if (process.env.DATABASE_URL) {
    console.log("[Session] Using DATABASE_URL env for session store");
    return process.env.DATABASE_URL;
  }
  
  // For published apps, check /tmp/replitdb as fallback
  const replitDbPath = "/tmp/replitdb";
  if (fs.existsSync(replitDbPath)) {
    const dbUrl = fs.readFileSync(replitDbPath, "utf-8").trim();
    if (dbUrl) {
      console.log("[Session] Using /tmp/replitdb for session store");
      return dbUrl;
    }
  }
  
  console.warn("[Session] No database URL found for session store");
  return "";
}

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: getDatabaseUrl(),
    createTableIfMissing: true,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  const isProduction = process.env.NODE_ENV === 'production';
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: isProduction,
      maxAge: sessionTtl,
    },
  });
}

interface UserSession {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  profileImageUrl: string | null;
  claims: {
    sub: string;
    email: string;
  };
}

async function upsertUser(profile: Profile): Promise<UserSession> {
  const email = profile.emails?.[0]?.value || "";
  const firstName = profile.name?.givenName || "";
  const lastName = profile.name?.familyName || "";
  const profileImageUrl = profile.photos?.[0]?.value || null;
  
  console.log(`[Auth] upsertUser called for email=${email}, id=${profile.id}`);
  
  try {
    await storage.upsertUser({
      id: profile.id,
      email,
      firstName,
      lastName,
      profileImageUrl,
    });
    console.log(`[Auth] upsertUser succeeded for email=${email}`);
  } catch (error: any) {
    console.error(`[Auth] upsertUser FAILED for email=${email}`);
    console.error(`[Auth] Error name: ${error.name}`);
    console.error(`[Auth] Error message: ${error.message}`);
    console.error(`[Auth] Error stack: ${error.stack}`);
    if (error.response) {
      console.error(`[Auth] Error response status: ${error.response.status}`);
      console.error(`[Auth] Error response data: ${JSON.stringify(error.response.data)}`);
    }
    throw error;
  }
  
  return {
    id: profile.id,
    email,
    firstName,
    lastName,
    profileImageUrl,
    claims: {
      sub: profile.id,
      email,
    },
  };
}

export async function setupAuth(app: Express) {
  console.log("[Auth] Setting up Google OAuth...");
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  const clientID = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  console.log(`[Auth] GOOGLE_CLIENT_ID present: ${!!clientID}`);
  console.log(`[Auth] GOOGLE_CLIENT_SECRET present: ${!!clientSecret}`);
  
  if (!clientID || !clientSecret) {
    console.warn("⚠️  GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET not set. Google auth will not work.");
    console.warn("   Add these environment variables to enable Google SSO.");
    
    app.get("/api/login", (req, res) => {
      res.redirect("/login.html?error=not_configured");
    });
    
    app.get("/api/auth/google/callback", (req, res) => {
      res.redirect("/login.html?error=not_configured");
    });
    
    app.get("/api/logout", (req, res) => {
      req.logout(() => {
        res.redirect("/");
      });
    });
    
    return;
  }

  passport.use(
    new GoogleStrategy(
      {
        clientID,
        clientSecret,
        callbackURL: "/api/auth/google/callback",
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const user = await upsertUser(profile);
          done(null, user);
        } catch (error) {
          done(error as Error);
        }
      }
    )
  );

  passport.serializeUser((user: Express.User, cb) => cb(null, user));
  passport.deserializeUser((user: Express.User, cb) => cb(null, user));

  console.log("[Auth] Registering /api/login route");
  app.get("/api/login", passport.authenticate("google", {
    scope: ["profile", "email"],
  }));

  console.log("[Auth] Registering /api/auth/google/callback route");
  app.get("/api/auth/google/callback", 
    passport.authenticate("google", {
      successRedirect: "/interview.html",
      failureRedirect: "/login.html?error=auth_failed",
    })
  );

  console.log("[Auth] Registering /api/logout route");
  app.get("/api/logout", (req, res) => {
    req.logout(() => {
      res.redirect("/");
    });
  });
  
  console.log("[Auth] Google OAuth setup complete");
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  return next();
};

export const optionalAuth: RequestHandler = async (req, res, next) => {
  return next();
};
