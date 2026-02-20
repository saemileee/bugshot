import { credentialStore } from './token-store';
import type { JiraCredentials } from './types';

/**
 * Normalize site URL: strip protocol, trailing slashes
 * "https://mysite.atlassian.net/" → "mysite.atlassian.net"
 */
function normalizeSiteUrl(raw: string): string {
  return raw
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '');
}

/**
 * Build Basic Auth header value from email + API token.
 */
export function buildBasicAuth(email: string, apiToken: string): string {
  return btoa(`${email}:${apiToken}`);
}

/**
 * Save credentials and test the connection.
 * Returns the display name of the Jira user on success.
 */
export async function saveAndVerify(
  email: string,
  apiToken: string,
  siteUrl: string,
): Promise<{ success: true; displayName: string } | { success: false; error: string }> {
  const normalized = normalizeSiteUrl(siteUrl);

  try {
    const response = await fetch(`https://${normalized}/rest/api/3/myself`, {
      headers: {
        Authorization: `Basic ${buildBasicAuth(email, apiToken)}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        return { success: false, error: 'Invalid email or API token' };
      }
      if (response.status === 403) {
        return { success: false, error: 'API token does not have permission' };
      }
      return { success: false, error: `Connection failed (${response.status})` };
    }

    const user = await response.json();

    await credentialStore.save({
      email,
      apiToken,
      siteUrl: normalized,
    });

    return { success: true, displayName: user.displayName || email };
  } catch (err) {
    return { success: false, error: (err as Error).message || 'Connection failed' };
  }
}

export async function isAuthenticated(): Promise<boolean> {
  const creds = await credentialStore.get();
  return creds !== null;
}

export async function getCredentials(): Promise<JiraCredentials> {
  const creds = await credentialStore.get();
  if (!creds) throw new Error('Not authenticated. Configure Jira in Settings.');
  return creds;
}

export async function logout(): Promise<void> {
  await credentialStore.clear();
}
