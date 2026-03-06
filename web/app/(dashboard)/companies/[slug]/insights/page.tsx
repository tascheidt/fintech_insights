import { redirect } from "next/navigation";

export default async function CompanyInsightsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/companies/${slug}`);
}
