import { OpenAICompatProvider, type OpenAICompatConfig } from './openai-compat.js';
import { OAuthManager } from './oauth.js';

const CHATGPT_CLIENT_ID = 'pdlLIX2Y72MIbGcfXp6qZx/HQdMd4cEM';
const AUTH0_DOMAIN = 'https://auth0.openai.com';

export async function chatGptOAuthFlow(): Promise<string> {
  const deviceCodeResp = await fetch(`${AUTH0_DOMAIN}/oauth/device/code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: CHATGPT_CLIENT_ID,
      audience: 'https://api.openai.com/v1',
      scope: 'openid profile email offline_access',
    }),
  });

  if (!deviceCodeResp.ok) {
    const errorBody = await deviceCodeResp.text().catch(() => '');
    throw new Error(`ChatGPT device code request failed (${deviceCodeResp.status}): ${errorBody}`);
  }

  const deviceCode = (await deviceCodeResp.json()) as {
    device_code: string;
    user_code: string;
    verification_uri_complete: string;
    interval: number;
  };

  // ---
  console.log(`\n  Code: ${deviceCode.user_code}`);
  console.log(`  Visit: ${deviceCode.verification_uri_complete}\n`);
  // ---

  const pollInterval = (deviceCode.interval ?? 5) * 1000;
  const timeout = 300_000;
  const start = Date.now();

  while (Date.now() - start < timeout) {
    await new Promise((resolve) => setTimeout(resolve, pollInterval));

    const tokenResp = await fetch(`${AUTH0_DOMAIN}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        device_code: deviceCode.device_code,
        client_id: CHATGPT_CLIENT_ID,
      }),
    });

    if (!tokenResp.ok) {
      const errorBody = await tokenResp.text().catch(() => '');
      throw new Error(`ChatGPT token request failed (${tokenResp.status}): ${errorBody}`);
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
      throw new Error('ChatGPT device code expired. Please try again.');
    }

    if (error === 'access_denied') {
      throw new Error('ChatGPT authorization denied.');
    }

    throw new Error(`ChatGPT OAuth error: ${error ?? 'unknown'}`);
  }

  throw new Error('ChatGPT authorization timed out.');
}

export async function createChatGPTProvider(model: string): Promise<OpenAICompatProvider> {
  const oauthManager = new OAuthManager();
  let token = await oauthManager.loadToken('chatgpt');

  if (!token || oauthManager.isExpired(token)) {
    const accessToken = await chatGptOAuthFlow();
    token = {
      accessToken,
      tokenType: 'Bearer',
      expiresAt: Date.now() + 86400_000,
    };
    await oauthManager.saveToken('chatgpt', token);
  }

  const config: OpenAICompatConfig = {
    apiKey: token.accessToken,
    model,
    baseUrl: 'https://api.openai.com/v1',
  };

  return new OpenAICompatProvider(config, { input: 0, output: 0 });
}
