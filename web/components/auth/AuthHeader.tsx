import { Button } from "@/components/ui/button";
import Link from "next/link";
import { BrandMark } from "@/components/layout/BrandMark";

export function AuthHeader() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8 bg-background/80 backdrop-blur-sm border-b border-border/40">
      <div className="flex items-center gap-2">
        <Link
          href="/dashboard"
          className="flex items-center gap-[9px] font-semibold text-lg"
        >
          <BrandMark size={28} />
          <span>The Fintech Talent Brief</span>
        </Link>
      </div>

      <div className="flex items-center gap-2 sm:gap-4">
        <Button
          asChild
          variant="ghost"
          className="text-muted-foreground hover:text-foreground hidden sm:flex"
        >
          <Link href="/login">Log in</Link>
        </Button>
        <Button asChild className="font-medium">
          <Link href="/login?mode=signup">Get started</Link>
        </Button>
      </div>
    </header>
  );
}
