import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { fetchWithRetry } from "@/lib/supabase/fetch-retry";

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

  if (!user && pathname !== "/login") {
    // Preserve the original destination so that links from emails (and
    // any other deep link) land where the user intended after logging in.
    const loginUrl = new URL("/login", request.url);
    const destination = `${pathname}${request.nextUrl.search}`;
    if (destination && destination !== "/") {
      loginUrl.searchParams.set("next", destination);
    }
    return NextResponse.redirect(loginUrl);
  }

  if (user && pathname === "/login") {
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
