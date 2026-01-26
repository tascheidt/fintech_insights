/**
 * Insights Page - Redirects to Weekly Digests
 * 
 * This page has been deprecated. All insight functionality is now accessible
 * through the Weekly Digests page and individual Company pages.
 */

import { redirect } from "next/navigation";

export default function InsightsPage() {
  redirect("/digests");
}
