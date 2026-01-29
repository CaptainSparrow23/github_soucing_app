import { NextRequest, NextResponse } from "next/server";
import {
  clearMicrosoftOAuthState,
  exchangeCodeForToken,
  getMicrosoftOAuthConfig,
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

  if (!code || !state || !expectedState || state !== expectedState) {
    const response = NextResponse.redirect(new URL("/?auth=error", request.url));
    clearMicrosoftOAuthState(response);
    return response;
  }

  try {
    const tokenData = await exchangeCodeForToken(config, code);
    const response = NextResponse.redirect(new URL("/", request.url));
    setMicrosoftAuthCookies(response, tokenData);
    clearMicrosoftOAuthState(response);
    return response;
  } catch (error) {
    const response = NextResponse.redirect(new URL("/?auth=error", request.url));
    clearMicrosoftOAuthState(response);
    return response;
  }
};
