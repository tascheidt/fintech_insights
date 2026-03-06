import { Card, CardContent } from "@/components/ui/card";
import { LabCard } from "@/components/labs/LabCard";
import { createClient } from "@/lib/supabase/server";
import { getLabsExperiments } from "@/lib/navigation";

export default async function LabsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = user
    ? await supabase.from("profiles").select("role").eq("id", user.id).single()
    : { data: null };

  const experiments = getLabsExperiments(profile?.role);

  return (
    <div className="mx-auto max-w-6xl space-y-10">
      <Card className="rounded-[24px] border-border/70 bg-muted/20">
        <CardContent className="space-y-4 p-8">
          <div className="inline-flex items-center rounded-full border bg-background px-3 py-1 text-xs font-medium text-muted-foreground">
            Talent Brief Labs
          </div>
          <div className="space-y-3">
            <h1 className="max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">
              A place to explore new Talent Brief concepts before they become core product features.
            </h1>
            <p className="max-w-3xl text-base leading-7 text-muted-foreground">
              Labs gives experimental workflows a dedicated home without crowding
              the main product navigation. Each concept is meant to be useful,
              clearly labeled, and easy to expand as new ideas are added.
            </p>
          </div>
        </CardContent>
      </Card>

      <section className="space-y-4">
        <div className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground">
            Available now
          </p>
          <h2 className="text-2xl font-semibold tracking-tight">
            Current experiments
          </h2>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {experiments.map((experiment) => (
            <LabCard
              key={experiment.slug}
              href={experiment.href}
              title={experiment.title}
              status={experiment.status}
              summary={experiment.summary}
              ctaLabel={experiment.ctaLabel}
              featured={experiment.featured}
              adminOnly={experiment.adminOnly}
            />
          ))}

          <Card className="h-full rounded-[24px] border-dashed border-border/70 bg-muted/20">
            <CardContent className="flex h-full flex-col justify-between gap-5 p-6">
              <div className="space-y-3">
                <div className="inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                  In development
                </div>
                <h3 className="text-lg font-semibold tracking-tight">
                  More concepts are on the way
                </h3>
                <p className="text-sm leading-6 text-muted-foreground">
                  Future Labs concepts should plug into this surface without any
                  primary navigation changes. Add the experiment metadata, add
                  its route, and it becomes discoverable here.
                </p>
              </div>
              <p className="text-sm font-medium text-muted-foreground">
                Built for expansion, not one-off exposure.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
