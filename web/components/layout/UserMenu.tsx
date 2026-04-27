"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { MessageSquare } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FeedbackDialog } from "@/components/feedback/FeedbackDialog";
import { getLatestVersion } from "@/lib/releases";

const LATEST_VERSION = getLatestVersion();
const STORAGE_KEY = "last_seen_release_version";

// useSyncExternalStore subscribes to the storage event so other tabs writing
// LATEST_VERSION reflect immediately. Server snapshot returns null to avoid
// hydration mismatch — the "new release" pip will appear after first paint.
const subscribeStorage = (cb: () => void) => {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
};
const readLastSeen = () =>
  typeof window === "undefined" ? null : window.localStorage.getItem(STORAGE_KEY);
const readLastSeenServer = () => null;

export function UserMenu({ email }: { email: string | undefined }) {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  const lastSeen = useSyncExternalStore(subscribeStorage, readLastSeen, readLastSeenServer);
  const hasNewRelease = lastSeen !== null && lastSeen !== LATEST_VERSION;

  // Mark the current version as seen when the user lands on /releases.
  // localStorage write is fine in an effect (no React state mutation).
  useEffect(() => {
    if (pathname === "/releases" && lastSeen !== LATEST_VERSION) {
      window.localStorage.setItem(STORAGE_KEY, LATEST_VERSION);
      // Notify subscribers in this tab (storage event only fires for other tabs).
      window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY }));
    }
  }, [pathname, lastSeen]);

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const initials =
    (email ?? "?")
      .trim()
      .split("@")[0]
      .split(/[._-]/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s.charAt(0).toUpperCase())
      .join("") || "U";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-[30px] w-[30px] rounded-full bg-pacific-500 text-white text-[11px] font-semibold tracking-wide hover:bg-pacific-600 hover:text-white"
          >
            <span aria-hidden>{initials}</span>
            <span className="sr-only">{email || "Account"}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setFeedbackOpen(true)}>
            <MessageSquare className="h-4 w-4 mr-2" />
            Send feedback
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <a href="/settings">Settings</a>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a href="/releases" className="flex items-center gap-1.5">
              Releases
              {hasNewRelease && (
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              )}
            </a>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={signOut}>Sign out</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />
    </>
  );
}
