"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { MessageSquare } from "lucide-react";
import { CircleUser } from "lucide-react";
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

export function UserMenu({ email }: { email: string | undefined }) {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [hasNewRelease, setHasNewRelease] = useState(false);

  useEffect(() => {
    const lastSeen = localStorage.getItem("last_seen_release_version");
    setHasNewRelease(lastSeen !== LATEST_VERSION);
  }, []);

  useEffect(() => {
    if (pathname === "/releases") {
      localStorage.setItem("last_seen_release_version", LATEST_VERSION);
      setHasNewRelease(false);
    }
  }, [pathname]);

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm">
            {email || "Account"}
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
          <DropdownMenuItem onClick={signOut}>Sign out</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />
    </>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <CircleUser className="h-5 w-5" />
          <span className="sr-only">{email || "Account"}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <a href="/settings">Settings</a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href="/releases" className="flex items-center gap-1.5">
            Releases
            {hasNewRelease && (
              <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
            )}
          </a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={signOut}>Sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
