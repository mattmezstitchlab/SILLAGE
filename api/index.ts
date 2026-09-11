/**
 * Vercel Serverless Function entrypoint for the API.
 *
 * The Express app built by `@workspace/api-server` is exported directly as the
 * handler: Vercel calls it per request, so unlike `src/index.ts` (the
 * long-running Replit/container entrypoint) nothing here reads PORT or calls
 * `listen()`.
 *
 * `vercel.json` rewrites every `/api/*` request to this function while keeping
 * the original path, so the `app.use("/api", router)` mount in `app.ts` keeps
 * matching — including the Clerk frontend proxy at `/api/__clerk`.
 */
import app from "../artifacts/api-server/src/app";

export default app;
