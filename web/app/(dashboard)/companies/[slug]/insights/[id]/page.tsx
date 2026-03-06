import { redirect } from "next/navigation";

export default async function CompanyInsightDetailPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug } = await params;
  redirect(`/companies/${slug}`);
}
