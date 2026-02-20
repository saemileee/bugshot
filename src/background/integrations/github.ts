import type { IntegrationConfig, IntegrationResult, SubmissionPayload } from '@/shared/types/integration';

export async function verifyGithub(
  config: IntegrationConfig,
): Promise<{ success: boolean; displayName?: string; error?: string }> {
  const { token } = config.credentials;
  if (!token) {
    return { success: false, error: 'Personal Access Token is required' };
  }

  try {
    const response = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
      },
    });

    if (!response.ok) {
      if (response.status === 401) return { success: false, error: 'Invalid token' };
      return { success: false, error: `GitHub API ${response.status}` };
    }

    const user = await response.json();
    return { success: true, displayName: user.login || 'GitHub User' };
  } catch (err) {
    return { success: false, error: (err as Error).message || 'Connection failed' };
  }
}

export async function submitToGithub(
  config: IntegrationConfig,
  payload: SubmissionPayload,
): Promise<IntegrationResult> {
  const { token } = config.credentials;
  const { owner, repo } = config.settings;

  if (!token || !owner || !repo) {
    return { integrationId: 'github', success: false, error: 'Token, owner, and repo are required' };
  }

  try {
    const body = buildGithubBody(payload);

    console.log('[GitHub] Creating issue:', { owner, repo, title: payload.summary });

    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: payload.summary,
        body,
        labels: config.settings.labels ? config.settings.labels.split(',').map((l) => l.trim()).filter(Boolean) : undefined,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`GitHub API ${response.status}: ${errBody}`);
    }

    const issue = await response.json();
    console.log('[GitHub] Issue created:', issue.number);

    return {
      integrationId: 'github',
      success: true,
      issueKey: `#${issue.number}`,
      url: issue.html_url,
    };
  } catch (error) {
    return {
      integrationId: 'github',
      success: false,
      error: (error as Error).message,
    };
  }
}

function buildGithubBody(payload: SubmissionPayload): string {
  const lines: string[] = [];

  for (const change of payload.changes) {
    lines.push(`### Element: \`${change.selector}\``);
    lines.push('');

    if (change.description) {
      lines.push(`> ${change.description}`);
      lines.push('');
    }

    if (change.properties.length > 0) {
      lines.push('| Property | As-Is | To-Be |');
      lines.push('|----------|-------|-------|');
      for (const prop of change.properties) {
        lines.push(`| \`${prop.property}\` | ${prop.asIs} | ${prop.toBe} |`);
      }
      lines.push('');
    }
  }

  if (payload.screenshots.length > 0) {
    lines.push(`### Screenshots`);
    lines.push(`${payload.screenshots.length} screenshot(s) captured`);
    lines.push('');
  }

  if (payload.manualNotes) {
    lines.push('### Notes');
    lines.push(payload.manualNotes);
    lines.push('');
  }

  lines.push('### Context');
  lines.push(`- Page: [${payload.pageUrl}](${payload.pageUrl})`);
  lines.push(`- Captured: ${new Date().toLocaleString()}`);
  lines.push('');
  lines.push('---');
  lines.push('*Created by BugShot*');

  return lines.join('\n');
}
