import { createHash, randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";

const ACCESS_TOKEN_COOKIE = "ms_access_token";
const REFRESH_TOKEN_COOKIE = "ms_refresh_token";
const EXPIRES_AT_COOKIE = "ms_expires_at";
const STATE_COOKIE = "ms_oauth_state";
const CODE_VERIFIER_COOKIE = "ms_code_verifier";

const MICROSOFT_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "User.Read",
  "Mail.Send"
].join(" ");
const MICROSOFT_PROMPT =
  process.env.MICROSOFT_PROMPT || "select_account";

type MicrosoftOAuthConfig = {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

type TokenData = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
};

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
};

const cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/"
});

export const microsoftCookieNames = {
  access: ACCESS_TOKEN_COOKIE,
  refresh: REFRESH_TOKEN_COOKIE,
  expiresAt: EXPIRES_AT_COOKIE,
  state: STATE_COOKIE,
  codeVerifier: CODE_VERIFIER_COOKIE
};

export const microsoftOAuthScopes = MICROSOFT_SCOPES;

export const getMicrosoftOAuthConfig = (): MicrosoftOAuthConfig | null => {
  const tenantId =
    process.env.MICROSOFT_TENANT_ID ||
    process.env.OUTLOOK_TENANT_ID ||
    "common";
  const clientId = process.env.MICROSOFT_CLIENT_ID || process.env.OUTLOOK_CLIENT_ID;
  const clientSecret =
    process.env.MICROSOFT_CLIENT_SECRET || process.env.OUTLOOK_CLIENT_SECRET;
  const redirectUri =
    process.env.MICROSOFT_REDIRECT_URI || process.env.MS_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    return null;
  }

  return {
    tenantId,
    clientId,
    clientSecret,
    redirectUri
  };
};

export const buildMicrosoftAuthorizeUrl = (
  config: MicrosoftOAuthConfig,
  state: string,
  codeChallenge?: string
) => {
  const authorizeUrl = new URL(
    `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/authorize`
  );
  authorizeUrl.searchParams.set("client_id", config.clientId);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("redirect_uri", config.redirectUri);
  authorizeUrl.searchParams.set("response_mode", "query");
  authorizeUrl.searchParams.set("scope", MICROSOFT_SCOPES);
  authorizeUrl.searchParams.set("state", state);
  if (MICROSOFT_PROMPT) {
    authorizeUrl.searchParams.set("prompt", MICROSOFT_PROMPT);
  }
  if (codeChallenge) {
    authorizeUrl.searchParams.set("code_challenge", codeChallenge);
    authorizeUrl.searchParams.set("code_challenge_method", "S256");
  }
  return authorizeUrl.toString();
};

const toBase64Url = (value: Buffer) =>
  value
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

const createCodeVerifier = () => toBase64Url(randomBytes(32));

const createCodeChallenge = (verifier: string) =>
  toBase64Url(createHash("sha256").update(verifier).digest());

export const createMicrosoftAuthRequest = (config: MicrosoftOAuthConfig) => {
  const state = crypto.randomUUID();
  const codeVerifier = createCodeVerifier();
  const codeChallenge = createCodeChallenge(codeVerifier);
  const authorizeUrl = buildMicrosoftAuthorizeUrl(
    config,
    state,
    codeChallenge
  );
  return { state, codeVerifier, authorizeUrl };
};

const normalizeTokenResponse = (data: TokenResponse): TokenData => {
  const expiresAt = Date.now() + data.expires_in * 1000;
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt
  };
};

export const exchangeCodeForToken = async (
  config: MicrosoftOAuthConfig,
  code: string,
  codeVerifier: string
) => {
  const tokenUrl = `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: config.redirectUri,
    scope: MICROSOFT_SCOPES,
    code_verifier: codeVerifier
  });

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token exchange failed: ${errorText}`);
  }

  const data = (await response.json()) as TokenResponse;
  return normalizeTokenResponse(data);
};

export const refreshMicrosoftAccessToken = async (
  config: MicrosoftOAuthConfig,
  refreshToken: string
) => {
  const tokenUrl = `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    redirect_uri: config.redirectUri,
    scope: MICROSOFT_SCOPES
  });

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token refresh failed: ${errorText}`);
  }

  const data = (await response.json()) as TokenResponse;
  return normalizeTokenResponse(data);
};

export const getMicrosoftTokensFromRequest = (request: NextRequest) => {
  const accessToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  const refreshToken = request.cookies.get(REFRESH_TOKEN_COOKIE)?.value;
  const expiresAtValue = request.cookies.get(EXPIRES_AT_COOKIE)?.value;
  const expiresAt = expiresAtValue ? Number(expiresAtValue) : undefined;
  return {
    accessToken,
    refreshToken,
    expiresAt
  };
};

export const isAccessTokenExpired = (expiresAt?: number) => {
  if (!expiresAt) {
    return true;
  }
  return Date.now() >= expiresAt - 60_000;
};

export const setMicrosoftAuthCookies = (
  response: NextResponse,
  tokenData: TokenData
) => {
  response.cookies.set(ACCESS_TOKEN_COOKIE, tokenData.accessToken, {
    ...cookieOptions(),
    maxAge: Math.floor((tokenData.expiresAt - Date.now()) / 1000)
  });

  response.cookies.set(EXPIRES_AT_COOKIE, String(tokenData.expiresAt), {
    ...cookieOptions(),
    maxAge: 60 * 60 * 24
  });

  if (tokenData.refreshToken) {
    response.cookies.set(REFRESH_TOKEN_COOKIE, tokenData.refreshToken, {
      ...cookieOptions(),
      maxAge: 60 * 60 * 24 * 30
    });
  }
};

export const clearMicrosoftAuthCookies = (response: NextResponse) => {
  response.cookies.set(ACCESS_TOKEN_COOKIE, "", { ...cookieOptions(), maxAge: 0 });
  response.cookies.set(REFRESH_TOKEN_COOKIE, "", { ...cookieOptions(), maxAge: 0 });
  response.cookies.set(EXPIRES_AT_COOKIE, "", { ...cookieOptions(), maxAge: 0 });
};

export const setMicrosoftOAuthState = (
  response: NextResponse,
  state: string
) => {
  response.cookies.set(STATE_COOKIE, state, {
    ...cookieOptions(),
    maxAge: 60 * 10
  });
};

export const getMicrosoftOAuthState = (request: NextRequest) =>
  request.cookies.get(STATE_COOKIE)?.value;

export const clearMicrosoftOAuthState = (response: NextResponse) => {
  response.cookies.set(STATE_COOKIE, "", { ...cookieOptions(), maxAge: 0 });
};

export const setMicrosoftOAuthCodeVerifier = (
  response: NextResponse,
  verifier: string
) => {
  response.cookies.set(CODE_VERIFIER_COOKIE, verifier, {
    ...cookieOptions(),
    maxAge: 60 * 10
  });
};

export const getMicrosoftOAuthCodeVerifier = (request: NextRequest) =>
  request.cookies.get(CODE_VERIFIER_COOKIE)?.value;

export const clearMicrosoftOAuthCodeVerifier = (response: NextResponse) => {
  response.cookies.set(CODE_VERIFIER_COOKIE, "", {
    ...cookieOptions(),
    maxAge: 0
  });
};
