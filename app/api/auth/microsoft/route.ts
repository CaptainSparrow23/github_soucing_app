import { NextResponse } from "next/server";
import {
  createMicrosoftAuthRequest,
  getMicrosoftOAuthConfig,
  setMicrosoftOAuthCodeVerifier,
  setMicrosoftOAuthState
} from "../../../lib/microsoftAuth";

export const GET = async () => {
  const config = getMicrosoftOAuthConfig();

  if (!config) {
    return NextResponse.json(
      { error: "Microsoft OAuth is not configured." },
      { status: 500 }
    );
  }

  const { state, codeVerifier, authorizeUrl } = createMicrosoftAuthRequest(config);
  const response = NextResponse.redirect(authorizeUrl);
  setMicrosoftOAuthState(response, state);
  setMicrosoftOAuthCodeVerifier(response, codeVerifier);
  return response;
};
