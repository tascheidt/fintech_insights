/**
 * Marketing layout — public, no auth required.
 *
 * Routes under `(marketing)` are intentionally outside the dashboard auth
 * boundary in `(dashboard)/layout.tsx`. This is the design-system "logged-out"
 * surface group: the marketing page, sample digest, etc.
 */

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <main className="min-h-screen bg-background">{children}</main>;
}
