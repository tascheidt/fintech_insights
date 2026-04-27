import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error_description = searchParams.get("error_description");
  const error_code = searchParams.get("error");

  // `next` may arrive as a query param (legacy) or via the auth_next cookie
  // (set by use-google-auth before the OAuth redirect to keep redirectTo clean).
  const rawNext =
    searchParams.get("next") ??
    (() => {
      try {
        const encoded = request.headers
          .get("cookie")
          ?.split("; ")
          .find((c) => c.startsWith("auth_next="))
          ?.split("=")[1];
        return encoded ? decodeURIComponent(encoded) : null;
      } catch {
        return null;
      }
    })();

  // Only honor same-origin relative paths — never follow external URLs.
  // Default destination after sign-in is the dashboard; the marketing landing
  // at `/` would just bounce authenticated users back to `/dashboard`.
  const next =
    rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//")
      ? rawNext
      : "/dashboard";
  const origin = new URL(request.url).origin;

  // Handle OAuth errors from Supabase
  if (error_code || error_description) {
    console.error("OAuth error:", { error_code, error_description, origin });
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error_description || error_code || "auth_failed")}`
    );
  }

  if (code) {
    const supabase = await createClient();
    const { error, data } = await supabase.auth.exchangeCodeForSession(code);
    
    if (error) {
      console.error("Session exchange error:", {
        error: error.message,
        code: error.status,
        origin,
        url: request.url,
      });
      return NextResponse.redirect(
        `${origin}/login?error=${encodeURIComponent(error.message || "session_exchange_failed")}`
      );
    }

    if (data.session) {
      const response = NextResponse.redirect(`${origin}${next}`);
      response.cookies.delete("auth_next");
      return response;
    }
  }

  return NextResponse.redirect(`${origin}/login?error=no_code`);
}
