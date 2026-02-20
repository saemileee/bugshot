import { tokenStore } from './token-store';
import type { AccessibleResource } from './types';
import {
  JIRA_CLIENT_ID,
  JIRA_AUTH_URL,
  JIRA_TOKEN_URL,
  JIRA_ACCESSIBLE_RESOURCES_URL,
  STORAGE_KEYS,
} from '@/shared/constants';

function getRedirectUrl(): string {
  return chrome.identity.getRedirectURL('oauth2/callback');
}

/**
 * Generate PKCE code verifier and challenge.
 * This eliminates the need for a client_secret in the extension code.
 */
async function generatePKCE(): Promise<{ verifier: string; challenge: string }> {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  const verifier = btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return { verifier, challenge };
}

export async function initiateJiraAuth(): Promise<boolean> {
  const state = crypto.randomUUID();
  const { verifier, challenge } = await generatePKCE();

  await chrome.storage.session.set({ oauthState: state, codeVerifier: verifier });

  const authUrl = new URL(JIRA_AUTH_URL);
  authUrl.searchParams.set('audience', 'api.atlassian.com');
  authUrl.searchParams.set('client_id', JIRA_CLIENT_ID);
  authUrl.searchParams.set('scope', [
    'read:jira-work',
    'write:jira-work',
    'read:jira-user',
    'read:me',
    'offline_access',
  ].join(' '));
  authUrl.searchParams.set('redirect_uri', getRedirectUrl());
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('prompt', 'consent');
  authUrl.searchParams.set('code_challenge', challenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');

  return new Promise((resolve) => {
    chrome.identity.launchWebAuthFlow(
      {
        url: authUrl.toString(),
        interactive: true,
      },
      async (redirectUrl) => {
        if (chrome.runtime.lastError || !redirectUrl) {
          console.error('OAuth failed:', chrome.runtime.lastError);
          resolve(false);
          return;
        }

        const url = new URL(redirectUrl);
        const code = url.searchParams.get('code');
        const returnedState = url.searchParams.get('state');

        const { oauthState } = await chrome.storage.session.get('oauthState');
        if (returnedState !== oauthState) {
          console.error('OAuth state mismatch');
          resolve(false);
          return;
        }

        const success = await exchangeCodeForTokens(code!);
        resolve(success);
      },
    );
  });
}

async function exchangeCodeForTokens(code: string): Promise<boolean> {
  try {
    const { codeVerifier } = await chrome.storage.session.get('codeVerifier');

    const response = await fetch(JIRA_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: JIRA_CLIENT_ID,
        code,
        redirect_uri: getRedirectUrl(),
        code_verifier: codeVerifier,
      }),
    });

    if (!response.ok) {
      throw new Error(`Token exchange failed: ${response.status}`);
    }

    const data = await response.json();
    await tokenStore.saveTokens({
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + data.expires_in * 1000,
      scope: data.scope,
    });

    await fetchAndStoreCloudId(data.access_token);

    // Clean up PKCE state
    await chrome.storage.session.remove(['oauthState', 'codeVerifier']);

    return true;
  } catch (error) {
    console.error('Token exchange error:', error);
    return false;
  }
}

async function fetchAndStoreCloudId(accessToken: string): Promise<void> {
  const response = await fetch(JIRA_ACCESSIBLE_RESOURCES_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const resources: AccessibleResource[] = await response.json();

  if (resources.length > 0) {
    await chrome.storage.sync.set({
      [STORAGE_KEYS.JIRA_CLOUD_ID]: resources[0].id,
      [STORAGE_KEYS.JIRA_CLOUD_NAME]: resources[0].name,
      [STORAGE_KEYS.JIRA_CLOUD_URL]: resources[0].url,
    });
  }
}

export async function getValidAccessToken(): Promise<string> {
  const tokens = await tokenStore.getTokens();
  if (!tokens) throw new Error('Not authenticated');

  if (tokens.expiresAt - 60000 < Date.now()) {
    return refreshAccessToken(tokens.refreshToken);
  }
  return tokens.accessToken;
}

async function refreshAccessToken(refreshToken: string): Promise<string> {
  const response = await fetch(JIRA_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: JIRA_CLIENT_ID,
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    await tokenStore.clearTokens();
    throw new Error('Refresh token expired. Re-authentication required.');
  }

  const data = await response.json();
  await tokenStore.saveTokens({
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
    scope: data.scope,
  });
  return data.access_token;
}

export async function isAuthenticated(): Promise<boolean> {
  const tokens = await tokenStore.getTokens();
  return tokens !== null;
}

export async function logout(): Promise<void> {
  await tokenStore.clearTokens();
  await chrome.storage.sync.remove([
    STORAGE_KEYS.JIRA_CLOUD_ID,
    STORAGE_KEYS.JIRA_CLOUD_NAME,
    STORAGE_KEYS.JIRA_CLOUD_URL,
  ]);
}
