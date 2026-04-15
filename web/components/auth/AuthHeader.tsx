"use client";

import { Button } from "@/components/ui/button";
import { useGoogleAuth } from "@/hooks/use-google-auth";
import Link from "next/link";
import { Sparkles } from "lucide-react";

export function AuthHeader() {
  const { signInWithGoogle, isLoading } = useGoogleAuth();
  const handleSignIn = () => signInWithGoogle();

  return (
    <header className="fixed top-0 left-0 right-0 z-50 flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8 bg-background/80 backdrop-blur-sm border-b border-border/40">
      <div className="flex items-center gap-2">
        <Link href="/" className="flex items-center gap-2 font-semibold text-lg">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Sparkles className="h-4 w-4" />
          </div>
          <span>The Fintech Talent Brief</span>
        </Link>
      </div>

      <div className="flex items-center gap-2 sm:gap-4">
        <Button 
          variant="ghost" 
          onClick={handleSignIn}
          disabled={isLoading}
          className="text-muted-foreground hover:text-foreground hidden sm:flex"
        >
          Log in
        </Button>
        <Button 
          onClick={handleSignIn}
          disabled={isLoading}
          className="font-medium"
        >
          Get started
        </Button>
      </div>
    </header>
  );
}
