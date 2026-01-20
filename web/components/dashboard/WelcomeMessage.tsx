"use client";

/**
 * WelcomeMessage - Non-intrusive personalized welcome banner.
 * 
 * Shows on every login with user's name/email.
 * Subtle design that doesn't dominate the page.
 * Can be dismissed for the current session.
 */

import * as React from "react";
import { cn } from "@/lib/utils";
import { X, Sparkles } from "lucide-react";

interface WelcomeMessageProps {
  /** User's display name or email */
  userName?: string | null;
  /** User's email (fallback if no name) */
  userEmail?: string | null;
  /** Additional CSS classes */
  className?: string;
}

export function WelcomeMessage({
  userName,
  userEmail,
  className,
}: WelcomeMessageProps) {
  const [isDismissed, setIsDismissed] = React.useState(false);

  // Get display name - prefer name, fallback to email prefix
  const displayName = React.useMemo(() => {
    if (userName) return userName;
    if (userEmail) {
      const name = userEmail.split("@")[0];
      // Capitalize first letter
      return name.charAt(0).toUpperCase() + name.slice(1);
    }
    return "there";
  }, [userName, userEmail]);

  // Get greeting based on time of day
  const greeting = React.useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  }, []);

  if (isDismissed) return null;

  return (
    <div
      className={cn(
        "relative flex items-center gap-3 px-4 py-3 rounded-lg",
        "bg-gradient-to-r from-primary/10 via-primary/5 to-transparent",
        "border border-primary/10",
        className
      )}
    >
      {/* Icon */}
      <div className="flex-shrink-0">
        <Sparkles className="h-5 w-5 text-primary" />
      </div>

      {/* Message */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">
          {greeting}, {displayName}!
        </p>
        <p className="text-xs text-muted-foreground">
          Welcome to Fintech Insights. Here&apos;s your competitive intelligence overview.
        </p>
      </div>

      {/* Dismiss button */}
      <button
        type="button"
        onClick={() => setIsDismissed(true)}
        className={cn(
          "flex-shrink-0 p-1 rounded-md",
          "text-muted-foreground hover:text-foreground",
          "hover:bg-muted transition-colors"
        )}
        aria-label="Dismiss welcome message"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export default WelcomeMessage;
