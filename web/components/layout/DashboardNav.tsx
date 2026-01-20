/**
 * DashboardNav - Main navigation header for the application.
 * 
 * Navigation structure:
 * - Dashboard (home) - Overview with companies and digests
 * - Insights - Weekly strategic insights
 * - Companies - Company list and details (includes jobs)
 * - Admin (admin only) - System administration
 * 
 * Note: Jobs and Templates are now accessed through Company pages.
 */

import Link from "next/link";
import { UserMenu } from "./UserMenu";

export function DashboardNav({
  user,
  role,
}: {
  user: { email?: string };
  role?: string;
}) {
  return (
    <header className="border-b">
      <div className="flex h-14 items-center px-6 gap-6">
        <Link href="/" className="font-semibold">
          Fintech Intelligence
        </Link>
        <nav className="flex gap-4">
          <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
            Dashboard
          </Link>
          <Link href="/insights" className="text-sm text-muted-foreground hover:text-foreground">
            Insights
          </Link>
          <Link href="/companies" className="text-sm text-muted-foreground hover:text-foreground">
            Companies
          </Link>
          {role === "admin" && (
            <Link href="/admin" className="text-sm text-muted-foreground hover:text-foreground">
              Admin
            </Link>
          )}
        </nav>
        <div className="ml-auto">
          <UserMenu email={user?.email} />
        </div>
      </div>
    </header>
  );
}
