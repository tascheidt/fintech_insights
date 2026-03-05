/**
 * GitHub API Utilities
 *
 * Functions for creating issues and triggering GitHub Actions workflows
 * from the Vercel backend.
 *
 * Required env vars: GJ_GITHUB_TOKEN, GJ_GITHUB_OWNER, GJ_GITHUB_REPO
 */

function getGitHubConfig() {
  const token = process.env.GJ_GITHUB_TOKEN;
  const owner = process.env.GJ_GITHUB_OWNER;
  const repo = process.env.GJ_GITHUB_REPO;
  if (!token || !owner || !repo) {
    throw new Error("GitHub integration not configured (GJ_GITHUB_TOKEN, GJ_GITHUB_OWNER, GJ_GITHUB_REPO required)");
  }
  return {
    token,
    owner,
    repo,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
  };
}

/**
 * Create a GitHub Issue in the configured repository
 */
export async function createGitHubIssue(input: {
  title: string;
  body: string;
  labels?: string[];
}): Promise<{ number: number; html_url: string }> {
  const { headers, owner, repo } = getGitHubConfig();
  const url = `https://api.github.com/repos/${owner}/${repo}/issues`;
  let res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      title: input.title,
      body: input.body,
      labels: input.labels ?? [],
    }),
  });
  // Retry without labels if they don't exist in the repo
  if (res.status === 422 && input.labels?.length) {
    res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        title: input.title,
        body: input.body,
      }),
    });
  }
  if (!res.ok) {
    throw new Error(`GitHub API error ${res.status}: ${await res.text()}`);
  }
  const data = await res.json() as { number: number; html_url: string };
  return { number: data.number, html_url: data.html_url };
}

/**
 * Trigger the auto-implement GitHub Actions workflow for a specific issue
 */
export async function triggerCodeGenWorkflow(issueNumber: number): Promise<void> {
  const { headers, owner, repo } = getGitHubConfig();
  const workflowFile = "auto-implement.yml";
  const url = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowFile}/dispatches`;
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      ref: "main",
      inputs: { issue_number: String(issueNumber) },
    }),
  });
  if (!res.ok) {
    throw new Error(`GitHub Actions trigger error ${res.status}: ${await res.text()}`);
  }
}

/**
 * GitHub Actions Workflow Trigger Utility
 *
 * Provides functions to programmatically trigger GitHub Actions workflows
 * from the Vercel backend.
 */

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
    console.error(`❌ ${error}`);
    throw new Error(error);
  }

  if (!owner) {
    const error = "GJ_GITHUB_OWNER environment variable is not set";
    console.error(`❌ ${error}`);
    throw new Error(error);
  }

  if (!repo) {
    const error = "GJ_GITHUB_REPO environment variable is not set";
    console.error(`❌ ${error}`);
    throw new Error(error);
  }

  if (!companyId || typeof companyId !== "string") {
    const error = "companyId must be a non-empty string";
    console.error(`❌ ${error}`);
    throw new Error(error);
  }

  // GitHub API expects workflow file path relative to .github/workflows/
  // Can use filename, workflow ID, or full path
  const workflowFile = "scrape-heavy.yml";
  const url = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowFile}/dispatches`;
  
  // Log the URL being used for debugging
  console.log(`🔍 Triggering workflow at: ${url}`);

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
    console.log(`🚀 Triggering GitHub Actions workflow for company: ${companyId}`);
    console.log(`   Repository: ${owner}/${repo}`);
    console.log(`   Workflow: ${workflowFile}`);
    console.log(`   Branch: ${payload.ref}`);
    
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
      console.error(`❌ ${fullError}`);
      console.error(`   Status: ${response.status}`);
      console.error(`   URL: ${url}`);
      throw new Error(fullError);
    }

    console.log(`✅ Successfully triggered workflow for company: ${companyId}${taskId ? ` (updating task ${taskId})` : ''}`);
  } catch (error) {
    // Re-throw if it's already our Error
    if (error instanceof Error) {
      throw error;
    }
    
    // Wrap unknown errors
    const errorMessage = `Unexpected error triggering workflow: ${String(error)}`;
    console.error(`❌ ${errorMessage}`);
    throw new Error(errorMessage);
  }
}
