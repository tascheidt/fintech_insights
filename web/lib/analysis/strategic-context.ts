import { createAdminClient } from "@/lib/supabase/admin";
import { scoreRankedSource } from "@/lib/analysis/source-scoring";

const MAX_STRATEGIC_SOURCES = 4;
const MAX_STRATEGY_LENGTH = 500;
const MAX_SUMMARY_LENGTH = 320;
const MAX_SNIPPET_LENGTH = 220;

interface StoredInsightRow {
  id: string;
  generated_at: string;
  headline: string | null;
  key_signal: string | null;
  executive_summary: string | null;
  strategic_hypothesis: string | null;
  stated_strategy: string | null;
  alignment_analysis: string | null;
  research_sources: unknown;
  research_quality_score: number | null;
}

interface StrategicSource {
  url: string;
  title: string;
  snippet: string;
  sourceType: string;
  verificationStatus: string;
}

export interface StrategicContextPacket {
  insightId: string | null;
  sourceCount: number;
  context: string;
}

function normalizeWhitespace(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3).trim()}...`;
}

function parseStrategicSources(value: unknown): StrategicSource[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .map((item) => ({
      url: typeof item.url === "string" ? item.url : "",
      title: typeof item.title === "string" ? item.title : "",
      snippet: typeof item.snippet === "string" ? item.snippet : "",
      sourceType: typeof item.sourceType === "string" ? item.sourceType : "news",
      verificationStatus:
        typeof item.verificationStatus === "string" ? item.verificationStatus : "unverified",
    }))
    .filter((item) => item.title || item.snippet);
}

function scoreStrategicSource(source: StrategicSource) {
  return scoreRankedSource(source, {
    extraKeywordWeights: {
      "engine by": 4,
      payments: 1,
      bank: 1,
    },
  });
}

function formatSourceEvidence(source: StrategicSource) {
  const title = truncateText(normalizeWhitespace(source.title), 140);
  const snippet = truncateText(normalizeWhitespace(source.snippet), MAX_SNIPPET_LENGTH);
  const status = source.verificationStatus === "verified" ? "verified" : "context";
  return `- [${status} ${source.sourceType}] ${title}: ${snippet}`;
}

function formatStrategicContext(row: StoredInsightRow | null) {
  if (!row) {
    return "No company strategic context is available. Base the synthesis only on hiring-derived technology evidence and state uncertainty explicitly.";
  }

  const sections: string[] = ["## Strategic Context"];
  const generatedAt = new Date(row.generated_at).toLocaleDateString();

  sections.push(`Latest company insight generated: ${generatedAt}`);

  if (row.headline) {
    sections.push(`Headline: ${normalizeWhitespace(row.headline)}`);
  }

  if (row.key_signal) {
    sections.push(`Key signal: ${normalizeWhitespace(row.key_signal)}`);
  }

  if (row.strategic_hypothesis) {
    sections.push(
      `Strategic hypothesis: ${truncateText(normalizeWhitespace(row.strategic_hypothesis), MAX_SUMMARY_LENGTH)}`
    );
  }

  if (row.stated_strategy) {
    sections.push(
      `Stated strategy: ${truncateText(normalizeWhitespace(row.stated_strategy), MAX_STRATEGY_LENGTH)}`
    );
  }

  if (row.executive_summary) {
    sections.push(
      `Company insight summary: ${truncateText(normalizeWhitespace(row.executive_summary), MAX_SUMMARY_LENGTH)}`
    );
  }

  if (row.alignment_analysis) {
    sections.push(
      `Alignment view: ${truncateText(normalizeWhitespace(row.alignment_analysis), MAX_SUMMARY_LENGTH)}`
    );
  }

  const selectedSources = parseStrategicSources(row.research_sources)
    .sort((left, right) => scoreStrategicSource(right) - scoreStrategicSource(left))
    .slice(0, MAX_STRATEGIC_SOURCES);

  if (selectedSources.length > 0) {
    sections.push("Named strategic evidence:");
    sections.push(...selectedSources.map(formatSourceEvidence));
  }

  if ((row.research_quality_score ?? 0) < 3) {
    sections.push(
      "Caveat: research quality is limited, so use this context only as supporting evidence and avoid overclaiming."
    );
  }

  return sections.join("\n");
}

export async function buildTechStackStrategicContext(
  companyId: string
): Promise<StrategicContextPacket> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("company_insights")
    .select(
      "id, generated_at, headline, key_signal, executive_summary, strategic_hypothesis, stated_strategy, alignment_analysis, research_sources, research_quality_score"
    )
    .eq("company_id", companyId)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return {
      insightId: null,
      sourceCount: 0,
      context: formatStrategicContext(null),
    };
  }

  const row = data as StoredInsightRow;
  const sourceCount = parseStrategicSources(row.research_sources).length;

  return {
    insightId: row.id,
    sourceCount,
    context: formatStrategicContext(row),
  };
}
