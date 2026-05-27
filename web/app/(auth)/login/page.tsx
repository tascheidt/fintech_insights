/**
 * LoginPage — editorial split layout per design system.
 *
 * Visual contract:
 * - Left panel: form, max 380px, white card surface.
 * - Right aside: gradient-coast bleed with frosted pull-quote from this week's digest.
 *   On screens < 880px, aside collapses (hidden) and form fills the viewport.
 * - Hero headline: Fraunces 44px, tight tracking, max-width 11ch.
 *
 * Auth: Google OAuth (useGoogleAuth) + email/password (useEmailAuth).
 * Mode (`log in` vs `sign up`) is driven by `?mode=signup` so it's deep-linkable
 * from the marketing CTA and the AuthHeader's "Get started" button.
 */

"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useGoogleAuth } from "@/hooks/use-google-auth";
import { useEmailAuth } from "@/hooks/use-email-auth";
import {
  firstZodError,
  signInSchema,
  signUpSchema,
} from "@/lib/auth/validation";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";

// Google brand colors are vendor-required and must not be tokenized — Google's
// brand guidelines mandate the exact hex values when displaying their mark.
/* eslint-disable design-system/no-raw-color */
function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}
/* eslint-enable design-system/no-raw-color */

type Mode = "login" | "signup";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mode: Mode = searchParams.get("mode") === "signup" ? "signup" : "login";
  const nextPath = searchParams.get("next");

  const google = useGoogleAuth();
  const email = useEmailAuth();

  const [fullName, setFullName] = useState("");
  const [emailValue, setEmailValue] = useState("");
  const [password, setPassword] = useState("");
  const [pendingConfirmEmail, setPendingConfirmEmail] = useState<string | null>(null);

  // URL-encoded ?error= from /auth/callback. Surfaces in either hook's error state.
  useEffect(() => {
    const errorParam = searchParams.get("error");
    if (errorParam) {
      google.setError(decodeURIComponent(errorParam));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Clear the form-level error when the user toggles mode.
  useEffect(() => {
    email.setError(null);
    google.setError(null);
    setPendingConfirmEmail(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const displayedError = email.error ?? google.error;
  const busy = email.isLoading || google.isLoading;

  const headline = useMemo(
    () => (mode === "signup" ? "Get started in seconds." : "Decode hiring strategy."),
    [mode],
  );
  const subhead = useMemo(
    () =>
      mode === "signup"
        ? "Create your account to read the weekly briefing on fintech hiring."
        : "A weekly analyst briefing on fintech hiring — read the moves before the market does.",
    [mode],
  );

  function switchMode(next: Mode) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "signup") params.set("mode", "signup");
    else params.delete("mode");
    const query = params.toString();
    router.replace(query ? `/login?${query}` : "/login");
  }

  async function handleEmailSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (mode === "signup") {
      const parsed = signUpSchema.safeParse({
        fullName,
        email: emailValue,
        password,
      });
      if (!parsed.success) {
        email.setError(firstZodError(parsed.error));
        return;
      }
      const result = await email.signUp(
        parsed.data.email,
        parsed.data.password,
        parsed.data.fullName,
        nextPath,
      );
      if (result.ok && result.needsConfirmation) {
        setPendingConfirmEmail(parsed.data.email);
      } else if (result.ok) {
        // Email confirmation disabled in Supabase — session is live, hard nav.
        window.location.assign(nextPath && nextPath.startsWith("/") ? nextPath : "/dashboard");
      }
    } else {
      const parsed = signInSchema.safeParse({ email: emailValue, password });
      if (!parsed.success) {
        email.setError(firstZodError(parsed.error));
        return;
      }
      await email.signIn(parsed.data.email, parsed.data.password, nextPath);
    }
  }

  return (
    <main className="min-h-[100svh] grid grid-cols-1 md:grid-cols-[minmax(380px,1fr)_minmax(0,1.1fr)]">
      {/* Form panel */}
      <section className="flex items-center justify-center px-6 py-12 md:px-12">
        <div className="w-full max-w-[420px] space-y-7">
          <div className="space-y-3">
            <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-primary">
              The Fintech Talent Brief
            </p>
            <h1 className="font-display font-semibold text-[44px] tracking-[-0.022em] leading-[1.08] max-w-[11ch] text-foreground">
              {headline}
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-[36ch]">
              {subhead}
            </p>
          </div>

          {/* Mode toggle */}
          <div className="inline-flex items-center gap-1 rounded-full border border-border bg-card p-1 text-xs font-medium">
            <button
              type="button"
              onClick={() => switchMode("login")}
              className={
                "h-7 rounded-full px-4 transition-colors " +
                (mode === "login"
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground")
              }
              aria-pressed={mode === "login"}
            >
              Log in
            </button>
            <button
              type="button"
              onClick={() => switchMode("signup")}
              className={
                "h-7 rounded-full px-4 transition-colors " +
                (mode === "signup"
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground")
              }
              aria-pressed={mode === "signup"}
            >
              Sign up
            </button>
          </div>

          {pendingConfirmEmail ? (
            <div
              className="rounded-md border border-border bg-card px-4 py-3 text-sm text-foreground"
              role="status"
            >
              <p className="font-semibold mb-1">Check your email.</p>
              <p className="text-muted-foreground">
                We sent a confirmation link to{" "}
                <span className="text-foreground font-medium">{pendingConfirmEmail}</span>.
                Click it to finish creating your account.
              </p>
            </div>
          ) : (
            <>
              {displayedError && (
                <div
                  className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive"
                  role="alert"
                >
                  <span className="font-semibold">Error:</span> {displayedError}
                </div>
              )}

              <Button
                variant="outline"
                size="lg"
                onClick={() => google.signInWithGoogle(nextPath)}
                disabled={busy}
                className="h-11 w-full text-sm gap-2"
              >
                <GoogleIcon className="h-4 w-4" />
                Continue with Google
              </Button>

              <div className="flex items-center gap-3 text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                <span>or continue with email</span>
                <span className="h-px flex-1 bg-border" />
              </div>

              <form onSubmit={handleEmailSubmit} className="space-y-4">
                {mode === "signup" && (
                  <div className="space-y-1.5">
                    <label htmlFor="fullName" className="text-xs font-medium text-foreground">
                      Full name
                    </label>
                    <Input
                      id="fullName"
                      type="text"
                      autoComplete="name"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      disabled={busy}
                    />
                  </div>
                )}

                <div className="space-y-1.5">
                  <label htmlFor="email" className="text-xs font-medium text-foreground">
                    Email
                  </label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={emailValue}
                    onChange={(e) => setEmailValue(e.target.value)}
                    disabled={busy}
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label htmlFor="password" className="text-xs font-medium text-foreground">
                      Password
                    </label>
                    {mode === "login" && (
                      <Link
                        href="/forgot-password"
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        Forgot?
                      </Link>
                    )}
                  </div>
                  <Input
                    id="password"
                    type="password"
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={busy}
                  />
                  {mode === "signup" && (
                    <p className="text-[11px] text-muted-foreground">
                      At least 8 characters, with a letter and a number.
                    </p>
                  )}
                </div>

                <Button
                  type="submit"
                  size="lg"
                  disabled={busy}
                  className="h-11 w-full text-sm gap-2"
                >
                  {busy ? (
                    "Working…"
                  ) : (
                    <>
                      {mode === "signup" ? "Create account" : "Log in"}
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </Button>
              </form>

              <p className="text-xs text-muted-foreground text-center">
                Free for teams. No credit card required.
              </p>
            </>
          )}
        </div>
      </section>

      {/* Editorial aside — hidden on narrow viewports */}
      <aside
        aria-hidden
        className="hidden md:flex relative items-center justify-center px-12 py-12 overflow-hidden"
        style={{ background: "var(--gradient-coast)" }}
      >
        <div className="relative max-w-[460px] rounded-[18px] border border-border bg-card/60 backdrop-blur-md p-8 shadow-sm">
          <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-primary mb-4">
            From this week&apos;s digest
          </p>
          <p className="font-display text-[22px] leading-[1.32] tracking-[-0.012em] text-foreground">
            “Five fintechs quietly built compliance teams this week. The pattern says more about regulator pressure than the companies do.”
          </p>
          <p className="mt-6 font-mono text-[11px] tracking-[0.02em] text-muted-foreground">
            5 companies · 47 active roles · Updated weekly
          </p>
        </div>
      </aside>
    </main>
  );
}
