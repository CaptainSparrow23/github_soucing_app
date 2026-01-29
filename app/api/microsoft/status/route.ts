import { NextRequest, NextResponse } from "next/server";
import {
  getMicrosoftOAuthConfig,
  getMicrosoftTokensFromRequest,
  isAccessTokenExpired,
  refreshMicrosoftAccessToken,
  setMicrosoftAuthCookies
} from "../../../lib/microsoftAuth";

const fetchMicrosoftProfile = async (accessToken: string) => {
  const response = await fetch("https://graph.microsoft.com/v1.0/me", {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!response.ok) {
    throw new Error("Unable to fetch profile.");
  }

  return response.json();
};

export const GET = async (request: NextRequest) => {
  const config = getMicrosoftOAuthConfig();
  if (!config) {
    return NextResponse.json(
      { signedIn: false, error: "Microsoft OAuth is not configured." },
      { status: 500 }
    );
  }

  const { accessToken, refreshToken, expiresAt } =
    getMicrosoftTokensFromRequest(request);

  if (!accessToken && !refreshToken) {
    return NextResponse.json({ signedIn: false });
  }

  let activeAccessToken = accessToken;
  let refreshedTokens: {
    accessToken: string;
    refreshToken?: string;
    expiresAt: number;
  } | null = null;

  if (!activeAccessToken || isAccessTokenExpired(expiresAt)) {
    if (!refreshToken) {
      return NextResponse.json({ signedIn: false });
    }

    try {
      const refreshed = await refreshMicrosoftAccessToken(config, refreshToken);
      activeAccessToken = refreshed.accessToken;
      refreshedTokens = {
        ...refreshed,
        refreshToken: refreshed.refreshToken || refreshToken
      };
    } catch (error) {
      return NextResponse.json({ signedIn: false });
    }
  }

  try {
    const profile = await fetchMicrosoftProfile(activeAccessToken);
    const response = NextResponse.json({
      signedIn: true,
      user: {
        displayName: profile.displayName,
        mail: profile.mail,
        userPrincipalName: profile.userPrincipalName
      }
    });
    if (refreshedTokens) {
      setMicrosoftAuthCookies(response, refreshedTokens);
    }
    return response;
  } catch (error) {
    return NextResponse.json({ signedIn: false });
  }
};
