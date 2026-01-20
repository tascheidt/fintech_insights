"use client";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

export default function LoginPage() {
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const errorParam = searchParams.get("error");
    if (errorParam) {
      setError(decodeURIComponent(errorParam));
    }
  }, [searchParams]);

  async function signInWithGoogle() {
    try {
      const supabase = createClient();
      
      // Ensure we always use the full absolute URL for redirect
      // Supabase uses the Site URL from dashboard config, but redirectTo should override it
      const redirectTo = typeof window !== "undefined" 
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
      }
    } catch (err) {
      console.error("Failed to initialize Supabase client:", err);
      setError(err instanceof Error ? err.message : "Failed to initialize authentication client");
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Fintech Intelligence</CardTitle>
        <CardDescription>Sign in to access competitive intelligence</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-800">
            <strong>Authentication Error:</strong> {error}
          </div>
        )}
        <Button className="w-full" onClick={signInWithGoogle}>
          Sign in with Google
        </Button>
      </CardContent>
    </Card>
  );
}
