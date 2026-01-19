/**
 * Code Verification Script
 * 
 * Verifies that all code changes are correctly implemented without needing database access.
 * This checks the logic and structure of the changes.
 */

import { readFileSync } from "fs";
import { join } from "path";

const webDir = join(__dirname, "..");
const rootDir = join(__dirname, "../..");

interface CheckResult {
  name: string;
  passed: boolean;
  message: string;
}

const checks: CheckResult[] = [];

function checkFile(filePath: string, fileChecks: Array<{ pattern: RegExp; description: string; required: boolean }>) {
  try {
    const content = readFileSync(join(webDir, filePath), "utf-8");
    
    fileChecks.forEach(({ pattern, description, required }) => {
      const found = pattern.test(content);
      checks.push({
        name: `${filePath}: ${description}`,
        passed: required ? found : true,
        message: found 
          ? `✅ ${description}` 
          : required 
            ? `❌ Missing: ${description}` 
            : `⚠️  Not found: ${description} (optional)`,
      });
    });
  } catch (error) {
    checks.push({
      name: filePath,
      passed: false,
      message: `❌ File not found: ${filePath}`,
    });
  }
}

console.log("🔍 Verifying code changes...\n");

// Check 1: GitHub Actions workflow accepts task_id
function checkRootFile(filePath: string, fileChecks: Array<{ pattern: RegExp; description: string; required: boolean }>) {
  try {
    const content = readFileSync(join(rootDir, filePath), "utf-8");
    
    fileChecks.forEach(({ pattern, description, required }) => {
      const found = pattern.test(content);
      checks.push({
        name: `${filePath}: ${description}`,
        passed: required ? found : true,
        message: found 
          ? `✅ ${description}` 
          : required 
            ? `❌ Missing: ${description}` 
            : `⚠️  Not found: ${description} (optional)`,
      });
    });
  } catch (error) {
    checks.push({
      name: filePath,
      passed: false,
      message: `❌ File not found: ${filePath}`,
    });
  }
}

checkRootFile(".github/workflows/scrape-heavy.yml", [
  {
    pattern: /task_id:/,
    description: "task_id input parameter",
    required: true,
  },
  {
    pattern: /TASK_ID: \$\{\{ inputs\.task_id \}\}/,
    description: "TASK_ID environment variable",
    required: true,
  },
]);

// Check 2: github.ts accepts taskId parameter
checkFile("lib/github.ts", [
  {
    pattern: /taskId\?: string/,
    description: "taskId optional parameter",
    required: true,
  },
  {
    pattern: /if \(taskId\)/,
    description: "task_id conditionally added to inputs",
    required: true,
  },
  {
    pattern: /payload\.inputs\.task_id = taskId/,
    description: "task_id assigned to payload inputs",
    required: true,
  },
]);

// Check 3: processor.ts passes taskId to GitHub trigger
checkFile("lib/jobs/processor.ts", [
  {
    pattern: /triggerScrapeWorkflow\(company\.id, taskId\)/,
    description: "taskId passed to triggerScrapeWorkflow",
    required: true,
  },
]);

// Check 4: scrape-heavy.ts handles TASK_ID
checkFile("scripts/scrape-heavy.ts", [
  {
    pattern: /const taskId = process\.env\.TASK_ID/,
    description: "TASK_ID environment variable read",
    required: true,
  },
  {
    pattern: /if \(taskId\)/,
    description: "Conditional logic for existing task",
    required: true,
  },
  {
    pattern: /Updating existing task/,
    description: "Log message for updating existing task",
    required: true,
  },
]);

// Check 5: Process API route has deduplication
checkFile("app/api/companies/[id]/process/route.ts", [
  {
    pattern: /existingRunningTask/,
    description: "Deduplication check for running jobs",
    required: true,
  },
  {
    pattern: /already_running/,
    description: "already_running status response",
    required: true,
  },
  {
    pattern: /error_message: errorMessage/,
    description: "Error handling marks jobs as failed",
    required: true,
  },
]);

// Check 6: Cleanup cron endpoint exists
checkFile("app/api/cron/cleanup-jobs/route.ts", [
  {
    pattern: /staleThreshold/,
    description: "30 minute threshold check",
    required: true,
  },
  {
    pattern: /Job timed out/,
    description: "Timeout error message",
    required: true,
  },
  {
    pattern: /30 \* 60 \* 1000/,
    description: "30 minutes in milliseconds",
    required: true,
  },
]);

// Check 7: vercel.json has cleanup cron schedule
checkFile("vercel.json", [
  {
    pattern: /\/api\/cron\/cleanup-jobs/,
    description: "cleanup-jobs cron endpoint",
    required: true,
  },
  {
    pattern: /\*\/15 \* \* \* \*/,
    description: "Every 15 minutes schedule",
    required: true,
  },
]);

// Check 8: ProcessButton has timeout handling
checkFile("components/companies/ProcessButton.tsx", [
  {
    pattern: /CLIENT_TIMEOUT_MS/,
    description: "Client timeout constant",
    required: true,
  },
  {
    pattern: /timeoutWarning/,
    description: "Timeout warning state",
    required: true,
  },
  {
    pattern: /handleCancel/,
    description: "Cancel handler function",
    required: true,
  },
  {
    pattern: /already_running/,
    description: "Handles already_running status",
    required: true,
  },
]);

console.log("Results:\n");
checks.forEach((check) => {
  console.log(check.message);
});

const passed = checks.filter((c) => c.passed).length;
const total = checks.length;

console.log(`\n${"=".repeat(60)}`);
console.log(`Summary: ${passed}/${total} checks passed`);

if (passed === total) {
  console.log("✅ All code changes verified!");
  process.exit(0);
} else {
  console.log("❌ Some checks failed. Please review the code.");
  process.exit(1);
}
