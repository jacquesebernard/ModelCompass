import { createApp } from "../server/app";

// Vercel invokes this app directly; server/index.ts remains the local listener.
export default createApp(undefined, undefined, { production: true });
