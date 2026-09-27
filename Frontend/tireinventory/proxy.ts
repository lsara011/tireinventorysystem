import { type NextRequest, NextResponse } from "next/server";

const validSessionTtlMs = 30_000;
const invalidSessionTtlMs = 5_000;
const maxCachedSessions = 500;
const sessionCache = new Map<string, { valid: boolean; expiresAt: number }>();
const pendingValidations = new Map<string, Promise<boolean>>();

function tokenExpiration(token: string) {
  try {
    const payload = token.split(".")[1];
    if (!payload) return 0;
    const normalized = payload.replaceAll("-", "+").replaceAll("_", "/");
    const decoded = JSON.parse(atob(normalized)) as { exp?: unknown };
    return typeof decoded.exp === "number" ? decoded.exp * 1000 : 0;
  } catch {
    return 0;
  }
}

async function sessionIsValid(token: string) {
  const now = Date.now();
  const tokenExpiresAt = tokenExpiration(token);
  if (tokenExpiresAt <= now) return false;

  const cached = sessionCache.get(token);
  if (cached && cached.expiresAt > now) return cached.valid;

  const pending = pendingValidations.get(token);
  if (pending) return pending;

  const apiUrl = process.env.API_URL;
  if (!apiUrl) return false;

  const validation = (async () => {
    let valid = false;
    try {
      const response = await fetch(`${apiUrl.replace(/\/$/, "")}/auth/verify`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
        signal: AbortSignal.timeout(5_000),
      });
      valid = response.ok;
    } catch {
      valid = false;
    }

    if (sessionCache.size >= maxCachedSessions) {
      sessionCache.delete(sessionCache.keys().next().value ?? "");
    }
    sessionCache.set(token, {
      valid,
      expiresAt: Math.min(
        tokenExpiresAt,
        Date.now() + (valid ? validSessionTtlMs : invalidSessionTtlMs),
      ),
    });
    return valid;
  })();

  pendingValidations.set(token, validation);
  try {
    return await validation;
  } finally {
    pendingValidations.delete(token);
  }
}

export async function proxy(request: NextRequest) {
  const token = request.cookies.get("tis_access_token")?.value;
  const isLoginPage = request.nextUrl.pathname === "/login";

  if (!token) {
    return isLoginPage
      ? NextResponse.next()
      : NextResponse.redirect(new URL("/login", request.url));
  }

  const valid = await sessionIsValid(token);
  if (valid) {
    return isLoginPage
      ? NextResponse.redirect(new URL("/", request.url))
      : NextResponse.next();
  }

  const response = isLoginPage
    ? NextResponse.next()
    : NextResponse.redirect(new URL("/login", request.url));
  response.cookies.delete("tis_access_token");
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/auth/login|api/auth/logout).*)",
  ],
};
