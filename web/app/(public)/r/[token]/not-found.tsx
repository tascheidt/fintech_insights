import Link from "next/link";

/**
 * Shared reports expire after 90 days and can be revoked by their author, so a
 * dead link is an expected end state, not an error. The copy says which of the
 * three things happened is unknowable from here — deliberately, since
 * distinguishing "wrong token" from "revoked" would confirm a token exists.
 */
export default function SharedReportNotFound() {
  return (
    <div className="mx-auto w-full max-w-[560px] px-5 py-20 text-center">
      <p className="mb-3 text-[12px] font-semibold uppercase tracking-[0.09em] text-sand-500">
        The Fintech Talent Brief
      </p>
      <h1
        className="mb-3 text-[26px] leading-[1.2] text-sand-950"
        style={{ letterSpacing: "-0.02em", fontWeight: 600 }}
      >
        This report isn&apos;t available
      </h1>
      <p className="mb-7 text-[14px] leading-[1.6] text-sand-600">
        The link may have expired, been revoked by whoever shared it, or been
        copied incompletely. Ask the sender for a fresh one.
      </p>
      <Link
        href="/login"
        className="inline-flex items-center rounded-lg bg-pacific-500 px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-pacific-600"
      >
        Go to the Fintech Talent Brief
      </Link>
    </div>
  );
}
