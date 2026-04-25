/**
 * GitHub Actions Workflow Trigger Utility
 *
 * Provides functions to programmatically trigger GitHub Actions workflows
 * from the Vercel backend.
 *
 * Feedback-related GitHub functions (createGitHubIssue, triggerCodeGenWorkflow)
 * have been moved to @tascheidt/feedback. Thin wrappers here for backward compat.
 */
import {
  createGitHubIssue as _createGitHubIssue,
  triggerCodeGenWorkflow as _triggerCodeGenWorkflow,
} from "@tascheidt/feedback";
import type { GitHubConfig } from "@tascheidt/feedback";
import { log } from "@/lib/log";

function getGitHubConfig(): GitHubConfig {
  const token = process.env.GJ_GITHUB_TOKEN;
  const owner = process.env.GJ_GITHUB_OWNER;
  const repo = process.env.GJ_GITHUB_REPO;
  if (!token || !owner || !repo) {
    throw new Error("GitHub integration not configured (GJ_GITHUB_TOKEN, GJ_GITHUB_OWNER, GJ_GITHUB_REPO required)");
  }
  return { token, owner, repo };
}

/** Create a GitHub Issue (delegates to @tascheidt/feedback) */
export async function createGitHubIssue(input: {
  title: string;
  body: string;
  labels?: string[];
}): Promise<{ number: number; html_url: string }> {
  return _createGitHubIssue(getGitHubConfig(), input);
}

/** Trigger auto-implement workflow (delegates to @tascheidt/feedback) */
export async function triggerCodeGenWorkflow(issueNumber: number): Promise<void> {
  return _triggerCodeGenWorkflow(getGitHubConfig(), issueNumber);
}

/**
 * Trigger the "Heavy Scraper" GitHub Actions workflow for a company
 * 
 * @param companyId - UUID of the company to scrape
 * @param taskId - Optional UUID of the existing task to update (instead of creating new one)
 * @throws Error if the workflow trigger fails
 */
export async function triggerScrapeWorkflow(companyId: string, taskId?: string): Promise<void> {
  const token = process.env.GJ_GITHUB_TOKEN;
  const owner = process.env.GJ_GITHUB_OWNER;
  const repo = process.env.GJ_GITHUB_REPO;

  // Validate environment variables
  if (!token) {
    const error = "GJ_GITHUB_TOKEN environment variable is not set";
    log.error(`❌ ${error}`);
    throw new Error(error);
  }

  if (!owner) {
    const error = "GJ_GITHUB_OWNER environment variable is not set";
    log.error(`❌ ${error}`);
    throw new Error(error);
  }

  if (!repo) {
    const error = "GJ_GITHUB_REPO environment variable is not set";
    log.error(`❌ ${error}`);
    throw new Error(error);
  }

  if (!companyId || typeof companyId !== "string") {
    const error = "companyId must be a non-empty string";
    log.error(`❌ ${error}`);
    throw new Error(error);
  }

  // GitHub API expects workflow file path relative to .github/workflows/
  // Can use filename, workflow ID, or full path
  const workflowFile = "scrape-heavy.yml";
  const url = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowFile}/dispatches`;
  
  // Log the URL being used for debugging
  log.info(`🔍 Triggering workflow at: ${url}`);

  const payload: {
    ref: string;
    inputs: {
      company_id: string;
      task_id?: string;
    };
  } = {
    ref: "main",
    inputs: {
      company_id: companyId,
    },
  };

  // Add task_id if provided
  if (taskId) {
    payload.inputs.task_id = taskId;
  }

  try {
    log.info(`🚀 Triggering GitHub Actions workflow for company: ${companyId}`);
    log.info(`   Repository: ${owner}/${repo}`);
    log.info(`   Workflow: ${workflowFile}`);
    log.info(`   Branch: ${payload.ref}`);
    
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage: string;
      
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.message || errorText;
      } catch {
        errorMessage = errorText || `HTTP ${response.status} ${response.statusText}`;
      }

      // Provide helpful debugging information for common errors
      let debugInfo = "";
      if (response.status === 404) {
        debugInfo = `\n   Troubleshooting:\n   - Verify repository name: ${owner}/${repo}\n   - Check workflow file exists: .github/workflows/${workflowFile}\n   - Ensure workflow is in the default branch (${payload.ref})\n   - Verify GitHub token has 'actions:write' permission`;
      } else if (response.status === 403) {
        debugInfo = `\n   Troubleshooting:\n   - Verify GitHub token has 'actions:write' permission\n   - Check token hasn't expired\n   - Ensure repository access is granted`;
      }

      const fullError = `Failed to trigger workflow: ${errorMessage}${debugInfo}`;
      log.error(`❌ ${fullError}`);
      log.error(`   Status: ${response.status}`);
      log.error(`   URL: ${url}`);
      throw new Error(fullError);
    }

    log.info(`✅ Successfully triggered workflow for company: ${companyId}${taskId ? ` (updating task ${taskId})` : ''}`);
  } catch (error) {
    // Re-throw if it's already our Error
    if (error instanceof Error) {
      throw error;
    }
    
    // Wrap unknown errors
    const errorMessage = `Unexpected error triggering workflow: ${String(error)}`;
    log.error(`❌ ${errorMessage}`);
    throw new Error(errorMessage);
  }
}
