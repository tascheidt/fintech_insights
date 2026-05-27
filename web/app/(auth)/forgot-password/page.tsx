"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEmailAuth } from "@/hooks/use-email-auth";
import { firstZodError, forgotPasswordSchema } from "@/lib/auth/validation";
import Link from "next/link";
import { useState } from "react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const { requestPasswordReset, isLoading, error, setError } = useEmailAuth();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = forgotPasswordSchema.safeParse({ email });
    if (!parsed.success) {
      setError(firstZodError(parsed.error));
      return;
    }
    await requestPasswordReset(parsed.data.email);
    // Always show the same confirmation, even on Supabase errors, to avoid
    // leaking which addresses have accounts.
    setSubmitted(true);
  }

  return (
    <main className="min-h-[100svh] grid grid-cols-1 md:grid-cols-[minmax(380px,1fr)_minmax(0,1.1fr)]">
      <section className="flex items-center justify-center px-6 py-12 md:px-12">
        <div className="w-full max-w-[420px] space-y-8">
          <div className="space-y-3">
            <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-primary">
              Reset password
            </p>
            <h1 className="font-display font-semibold text-[44px] tracking-[-0.022em] leading-[1.08] max-w-[12ch] text-foreground">
              Forgot your password?
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-[36ch]">
              Enter your email and we&apos;ll send you a link to set a new one.
            </p>
          </div>

          {submitted ? (
            <div className="space-y-4">
              <div
                className="rounded-md border border-border bg-card px-4 py-3 text-sm text-foreground"
                role="status"
              >
                If an account exists for <span className="font-semibold">{email}</span>,
                we just sent a reset link. Check your inbox.
              </div>
              <Link
                href="/login"
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                ← Back to log in
              </Link>
            </div>
          ) : (
            <>
              {error && (
                <div
                  className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive"
                  role="alert"
                >
                  <span className="font-semibold">Error:</span> {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label
                    htmlFor="email"
                    className="text-xs font-medium text-foreground"
                  >
                    Email
                  </label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isLoading}
                  />
                </div>

                <Button
                  type="submit"
                  size="lg"
                  disabled={isLoading}
                  className="h-11 w-full text-sm"
                >
                  {isLoading ? "Sending…" : "Send reset link"}
                </Button>

                <div className="text-center">
                  <Link
                    href="/login"
                    className="text-sm text-muted-foreground hover:text-foreground"
                  >
                    ← Back to log in
                  </Link>
                </div>
              </form>
            </>
          )}
        </div>
      </section>

      <aside
        aria-hidden
        className="hidden md:flex relative items-center justify-center px-12 py-12 overflow-hidden"
        style={{ background: "var(--gradient-coast)" }}
      />
    </main>
  );
}
