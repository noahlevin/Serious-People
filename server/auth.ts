import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { Pool } from "pg";
import type { Express, RequestHandler } from "express";
import { storage } from "./storage";
import type { User } from "@shared/schema";

declare global {
  namespace Express {
    interface User {
      id: string;
      email: string | null;
      name: string | null;
    }
  }
}

const PgSession = connectPgSimple(session);

function getBaseUrl(): string {
  if (process.env.BASE_URL) {
    return process.env.BASE_URL;
  }
  if (process.env.REPLIT_DEV_DOMAIN) {
    return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  }
  // For production, fallback to current request origin if available
  // Otherwise use localhost for local development
  return "http://localhost:5000";
}

export function setupAuth(app: Express): void {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  app.use(
    session({
      store: new PgSession({
        pool,
        tableName: "sessions",
        createTableIfMissing: false,
      }),
      secret: process.env.SESSION_SECRET || "serious-people-dev-secret",
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: process.env.NODE_ENV === "production",
        httpOnly: true,
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        sameSite: "lax",
      },
    })
  );

  app.use(passport.initialize());
  app.use(passport.session());

  passport.serializeUser((user: Express.User, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await storage.getUser(id);
      if (user) {
        done(null, { id: user.id, email: user.email, name: user.name });
      } else {
        done(null, false);
      }
    } catch (err) {
      done(err);
    }
  });

  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          callbackURL: `${getBaseUrl()}/auth/google/callback`,
          scope: ["email", "profile"],
        },
        async (accessToken, refreshToken, profile, done) => {
          try {
            const email = profile.emails?.[0]?.value;
            const name = profile.displayName || profile.name?.givenName || null;

            let user = await storage.getUserByOAuth("google", profile.id);

            if (!user && email) {
              user = await storage.getUserByEmail(email);
              if (user) {
                user = await storage.updateUser(user.id, {
                  oauthProvider: "google",
                  oauthId: profile.id,
                  name: name || user.name,
                });
              }
            }

            if (!user) {
              user = await storage.createUser({
                email: email || null,
                name,
                oauthProvider: "google",
                oauthId: profile.id,
              });
            }

            done(null, { id: user!.id, email: user!.email, name: user!.name });
          } catch (err) {
            done(err as Error);
          }
        }
      )
    );
  }
}

export const requireAuth: RequestHandler = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: "Authentication required" });
};

export const optionalAuth: RequestHandler = (req, res, next) => {
  next();
};
