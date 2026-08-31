export const OIDC_CONFIG = {
  // Toggle OIDC authentication mode (true = use cloud IdP, false = fallback to local JWT)
  enabled: true,
  
  // Replace these with your actual cloud Identity Provider (Auth0, Okta, Asgardeo, OneLogin, etc.) credentials
  authority: 'https://dev-bookfair.us.auth0.com', 
  clientId: 'p8kZ2XN2R7P9u9mJp0o1N7n2P5q9x0L8', // Example/Mock Client ID (unsecured public identifier)
  
  redirectUri: 'https://localhost:5173/callback',
  postLogoutRedirectUri: 'https://localhost:5173/',
  scope: 'openid profile email'
};

export const API_BASE_URL = 'https://localhost:8443';
