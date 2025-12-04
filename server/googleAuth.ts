import passport from "passport";
import { Strategy as GoogleStrategy, Profile } from "passport-google-oauth20";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import connectPg from "connect-pg-simple";
import fs from "fs";
import { storage } from "./storage";

function getDatabaseUrl(): string {
  // For published apps, check /tmp/replitdb first
  const replitDbPath = "/tmp/replitdb";
  if (fs.existsSync(replitDbPath)) {
    const dbUrl = fs.readFileSync(replitDbPath, "utf-8").trim();
    if (dbUrl) {
      return dbUrl;
    }
  }
  return process.env.DATABASE_URL || "";
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
  
  await storage.upsertUser({
    id: profile.id,
    email,
    firstName,
    lastName,
    profileImageUrl,
  });
  
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
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  const clientID = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  
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

  app.get("/api/login", passport.authenticate("google", {
    scope: ["profile", "email"],
  }));

  app.get("/api/auth/google/callback", 
    passport.authenticate("google", {
      successRedirect: "/interview.html",
      failureRedirect: "/login.html?error=auth_failed",
    })
  );

  app.get("/api/logout", (req, res) => {
    req.logout(() => {
      res.redirect("/");
    });
  });
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
