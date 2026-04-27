/**
 * DashboardNav - Main navigation header.
 *
 * Visual contract (design system):
 * - Brand mark: 28px inline `BrandMark` + wordmark, 9px gap.
 *   Inline (not next/image) so the sun + wave detail doesn't dissolve at small size.
 * - Active nav link: 2px Pacific underline (bg-primary), sits 6px below the link.
 * - Labs pill: ghost border + small sunset (`bg-accent`) dot.
 * - User avatar: 30×30 round circle, Pacific 500 background, white initials.
 *
 * All colors come from tokens in app/globals.css. Do not hardcode.
 */

"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { UserMenu } from "./UserMenu";
import { BrandMark } from "./BrandMark";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getPrimaryNavItems, getUtilityNavItems, type NavItem } from "@/lib/navigation";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export function DashboardNav({
  user,
  role,
}: {
  user: { email?: string };
  role?: string;
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const pathname = usePathname();

  const primaryNavItems = getPrimaryNavItems(role);
  const labsEntry = getUtilityNavItems()[0];

  const isActive = (item: NavItem) => {
    if (item.exact) {
      return pathname === item.href;
    }
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  };

  return (
    // Nav sits on `bg-card` (sand-0 / white) so the brand mark's sand-25
    // background reads with a tonal step against the warm page bg below.
    <header className="border-b bg-card">
      <div className="flex h-14 items-center px-4 sm:px-6 gap-4 sm:gap-6">
        <Link
          href="/dashboard"
          aria-label="Talent Brief"
          className="flex items-center gap-[9px] font-semibold text-[15px] tracking-[-0.01em] text-foreground"
        >
          <BrandMark size={28} />
          <span>Talent Brief</span>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex gap-5">
          {primaryNavItems.map((link) => {
            const active = isActive(link);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "relative text-sm transition-colors",
                  active
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {link.label}
                {active && (
                  <span
                    aria-hidden
                    className="absolute left-0 right-0 -bottom-[19px] h-[2px] rounded-[2px] bg-primary"
                  />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Mobile Menu */}
        <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
          <SheetTrigger asChild className="md:hidden">
            <Button variant="ghost" size="icon" className="h-10 w-10">
              <Menu className="h-5 w-5" />
              <span className="sr-only">Open menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[280px] sm:w-[300px]">
            <SheetHeader>
              <SheetTitle>Navigation</SheetTitle>
            </SheetHeader>
            <nav className="flex flex-col gap-2 mt-6">
              {primaryNavItems.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    "text-base py-3 px-3 rounded-md transition-colors",
                    isActive(link)
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                  )}
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </SheetContent>
        </Sheet>

        <div className="ml-auto flex items-center gap-3">
          <Link
            href={labsEntry.href}
            className={cn(
              "inline-flex h-8 items-center gap-2 rounded-full border px-3 text-xs font-medium transition-colors",
              isActive(labsEntry)
                ? "border-border bg-secondary text-foreground"
                : "border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground"
            )}
          >
            <span
              aria-hidden
              className="h-1.5 w-1.5 rounded-full bg-accent"
            />
            Labs
          </Link>

          <UserMenu email={user?.email} />
        </div>
      </div>
    </header>
  );
}
