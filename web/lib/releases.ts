import releasesData from "@/data/releases.json";

export interface Change {
  type: "feature" | "fix" | "improvement";
  description: string;
}

export interface Release {
  version: string;
  date: string;
  changes: Change[];
}

export const releases: Release[] = releasesData as Release[];

export function getLatestVersion(): string {
  return releases[0]?.version ?? "0.0.0";
}
