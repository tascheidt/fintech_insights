"use client";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Search,
  Brain,
  TrendingUp,
  Clock,
  ArrowRight,
  Sparkles,
} from "lucide-react";

/**
 * Feature data for the landing page highlights section
 * Each feature represents a key value proposition of the platform
 */
const features = [
  {
    icon: Search,
    title: "Automated Job Tracking",
    description:
      "Monitor competitor job postings across multiple ATS platforms in real-time. Never miss a strategic hire.",
  },
  {
    icon: Brain,
    title: "AI-Powered Insights",
    description:
      "Gemini-powered analysis extracts strategic signals from hiring patterns and job descriptions.",
  },
  {
    icon: TrendingUp,
    title: "Market Signals",
    description:
      "Identify expansion plans, technology shifts, and organizational changes before they're announced.",
  },
  {
    icon: Clock,
    title: "Historical Trends",
    description:
      "Track hiring velocity, team growth, and role evolution over time to spot long-term patterns.",
  },
];

/**
 * FeatureCard Component
 * Displays a single feature with icon, title, and description
 * Includes hover animations and gradient accent
 */
function FeatureCard({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Search;
  title: string;
  description: string;
}) {
  return (
    <div
      className="group relative rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm transition-all duration-300 hover:border-white/20 hover:bg-white/10"
      role="article"
    >
      {/* Gradient accent on hover */}
      <div
        className="absolute inset-0 rounded-xl bg-linear-to-br from-blue-500/10 via-transparent to-purple-500/10 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        aria-hidden="true"
      />

      <div className="relative">
        {/* Icon container with gradient background */}
        <div className="mb-4 inline-flex rounded-lg bg-linear-to-br from-blue-500/20 to-cyan-500/20 p-3">
          <Icon
            className="h-6 w-6 text-blue-400"
            aria-hidden="true"
          />
        </div>

        <h3 className="mb-2 text-lg font-semibold text-white">{title}</h3>
        <p className="text-sm leading-relaxed text-slate-400">{description}</p>
      </div>
    </div>
  );
}

/**
 * Google Icon SVG Component
 * Standard Google "G" logo for the sign-in button
 */
function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

/**
 * LoginPage - Main landing page component
 *
 * Serves as both the landing page and authentication entry point.
 * Features:
 * - Hero section with compelling headline and value proposition
 * - Feature highlights showcasing platform capabilities
 * - Unified Google sign-in flow (handles both new and existing users)
 * - Error handling for OAuth failures
 * - Fully responsive design with accessibility support
 */
export default function LoginPage() {
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Check for OAuth error parameters in URL
  useEffect(() => {
    const errorParam = searchParams.get("error");
    if (errorParam) {
      setError(decodeURIComponent(errorParam));
    }
  }, [searchParams]);

  /**
   * Initiates Google OAuth sign-in flow
   * Handles both new user registration and existing user login
   * Supabase automatically creates accounts for new users
   */
  async function signInWithGoogle() {
    try {
      setIsLoading(true);
      setError(null);

      const supabase = createClient();

      // Build absolute redirect URL for OAuth callback
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

  return (
    <main className="flex flex-col items-center">
      {/* ============================================
          HERO SECTION
          Compelling headline and value proposition
          ============================================ */}
      <section
        className="mb-12 text-center sm:mb-16"
        aria-labelledby="hero-heading"
      >
        {/* Badge */}
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-4 py-2 text-sm text-blue-300">
          <Sparkles className="h-4 w-4" aria-hidden="true" />
          <span>AI-Powered Competitive Intelligence</span>
        </div>

        {/* Main headline with gradient text */}
        <h1
          id="hero-heading"
          className="mb-6 text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl"
        >
          Track Your Competitors&apos;{" "}
          <span className="bg-linear-to-r from-blue-400 via-cyan-400 to-emerald-400 bg-clip-text text-transparent">
            Moves
          </span>
          <br />
          Before They Happen
        </h1>

        {/* Subheadline - value proposition */}
        <p className="mx-auto max-w-2xl text-lg text-slate-400 sm:text-xl">
          Transform job postings into strategic intelligence. Monitor fintech
          competitors, decode hiring signals, and stay ahead of market shifts
          with AI-powered analysis.
        </p>
      </section>

      {/* ============================================
          FEATURES SECTION
          Key platform capabilities in a grid layout
          ============================================ */}
      <section
        className="mb-12 w-full sm:mb-16"
        aria-labelledby="features-heading"
      >
        <h2 id="features-heading" className="sr-only">
          Platform Features
        </h2>

        <div className="grid gap-4 sm:grid-cols-2 lg:gap-6">
          {features.map((feature) => (
            <FeatureCard
              key={feature.title}
              icon={feature.icon}
              title={feature.title}
              description={feature.description}
            />
          ))}
        </div>
      </section>

      {/* ============================================
          SIGN-IN SECTION
          Google OAuth with unified flow messaging
          ============================================ */}
      <section
        className="w-full max-w-md text-center"
        aria-labelledby="signin-heading"
      >
        <h2 id="signin-heading" className="sr-only">
          Sign In
        </h2>

        {/* Sign-in card */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-8 backdrop-blur-sm">
          {/* Error message display */}
          {error && (
            <div
              className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-left text-sm text-red-300"
              role="alert"
            >
              <strong className="font-semibold">Authentication Error:</strong>{" "}
              {error}
            </div>
          )}

          {/* Call to action text */}
          <p className="mb-6 text-slate-300">
            Get started in seconds with your Google account
          </p>

          {/* Google sign-in button */}
          <Button
            onClick={signInWithGoogle}
            disabled={isLoading}
            className="w-full gap-3 bg-white py-6 text-base font-medium text-slate-900 transition-all duration-200 hover:bg-slate-100 disabled:opacity-70"
            aria-label="Sign in with Google"
          >
            {isLoading ? (
              <>
                <div
                  className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900"
                  aria-hidden="true"
                />
                <span>Connecting...</span>
              </>
            ) : (
              <>
                <GoogleIcon className="h-5 w-5" />
                <span>Continue with Google</span>
                <ArrowRight className="ml-auto h-4 w-4" aria-hidden="true" />
              </>
            )}
          </Button>

          {/* Helper text explaining unified flow */}
          <p className="mt-4 text-xs text-slate-500">
            New users are automatically registered. By continuing, you agree to
            our terms of service.
          </p>
        </div>

        {/* Trust indicator */}
        <p className="mt-8 text-sm text-slate-500">
          Trusted by fintech teams tracking market intelligence
        </p>
      </section>
    </main>
  );
}
