import { OIDC_CONFIG } from '../config';

// 1. PKCE Helpers using browser's native Web Crypto API
function generateRandomString(length = 48) {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const values = new Uint8Array(length);
  window.crypto.getRandomValues(values);
  return Array.from(values, (dec) => charset[dec % charset.length]).join('');
}

async function sha256(plain) {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  return window.crypto.subtle.digest('SHA-256', data);
}

function base64urlencode(a) {
  let str = "";
  const bytes = new Uint8Array(a);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    str += String.fromCharCode(bytes[i]);
  }
  return btoa(str)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// 2. Decode JWT profile information
export function parseJwt(token) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      window.atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (e) {
    console.error('Failed to parse JWT payload', e);
    return null;
  }
}

// 3. OIDC Service Client
export const oidcService = {
  async initiateLogin() {
    const state = generateRandomString(16);
    const codeVerifier = generateRandomString(64);
    
    sessionStorage.setItem('oidc_state', state);
    sessionStorage.setItem('oidc_code_verifier', codeVerifier);

    const hashed = await sha256(codeVerifier);
    const codeChallenge = base64urlencode(hashed);

    const authUrl = new URL(`${OIDC_CONFIG.authority}/authorize`);
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('client_id', OIDC_CONFIG.clientId);
    authUrl.searchParams.append('redirect_uri', OIDC_CONFIG.redirectUri);
    authUrl.searchParams.append('scope', OIDC_CONFIG.scope);
    authUrl.searchParams.append('state', state);
    authUrl.searchParams.append('code_challenge', codeChallenge);
    authUrl.searchParams.append('code_challenge_method', 'S256');

    // Redirect to Cloud Identity Provider login screen
    window.location.href = authUrl.toString();
  },

  async handleCallback(code, state) {
    const savedState = sessionStorage.getItem('oidc_state');
    const codeVerifier = sessionStorage.getItem('oidc_code_verifier');

    sessionStorage.removeItem('oidc_state');
    sessionStorage.removeItem('oidc_code_verifier');

    if (state !== savedState) {
      throw new Error('State validation failed (Anti-CSRF Protection).');
    }

    const payload = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: OIDC_CONFIG.clientId,
      code_verifier: codeVerifier,
      code: code,
      redirect_uri: OIDC_CONFIG.redirectUri,
    });

    const response = await fetch(`${OIDC_CONFIG.authority}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: payload.toString(),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Token exchange failed: ${errText}`);
    }

    const tokens = await response.json();
    const idToken = tokens.id_token;
    const accessToken = tokens.access_token;
    
    // Extract claims from ID Token
    const profile = parseJwt(idToken);
    
    return {
      accessToken,
      idToken,
      profile
    };
  },

  initiateLogout() {
    const logoutUrl = new URL(`${OIDC_CONFIG.authority}/v2/logout`);
    logoutUrl.searchParams.append('client_id', OIDC_CONFIG.clientId);
    logoutUrl.searchParams.append('returnTo', OIDC_CONFIG.postLogoutRedirectUri);
    
    // Redirect to Cloud Identity Provider logout
    window.location.href = logoutUrl.toString();
  }
};
