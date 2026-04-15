"use client";

import { createClient } from "@/lib/supabase/client";
import { useState } from "react";

export function useGoogleAuth() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signInWithGoogle(next?: string | null) {
    try {
      setIsLoading(true);
      setError(null);

      const supabase = createClient();

      // Build absolute redirect URL for OAuth callback.
      // NOTE: We keep redirectTo free of query params so it matches Supabase's
      // allowed redirect URLs exactly. The `next` destination is stashed in a
      // short-lived cookie that the callback route reads after code exchange.
      const safeNext =
        next && next.startsWith("/") && !next.startsWith("//") ? next : null;
      if (safeNext && typeof document !== "undefined") {
        document.cookie = `auth_next=${encodeURIComponent(safeNext)}; path=/; SameSite=Lax; max-age=300`;
      }
      const redirectTo =
        typeof window !== "undefined"
          ? `${window.location.protocol}//${window.location.host}/auth/callback`
          : "/auth/callback";

      console.log("Initiating OAuth with redirectTo:", redirectTo);

      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      });

      if (oauthError) {
        console.error("OAuth initiation error:", oauthError);
        setError(oauthError.message);
        setIsLoading(false);
      }
      // Note: On success, the page redirects so we don't reset isLoading
    } catch (err) {
      console.error("Failed to initialize Supabase client:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Failed to initialize authentication client"
      );
      setIsLoading(false);
    }
  }

  return { signInWithGoogle, isLoading, error, setError };
}
