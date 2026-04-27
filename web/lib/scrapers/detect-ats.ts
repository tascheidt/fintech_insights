/**
 * ATS URL Detection Utility
 * Automatically detects the ATS platform and identifier from a careers page URL
 */

export interface ATSDetectionResult {
  detected: boolean;
  atsType?: string;
  atsIdentifier?: string;
  confidence: "high" | "medium" | "low";
  normalizedUrl?: string;
}

interface ATSPattern {
  type: string;
  patterns: RegExp[];
  extractIdentifier: (url: URL, match: RegExpMatchArray | null) => string | null;
}

const ATS_PATTERNS: ATSPattern[] = [
  // Lever: jobs.lever.co/{identifier} or {identifier}.lever.co
  {
    type: "lever",
    patterns: [
      /^jobs\.lever\.co$/i,
      /^([a-z0-9-]+)\.lever\.co$/i,
    ],
    extractIdentifier: (url: URL) => {
      const host = url.hostname.toLowerCase();
      if (host === "jobs.lever.co") {
        // Path format: /identifier/...
        const parts = url.pathname.split("/").filter(Boolean);
        return parts[0] || null;
      }
      // Subdomain format
      const subMatch = host.match(/^([a-z0-9-]+)\.lever\.co$/i);
      return subMatch ? subMatch[1] : null;
    },
  },
  // Greenhouse: boards.greenhouse.io/{identifier} or {identifier}.greenhouse.io
  {
    type: "greenhouse",
    patterns: [
      /^boards\.greenhouse\.io$/i,
      /^([a-z0-9-]+)\.greenhouse\.io$/i,
    ],
    extractIdentifier: (url: URL) => {
      const host = url.hostname.toLowerCase();
      if (host === "boards.greenhouse.io") {
        const parts = url.pathname.split("/").filter(Boolean);
        return parts[0] || null;
      }
      const subMatch = host.match(/^([a-z0-9-]+)\.greenhouse\.io$/i);
      if (subMatch && subMatch[1] !== "boards") {
        return subMatch[1];
      }
      return null;
    },
  },
  // Workable: apply.workable.com/{identifier}
  {
    type: "workable",
    patterns: [
      /^apply\.workable\.com$/i,
    ],
    extractIdentifier: (url: URL) => {
      const parts = url.pathname.split("/").filter(Boolean);
      return parts[0] || null;
    },
  },
  // Ashby: jobs.ashbyhq.com/{identifier}
  {
    type: "ashby",
    patterns: [
      /^jobs\.ashbyhq\.com$/i,
    ],
    extractIdentifier: (url: URL) => {
      const parts = url.pathname.split("/").filter(Boolean);
      return parts[0] || null;
    },
  },
  // Workday: {company}.wd{number}.myworkdayjobs.com or {company}.myworkdayjobs.com
  {
    type: "workday",
    patterns: [
      /^([a-z0-9-]+)\.wd\d+\.myworkdayjobs\.com$/i,
      /^([a-z0-9-]+)\.myworkdayjobs\.com$/i,
    ],
    extractIdentifier: (url: URL) => {
      const host = url.hostname.toLowerCase();
      const match = host.match(/^([a-z0-9-]+)\.(?:wd\d+\.)?myworkdayjobs\.com$/i);
      return match ? match[1] : null;
    },
  },
  // SmartRecruiters: jobs.smartrecruiters.com/{identifier}
  {
    type: "smartrecruiters",
    patterns: [
      /^jobs\.smartrecruiters\.com$/i,
    ],
    extractIdentifier: (url: URL) => {
      const parts = url.pathname.split("/").filter(Boolean);
      return parts[0] || null;
    },
  },
  // BambooHR: {identifier}.bamboohr.com/careers
  {
    type: "bamboohr",
    patterns: [
      /^([a-z0-9-]+)\.bamboohr\.com$/i,
    ],
    extractIdentifier: (url: URL) => {
      const match = url.hostname.match(/^([a-z0-9-]+)\.bamboohr\.com$/i);
      return match ? match[1] : null;
    },
  },
  // JazzHR: {identifier}.applytojob.com
  {
    type: "jazzhr",
    patterns: [
      /^([a-z0-9-]+)\.applytojob\.com$/i,
    ],
    extractIdentifier: (url: URL) => {
      const match = url.hostname.match(/^([a-z0-9-]+)\.applytojob\.com$/i);
      return match ? match[1] : null;
    },
  },
  // Recruitee: {identifier}.recruitee.com
  {
    type: "recruitee",
    patterns: [
      /^([a-z0-9-]+)\.recruitee\.com$/i,
    ],
    extractIdentifier: (url: URL) => {
      const match = url.hostname.match(/^([a-z0-9-]+)\.recruitee\.com$/i);
      return match ? match[1] : null;
    },
  },
  // Dayforce: jobs.dayforcehcm.com/{locale}/{identifier}/CANDIDATEPORTAL
  {
    type: "dayforce",
    patterns: [
      /^jobs\.dayforcehcm\.com$/i,
    ],
    extractIdentifier: (url: URL) => {
      // URL pattern: /en-US/{identifier}/CANDIDATEPORTAL/...
      const parts = url.pathname.split("/").filter(Boolean);
      // parts[0] is locale (en-US), parts[1] is identifier
      if (parts.length >= 2) {
        return parts[1].toLowerCase();
      }
      return null;
    },
  },
];

/**
 * Detects the ATS type and identifier from a careers page URL
 */
export function detectATSFromUrl(careersUrl: string): ATSDetectionResult {
  // Clean up the URL
  let cleanUrl = careersUrl.trim();
  
  // Add protocol if missing
  if (!cleanUrl.startsWith("http://") && !cleanUrl.startsWith("https://")) {
    cleanUrl = `https://${cleanUrl}`;
  }

  let url: URL;
  try {
    url = new URL(cleanUrl);
  } catch {
    return { detected: false, confidence: "low" };
  }

  const hostname = url.hostname.toLowerCase();

  for (const ats of ATS_PATTERNS) {
    for (const pattern of ats.patterns) {
      if (pattern.test(hostname)) {
        const match = hostname.match(pattern);
        const identifier = ats.extractIdentifier(url, match);
        
        if (identifier) {
          // Remove query params and fragments for normalized URL
          const normalizedUrl = `${url.protocol}//${url.hostname}${url.pathname}`.replace(/\/$/, "");
          
          return {
            detected: true,
            atsType: ats.type,
            atsIdentifier: identifier,
            confidence: "high",
            normalizedUrl,
          };
        }
      }
    }
  }

  return { detected: false, confidence: "low" };
}

/**
 * List of supported ATS types with display names
 */
export const SUPPORTED_ATS = [
  { value: "lever", label: "Lever", implemented: true },
  { value: "greenhouse", label: "Greenhouse", implemented: true },
  { value: "workable", label: "Workable", implemented: true },
  { value: "ashby", label: "Ashby", implemented: true },
  { value: "dayforce", label: "Dayforce", implemented: true },
  { value: "workday", label: "Workday", implemented: false },
  { value: "smartrecruiters", label: "SmartRecruiters", implemented: false },
  { value: "bamboohr", label: "BambooHR", implemented: false },
  { value: "jazzhr", label: "JazzHR", implemented: false },
  { value: "recruitee", label: "Recruitee", implemented: false },
  { value: "custom", label: "Other / Manual", implemented: false },
] as const;

export type ATSType = typeof SUPPORTED_ATS[number]["value"];
