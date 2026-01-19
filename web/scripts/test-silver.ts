#!/usr/bin/env npx tsx
/**
 * Test Silver Layer Extraction
 * 
 * Tests the extractJobStructure function with a realistic job description.
 * 
 * Usage:
 *   npx tsx web/scripts/test-silver.ts
 *   # Or with .env.local:
 *   npx tsx --env-file=.env.local web/scripts/test-silver.ts
 * 
 * Ensure GEMINI_API_KEY is set in .env.local or environment variables.
 */

// Note: tsx supports --env-file flag to load .env.local
// If not using --env-file, ensure GEMINI_API_KEY is exported in your shell

import { extractJobStructure } from "../lib/analysis/structure";

const SAMPLE_JOB_TITLE = "Senior React Engineer";

const SAMPLE_JOB_DESCRIPTION = `
We are looking for a Senior React Engineer to join our fintech team. This is a remote position with competitive compensation.

**About the Role:**
You'll be building and maintaining our customer-facing web applications using modern React and TypeScript. You'll work closely with product managers, designers, and backend engineers to deliver high-quality features.

**Responsibilities:**
- Develop and maintain React components using TypeScript
- Build responsive UIs that work across all devices
- Collaborate with backend engineers to integrate with Node.js APIs
- Deploy applications to AWS using CI/CD pipelines
- Write unit and integration tests
- Participate in code reviews and technical discussions

**Requirements:**
- 5+ years of experience with React and TypeScript
- Strong knowledge of modern JavaScript (ES6+)
- Experience with Node.js and RESTful APIs
- Familiarity with AWS services (S3, CloudFront, Lambda)
- Experience with testing frameworks (Jest, React Testing Library)
- Understanding of Git and version control
- Excellent communication skills

**Nice to Have:**
- Experience with Next.js or Remix
- Knowledge of PostgreSQL or other databases
- Experience with Docker and Kubernetes
- Background in fintech or financial services

**Compensation:**
$150,000 - $180,000 USD per year, plus equity and benefits.

**Location:**
Remote (US time zones preferred)

**Benefits:**
- Health, dental, and vision insurance
- 401(k) with company match
- Unlimited PTO
- Home office stipend
- Learning and development budget
`;

async function main() {
  console.log("🧪 Testing Silver Layer Extraction\n");
  console.log("═".repeat(70));
  console.log(`Job Title: ${SAMPLE_JOB_TITLE}`);
  console.log("═".repeat(70));
  console.log("\n📝 Sample Job Description:");
  console.log(SAMPLE_JOB_DESCRIPTION.substring(0, 200) + "...\n");
  console.log("═".repeat(70));
  console.log("\n🔍 Extracting structured data...\n");

  // Check for API key
  if (!process.env.GEMINI_API_KEY) {
    console.error("❌ GEMINI_API_KEY environment variable is not set");
    console.log("\nTo set it:");
    console.log("  1. Add GEMINI_API_KEY=your-key to .env.local in the web directory");
    console.log("  2. Or export GEMINI_API_KEY=your-key before running");
    process.exit(1);
  }

  console.log(`API Key: ${process.env.GEMINI_API_KEY.substring(0, 8)}...${process.env.GEMINI_API_KEY.substring(process.env.GEMINI_API_KEY.length - 4)}\n`);

  try {
    const startTime = Date.now();
    const result = await extractJobStructure(SAMPLE_JOB_TITLE, SAMPLE_JOB_DESCRIPTION);
    const duration = Date.now() - startTime;

    if (!result) {
      console.error("❌ Extraction failed - returned null");
      process.exit(1);
    }

    console.log("✅ Extraction successful!\n");
    console.log("═".repeat(70));
    console.log("📊 Extracted Structure:");
    console.log("═".repeat(70));
    console.log(JSON.stringify(result, null, 2));
    console.log("\n" + "═".repeat(70));
    console.log(`⏱️  Duration: ${duration}ms`);
    console.log("═".repeat(70));

    // Validate key fields
    console.log("\n🔍 Validation:");
    console.log(`  Summary: ${result.summary ? `✅ (${result.summary.length} chars)` : "❌ Missing"}`);
    console.log(`  Seniority Level: ${result.seniority_level ? `✅ ${result.seniority_level}` : "❌ Missing"}`);
    console.log(`  Salary: ${result.salary_min && result.salary_max ? `✅ $${result.salary_min.toLocaleString()} - $${result.salary_max.toLocaleString()} ${result.salary_currency}` : "⚠️  Not found"}`);
    console.log(`  Tech Stack: ${result.tech_stack.length > 0 ? `✅ [${result.tech_stack.join(", ")}]` : "❌ Empty"}`);
    console.log(`  Standardized Department: ${result.standardized_department ? `✅ ${result.standardized_department}` : "❌ Missing"}`);

    console.log("\n✅ Test completed successfully!");
  } catch (error) {
    console.error("\n❌ Test failed with error:");
    console.error(error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
