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
import { Menu } from "lucide-react";
import { UserMenu } from "./UserMenu";
import { Button } from "@/components/ui/button";
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

  const navLinks = [
    { href: "/", label: "Dashboard" },
    { href: "/jobs", label: "Jobs" },
    { href: "/companies", label: "Companies" },
    { href: "/digests", label: "Weekly Digests" },
    ...(role === "admin" ? [{ href: "/admin", label: "Admin" }] : []),
  ];

  return (
    <header className="border-b">
      <div className="flex h-14 items-center px-4 sm:px-6 gap-4 sm:gap-6">
        <Link href="/" className="font-semibold text-sm sm:text-base">
          Fintech Intelligence
        </Link>
        
        {/* Desktop Navigation - Hidden on mobile */}
        <nav className="hidden md:flex gap-4">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
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
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-base py-3 px-3 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </SheetContent>
        </Sheet>

        {/* User Menu - Always visible */}
        <div className="ml-auto">
          <UserMenu email={user?.email} />
        </div>
      </div>
    </header>
  );
}
