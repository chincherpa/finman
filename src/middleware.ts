import { NextResponse, type NextRequest } from "next/server";

/**
 * HTTP Basic Auth in front of everything (pages, server actions, /api/backup, /api/export/*).
 *
 *   FINMAN_PASSWORD  required in production – without it every request is refused (fail closed)
 *   FINMAN_USER      optional, default "finman"
 *
 * In development (`next dev`) the check is skipped when no password is set.
 */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function middleware(req: NextRequest) {
  const password = process.env.FINMAN_PASSWORD;
  if (!password) {
    if (process.env.NODE_ENV !== "production") return NextResponse.next();
    return new NextResponse("FINMAN_PASSWORD ist nicht gesetzt – Zugriff gesperrt.", { status: 503 });
  }
  const user = process.env.FINMAN_USER || "finman";
  const header = req.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    try {
      const decoded = atob(header.slice(6));
      const i = decoded.indexOf(":");
      if (i >= 0 && safeEqual(decoded.slice(0, i), user) && safeEqual(decoded.slice(i + 1), password)) {
        return NextResponse.next();
      }
    } catch {
      /* fall through */
    }
  }
  return new NextResponse("Anmeldung erforderlich.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="finman", charset="UTF-8"' },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
