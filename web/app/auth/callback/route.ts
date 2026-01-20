import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error_description = searchParams.get("error_description");
  const error_code = searchParams.get("error");
  const next = searchParams.get("next") ?? "/";
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
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=no_code`);
}
