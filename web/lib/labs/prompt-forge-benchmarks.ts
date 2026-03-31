import type { CompanyTechStack } from "@/lib/ai/tech-stack-extraction";
import type { DigestCommentary, WeeklyDigestCompanyInput } from "@/lib/analysis/digest";

export interface JobStructureBenchmarkCase {
  id: string;
  title: string;
  rawDepartment: string;
  description: string;
  expectedInclude: string[];
  expectedExclude: string[];
}

export interface TechStackBenchmarkCase {
  id: string;
  companyName: string;
  strategicContext?: string;
  technologies: {
    name: string;
    count: number;
    firstSeen: string;
    lastSeen: string;
  }[];
  totalJobsAnalyzed: number;
  periodStart: string;
  periodEnd: string;
  expectedCategories: string[];
  expectedTechnologies: string[];
  expectedNarrativeTerms: string[];
}

export interface WeeklyDigestBenchmarkCase {
  id: string;
  companyName: string;
  input: WeeklyDigestCompanyInput;
  expectedContinuity: "continuing" | "mixed" | "new_focus";
  expectedInclude: string[];
  expectedExclude: string[];
}

export const JOB_STRUCTURE_BENCHMARKS: JobStructureBenchmarkCase[] = [
  {
    id: "regulated-banking-backend",
    title: "Senior Backend Engineer, Core Banking",
    rawDepartment: "Engineering",
    description: `We are hiring a Senior Backend Engineer to help modernize our core banking and card operations stack.
You will build services in Go and Kotlin, ship APIs on AWS, and work closely with PostgreSQL, Redis, Kafka, and Terraform.
The team integrates with Temenos and Stripe, monitors services in Datadog, and deploys with GitHub Actions and Kubernetes.
Experience with PCI, KYC, or AML systems is a plus.`,
    expectedInclude: ["Go", "Kotlin", "AWS", "PostgreSQL", "Redis", "Kafka", "Terraform", "Temenos", "Stripe", "Datadog", "GitHub Actions", "Kubernetes"],
    expectedExclude: ["cloud", "APIs", "microservices", "PCI", "KYC", "AML"],
  },
  {
    id: "analytics-fintech-data",
    title: "Staff Data Engineer, Risk Analytics",
    rawDepartment: "Data",
    description: `Join our risk analytics platform team to build fraud and underwriting pipelines.
You will use Python, Snowflake, dbt, Airflow, Spark, and Looker to model financial data.
Our platform runs on GCP and BigQuery, with orchestration in Terraform and observability in New Relic.
You will partner with teams using FICO and Plaid data.`,
    expectedInclude: ["Python", "Snowflake", "dbt", "Airflow", "Spark", "Looker", "GCP", "BigQuery", "Terraform", "New Relic", "FICO", "Plaid"],
    expectedExclude: ["financial data", "fraud", "underwriting", "analytics", "platform"],
  },
];

export const TECH_STACK_BENCHMARKS: TechStackBenchmarkCase[] = [
  {
    id: "fintech-platform-mix",
    companyName: "Benchmark BankTech",
    strategicContext: `## Strategic Context
Latest company insight generated: 2026-02-10
Headline: Core banking modernization accelerates
Key signal: The company is pairing named financial systems with a platform modernization push.
Named strategic evidence:
- [verified news] Benchmark BankTech expands core modernization: Benchmark BankTech signed a multi-year agreement with Engine by Starling to modernize onboarding and deposit operations.
- [verified official] Benchmark BankTech payments strategy update: Leadership said Stripe remains central to payments orchestration while Temenos supports banking core workflows.`,
    technologies: [
      { name: "Temenos", count: 7, firstSeen: "2025-09-01", lastSeen: "2026-02-01" },
      { name: "Stripe", count: 6, firstSeen: "2025-09-01", lastSeen: "2026-02-10" },
      { name: "Go", count: 6, firstSeen: "2025-09-01", lastSeen: "2026-02-05" },
      { name: "Kubernetes", count: 5, firstSeen: "2025-09-15", lastSeen: "2026-02-11" },
      { name: "Datadog", count: 4, firstSeen: "2025-10-01", lastSeen: "2026-02-08" },
      { name: "Snowflake", count: 4, firstSeen: "2025-10-03", lastSeen: "2026-02-10" },
      { name: "dbt", count: 3, firstSeen: "2025-10-03", lastSeen: "2026-02-10" },
    ],
    totalJobsAnalyzed: 12,
    periodStart: "2025-09-01",
    periodEnd: "2026-02-11",
    expectedCategories: ["financial_systems", "application_stack", "platform_infrastructure", "data_ai"],
    expectedTechnologies: ["Temenos", "Stripe", "Go", "Kubernetes", "Datadog", "Snowflake"],
    expectedNarrativeTerms: ["vendor", "platform", "payments", "banking", "data", "observability", "engine by starling"],
  },
  {
    id: "data-heavy-fintech",
    companyName: "Benchmark Analytics Fintech",
    strategicContext: `## Strategic Context
Latest company insight generated: 2026-02-10
Headline: Data platform remains central
Key signal: Research suggests the company is scaling a data-led underwriting and data-sharing model.
Named strategic evidence:
- [verified news] Benchmark Analytics Fintech expands data partnerships: Leadership highlighted Plaid-driven acquisition and tighter warehouse governance for analytics products.`,
    technologies: [
      { name: "Python", count: 8, firstSeen: "2025-08-01", lastSeen: "2026-02-11" },
      { name: "Databricks", count: 5, firstSeen: "2025-08-20", lastSeen: "2026-02-02" },
      { name: "Snowflake", count: 5, firstSeen: "2025-08-20", lastSeen: "2026-02-02" },
      { name: "Airflow", count: 4, firstSeen: "2025-09-01", lastSeen: "2026-01-28" },
      { name: "Plaid", count: 4, firstSeen: "2025-09-15", lastSeen: "2026-02-10" },
      { name: "Terraform", count: 4, firstSeen: "2025-10-01", lastSeen: "2026-02-10" },
      { name: "Looker", count: 3, firstSeen: "2025-10-01", lastSeen: "2026-02-10" },
    ],
    totalJobsAnalyzed: 10,
    periodStart: "2025-08-01",
    periodEnd: "2026-02-11",
    expectedCategories: ["financial_systems", "platform_infrastructure", "data_ai"],
    expectedTechnologies: ["Python", "Databricks", "Snowflake", "Airflow", "Plaid", "Terraform", "Looker"],
    expectedNarrativeTerms: ["data", "build-vs-buy", "platform", "uncertainty"],
  },
];

export const WEEKLY_DIGEST_BENCHMARKS: WeeklyDigestBenchmarkCase[] = [
  {
    id: "continued-field-sales",
    companyName: "Neo Financial",
    input: {
      company_name: "Neo Financial",
      week_job_count: 7,
      current_open_job_count: 34,
      year_to_date_job_count: 58,
      weekly_role_themes: [
        { id: "in_person_sales", label: "In-person sales", count: 5, sample_titles: ["Sales Representative - Yorkdale", "Sales Representative - Chinook Centre"] },
        { id: "lending_mortgage", label: "Lending and mortgage", count: 2, sample_titles: ["Mortgage Fulfillment Specialist", "Mortgage Advisor"] },
      ],
      open_role_themes: [
        { id: "in_person_sales", label: "In-person sales", count: 18, sample_titles: ["Sales Representative - Yorkdale"] },
      ],
      year_to_date_role_themes: [
        { id: "in_person_sales", label: "In-person sales", count: 29, sample_titles: ["Sales Representative - Yorkdale"] },
        { id: "lending_mortgage", label: "Lending and mortgage", count: 6, sample_titles: ["Mortgage Advisor"] },
      ],
      continuing_themes: ["In-person sales", "Lending and mortgage"],
      new_themes: [],
      sample_titles: ["Sales Representative - Yorkdale", "Sales Representative - Chinook Centre", "Mortgage Fulfillment Specialist"],
      continuity: "continuing",
    },
    expectedContinuity: "continuing",
    expectedInclude: ["continues", "in-person sales", "year"],
    expectedExclude: ["pivot", "new direction", "surprise move"],
  },
  {
    id: "new-risk-ai-signal",
    companyName: "EQ Bank",
    input: {
      company_name: "EQ Bank",
      week_job_count: 6,
      current_open_job_count: 21,
      year_to_date_job_count: 31,
      weekly_role_themes: [
        { id: "ai_ml_risk", label: "AI and machine learning for risk", count: 2, sample_titles: ["Senior Machine Learning Engineer, Fraud", "Manager, Credit Risk Models"] },
        { id: "sales", label: "Sales", count: 3, sample_titles: ["Business Development Manager, Prairies"] },
      ],
      open_role_themes: [
        { id: "sales", label: "Sales", count: 8, sample_titles: ["Business Development Manager, Prairies"] },
      ],
      year_to_date_role_themes: [
        { id: "sales", label: "Sales", count: 12, sample_titles: ["Business Development Manager, Prairies"] },
        { id: "risk_fraud", label: "Risk and fraud", count: 2, sample_titles: ["Director, Special Loans and Restructuring"] },
      ],
      continuing_themes: ["Sales"],
      new_themes: ["AI and machine learning for risk"],
      sample_titles: ["Senior Machine Learning Engineer, Fraud", "Manager, Credit Risk Models", "Business Development Manager, Prairies"],
      continuity: "mixed",
    },
    expectedContinuity: "mixed",
    expectedInclude: ["sales", "new", "risk"],
    expectedExclude: ["transformation", "bets big", "dramatic shift"],
  },
];

export function scoreJobStructureBenchmark(output: string[], benchmark: JobStructureBenchmarkCase) {
  const lower = output.map((item) => item.toLowerCase());
  const includeHits = benchmark.expectedInclude.filter((item) => lower.includes(item.toLowerCase())).length;
  const excludeHits = benchmark.expectedExclude.filter((item) => lower.includes(item.toLowerCase())).length;

  const precision = benchmark.expectedInclude.length === 0
    ? 0
    : Math.round((includeHits / benchmark.expectedInclude.length) * 100);
  const antiNoise = Math.max(0, 100 - Math.round((excludeHits / Math.max(1, benchmark.expectedExclude.length)) * 100));

  return Math.round((precision * 0.7) + (antiNoise * 0.3));
}

export function scoreTechStackBenchmark(output: CompanyTechStack, benchmark: TechStackBenchmarkCase) {
  const categoryIds = output.categories.map((category) => category.category.toLowerCase());
  const techNames = output.categories.flatMap((category) =>
    category.technologies.map((technology) => technology.name.toLowerCase())
  );
  const narrative = [
    output.architectSummary ?? "",
    ...output.categories.map((category) => category.narrativeSummary ?? ""),
  ]
    .join(" ")
    .toLowerCase();

  const categoryHits = benchmark.expectedCategories.filter((category) => categoryIds.includes(category.toLowerCase())).length;
  const techHits = benchmark.expectedTechnologies.filter((technology) => techNames.includes(technology.toLowerCase())).length;
  const narrativeHits = benchmark.expectedNarrativeTerms.filter((term) => narrative.includes(term.toLowerCase())).length;

  const categoryScore = Math.round((categoryHits / Math.max(1, benchmark.expectedCategories.length)) * 100);
  const techScore = Math.round((techHits / Math.max(1, benchmark.expectedTechnologies.length)) * 100);
  const narrativeScore = Math.round((narrativeHits / Math.max(1, benchmark.expectedNarrativeTerms.length)) * 100);

  return Math.round((categoryScore * 0.35) + (techScore * 0.35) + (narrativeScore * 0.3));
}

export function scoreWeeklyDigestBenchmark(output: DigestCommentary, benchmark: WeeklyDigestBenchmarkCase) {
  const text = `${output.headline} ${output.body}`.toLowerCase();
  const includeHits = benchmark.expectedInclude.filter((item) => text.includes(item.toLowerCase())).length;
  const excludeHits = benchmark.expectedExclude.filter((item) => text.includes(item.toLowerCase())).length;
  const continuityTerms =
    benchmark.expectedContinuity === "continuing"
      ? /(continue|continuing|still|remains)/i.test(text)
      : benchmark.expectedContinuity === "new_focus"
        ? /(new|first|different|shift)/i.test(text)
        : /(continue|continuing|still|remains|new|shift)/i.test(text);

  const includeScore = Math.round((includeHits / Math.max(1, benchmark.expectedInclude.length)) * 100);
  const excludeScore = Math.max(0, 100 - Math.round((excludeHits / Math.max(1, benchmark.expectedExclude.length)) * 100));
  const continuityScore = continuityTerms ? 100 : 30;

  return Math.round((includeScore * 0.45) + (excludeScore * 0.3) + (continuityScore * 0.25));
}
