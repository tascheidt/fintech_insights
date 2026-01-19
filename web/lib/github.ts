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

  const workflowFile = "scrape-heavy.yml";
  const url = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowFile}/dispatches`;

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

      const fullError = `Failed to trigger workflow: ${errorMessage}`;
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
