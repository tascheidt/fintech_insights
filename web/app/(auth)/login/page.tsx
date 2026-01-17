"use client";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginPage() {
  const supabase = createClient();

  async function signInWith(provider: "google" | "azure") {
    const redirectTo = typeof window !== "undefined" 
      ? `${window.location.origin}/auth/callback` 
      : "/auth/callback";
    await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo },
    });
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Fintech Intelligence</CardTitle>
        <CardDescription>Sign in to access competitive intelligence</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button
          className="w-full"
          onClick={() => signInWith("google")}
        >
          Sign in with Google
        </Button>
        <Button
          variant="outline"
          className="w-full"
          onClick={() => signInWith("azure")}
        >
          Sign in with Microsoft
        </Button>
      </CardContent>
    </Card>
  );
}
