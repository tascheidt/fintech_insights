/**
 * Insight Detail Page - Redirects to Weekly Digests
 * 
 * This page has been deprecated. Job-level insights are no longer directly accessible.
 * Users should access company insights through the Company pages or Weekly Digests.
 */

import { redirect } from "next/navigation";

export default function InsightDetailPage() {
  redirect("/digests");
}
