import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/jwt";

/**
 * A cheap first gate: verify the session token's signature before a request
 * reaches a page, and send signed-out visitors to the login screen.
 *
 * This is convenience, not security. It never queries the database, so it
 * cannot know whether a membership was revoked a minute ago, and it only runs
 * for paths its matcher covers. Authorisation is re-checked with a live lookup
 * inside every route handler and server action that touches tenant data.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const session = await verifySession(
    request.cookies.get(SESSION_COOKIE)?.value,
  );

  if (!session) {
    const login = new URL("/login", request.url);
    if (pathname !== "/") login.searchParams.set("next", pathname);
    return NextResponse.redirect(login);
  }

  // Clients get the read-only surface only. Consultants and owners get both.
  if (session.role === "client" && !pathname.startsWith("/shared")) {
    return NextResponse.redirect(new URL("/shared", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/projects/:path*",
    "/shared/:path*",
    "/settings/:path*",
  ],
};
