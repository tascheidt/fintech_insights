/**
 * DashboardNav - Main navigation header for the application.
 * 
 * Navigation structure:
 * - Dashboard (home) - Overview with companies and digests
 * - Jobs - All job postings across companies
 * - Companies - Company list and details
 * - Weekly Digests - Historical weekly intelligence reports
 * - Admin (admin only) - System administration
 * 
 * Mobile: Shows hamburger menu on small screens, hides desktop nav links.
 */

"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { UserMenu } from "./UserMenu";
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
    <header className="border-b">
      <div className="flex h-14 items-center px-4 sm:px-6 gap-4 sm:gap-6">
        <Link href="/" className="font-semibold text-sm sm:text-base">
          Talent Brief
        </Link>
        
        {/* Desktop Navigation - Hidden on mobile */}
        <nav className="hidden md:flex gap-4">
          {primaryNavItems.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "text-sm transition-colors",
                isActive(link)
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Mobile Menu Button - Visible on mobile */}
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
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent"
                  )}
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </SheetContent>
        </Sheet>

        <div className="ml-auto flex items-center gap-2">
          <Link
            href={labsEntry.href}
            className={cn(
              "inline-flex h-8 items-center gap-2 rounded-full border px-3 text-sm font-medium transition-colors",
              isActive(labsEntry)
                ? "border-border bg-accent text-foreground"
                : "border-transparent text-muted-foreground hover:border-border hover:bg-accent hover:text-foreground"
            )}
          >
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                isActive(labsEntry) ? "bg-foreground" : "bg-muted-foreground"
              )}
            />
            Labs
          </Link>

          {/* User Menu - Always visible */}
          <UserMenu email={user?.email} />
        </div>
      </div>
    </header>
  );
}
