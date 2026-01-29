import { NextResponse } from "next/server";
import {
  buildMicrosoftAuthorizeUrl,
  getMicrosoftOAuthConfig,
  setMicrosoftOAuthState
} from "../../lib/microsoftAuth";

export const GET = () => {
  const config = getMicrosoftOAuthConfig();

  if (!config) {
    return NextResponse.json(
      { error: "Microsoft OAuth is not configured." },
      { status: 500 }
    );
  }

  const state = crypto.randomUUID();
  const authorizeUrl = buildMicrosoftAuthorizeUrl(config, state);
  const response = NextResponse.redirect(authorizeUrl);
  setMicrosoftOAuthState(response, state);
  return response;
};
