/**
 * Public layout — no auth, no dashboard chrome.
 *
 * Routes under `(public)` are readable by anyone holding the URL. Today that
 * is the shared search report at `/r/[token]`. `web/proxy.ts` allows the `/r/`
 * prefix through the auth redirect; everything else stays gated.
 *
 * Deliberately separate from `(marketing)`: marketing pages are indexable and
 * link into the product, while these pages are capability-scoped artifacts and
 * carry `noindex` (see the page's `generateMetadata`).
 */

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="min-h-screen bg-sand-25">{children}</div>;
}
