"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEmailAuth } from "@/hooks/use-email-auth";
import { createClient } from "@/lib/supabase/client";
import {
  firstZodError,
  updatePasswordSchema,
} from "@/lib/auth/validation";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const { updatePassword, isLoading, error, setError } = useEmailAuth();

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setHasSession(Boolean(data.user));
    });
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = updatePasswordSchema.safeParse({ password, confirm });
    if (!parsed.success) {
      setError(firstZodError(parsed.error));
      return;
    }
    const result = await updatePassword(parsed.data.password);
    if (result.ok) {
      router.replace("/dashboard?password_updated=1");
    }
  }

  return (
    <main className="min-h-[100svh] grid grid-cols-1 md:grid-cols-[minmax(380px,1fr)_minmax(0,1.1fr)]">
      <section className="flex items-center justify-center px-6 py-12 md:px-12">
        <div className="w-full max-w-[420px] space-y-8">
          <div className="space-y-3">
            <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-primary">
              Set a new password
            </p>
            <h1 className="font-display font-semibold text-[44px] tracking-[-0.022em] leading-[1.08] max-w-[12ch] text-foreground">
              Choose a new password.
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-[36ch]">
              At least 8 characters with a letter and a number.
            </p>
          </div>

          {hasSession === false ? (
            <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
              This reset link has expired or already been used. Request a fresh one
              from the <a href="/forgot-password" className="underline">forgot password</a> page.
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
                  <label htmlFor="password" className="text-xs font-medium text-foreground">
                    New password
                  </label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="new-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isLoading || hasSession === null}
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="confirm" className="text-xs font-medium text-foreground">
                    Confirm new password
                  </label>
                  <Input
                    id="confirm"
                    type="password"
                    autoComplete="new-password"
                    required
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    disabled={isLoading || hasSession === null}
                  />
                </div>

                <Button
                  type="submit"
                  size="lg"
                  disabled={isLoading || hasSession === null}
                  className="h-11 w-full text-sm"
                >
                  {isLoading ? "Updating…" : "Update password"}
                </Button>
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
