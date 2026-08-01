import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { fetchWithRetry } from "@/lib/supabase/fetch-retry";

// Paths the unauthenticated user is allowed to reach. /account/update-password is
// here because the reset-link flow lands the user with a fresh session that the
// page itself reads; the page guards against missing sessions inline.
const PUBLIC_PATHS = new Set([
  "/login",
  "/forgot-password",
  "/account/update-password",
]);

// Path prefixes readable without a session. `/r/` serves shared search reports
// (`app/(public)/r/[token]`): the token in the URL is the capability, the page
// renders only that report's own snapshot, and every link out of it goes to
// /login. Keep this list short — a prefix is a hole in the auth boundary, so a
// new entry needs the same "capability in the URL, no live queries" property.
const PUBLIC_PREFIXES = ["/r/"];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Skip auth for API and auth callback routes
  if (pathname.startsWith("/api") || pathname.startsWith("/auth")) {
    return NextResponse.next({ request });
  }

  const response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        fetch: fetchWithRetry,
      },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isPublicPath(pathname)) {
    // Preserve the original destination so that links from emails (and
    // any other deep link) land where the user intended after logging in.
    const loginUrl = new URL("/login", request.url);
    const destination = `${pathname}${request.nextUrl.search}`;
    if (destination && destination !== "/") {
      loginUrl.searchParams.set("next", destination);
    }
    return NextResponse.redirect(loginUrl);
  }

  if (user && (pathname === "/login" || pathname === "/forgot-password")) {
    const next = request.nextUrl.searchParams.get("next");
    const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
    return NextResponse.redirect(new URL(safeNext, request.url));
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
