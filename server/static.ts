import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath));

  // Helper to check if request is for API/auth routes (should not be intercepted by SPA)
  function isApiOrAuthRoute(url: string): boolean {
    return url.startsWith("/api") || url.startsWith("/auth") || 
           url.startsWith("/app/api") || url.startsWith("/app/auth");
  }

  // Serve SPA at /app/* routes (Phase 5: optional /app mount)
  app.use("/app", (_req, res, next) => {
    if (isApiOrAuthRoute(_req.originalUrl)) {
      return next();
    }
    res.sendFile(path.resolve(distPath, "index.html"));
  });
  app.use("/app/*", (_req, res, next) => {
    if (isApiOrAuthRoute(_req.originalUrl)) {
      return next();
    }
    res.sendFile(path.resolve(distPath, "index.html"));
  });

  // fall through to index.html if the file doesn't exist (but not for API/auth routes)
  app.use("*", (_req, res, next) => {
    if (isApiOrAuthRoute(_req.originalUrl)) {
      return next();
    }
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
