import type { IntegrationConfig, IntegrationResult, SubmissionPayload } from '@/shared/types/integration';

export async function verifyN8n(
  config: IntegrationConfig,
): Promise<{ success: boolean; displayName?: string; error?: string }> {
  const { webhookUrl } = config.credentials;
  if (!webhookUrl) {
    return { success: false, error: 'Webhook URL is required' };
  }

  try {
    const url = new URL(webhookUrl);
    if (!url.protocol.startsWith('http')) {
      return { success: false, error: 'URL must use HTTP or HTTPS' };
    }
  } catch {
    return { success: false, error: 'Invalid URL format' };
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ test: true, source: 'design-qa-helper' }),
    });

    if (!response.ok) {
      return { success: false, error: `Webhook returned ${response.status}` };
    }

    return { success: true, displayName: new URL(webhookUrl).host };
  } catch (err) {
    return { success: false, error: (err as Error).message || 'Connection failed' };
  }
}

export async function submitToN8n(
  config: IntegrationConfig,
  payload: SubmissionPayload,
): Promise<IntegrationResult> {
  const { webhookUrl } = config.credentials;

  if (!webhookUrl) {
    return { integrationId: 'n8n', success: false, error: 'Webhook URL is required' };
  }

  try {
    console.log('[N8N] Sending webhook:', webhookUrl);

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        summary: payload.summary,
        changes: payload.changes.map((c) => ({
          selector: c.selector,
          description: c.description,
          properties: c.properties,
        })),
        screenshots: payload.screenshots.map((s) => ({
          filename: s.filename,
          dataUrl: s.dataUrl,
        })),
        manualNotes: payload.manualNotes,
        pageUrl: payload.pageUrl,
        pageTitle: payload.pageTitle,
        timestamp: Date.now(),
        // Video excluded — too large for webhook payload
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Webhook ${response.status}: ${errBody}`);
    }

    console.log('[N8N] Webhook sent successfully');

    return {
      integrationId: 'n8n',
      success: true,
      url: webhookUrl,
    };
  } catch (error) {
    return {
      integrationId: 'n8n',
      success: false,
      error: (error as Error).message,
    };
  }
}
