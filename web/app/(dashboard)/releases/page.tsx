import { releases } from "@/lib/releases";
import { ReleaseEntry } from "@/components/releases/ReleaseEntry";

export const metadata = {
  title: "Releases | The Fintech Talent Brief",
};

export default function ReleasesPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight">Releases</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Product updates and improvements
      </p>

      <div className="mt-6 divide-y divide-border">
        {releases.map((release, i) => (
          <ReleaseEntry key={release.version} release={release} isLatest={i === 0} />
        ))}
      </div>
    </div>
  );
}
