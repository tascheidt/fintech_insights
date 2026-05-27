"use client";

import { createClient } from "@/lib/supabase/client";
import { useState } from "react";

function stashNextCookie(next?: string | null) {
  const safe = next && next.startsWith("/") && !next.startsWith("//") ? next : null;
  if (safe && typeof document !== "undefined") {
    document.cookie = `auth_next=${encodeURIComponent(safe)}; path=/; SameSite=Lax; max-age=300`;
  }
}

function callbackUrl(searchParams?: string) {
  if (typeof window === "undefined") return "/auth/callback";
  const base = `${window.location.protocol}//${window.location.host}/auth/callback`;
  return searchParams ? `${base}?${searchParams}` : base;
}

export function useEmailAuth() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn(email: string, password: string, next?: string | null) {
    try {
      setIsLoading(true);
      setError(null);
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) {
        setError(signInError.message);
        setIsLoading(false);
        return { ok: false as const };
      }
      const safeNext =
        next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
      window.location.assign(safeNext);
      return { ok: true as const };
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
      setIsLoading(false);
      return { ok: false as const };
    }
  }

  async function signUp(
    email: string,
    password: string,
    fullName: string,
    next?: string | null,
  ) {
    try {
      setIsLoading(true);
      setError(null);
      stashNextCookie(next);
      const supabase = createClient();
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
          emailRedirectTo: callbackUrl(),
        },
      });
      if (signUpError) {
        setError(signUpError.message);
        setIsLoading(false);
        return { ok: false as const, needsConfirmation: false };
      }
      // When email confirmation is required, Supabase returns a user but no session.
      const needsConfirmation = !data.session;
      setIsLoading(false);
      return { ok: true as const, needsConfirmation };
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-up failed");
      setIsLoading(false);
      return { ok: false as const, needsConfirmation: false };
    }
  }

  async function requestPasswordReset(email: string) {
    try {
      setIsLoading(true);
      setError(null);
      const supabase = createClient();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: callbackUrl("next=/account/update-password"),
      });
      if (resetError) {
        setError(resetError.message);
        setIsLoading(false);
        return { ok: false as const };
      }
      setIsLoading(false);
      return { ok: true as const };
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset request failed");
      setIsLoading(false);
      return { ok: false as const };
    }
  }

  async function updatePassword(password: string) {
    try {
      setIsLoading(true);
      setError(null);
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message);
        setIsLoading(false);
        return { ok: false as const };
      }
      setIsLoading(false);
      return { ok: true as const };
    } catch (err) {
      setError(err instanceof Error ? err.message : "Password update failed");
      setIsLoading(false);
      return { ok: false as const };
    }
  }

  return {
    signIn,
    signUp,
    requestPasswordReset,
    updatePassword,
    isLoading,
    error,
    setError,
  };
}
