/**
 * LoginPage — editorial split layout per design system.
 *
 * Visual contract:
 * - Left panel: form, max 380px, white card surface.
 * - Right aside: gradient-coast bleed with frosted pull-quote from this week's digest.
 *   On screens < 880px, aside collapses (hidden) and form fills the viewport.
 * - Hero headline: Fraunces 44px, tight tracking, max-width 11ch.
 *
 * Auth: keeps the existing Google OAuth Supabase logic intact via useGoogleAuth.
 * Pull-quote: server-fetched from the most recent published digest in a sibling
 * component (LoginAside). For now this renders a default editorial quote because
 * the route is currently a client component; promote to server fetch when we
 * convert the page.
 */

"use client";

import { Button } from "@/components/ui/button";
import { useGoogleAuth } from "@/hooks/use-google-auth";
import { useSearchParams } from "next/navigation";
import { useEffect } from "react";
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

export default function LoginPage() {
  const searchParams = useSearchParams();
  const { signInWithGoogle, isLoading, error, setError } = useGoogleAuth();
  const nextPath = searchParams.get("next");
  const handleSignIn = () => signInWithGoogle(nextPath);

  useEffect(() => {
    const errorParam = searchParams.get("error");
    if (errorParam) {
      setError(decodeURIComponent(errorParam));
    }
  }, [searchParams, setError]);

  return (
    <main className="min-h-[100svh] grid grid-cols-1 md:grid-cols-[minmax(380px,1fr)_minmax(0,1.1fr)]">
      {/* Form panel */}
      <section className="flex items-center justify-center px-6 py-12 md:px-12">
        <div className="w-full max-w-[420px] space-y-8">
          <div className="space-y-3">
            <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-primary">
              The Fintech Talent Brief
            </p>
            <h1 className="font-display font-semibold text-[44px] tracking-[-0.022em] leading-[1.08] max-w-[11ch] text-foreground">
              Decode hiring strategy.
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-[36ch]">
              A weekly analyst briefing on fintech hiring — read the moves before the market does.
            </p>
          </div>

          {error && (
            <div
              className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive"
              role="alert"
            >
              <span className="font-semibold">Error:</span> {error}
            </div>
          )}

          <div className="space-y-3">
            <Button
              size="lg"
              onClick={handleSignIn}
              disabled={isLoading}
              className="h-11 w-full text-sm gap-2"
            >
              {isLoading ? "Connecting…" : (
                <>
                  Get started free
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
            <Button
              variant="outline"
              size="lg"
              onClick={handleSignIn}
              disabled={isLoading}
              className="h-11 w-full text-sm gap-2"
            >
              <GoogleIcon className="h-4 w-4" />
              Continue with Google
            </Button>
            <p className="text-xs text-muted-foreground text-center pt-2">
              Free for teams. No credit card required.
            </p>
          </div>
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
