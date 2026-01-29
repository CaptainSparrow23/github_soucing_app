import { NextRequest, NextResponse } from "next/server";
import {
  clearMicrosoftOAuthCodeVerifier,
  clearMicrosoftOAuthState,
  exchangeCodeForToken,
  getMicrosoftOAuthConfig,
  getMicrosoftOAuthCodeVerifier,
  getMicrosoftOAuthState,
  setMicrosoftAuthCookies
} from "../../../../lib/microsoftAuth";

export const GET = async (request: NextRequest) => {
  const config = getMicrosoftOAuthConfig();
  if (!config) {
    return NextResponse.json(
      { error: "Microsoft OAuth is not configured." },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const expectedState = getMicrosoftOAuthState(request);
  const codeVerifier = getMicrosoftOAuthCodeVerifier(request);

  if (!code || !state || !expectedState || state !== expectedState || !codeVerifier) {
    const response = NextResponse.redirect(new URL("/?auth=error", request.url));
    clearMicrosoftOAuthState(response);
    clearMicrosoftOAuthCodeVerifier(response);
    return response;
  }

  try {
    const tokenData = await exchangeCodeForToken(config, code, codeVerifier);
    const response = NextResponse.redirect(new URL("/", request.url));
    setMicrosoftAuthCookies(response, tokenData);
    clearMicrosoftOAuthState(response);
    clearMicrosoftOAuthCodeVerifier(response);
    return response;
  } catch (error) {
    const response = NextResponse.redirect(new URL("/?auth=error", request.url));
    clearMicrosoftOAuthState(response);
    clearMicrosoftOAuthCodeVerifier(response);
    return response;
  }
};
