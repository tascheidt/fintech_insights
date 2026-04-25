import type { GitHubConfig } from "../types";

function getHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  };
}

/** Create a GitHub Issue in the configured repository */
export async function createGitHubIssue(
  config: GitHubConfig,
  input: { title: string; body: string; labels?: string[] }
): Promise<{ number: number; html_url: string }> {
  const headers = getHeaders(config.token);
  const url = `https://api.github.com/repos/${config.owner}/${config.repo}/issues`;

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
      body: JSON.stringify({ title: input.title, body: input.body }),
    });
  }

  if (!res.ok) {
    throw new Error(`GitHub API error ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as { number: number; html_url: string };
  return { number: data.number, html_url: data.html_url };
}

/** Trigger a GitHub Actions workflow for auto-implementing an issue */
export async function triggerCodeGenWorkflow(
  config: GitHubConfig,
  issueNumber: number
): Promise<void> {
  const headers = getHeaders(config.token);
  const workflowFile = config.codeGenWorkflowFile ?? "auto-implement.yml";
  const url = `https://api.github.com/repos/${config.owner}/${config.repo}/actions/workflows/${workflowFile}/dispatches`;

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      ref: "main",
      inputs: { issue_number: String(issueNumber) },
    }),
  });

  if (!res.ok) {
    throw new Error(
      `GitHub Actions trigger error ${res.status}: ${await res.text()}`
    );
  }
}
