import type { Express, RequestHandler } from "express";
import { isIP } from "node:net";

const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
function hostname(authority: string): string | null {
  if (!authority || /[\s/@\\?#,]/.test(authority)) return null;
  try {
    return new URL(`http://${authority}`).hostname.toLowerCase();
  } catch {
    return null;
  }
}
export function allowedHost(authority: string, bindHost: string): boolean {
  const host = hostname(authority);
  const configured = hostname(
    isIP(bindHost) === 6 ? `[${bindHost}]` : bindHost,
  );
  return (
    host !== null &&
    (loopbackHosts.has(host) ||
      (!!configured &&
        !["0.0.0.0", "[::]"].includes(configured) &&
        host === configured))
  );
}
export function secureProviderURL(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      (url.protocol === "https:" ||
        (url.protocol === "http:" && loopbackHosts.has(url.hostname)))
    );
  } catch {
    return false;
  }
}
export function installSecurity(
  app: Express,
  bindHost: string,
  production: boolean,
) {
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    res.set({
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "X-Frame-Options": "DENY",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
      "Content-Security-Policy": production
        ? "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
        : "object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    });
    if (!allowedHost(req.headers.host ?? "", bindHost))
      return res.status(403).json({ error: "Unrecognized host." });
    // Express routes are case-insensitive by default; the guard must match.
    const path = req.path.toLowerCase();
    if (path === "/api" || path.startsWith("/api/")) {
      res.set("Cache-Control", "no-store");
      const origin = req.headers.origin;
      // GET discovery/refresh paths also consume provider quota, so reject
      // cross-site browser requests regardless of method, even without Origin.
      if (
        ["cross-site", "same-site"].includes(
          String(req.headers["sec-fetch-site"]),
        ) ||
        (origin &&
          origin !== `http://${req.headers.host}` &&
          origin !== `https://${req.headers.host}`)
      )
        return res
          .status(403)
          .json({ error: "Cross-origin access is not allowed." });
      if (req.method === "POST" && !req.is("application/json"))
        return res.status(415).json({ error: "Use application/json." });
    }
    next();
  });
}

export function apiRateLimit(): RequestHandler {
  const windows = new Map<string, { at: number; count: number }>();
  return (req, res, next) => {
    const now = Date.now(),
      key = req.ip ?? "local";
    if (windows.size >= 1000)
      for (const [ip, window] of windows)
        if (now - window.at >= 60000) windows.delete(ip);
    const current = windows.get(key);
    if (
      (!current && windows.size >= 1000) ||
      (current && now - current.at < 60000 && current.count >= 100)
    )
      return res
        .status(429)
        .set("Retry-After", "60")
        .json({ error: "Too many requests. Try again in one minute." });
    if (!current || now - current.at >= 60000)
      windows.set(key, { at: now, count: 1 });
    else current.count++;
    next();
  };
}
export function concurrentRequests(limit: number): RequestHandler {
  let active = 0;
  return (_req, res, next) => {
    if (active >= limit)
      return res.status(429).set("Retry-After", "5").json({
        error: "The advisor is busy. Wait for a current request to finish.",
      });
    active++;
    let released = false;
    const release = () => {
      if (!released) {
        released = true;
        active--;
      }
    };
    res.once("finish", release);
    res.once("close", release);
    next();
  };
}
