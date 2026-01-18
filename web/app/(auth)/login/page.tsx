"use client";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginPage() {
  const supabase = createClient();

  async function signInWithGoogle() {
    const redirectTo = typeof window !== "undefined" 
      ? `${window.location.origin}/auth/callback` 
      : "/auth/callback";
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Fintech Intelligence</CardTitle>
        <CardDescription>Sign in to access competitive intelligence</CardDescription>
      </CardHeader>
      <CardContent>
        <Button className="w-full" onClick={signInWithGoogle}>
          Sign in with Google
        </Button>
      </CardContent>
    </Card>
  );
}
