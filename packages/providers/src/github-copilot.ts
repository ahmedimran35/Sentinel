import { OpenAICompatProvider, type OpenAICompatConfig } from './openai-compat.js';
import { OAuthManager } from './oauth.js';

const GITHUB_COPILOT_CLIENT_ID = 'Iv1.b507a4c0a4c3a5e2';
const COPILOT_API_BASE = 'https://api.githubcopilot.com';

export async function githubCopilotOAuthFlow(): Promise<string> {
  const deviceCodeResp = await fetch('https://github.com/login/device/code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: GITHUB_COPILOT_CLIENT_ID,
      scope: 'read:user',
    }),
  });

  if (!deviceCodeResp.ok) {
    const errorBody = await deviceCodeResp.text().catch(() => '');
    throw new Error(`GitHub device code request failed (${deviceCodeResp.status}): ${errorBody}`);
  }

  const deviceCode = (await deviceCodeResp.json()) as {
    device_code: string;
    user_code: string;
    verification_uri: string;
    interval: number;
  };

  // ---
  console.log(`\n  Code: ${deviceCode.user_code}`);
  console.log(`  Visit: ${deviceCode.verification_uri}\n`);
  // ---

  const pollInterval = (deviceCode.interval ?? 5) * 1000;
  const timeout = 300_000;
  const start = Date.now();

  while (Date.now() - start < timeout) {
    await new Promise((resolve) => setTimeout(resolve, pollInterval));

    const tokenResp = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: GITHUB_COPILOT_CLIENT_ID,
        device_code: deviceCode.device_code,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
    });

    if (!tokenResp.ok) {
      const errorBody = await tokenResp.text().catch(() => '');
      throw new Error(`GitHub token request failed (${tokenResp.status}): ${errorBody}`);
    }

    const tokenData = (await tokenResp.json()) as Record<string, unknown>;

    if (tokenData.access_token) {
      return tokenData.access_token as string;
    }

    const error = tokenData.error as string | undefined;
    if (error === 'authorization_pending' || error === 'slow_down') {
      continue;
    }

    if (error === 'expired_token') {
      throw new Error('GitHub Copilot device code expired. Please try again.');
    }

    if (error === 'access_denied') {
      throw new Error('GitHub Copilot authorization denied.');
    }

    throw new Error(`GitHub Copilot OAuth error: ${error ?? 'unknown'}`);
  }

  throw new Error('GitHub Copilot authorization timed out.');
}

export async function createGitHubCopilotProvider(model: string): Promise<OpenAICompatProvider> {
  const oauthManager = new OAuthManager();
  let token = await oauthManager.loadToken('github-copilot');

  if (!token || oauthManager.isExpired(token)) {
    const accessToken = await githubCopilotOAuthFlow();
    token = {
      accessToken,
      tokenType: 'Bearer',
      expiresAt: Date.now() + 86400_000,
    };
    await oauthManager.saveToken('github-copilot', token);
  }

  const config: OpenAICompatConfig = {
    apiKey: token.accessToken,
    model,
    baseUrl: COPILOT_API_BASE,
    headers: { 'Copilot-Integration-Id': 'opencode' },
  };

  return new OpenAICompatProvider(config, { input: 0, output: 0 });
}
