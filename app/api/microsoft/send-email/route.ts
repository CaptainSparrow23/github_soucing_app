import { NextRequest, NextResponse } from "next/server";
import {
  getMicrosoftOAuthConfig,
  getMicrosoftTokensFromRequest,
  isAccessTokenExpired,
  refreshMicrosoftAccessToken,
  setMicrosoftAuthCookies
} from "../../../lib/microsoftAuth";

const sendMail = async (
  accessToken: string,
  payload: {
    subject: string;
    body: string;
    recipients: string[];
  }
) => {
  const response = await fetch(
    "https://graph.microsoft.com/v1.0/me/sendMail",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message: {
          subject: payload.subject,
          body: {
            contentType: "Text",
            content: payload.body
          },
          toRecipients: payload.recipients.map((address) => ({
            emailAddress: { address }
          }))
        },
        saveToSentItems: true
      })
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText);
  }
};

export const POST = async (request: NextRequest) => {
  const config = getMicrosoftOAuthConfig();
  if (!config) {
    return NextResponse.json(
      { error: "Microsoft OAuth is not configured." },
      { status: 500 }
    );
  }

  const { accessToken, refreshToken, expiresAt } =
    getMicrosoftTokensFromRequest(request);

  if (!accessToken && !refreshToken) {
    return NextResponse.json(
      { error: "Not signed in to Microsoft." },
      { status: 401 }
    );
  }

  const body = await request.json();
  const to = typeof body.to === "string" ? body.to : "";
  const subject = typeof body.subject === "string" ? body.subject : "";
  const message = typeof body.body === "string" ? body.body : "";

  if (!to || !subject || !message) {
    return NextResponse.json(
      { error: "To, subject, and body are required." },
      { status: 400 }
    );
  }

  const recipients = to
    .split(",")
    .map((entry: string) => entry.trim())
    .filter(Boolean);

  if (recipients.length === 0) {
    return NextResponse.json(
      { error: "At least one recipient is required." },
      { status: 400 }
    );
  }

  let activeAccessToken = accessToken;
  let refreshedTokens: {
    accessToken: string;
    refreshToken?: string;
    expiresAt: number;
  } | null = null;

  if (!activeAccessToken || isAccessTokenExpired(expiresAt)) {
    if (!refreshToken) {
      return NextResponse.json(
        { error: "Microsoft session expired. Please sign in again." },
        { status: 401 }
      );
    }
    try {
      const refreshed = await refreshMicrosoftAccessToken(config, refreshToken);
      activeAccessToken = refreshed.accessToken;
      refreshedTokens = {
        ...refreshed,
        refreshToken: refreshed.refreshToken || refreshToken
      };
    } catch (error) {
      return NextResponse.json(
        { error: "Unable to refresh Microsoft session." },
        { status: 401 }
      );
    }
  }

  try {
    await sendMail(activeAccessToken, {
      subject,
      body: message,
      recipients
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to send email via Microsoft Graph." },
      { status: 500 }
    );
  }

  const response = NextResponse.json({ ok: true });
  if (refreshedTokens) {
    setMicrosoftAuthCookies(response, refreshedTokens);
  }
  return response;
};
