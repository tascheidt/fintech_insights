export type RankedSourceType = "official" | "news" | "sec_filing" | "analyst" | "social" | "funding" | string;
export type RankedVerificationStatus = "verified" | "unverified" | "paywall" | string;

export interface RankedSourceLike {
  title: string;
  snippet: string;
  sourceType: RankedSourceType;
  verificationStatus: RankedVerificationStatus;
}

interface SourceScoringOptions {
  extraKeywordWeights?: Record<string, number>;
  lowSignalPenalty?: number;
  isLowSignalSource?: boolean;
}

const BASE_SOURCE_TYPE_WEIGHTS: Record<string, number> = {
  official: 4,
  sec_filing: 3,
  news: 2,
};

const BASE_VERIFICATION_WEIGHTS: Record<string, number> = {
  verified: 5,
};

const BASE_KEYWORD_WEIGHTS: Record<string, number> = {
  platform: 2,
  system: 2,
  agreement: 1,
  partnership: 1,
  "cloud-native": 2,
  "digital banking": 2,
  wealth: 1,
};

export function scoreRankedSource(
  source: RankedSourceLike,
  options: SourceScoringOptions = {}
) {
  const text = `${source.title} ${source.snippet}`.toLowerCase();
  let score = 0;

  score += BASE_VERIFICATION_WEIGHTS[source.verificationStatus] ?? 0;
  score += BASE_SOURCE_TYPE_WEIGHTS[source.sourceType] ?? 0;

  for (const [keyword, weight] of Object.entries(BASE_KEYWORD_WEIGHTS)) {
    if (text.includes(keyword)) {
      score += weight;
    }
  }

  for (const [keyword, weight] of Object.entries(options.extraKeywordWeights ?? {})) {
    if (text.includes(keyword)) {
      score += weight;
    }
  }

  if (options.isLowSignalSource) {
    score -= options.lowSignalPenalty ?? 0;
  }

  return score;
}
